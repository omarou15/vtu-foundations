/**
 * VTU — Edge Function : monitoring de santé d'application (admin only).
 *
 * Aggrège en un seul appel :
 *   - Santé LLM (latence p50/p95/p99, taux d'erreur, codes d'erreur,
 *     coût estimé, tokens consommés) depuis llm_extractions.
 *   - Santé Sync & Queue : impossible côté serveur (Dexie est local) —
 *     on remonte plutôt l'écart push/pull via les timestamps des rows
 *     (created_at vs updated_at sur visits/messages/visit_json_state).
 *   - Usage fonctionnel : VTs créées/jour, messages user vs assistant,
 *     attachments, patches IA proposés vs validés vs rejetés.
 *   - Infra Cloud : taille tables, derniers timestamps d'écriture par
 *     table critique. (Edge function logs et auth logs sont accessibles
 *     uniquement via l'API Supabase Management — pas exposés ici.)
 *
 * Auth : verify_jwt=true (gère par config.toml) + double check has_role(admin).
 *
 * Réponse : objet structuré avec sections + statut global (ok/warning/critical)
 * basé sur seuils CONSERVATEURS (cf. KNOWLEDGE §15.5 — It. 10.5 monitoring).
 *
 * Période : query param `?hours=24` (défaut 24h, max 168h = 7j).
 */

// @ts-ignore — Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonitoringResponse {
  ok: boolean;
  generated_at: string;
  window_hours: number;
  global_status: "ok" | "warning" | "critical";
  global_alerts: Alert[];
  llm: LlmHealth;
  sync_proxy: SyncProxyHealth;
  usage: UsageStats;
  infra: InfraHealth;
  events: TimelineEvent[];
}

interface Alert {
  level: "warning" | "critical";
  category: "llm" | "sync" | "usage" | "infra";
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

interface LlmHealth {
  total_calls: number;
  by_status: Record<string, number>;
  by_mode: Record<string, number>;
  by_error_code: Record<string, number>;
  latency_ms: { p50: number; p95: number; p99: number; max: number } | null;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
  error_rate_pct: number;
  status: "ok" | "warning" | "critical";
  alerts: Alert[];
}

interface SyncProxyHealth {
  // On ne voit pas la sync_queue locale Dexie — on remonte des proxies serveur.
  visits_created: number;
  messages_inserted: number;
  attachments_inserted: number;
  json_state_versions: number;
  oldest_pending_message_age_minutes: number | null;
  status: "ok" | "warning" | "critical";
  alerts: Alert[];
}

interface UsageStats {
  unique_active_users: number;
  visits_total: number;
  messages_user: number;
  messages_assistant: number;
  messages_actions_card: number;
  attachments_count: number;
  attachments_pdf: number;
  attachments_photo: number;
  patches_proposed: number;
  patches_validated: number;
  patches_rejected: number;
  ai_adoption_pct: number;
}

interface InfraHealth {
  tables: Array<{ name: string; row_count: number; last_write: string | null }>;
  buckets: string[];
}

interface TimelineEvent {
  ts: string;
  level: "info" | "warning" | "error";
  source: "llm" | "sync" | "usage" | "infra";
  message: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Seuils CONSERVATEURS (cf. doctrine It. 10.5)
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  llm_p95_warning_ms: 12_000,
  llm_p95_critical_ms: 20_000,
  llm_error_warning_pct: 5,
  llm_error_critical_pct: 15,
  llm_cost_warning_usd_per_day: 5,
  sync_oldest_pending_warning_minutes: 30,
  sync_oldest_pending_critical_minutes: 120,
};

// Tarifs très approximatifs Gemini Flash (USD pour 1M tokens) — pour estimation only.
const COST_PER_M_INPUT_TOKENS_USD = 0.075;
const COST_PER_M_OUTPUT_TOKENS_USD = 0.3;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// @ts-ignore — Deno
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore — Deno.env
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // @ts-ignore — Deno.env
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // @ts-ignore — Deno.env
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Vérifier l'auth + le rôle admin via le JWT user.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "missing_auth");
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonError(401, "invalid_jwt");
    }
    const userId = userData.user.id;

    // Vérifie has_role(admin) via RPC (SECURITY DEFINER côté DB).
    const { data: isAdmin, error: roleErr } = await userClient.rpc(
      "has_role",
      { _user_id: userId, _role: "admin" },
    );
    if (roleErr) {
      return jsonError(500, `role_check_failed: ${roleErr.message}`);
    }
    if (!isAdmin) {
      return jsonError(403, "admin_role_required");
    }

    // 2. Window
    const url = new URL(req.url);
    const hoursRaw = Number(url.searchParams.get("hours") ?? "24");
    const windowHours = Math.min(
      168,
      Math.max(1, Number.isFinite(hoursRaw) ? hoursRaw : 24),
    );
    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

    // 3. Service role client pour les agrégations cross-tenant.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 4. Aggregations en parallèle.
    const [llm, syncProxy, usage, infra] = await Promise.all([
      computeLlmHealth(admin, since),
      computeSyncProxyHealth(admin, since),
      computeUsageStats(admin, since),
      computeInfraHealth(admin),
    ]);

    // 5. Timeline 24h depuis llm_extractions (warnings/erreurs uniquement).
    const events = await buildTimeline(admin, since);

    // 6. Statut global = pire des sous-statuts.
    const globalAlerts: Alert[] = [
      ...llm.alerts,
      ...syncProxy.alerts,
    ];
    const globalStatus: "ok" | "warning" | "critical" = globalAlerts.some(
      (a) => a.level === "critical",
    )
      ? "critical"
      : globalAlerts.some((a) => a.level === "warning")
      ? "warning"
      : "ok";

    const response: MonitoringResponse = {
      ok: true,
      generated_at: new Date().toISOString(),
      window_hours: windowHours,
      global_status: globalStatus,
      global_alerts: globalAlerts,
      llm,
      sync_proxy: syncProxy,
      usage,
      infra,
      events,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, `unhandled: ${message}`);
  }
});

