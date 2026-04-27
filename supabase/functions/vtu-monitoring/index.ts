/**
 * VTU — Edge Function : monitoring de santé d'application (admin only).
 *
 * Sections retournées :
 *   - llm        : santé technique LLM (latence, erreurs, coût, tokens).
 *   - sync_proxy : proxy serveur de la sync (visites/messages/attachments
 *                  poussés ; plus ancien message user sans réponse).
 *   - usage      : compteurs bruts (utilisateurs actifs, messages, …).
 *   - functional : KPIs FONCTIONNELS calculés sur la période :
 *                    * cycle_time_minutes      — durée moyenne d'une VT
 *                    * media_per_visit         — médias attachés / VT
 *                    * time_to_first_ai_seconds — réactivité IA après 1er msg
 *                    * patches_proposed/validated/rejected/ignored (réels)
 *                    * patches_acceptance_rate_pct
 *                    * json_state_completeness_pct (champs renseignés)
 *                    * visits_with_ai_pct      — % VT avec ≥1 message IA
 *                    * media_capture_rate_pct  — % VT avec ≥1 media
 *   - okrs       : objectifs trimestriels (T2-2026) — voir OKRS plus bas.
 *   - time_series: 7 derniers jours (visits_per_day, llm_per_day, errors_per_day).
 *   - infra      : tailles tables + buckets storage.
 *   - events     : timeline (erreurs LLM + pics latence).
 *
 * Auth : Bearer JWT user (vérification + double check has_role(admin)).
 *
 * Période : ?hours=24 (1..168). Time series : toujours 7j fixes.
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
  functional: FunctionalKpis;
  okrs: OkrTracking;
  time_series: TimeSeries;
  infra: InfraHealth;
  events: TimelineEvent[];
}

interface Alert {
  level: "warning" | "critical";
  category: "llm" | "sync" | "usage" | "infra" | "functional";
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
}

interface FunctionalKpis {
  cycle_time_minutes_avg: number | null; // durée moyenne entre 1er et dernier événement d'une VT
  cycle_time_minutes_median: number | null;
  media_per_visit_avg: number; // attachments / VT
  time_to_first_ai_seconds_avg: number | null; // entre 1er msg user et 1er msg assistant
  patches_proposed: number;
  patches_validated: number;
  patches_rejected: number;
  patches_unvalidated: number;
  patches_acceptance_rate_pct: number; // validated / (validated + rejected)
  patches_treatment_rate_pct: number; // (validated + rejected) / proposed
  json_state_completeness_pct: number | null; // champs Field<T> non-null / totaux scannés
  visits_with_ai_pct: number; // % VT créées dans la fenêtre avec ≥1 msg assistant
  media_capture_rate_pct: number; // % VT créées avec ≥1 attachment
  status: "ok" | "warning" | "critical";
  alerts: Alert[];
}

interface OkrTracking {
  period: string; // ex "T2-2026 (avr → juin 2026)"
  objectives: Array<{
    id: string;
    title: string;
    description: string;
    keyResults: Array<{
      id: string;
      label: string;
      current: number;
      target: number;
      unit: string;
      higher_is_better: boolean;
      progress_pct: number; // 0..100, capé
      on_track: boolean;
      source: string; // explication transparente
    }>;
  }>;
}

interface TimeSeries {
  days: string[]; // ISO dates (YYYY-MM-DD), 7 entries, J-6 → J
  visits_per_day: number[];
  llm_calls_per_day: number[];
  llm_errors_per_day: number[];
  patches_proposed_per_day: number[];
}

interface InfraHealth {
  tables: Array<{ name: string; row_count: number; last_write: string | null }>;
  buckets: string[];
}

interface TimelineEvent {
  ts: string;
  level: "info" | "warning" | "error";
  source: "llm" | "sync" | "usage" | "infra" | "functional";
  message: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Seuils CONSERVATEURS
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  llm_p95_warning_ms: 12_000,
  llm_p95_critical_ms: 20_000,
  llm_error_warning_pct: 5,
  llm_error_critical_pct: 15,
  llm_cost_warning_usd_per_day: 5,
  sync_oldest_pending_warning_minutes: 30,
  sync_oldest_pending_critical_minutes: 120,
  // Fonctionnel
  acceptance_rate_warning_pct: 60, // < 60 % → IA produit trop de bruit
  acceptance_rate_critical_pct: 40,
  treatment_rate_warning_pct: 50, // < 50 % patches non triés → friction UX
  ttfi_warning_seconds: 12,
  ttfi_critical_seconds: 25,
};

// Tarifs très approximatifs Gemini Flash (USD pour 1M tokens) — pour estimation only.
const COST_PER_M_INPUT_TOKENS_USD = 0.075;
const COST_PER_M_OUTPUT_TOKENS_USD = 0.3;

// ---------------------------------------------------------------------------
// OKRs trimestriels — éditer ici pour ajuster les cibles
// ---------------------------------------------------------------------------

const OKR_PERIOD = "T2-2026 (avr → juin 2026)";

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

    const { data: isAdmin, error: roleErr } = await userClient.rpc(
      "has_role",
      { _user_id: userId, _role: "admin" },
    );
    if (roleErr) return jsonError(500, `role_check_failed: ${roleErr.message}`);
    if (!isAdmin) return jsonError(403, "admin_role_required");

    // Window
    const url = new URL(req.url);
    const hoursRaw = Number(url.searchParams.get("hours") ?? "24");
    const windowHours = Math.min(
      168,
      Math.max(1, Number.isFinite(hoursRaw) ? hoursRaw : 24),
    );
    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Aggregations en parallèle.
    const [llm, syncProxy, usage, functional, timeSeries, infra] =
      await Promise.all([
        computeLlmHealth(admin, since),
        computeSyncProxyHealth(admin, since),
        computeUsageStats(admin, since),
        computeFunctionalKpis(admin, since),
        computeTimeSeries(admin),
        computeInfraHealth(admin),
      ]);

    const okrs = buildOkrs({ functional, llm, usage });

    // Timeline (erreurs LLM + alertes fonctionnelles).
    const events = await buildTimeline(admin, since, functional);

    const globalAlerts: Alert[] = [
      ...llm.alerts,
      ...syncProxy.alerts,
      ...functional.alerts,
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
      functional,
      okrs,
      time_series: timeSeries,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeLlmHealth(admin: any, since: string): Promise<LlmHealth> {
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
// Sync proxy
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeSyncProxyHealth(admin: any, since: string): Promise<SyncProxyHealth> {
  const [visits, messages, attachments, jsonState] = await Promise.all([
    countSince(admin, "visits", since),
    countSince(admin, "messages", since),
    countSince(admin, "attachments", since),
    countSince(admin, "visit_json_state", since),
  ]);

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeUsageStats(admin: any, since: string): Promise<UsageStats> {
  const [visits, messages, attachments] = await Promise.all([
    admin
      .from("visits")
      .select("id, user_id, created_at")
      .gte("created_at", since)
      .limit(5000),
    admin
      .from("messages")
      .select("id, role, kind, user_id, created_at")
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

  for (const m of messagesRows) {
    if (m.user_id) userIds.add(m.user_id);
    if (m.role === "user") mUser++;
    if (m.role === "assistant") mAssistant++;
    if (m.kind === "actions_card") mActionsCard++;
  }
  for (const v of visitsRows) {
    if (v.user_id) userIds.add(v.user_id);
  }

  let pdf = 0;
  let photo = 0;
  for (const a of attachmentsRows) {
    if (a.media_profile === "pdf") pdf++;
    else if (a.media_profile === "photo") photo++;
  }

  return {
    unique_active_users: userIds.size,
    visits_total: visitsRows.length,
    messages_user: mUser,
    messages_assistant: mAssistant,
    messages_actions_card: mActionsCard,
    attachments_count: attachmentsRows.length,
    attachments_pdf: pdf,
    attachments_photo: photo,
  };
}

// ---------------------------------------------------------------------------
// Functional KPIs (vrais calculs métier)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeFunctionalKpis(admin: any, since: string): Promise<FunctionalKpis> {
  const alerts: Alert[] = [];

  // 1) Toutes les VTs créées dans la fenêtre.
  const { data: visits } = await admin
    .from("visits")
    .select("id, created_at, updated_at, user_id")
    .gte("created_at", since)
    .limit(5000);
  const visitsRows = (visits ?? []) as Array<{
    id: string;
    created_at: string;
    updated_at: string;
    user_id: string;
  }>;
  const visitIds = visitsRows.map((v) => v.id);

  // 2) Messages de ces VTs (pour cycle time + TTFI + visits_with_ai).
  const messagesByVisit = new Map<
    string,
    Array<{ role: string; kind: string; created_at: string }>
  >();
  if (visitIds.length > 0) {
    // Chunk pour éviter les payloads trop gros.
    for (let i = 0; i < visitIds.length; i += 200) {
      const chunk = visitIds.slice(i, i + 200);
      const { data: msgs } = await admin
        .from("messages")
        .select("visit_id, role, kind, created_at")
        .in("visit_id", chunk);
      for (const m of msgs ?? []) {
        const list = messagesByVisit.get(m.visit_id) ?? [];
        list.push({
          role: m.role,
          kind: m.kind,
          created_at: m.created_at,
        });
        messagesByVisit.set(m.visit_id, list);
      }
    }
  }

  // 3) Attachments par VT (pour media_per_visit + media_capture_rate).
  const attachmentsByVisit = new Map<string, number>();
  if (visitIds.length > 0) {
    for (let i = 0; i < visitIds.length; i += 200) {
      const chunk = visitIds.slice(i, i + 200);
      const { data: atts } = await admin
        .from("attachments")
        .select("visit_id")
        .in("visit_id", chunk);
      for (const a of atts ?? []) {
        attachmentsByVisit.set(
          a.visit_id,
          (attachmentsByVisit.get(a.visit_id) ?? 0) + 1,
        );
      }
    }
  }

  // 4) Cycle time : max(msg_ts) - visit.created_at, pour chaque VT non vide.
  // 5) TTFI : 1er msg user -> 1er msg assistant, par VT (ms).
  const cycleTimes: number[] = [];
  const ttfis: number[] = [];
  let visitsWithAi = 0;
  for (const v of visitsRows) {
    const msgs = (messagesByVisit.get(v.id) ?? []).slice().sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    if (msgs.length > 0) {
      const last = new Date(msgs[msgs.length - 1].created_at).getTime();
      const start = new Date(v.created_at).getTime();
      cycleTimes.push((last - start) / 60000); // minutes
    }
    const firstUser = msgs.find((m) => m.role === "user");
    const firstAssistant = msgs.find((m) => m.role === "assistant");
    if (firstUser && firstAssistant) {
      const ms = new Date(firstAssistant.created_at).getTime() -
        new Date(firstUser.created_at).getTime();
      if (ms >= 0) ttfis.push(ms / 1000); // seconds
    }
    if (msgs.some((m) => m.role === "assistant")) visitsWithAi++;
  }

  // 6) Versions JSON state pour ces VTs (la dernière par VT) -> patches + complétude.
  let proposed = 0;
  let validated = 0;
  let rejected = 0;
  let unvalidated = 0;
  let totalFields = 0;
  let filledFields = 0;
  if (visitIds.length > 0) {
    // On prend toutes les versions sur la fenêtre, puis garde la max version par VT.
    const lastByVisit = new Map<
      string,
      { version: number; state: Record<string, unknown> }
    >();
    for (let i = 0; i < visitIds.length; i += 200) {
      const chunk = visitIds.slice(i, i + 200);
      const { data: states } = await admin
        .from("visit_json_state")
        .select("visit_id, version, state")
        .in("visit_id", chunk);
      for (const s of states ?? []) {
        const cur = lastByVisit.get(s.visit_id);
        if (!cur || s.version > cur.version) {
          lastByVisit.set(s.visit_id, {
            version: s.version,
            state: (s.state ?? {}) as Record<string, unknown>,
          });
        }
      }
    }
    for (const [, entry] of lastByVisit) {
      const stats = scanFieldT(entry.state);
      proposed += stats.proposed;
      validated += stats.validated;
      rejected += stats.rejected;
      unvalidated += stats.unvalidated;
      totalFields += stats.totalFields;
      filledFields += stats.filledFields;
    }
  }

  const acceptanceRate = validated + rejected > 0
    ? (validated / (validated + rejected)) * 100
    : 0;
  const treatmentRate = proposed > 0
    ? ((validated + rejected) / proposed) * 100
    : 0;
  const completeness = totalFields > 0 ? (filledFields / totalFields) * 100 : null;
  const mediaPerVisit = visitsRows.length > 0
    ? sumValues(attachmentsByVisit) / visitsRows.length
    : 0;
  const mediaCaptureRate = visitsRows.length > 0
    ? (Array.from(attachmentsByVisit.keys()).length / visitsRows.length) * 100
    : 0;
  const visitsWithAiPct = visitsRows.length > 0
    ? (visitsWithAi / visitsRows.length) * 100
    : 0;
  const cycleAvg = cycleTimes.length ? avg(cycleTimes) : null;
  const cycleMed = cycleTimes.length ? percentile(cycleTimes, 0.5) : null;
  const ttfiAvg = ttfis.length ? avg(ttfis) : null;

  // Alerts fonctionnels
  if (proposed > 10) {
    if (acceptanceRate > 0 && acceptanceRate < THRESHOLDS.acceptance_rate_critical_pct) {
      alerts.push({
        level: "critical",
        category: "functional",
        message: `Taux d'acceptation IA très bas (${acceptanceRate.toFixed(1)} %)`,
        metric: "functional.acceptance_rate_pct",
        value: acceptanceRate,
        threshold: THRESHOLDS.acceptance_rate_critical_pct,
      });
    } else if (
      acceptanceRate > 0 &&
      acceptanceRate < THRESHOLDS.acceptance_rate_warning_pct
    ) {
      alerts.push({
        level: "warning",
        category: "functional",
        message: `Taux d'acceptation IA bas (${acceptanceRate.toFixed(1)} %)`,
        metric: "functional.acceptance_rate_pct",
        value: acceptanceRate,
        threshold: THRESHOLDS.acceptance_rate_warning_pct,
      });
    }
    if (treatmentRate < THRESHOLDS.treatment_rate_warning_pct) {
      alerts.push({
        level: "warning",
        category: "functional",
        message: `Patches IA non triés (${treatmentRate.toFixed(0)} % traités)`,
        metric: "functional.treatment_rate_pct",
        value: treatmentRate,
        threshold: THRESHOLDS.treatment_rate_warning_pct,
      });
    }
  }
  if (ttfiAvg !== null) {
    if (ttfiAvg >= THRESHOLDS.ttfi_critical_seconds) {
      alerts.push({
        level: "critical",
        category: "functional",
        message: `Time-to-first-IA critique (${ttfiAvg.toFixed(1)} s)`,
        metric: "functional.time_to_first_ai_seconds",
        value: ttfiAvg,
        threshold: THRESHOLDS.ttfi_critical_seconds,
      });
    } else if (ttfiAvg >= THRESHOLDS.ttfi_warning_seconds) {
      alerts.push({
        level: "warning",
        category: "functional",
        message: `Time-to-first-IA élevé (${ttfiAvg.toFixed(1)} s)`,
        metric: "functional.time_to_first_ai_seconds",
        value: ttfiAvg,
        threshold: THRESHOLDS.ttfi_warning_seconds,
      });
    }
  }

  return {
    cycle_time_minutes_avg: cycleAvg !== null ? round(cycleAvg, 1) : null,
    cycle_time_minutes_median: cycleMed !== null ? round(cycleMed, 1) : null,
    media_per_visit_avg: round(mediaPerVisit, 2),
    time_to_first_ai_seconds_avg: ttfiAvg !== null ? round(ttfiAvg, 2) : null,
    patches_proposed: proposed,
    patches_validated: validated,
    patches_rejected: rejected,
    patches_unvalidated: unvalidated,
    patches_acceptance_rate_pct: round(acceptanceRate, 1),
    patches_treatment_rate_pct: round(treatmentRate, 1),
    json_state_completeness_pct:
      completeness !== null ? round(completeness, 1) : null,
    visits_with_ai_pct: round(visitsWithAiPct, 1),
    media_capture_rate_pct: round(mediaCaptureRate, 1),
    status: alerts.some((a) => a.level === "critical")
      ? "critical"
      : alerts.length
        ? "warning"
        : "ok",
    alerts,
  };
}

/**
 * Scanne récursivement un visit_json_state.state pour compter les Field<T>
 * (objets ayant {value, source, validation_status}).
 */
