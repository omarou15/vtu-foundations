import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Zap,
  Database,
  Users,
  Sparkles,
} from "lucide-react";
import {
  useIsAdmin,
  useMonitoring,
  type Alert,
  type MonitoringSnapshot,
  type Status,
} from "@/features/admin";

/**
 * Page admin : santé applicative globale.
 *
 * Gate : useIsAdmin() côté client + Edge Function gate côté serveur
 * (has_role(admin)). Refresh auto 30s, fenêtre 24h par défaut.
 */
export const Route = createFileRoute("/_authenticated/admin/monitoring")({
  component: MonitoringPage,
  ssr: false,
});

const HOURS_PRESETS = [1, 6, 24, 72, 168] as const;

function MonitoringPage() {
  const { isAdmin, isLoading: roleLoading, error: roleError } = useIsAdmin();
  const [hours, setHours] = useState<number>(24);
  const [eventLevel, setEventLevel] = useState<"all" | "warning" | "error">(
    "all",
  );
  const [eventSource, setEventSource] = useState<
    "all" | "llm" | "sync" | "usage" | "infra"
  >("all");

  const { data, isLoading, isFetching, error, refetch } = useMonitoring({
    enabled: isAdmin,
    hours,
  });

  if (roleLoading) {
    return <CenterSpinner label="Vérification du rôle…" />;
  }
  if (roleError) {
    return (
      <CenterMessage
        title="Erreur de vérification"
        message={roleError.message}
      />
    );
  }
  if (!isAdmin) {
    return (
      <CenterMessage
        title="Accès refusé"
        message="Cette page est réservée aux administrateurs."
      />
    );
  }

  return (
    <div className="bg-background min-h-dvh">
      <header className="bg-card border-border sticky top-0 z-10 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-full"
              aria-label="Retour"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Activity className="text-primary h-5 w-5" aria-hidden="true" />
            <h1 className="font-heading text-base font-semibold">
              Santé de l'application
            </h1>
            {data ? <GlobalStatusPill status={data.global_status} /> : null}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="bg-background border-border font-ui rounded-md border px-2 py-1 text-xs"
              aria-label="Fenêtre temporelle"
            >
              {HOURS_PRESETS.map((h) => (
                <option key={h} value={h}>
                  {h < 24 ? `${h}h` : `${h / 24}j`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refetch}
              disabled={isFetching}
              className="bg-muted hover:bg-muted/80 inline-flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-50"
              aria-label="Rafraîchir"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        {error ? (
          <div className="border-destructive bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
            <strong>Erreur :</strong> {error.message}
          </div>
        ) : null}

        {isLoading || !data ? (
          <CenterSpinner label="Chargement des métriques…" />
        ) : (
          <>
            {data.global_alerts.length > 0 ? (
              <section aria-label="Alertes globales" className="space-y-2">
                {data.global_alerts.map((a, i) => (
                  <AlertBanner key={i} alert={a} />
                ))}
              </section>
            ) : null}

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi
                icon={<Zap className="h-4 w-4" />}
                label="Appels LLM"
                value={data.llm.total_calls}
                sub={`${data.llm.error_rate_pct}% erreurs`}
                status={data.llm.status}
              />
              <Kpi
                icon={<Activity className="h-4 w-4" />}
                label="Latence p95"
                value={
                  data.llm.latency_ms
                    ? `${Math.round(data.llm.latency_ms.p95)}ms`
                    : "—"
                }
                sub={
                  data.llm.latency_ms
                    ? `p99 ${Math.round(data.llm.latency_ms.p99)}ms`
                    : "Aucune donnée"
                }
                status={data.llm.status}
              />
              <Kpi
                icon={<Sparkles className="h-4 w-4" />}
                label="Coût estimé"
                value={`$${data.llm.estimated_cost_usd.toFixed(3)}`}
                sub={`${formatTokens(data.llm.total_input_tokens + data.llm.total_output_tokens)} tokens`}
                status="ok"
              />
              <Kpi
                icon={<Users className="h-4 w-4" />}
                label="Users actifs"
                value={data.usage.unique_active_users}
                sub={`${data.usage.visits_total} VTs`}
                status="ok"
              />
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Santé LLM" status={data.llm.status}>
                <DefList
                  items={[
                    [
                      "Latence p50",
                      data.llm.latency_ms
                        ? `${Math.round(data.llm.latency_ms.p50)} ms`
                        : "—",
                    ],
                    [
                      "Latence max",
                      data.llm.latency_ms
                        ? `${Math.round(data.llm.latency_ms.max)} ms`
                        : "—",
                    ],
                    ["Tokens entrée", formatTokens(data.llm.total_input_tokens)],
                    [
                      "Tokens sortie",
                      formatTokens(data.llm.total_output_tokens),
                    ],
                  ]}
                />
                <SubList
                  title="Par mode"
                  entries={Object.entries(data.llm.by_mode)}
                />
                <SubList
                  title="Par statut"
                  entries={Object.entries(data.llm.by_status)}
                />
                {Object.keys(data.llm.by_error_code).length > 0 ? (
                  <SubList
                    title="Codes d'erreur"
                    entries={Object.entries(data.llm.by_error_code)}
                    danger
                  />
                ) : null}
              </Card>

              <Card title="Sync & Queue" status={data.sync_proxy.status}>
                <DefList
                  items={[
                    ["VTs créées", data.sync_proxy.visits_created],
                    ["Messages insérés", data.sync_proxy.messages_inserted],
                    [
                      "Attachments insérés",
                      data.sync_proxy.attachments_inserted,
                    ],
                    [
                      "Versions JSON state",
                      data.sync_proxy.json_state_versions,
                    ],
                    [
                      "Plus ancien message sans réponse",
                      data.sync_proxy.oldest_pending_message_age_minutes != null
                        ? `${data.sync_proxy.oldest_pending_message_age_minutes} min`
                        : "Aucun",
                    ],
                  ]}
                />
              </Card>

              <Card title="Usage fonctionnel" status="ok">
                <DefList
                  items={[
                    ["Messages user", data.usage.messages_user],
                    ["Messages assistant", data.usage.messages_assistant],
                    ["Cards d'actions IA", data.usage.messages_actions_card],
                    ["Patches IA proposés", data.usage.patches_proposed],
                    [
                      "Photos / PDF",
                      `${data.usage.attachments_photo} / ${data.usage.attachments_pdf}`,
                    ],
                  ]}
                />
                <p className="font-ui text-muted-foreground mt-2 text-[11px]">
                  Le taux de validation des patches IA est calculé côté client
                  (le scan cross-tenant des Field&lt;T&gt; est différé Phase 3).
                </p>
              </Card>

              <Card title="Infra Cloud" status="ok">
                <div className="overflow-x-auto">
                  <table className="font-ui w-full text-[12px]">
                    <thead className="text-muted-foreground text-left">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Table</th>
                        <th className="py-1 pr-2 font-medium">Lignes</th>
                        <th className="py-1 font-medium">Dernière écriture</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.infra.tables.map((t) => (
                        <tr key={t.name} className="border-border border-t">
                          <td className="py-1 pr-2 font-mono text-[11px]">
                            {t.name}
                          </td>
                          <td className="py-1 pr-2 tabular-nums">
                            {t.row_count.toLocaleString("fr-FR")}
                          </td>
                          <td className="text-muted-foreground py-1 text-[11px]">
                            {t.last_write
                              ? new Date(t.last_write).toLocaleString("fr-FR")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="font-ui text-muted-foreground mt-2 text-[11px]">
                  Buckets storage : {data.infra.buckets.join(" · ")}
                </p>
              </Card>
            </section>

            <Card title={`Timeline (${data.events.length})`} status="ok">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <FilterChip
                  active={eventLevel === "all"}
                  onClick={() => setEventLevel("all")}
                >
                  Tous niveaux
                </FilterChip>
                <FilterChip
                  active={eventLevel === "warning"}
                  onClick={() => setEventLevel("warning")}
                >
                  Warnings
                </FilterChip>
                <FilterChip
                  active={eventLevel === "error"}
                  onClick={() => setEventLevel("error")}
                >
                  Erreurs
                </FilterChip>
                <span className="bg-border mx-1 h-5 w-px" aria-hidden="true" />
                {(["all", "llm", "sync", "usage", "infra"] as const).map((s) => (
                  <FilterChip
                    key={s}
                    active={eventSource === s}
                    onClick={() => setEventSource(s)}
                  >
                    {s === "all" ? "Toutes sources" : s}
                  </FilterChip>
                ))}
              </div>
              <Timeline
                events={data.events}
                level={eventLevel}
                source={eventSource}
              />
            </Card>

            <p className="font-ui text-muted-foreground text-center text-[11px]">
              Snapshot généré à{" "}
              {new Date(data.generated_at).toLocaleTimeString("fr-FR")} ·
              fenêtre {data.window_hours}h · refresh auto 30s
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function GlobalStatusPill({ status }: { status: Status }) {
  const cfg = {
    ok: {
      label: "OK",
      icon: CheckCircle2,
      className: "bg-primary/10 text-primary",
    },
    warning: {
      label: "Warning",
      icon: AlertTriangle,
      className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    },
    critical: {
      label: "Critical",
      icon: XCircle,
      className: "bg-destructive/15 text-destructive",
    },
  }[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`font-ui ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  status: Status;
}) {
  const ring = {
    ok: "border-border",
    warning: "border-yellow-500/40",
    critical: "border-destructive/50",
  }[status];
  return (
    <div className={`bg-card rounded-lg border p-3 shadow-sm ${ring}`}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        {icon}
        <span className="font-ui">{label}</span>
      </div>
      <p className="font-heading mt-1 text-xl font-semibold tabular-nums">
        {value}
      </p>
      {sub ? (
        <p className="font-ui text-muted-foreground text-[11px]">{sub}</p>
      ) : null}
    </div>
  );
}

function Card({
  title,
  status,
  children,
}: {
  title: string;
  status: Status;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border-border rounded-lg border p-3 shadow-sm">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
        <GlobalStatusPill status={status} />
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DefList({ items }: { items: Array<[string, string | number]> }) {
  return (
    <dl className="font-ui grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SubList({
  title,
  entries,
  danger,
}: {
  title: string;
  entries: Array<[string, number]>;
  danger?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="font-ui text-muted-foreground mt-1 text-[10px] uppercase tracking-wider">
        {title}
      </p>
      <ul className="mt-0.5 flex flex-wrap gap-1">
        {entries.map(([k, v]) => (
          <li
            key={k}
            className={`font-ui inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] ${
              danger
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-foreground"
            }`}
          >
            <span className="font-mono text-[10px]">{k}</span>
            <span className="font-medium tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertBanner({ alert }: { alert: Alert }) {
  const isCritical = alert.level === "critical";
  const Icon = isCritical ? XCircle : AlertTriangle;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
        isCritical
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-ui text-[11px] font-semibold uppercase tracking-wider">
          [{alert.category}] {alert.level}
        </p>
        <p className="font-body text-sm">{alert.message}</p>
        {alert.metric ? (
          <p className="font-ui text-[11px] opacity-80">
            {alert.metric} ={" "}
            {typeof alert.value === "number"
              ? alert.value.toFixed(1)
              : alert.value}{" "}
            (seuil {alert.threshold})
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-ui rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {children}
    </button>
  );
}

function Timeline({
  events,
  level,
  source,
}: {
  events: MonitoringSnapshot["events"];
  level: "all" | "warning" | "error";
  source: "all" | "llm" | "sync" | "usage" | "infra";
}) {
  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (level === "all" || e.level === level) &&
          (source === "all" || e.source === source),
      ),
    [events, level, source],
  );
  if (filtered.length === 0) {
    return (
      <p className="font-body text-muted-foreground py-4 text-center text-sm">
        Aucun événement pour ces filtres. ✨
      </p>
    );
  }
  return (
    <ul className="divide-border max-h-96 divide-y overflow-y-auto">
      {filtered.map((e, i) => (
        <li key={i} className="flex items-start gap-2 py-1.5">
          <EventDot level={e.level} />
          <div className="min-w-0 flex-1">
            <p className="font-body break-words text-[12px]">{e.message}</p>
            <p className="font-ui text-muted-foreground text-[10px]">
              {new Date(e.ts).toLocaleString("fr-FR")} · {e.source}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EventDot({ level }: { level: "info" | "warning" | "error" }) {
  const cls = {
    info: "bg-primary/40",
    warning: "bg-yellow-500",
    error: "bg-destructive",
  }[level];
  return (
    <span
      className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`}
      aria-hidden="true"
    />
  );
}

function CenterSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2">
      <div
        className="border-muted border-t-primary h-6 w-6 animate-spin rounded-full border-2"
        aria-hidden="true"
      />
      <p className="font-ui text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function CenterMessage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <Database className="text-muted-foreground h-6 w-6" aria-hidden="true" />
      <h1 className="font-heading text-base font-semibold">{title}</h1>
      <p className="font-body text-muted-foreground max-w-sm text-sm">
        {message}
      </p>
      <Link
        to="/"
        className="bg-primary text-primary-foreground font-ui mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
        Retour
      </Link>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