// ---------------------------------------------------------------------------
// LLM Health
// ---------------------------------------------------------------------------

async function computeLlmHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  since: string,
): Promise<LlmHealth> {
  const { data, error } = await admin
    .from("llm_extractions")
    .select(
      "id, mode, status, latency_ms, input_tokens, output_tokens, error_message, created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return emptyLlm({
      level: "warning",
      category: "llm",
      message: `Lecture llm_extractions échouée: ${error.message}`,
    });
  }

  const rows = data ?? [];
  const total = rows.length;
  const byStatus: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  const byErrorCode: Record<string, number> = {};
  let totalIn = 0;
  let totalOut = 0;
  const latencies: number[] = [];

  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byMode[r.mode] = (byMode[r.mode] ?? 0) + 1;
    if (r.status !== "success" && r.error_message) {
      const code = inferErrorCode(r.error_message);
      byErrorCode[code] = (byErrorCode[code] ?? 0) + 1;
    }
    totalIn += Number(r.input_tokens ?? 0);
    totalOut += Number(r.output_tokens ?? 0);
    if (typeof r.latency_ms === "number" && r.latency_ms > 0) {
      latencies.push(r.latency_ms);
    }
  }

  const successCount = byStatus["success"] ?? 0;
  const errorRate = total > 0 ? ((total - successCount) / total) * 100 : 0;

  const latency = latencies.length
    ? {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
        max: Math.max(...latencies),
      }
    : null;

  const cost =
    (totalIn / 1_000_000) * COST_PER_M_INPUT_TOKENS_USD +
    (totalOut / 1_000_000) * COST_PER_M_OUTPUT_TOKENS_USD;

  const alerts: Alert[] = [];
  if (latency) {
    if (latency.p95 >= THRESHOLDS.llm_p95_critical_ms) {
      alerts.push({
        level: "critical",
        category: "llm",
        message: `Latence LLM p95 critique (${Math.round(latency.p95)} ms)`,
        metric: "llm.latency_p95_ms",
        value: latency.p95,
        threshold: THRESHOLDS.llm_p95_critical_ms,
      });
    } else if (latency.p95 >= THRESHOLDS.llm_p95_warning_ms) {
      alerts.push({
        level: "warning",
        category: "llm",
        message: `Latence LLM p95 élevée (${Math.round(latency.p95)} ms)`,
        metric: "llm.latency_p95_ms",
        value: latency.p95,
        threshold: THRESHOLDS.llm_p95_warning_ms,
      });
    }
  }
  if (errorRate >= THRESHOLDS.llm_error_critical_pct) {
    alerts.push({
      level: "critical",
      category: "llm",
      message: `Taux d'erreur LLM critique (${errorRate.toFixed(1)} %)`,
      metric: "llm.error_rate_pct",
      value: errorRate,
      threshold: THRESHOLDS.llm_error_critical_pct,
    });
  } else if (errorRate >= THRESHOLDS.llm_error_warning_pct) {
    alerts.push({
      level: "warning",
      category: "llm",
      message: `Taux d'erreur LLM élevé (${errorRate.toFixed(1)} %)`,
      metric: "llm.error_rate_pct",
      value: errorRate,
      threshold: THRESHOLDS.llm_error_warning_pct,
    });
  }
  // Coût rapporté à 24h (extrapolation linéaire pour fenêtres autres).
  const costPer24h = (cost * 24) / Math.max(1, hoursFromSince(since));
  if (costPer24h >= THRESHOLDS.llm_cost_warning_usd_per_day) {
    alerts.push({
      level: "warning",
      category: "llm",
      message: `Coût LLM extrapolé > seuil (${costPer24h.toFixed(2)} $/jour)`,
      metric: "llm.cost_usd_per_day",
      value: costPer24h,
      threshold: THRESHOLDS.llm_cost_warning_usd_per_day,
    });
  }

  return {
    total_calls: total,
    by_status: byStatus,
    by_mode: byMode,
    by_error_code: byErrorCode,
    latency_ms: latency,
    total_input_tokens: totalIn,
    total_output_tokens: totalOut,
    estimated_cost_usd: round(cost, 4),
    error_rate_pct: round(errorRate, 2),
    status: alerts.some((a) => a.level === "critical")
      ? "critical"
      : alerts.length
      ? "warning"
      : "ok",
    alerts,
  };
}