function scanFieldT(node: unknown): {
  proposed: number;
  validated: number;
  rejected: number;
  unvalidated: number;
  totalFields: number;
  filledFields: number;
} {
  const acc = {
    proposed: 0,
    validated: 0,
    rejected: 0,
    unvalidated: 0,
    totalFields: 0,
    filledFields: 0,
  };
  walk(node);
  return acc;

  function walk(n: unknown): void {
    if (n === null || n === undefined) return;
    if (Array.isArray(n)) {
      for (const it of n) walk(it);
      return;
    }
    if (typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    // Field<T> heuristic : a "value" key + "source" + "validation_status".
    if (
      "value" in obj &&
      "source" in obj &&
      "validation_status" in obj &&
      typeof obj.validation_status === "string"
    ) {
      acc.totalFields++;
      const filled = obj.value !== null && obj.value !== undefined &&
        obj.value !== "";
      if (filled) acc.filledFields++;
      const src = obj.source as string;
      const status = obj.validation_status as string;
      if (src === "ai_infer") acc.proposed++;
      if (status === "validated") acc.validated++;
      else if (status === "rejected") acc.rejected++;
      else if (status === "unvalidated" && src === "ai_infer") acc.unvalidated++;
      // ne pas descendre dans la value (souvent primitive)
      return;
    }
    for (const k of Object.keys(obj)) walk(obj[k]);
  }
}

// ---------------------------------------------------------------------------
// OKRs
// ---------------------------------------------------------------------------

function buildOkrs(input: {
  functional: FunctionalKpis;
  llm: LlmHealth;
  usage: UsageStats;
}): OkrTracking {
  const { functional, llm, usage } = input;

  const objectives: OkrTracking["objectives"] = [
    {
      id: "obj-1",
      title: "Délivrer une saisie terrain ultra-rapide",
      description:
        "Réduire le temps perdu en saisie manuelle, gagner du temps sur le terrain.",
      keyResults: [
        {
          id: "kr-1.1",
          label: "Cycle time moyen d'une VT",
          current: functional.cycle_time_minutes_avg ?? 0,
          target: 25,
          unit: "min",
          higher_is_better: false,
          progress_pct: progressLowerIsBetter(
            functional.cycle_time_minutes_avg,
            25,
            120,
          ),
          on_track: (functional.cycle_time_minutes_avg ?? 999) <= 30,
          source:
            "moyenne(last_message_ts − visit.created_at) sur les VTs créées dans la fenêtre",
        },
        {
          id: "kr-1.2",
          label: "Time-to-first-IA",
          current: functional.time_to_first_ai_seconds_avg ?? 0,
          target: 8,
          unit: "s",
          higher_is_better: false,
          progress_pct: progressLowerIsBetter(
            functional.time_to_first_ai_seconds_avg,
            8,
            30,
          ),
          on_track: (functional.time_to_first_ai_seconds_avg ?? 999) <= 10,
          source: "moyenne(1er msg assistant − 1er msg user) par VT",
        },
        {
          id: "kr-1.3",
          label: "Latence p95 LLM",
          current: llm.latency_ms ? Math.round(llm.latency_ms.p95) : 0,
          target: 8000,
          unit: "ms",
          higher_is_better: false,
          progress_pct: progressLowerIsBetter(
            llm.latency_ms?.p95 ?? null,
            8000,
            25000,
          ),
          on_track: (llm.latency_ms?.p95 ?? 0) <= 10000,
          source: "p95 sur llm_extractions.latency_ms (fenêtre courante)",
        },
      ],
    },
    {
      id: "obj-2",
      title: "Faire confiance aux extractions IA",
      description: "Maximiser la qualité perçue des suggestions IA inline.",
      keyResults: [
        {
          id: "kr-2.1",
          label: "Taux d'acceptation des patches IA",
          current: functional.patches_acceptance_rate_pct,
          target: 80,
          unit: "%",
          higher_is_better: true,
          progress_pct: progressHigherIsBetter(
            functional.patches_acceptance_rate_pct,
            80,
          ),
          on_track: functional.patches_acceptance_rate_pct >= 70,
          source:
            "validated / (validated + rejected) — scan des Field<T> dans visit_json_state",
        },
        {
          id: "kr-2.2",
          label: "Patches IA traités (non laissés en attente)",
          current: functional.patches_treatment_rate_pct,
          target: 90,
          unit: "%",
          higher_is_better: true,
          progress_pct: progressHigherIsBetter(
            functional.patches_treatment_rate_pct,
            90,
          ),
          on_track: functional.patches_treatment_rate_pct >= 80,
          source: "(validated + rejected) / proposed — patches non ignorés",
        },
        {
          id: "kr-2.3",
          label: "Taux d'erreur LLM",
          current: llm.error_rate_pct,
          target: 2,
          unit: "%",
          higher_is_better: false,
          progress_pct: progressLowerIsBetter(llm.error_rate_pct, 2, 20),
          on_track: llm.error_rate_pct <= 5,
          source: "1 − success / total sur llm_extractions",
        },
      ],
    },
    {
      id: "obj-3",
      title: "Capturer la réalité du terrain",
      description:
        "Pas une VT sans photo ni audio : la donnée brute c'est notre preuve.",
      keyResults: [
        {
          id: "kr-3.1",
          label: "Médias capturés par VT",
          current: functional.media_per_visit_avg,
          target: 5,
          unit: "média/VT",
          higher_is_better: true,
          progress_pct: progressHigherIsBetter(
            functional.media_per_visit_avg,
            5,
          ),
          on_track: functional.media_per_visit_avg >= 3,
          source: "count(attachments) / count(visits) sur la fenêtre",
        },
        {
          id: "kr-3.2",
          label: "VT avec ≥1 média",
          current: functional.media_capture_rate_pct,
          target: 95,
          unit: "%",
          higher_is_better: true,
          progress_pct: progressHigherIsBetter(
            functional.media_capture_rate_pct,
            95,
          ),
          on_track: functional.media_capture_rate_pct >= 90,
          source: "count(VT distinctes ayant ≥1 attachment) / total VT",
        },
        {
          id: "kr-3.3",
          label: "Complétude moyenne du JSON state",
          current: functional.json_state_completeness_pct ?? 0,
          target: 75,
          unit: "%",
          higher_is_better: true,
          progress_pct: progressHigherIsBetter(
            functional.json_state_completeness_pct ?? 0,
            75,
          ),
          on_track: (functional.json_state_completeness_pct ?? 0) >= 60,
          source:
            "champs Field<T> avec value non-null / total champs scannés (toutes sections)",
        },
      ],
    },
    {
      id: "obj-4",
      title: "Adoption produit",
      description: "Faire venir et revenir les thermiciens.",
      keyResults: [
        {
          id: "kr-4.1",
          label: "Utilisateurs actifs (fenêtre)",
          current: usage.unique_active_users,
          target: 10,
          unit: "users",
          higher_is_better: true,
          progress_pct: progressHigherIsBetter(usage.unique_active_users, 10),
          on_track: usage.unique_active_users >= 5,
          source: "DISTINCT user_id sur visits + messages dans la fenêtre",
        },
        {
          id: "kr-4.2",
          label: "VT avec assistance IA utilisée",
          current: functional.visits_with_ai_pct,
          target: 90,
          unit: "%",
          higher_is_better: true,
          progress_pct: progressHigherIsBetter(
            functional.visits_with_ai_pct,
            90,
          ),
          on_track: functional.visits_with_ai_pct >= 75,
          source: "VT avec ≥1 message assistant / VT créées sur la fenêtre",
        },
      ],
    },
  ];

  return { period: OKR_PERIOD, objectives };
}

function progressHigherIsBetter(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, round((current / target) * 100, 1)));
}