function emptyLlm(alert: Alert): LlmHealth {
  return {
    total_calls: 0,
    by_status: {},
    by_mode: {},
    by_error_code: {},
    latency_ms: null,
    total_input_tokens: 0,
    total_output_tokens: 0,
    estimated_cost_usd: 0,
    error_rate_pct: 0,
    status: "warning",
    alerts: [alert],
  };
}

function inferErrorCode(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("rate") || m.includes("429")) return "rate_limited";
  if (m.includes("payment") || m.includes("402")) return "payment_required";
  if (m.includes("malformed") || m.includes("parse") || m.includes("json")) {
    return "malformed_response";
  }
  if (m.includes("timeout")) return "timeout";
  if (m.includes("network") || m.includes("fetch")) return "network";
  return "other";
}

// ---------------------------------------------------------------------------
// Sync proxy (vue serveur, on ne voit pas la sync_queue Dexie locale)
// ---------------------------------------------------------------------------

async function computeSyncProxyHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  since: string,
): Promise<SyncProxyHealth> {
  const [visits, messages, attachments, jsonState] = await Promise.all([
    countSince(admin, "visits", since),
    countSince(admin, "messages", since),
    countSince(admin, "attachments", since),
    countSince(admin, "visit_json_state", since),
  ]);

  // Proxy "oldest pending" : on regarde le message user le plus ancien dont
  // aucun message assistant ne suit dans la même VT. Heuristique imparfaite
  // mais suffisante pour détecter un backlog massif côté Edge Function LLM.
  const { data: oldestUserMsgs } = await admin
    .from("messages")
    .select("id, visit_id, created_at, role")
    .gte("created_at", since)
    .eq("role", "user")
    .order("created_at", { ascending: true })
    .limit(200);

  let oldestPendingAge: number | null = null;
  if (oldestUserMsgs && oldestUserMsgs.length > 0) {
    const visitIds = [
      ...new Set(oldestUserMsgs.map((m: { visit_id: string }) => m.visit_id)),
    ];
    const { data: assistantMsgs } = await admin
      .from("messages")
      .select("visit_id, created_at")
      .in("visit_id", visitIds)
      .eq("role", "assistant");

    const assistantByVisit = new Map<string, string[]>();
    for (const a of assistantMsgs ?? []) {
      const list = assistantByVisit.get(a.visit_id) ?? [];
      list.push(a.created_at);
      assistantByVisit.set(a.visit_id, list);
    }

    for (const m of oldestUserMsgs) {
      const assistants = assistantByVisit.get(m.visit_id) ?? [];
      const hasResponseAfter = assistants.some(
        (ts: string) => ts > m.created_at,
      );
      if (!hasResponseAfter) {
        oldestPendingAge = Math.round(
          (Date.now() - new Date(m.created_at).getTime()) / 60000,
        );
        break;
      }
    }
  }

  const alerts: Alert[] = [];
  if (
    oldestPendingAge !== null &&
    oldestPendingAge >= THRESHOLDS.sync_oldest_pending_critical_minutes
  ) {
    alerts.push({
      level: "critical",
      category: "sync",
      message: `Message user sans réponse assistant depuis ${oldestPendingAge} min`,
      metric: "sync.oldest_pending_minutes",
      value: oldestPendingAge,
      threshold: THRESHOLDS.sync_oldest_pending_critical_minutes,
    });
  } else if (
    oldestPendingAge !== null &&
    oldestPendingAge >= THRESHOLDS.sync_oldest_pending_warning_minutes
  ) {
    alerts.push({
      level: "warning",
      category: "sync",
      message: `Message user sans réponse assistant depuis ${oldestPendingAge} min`,
      metric: "sync.oldest_pending_minutes",
      value: oldestPendingAge,
      threshold: THRESHOLDS.sync_oldest_pending_warning_minutes,
    });
  }

  return {
    visits_created: visits,
    messages_inserted: messages,
    attachments_inserted: attachments,
    json_state_versions: jsonState,
    oldest_pending_message_age_minutes: oldestPendingAge,
    status: alerts.some((a) => a.level === "critical")
      ? "critical"
      : alerts.length
      ? "warning"
      : "ok",
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Usage stats
// ---------------------------------------------------------------------------

async function computeUsageStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  since: string,
): Promise<UsageStats> {
  const [visits, messages, attachments] = await Promise.all([
    admin
      .from("visits")
      .select("id, user_id, created_at")
      .gte("created_at", since)
      .limit(5000),
    admin
      .from("messages")
      .select("id, role, kind, user_id, metadata, created_at")
      .gte("created_at", since)
      .limit(10000),
    admin
      .from("attachments")
      .select("id, media_profile, created_at")
      .gte("created_at", since)
      .limit(5000),
  ]);

  const visitsRows = visits.data ?? [];
  const messagesRows = messages.data ?? [];
  const attachmentsRows = attachments.data ?? [];

  const userIds = new Set<string>();
  let mUser = 0;
  let mAssistant = 0;
  let mActionsCard = 0;
  let proposed = 0;
  let validated = 0;
  let rejected = 0;

  for (const m of messagesRows) {
    if (m.user_id) userIds.add(m.user_id);
    if (m.role === "user") mUser++;
    if (m.role === "assistant") mAssistant++;
    if (m.kind === "actions_card") {
      mActionsCard++;
      const meta = (m.metadata ?? {}) as {
        proposed_patches?: unknown[];
        proposed_custom_fields?: unknown[];
      };
      proposed += (meta.proposed_patches?.length ?? 0)
        + (meta.proposed_custom_fields?.length ?? 0);
    }
  }
  for (const v of visitsRows) {
    if (v.user_id) userIds.add(v.user_id);
  }

  // validation/rejection sont stockées dans visit_json_state.state.*.validation_status.
  // Trop coûteux à scanner cross-tenant ici → on remonte 0 / 0 et on laisse l'UI
  // expliquer "calculé à la volée côté client" si besoin. Marqué TODO Phase 3.

  let pdf = 0;
  let photo = 0;
  for (const a of attachmentsRows) {
    if (a.media_profile === "pdf") pdf++;
    else if (a.media_profile === "photo") photo++;
  }

  const adoption = mActionsCard > 0 && proposed > 0
    ? round((validated / proposed) * 100, 1)
    : 0;

  return {
    unique_active_users: userIds.size,
    visits_total: visitsRows.length,
    messages_user: mUser,
    messages_assistant: mAssistant,
    messages_actions_card: mActionsCard,
    attachments_count: attachmentsRows.length,
    attachments_pdf: pdf,
    attachments_photo: photo,
    patches_proposed: proposed,
    patches_validated: validated,
    patches_rejected: rejected,
    ai_adoption_pct: adoption,
  };
}

// ---------------------------------------------------------------------------
// Infra
// ---------------------------------------------------------------------------

async function computeInfraHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<InfraHealth> {
  const tables = [
    "visits",
    "messages",
    "attachments",
    "visit_json_state",
    "llm_extractions",
    "attachment_ai_descriptions",
    "schema_registry",
    "user_roles",
  ];
  const out: InfraHealth["tables"] = [];
  for (const name of tables) {
    const { count } = await admin
      .from(name)
      .select("*", { count: "exact", head: true });
    const { data: last } = await admin
      .from(name)
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    out.push({
      name,
      row_count: count ?? 0,
      last_write: last?.[0]?.created_at ?? null,
    });
  }
  return { tables: out, buckets: ["visit-audio", "visit-photos", "attachments"] };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

async function buildTimeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  since: string,
): Promise<TimelineEvent[]> {
  const out: TimelineEvent[] = [];
  // Erreurs LLM
  const { data: llmErrs } = await admin
    .from("llm_extractions")
    .select("created_at, mode, status, error_message, latency_ms")
    .gte("created_at", since)
    .neq("status", "success")
    .order("created_at", { ascending: false })
    .limit(100);
  for (const e of llmErrs ?? []) {
    out.push({
      ts: e.created_at,
      level: e.status === "rate_limited" ? "warning" : "error",
      source: "llm",
      message: `${e.mode} → ${e.status}${e.error_message ? `: ${truncate(e.error_message, 120)}` : ""}`,
      meta: { latency_ms: e.latency_ms },
    });
  }
  // Pics de latence (top 20 sur la période)
  const { data: slowest } = await admin
    .from("llm_extractions")
    .select("created_at, mode, latency_ms")
    .gte("created_at", since)
    .eq("status", "success")
    .order("latency_ms", { ascending: false })
    .limit(20);
  for (const s of slowest ?? []) {
    if ((s.latency_ms ?? 0) >= THRESHOLDS.llm_p95_warning_ms) {
      out.push({
        ts: s.created_at,
        level: s.latency_ms >= THRESHOLDS.llm_p95_critical_ms
          ? "warning"
          : "info",
        source: "llm",
        message: `${s.mode} lent (${s.latency_ms} ms)`,
        meta: { latency_ms: s.latency_ms },
      });
    }
  }
  // Tri DESC
  out.sort((a, b) => b.ts.localeCompare(a.ts));
  return out.slice(0, 200);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function countSince(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  table: string,
  since: string,
): Promise<number> {
  const { count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);
  return count ?? 0;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

function hoursFromSince(since: string): number {
  return (Date.now() - new Date(since).getTime()) / 3600 / 1000;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ ok: false, error: code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