function progressLowerIsBetter(
  current: number | null,
  target: number,
  worstCase: number,
): number {
  if (current === null || current === undefined) return 0;
  if (current <= target) return 100;
  if (current >= worstCase) return 0;
  return Math.max(
    0,
    Math.min(100, round(((worstCase - current) / (worstCase - target)) * 100, 1)),
  );
}

// ---------------------------------------------------------------------------
// Time series (fixe : 7 jours, par jour)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeTimeSeries(admin: any): Promise<TimeSeries> {
  const days: string[] = [];
  const now = new Date();
  // J-6 → J inclus
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    days.push(d.toISOString().slice(0, 10));
  }
  const start = new Date(days[0] + "T00:00:00.000Z").toISOString();

  const [visits, llmCalls, errs, actionsCards] = await Promise.all([
    admin
      .from("visits")
      .select("created_at")
      .gte("created_at", start)
      .limit(10000),
    admin
      .from("llm_extractions")
      .select("created_at, status")
      .gte("created_at", start)
      .limit(10000),
    admin
      .from("llm_extractions")
      .select("created_at")
      .gte("created_at", start)
      .neq("status", "success")
      .limit(10000),
    admin
      .from("messages")
      .select("created_at, metadata")
      .eq("kind", "actions_card")
      .gte("created_at", start)
      .limit(10000),
  ]);

  const visitsByDay = bucketize(days, (visits.data ?? []).map((r: { created_at: string }) => r.created_at));
  const llmByDay = bucketize(days, (llmCalls.data ?? []).map((r: { created_at: string }) => r.created_at));
  const errsByDay = bucketize(days, (errs.data ?? []).map((r: { created_at: string }) => r.created_at));
  const patchesByDay = days.map(() => 0);
  for (const m of actionsCards.data ?? []) {
    const day = String(m.created_at).slice(0, 10);
    const idx = days.indexOf(day);
    if (idx >= 0) {
      const meta = (m.metadata ?? {}) as {
        proposed_patches?: unknown[];
        proposed_custom_fields?: unknown[];
      };
      patchesByDay[idx] += (meta.proposed_patches?.length ?? 0) +
        (meta.proposed_custom_fields?.length ?? 0);
    }
  }

  return {
    days,
    visits_per_day: visitsByDay,
    llm_calls_per_day: llmByDay,
    llm_errors_per_day: errsByDay,
    patches_proposed_per_day: patchesByDay,
  };
}

function bucketize(days: string[], timestamps: string[]): number[] {
  const out = days.map(() => 0);
  for (const ts of timestamps) {
    const day = String(ts).slice(0, 10);
    const idx = days.indexOf(day);
    if (idx >= 0) out[idx]++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Infra
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeInfraHealth(admin: any): Promise<InfraHealth> {
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
  functional: FunctionalKpis,
): Promise<TimelineEvent[]> {
  const out: TimelineEvent[] = [];
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
  // Inject functional alerts as events
  const nowIso = new Date().toISOString();
  for (const a of functional.alerts) {
    out.push({
      ts: nowIso,
      level: a.level === "critical" ? "error" : "warning",
      source: "functional",
      message: a.message,
      meta: a.metric ? { metric: a.metric, value: a.value, threshold: a.threshold } : undefined,
    });
  }
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

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function sumValues(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
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
