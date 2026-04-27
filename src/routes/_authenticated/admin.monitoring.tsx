import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Target,
  XCircle,
  Zap,
  Database,
  Users,
  Sparkles,
  Camera,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  useIsAdmin,
  useMonitoring,
  type Alert,
  type KeyResult,
  type MonitoringSnapshot,
  type Objective,
  type Status,
  type TimeSeries,
} from "@/features/admin";

/**
 * Page admin : santé applicative globale (technique + fonctionnel + OKRs).
 */
export const Route = createFileRoute("/_authenticated/admin/monitoring")({
  component: MonitoringPage,
  ssr: false,
});

const HOURS_PRESETS = [1, 6, 24, 72, 168] as const;

function MonitoringPage() {
  const { isAdmin, isLoading: roleLoading, error: roleError } = useIsAdmin();
  const [hours, setHours] = useState<number>(24);
  const [eventLevel, setEventLevel] = useState<"all" | "warning" | "error">("all");
  const [eventSource, setEventSource] = useState<
    "all" | "llm" | "sync" | "usage" | "infra" | "functional"
  >("all");

  const { data, isLoading, isFetching, error, refetch } = useMonitoring({
    enabled: isAdmin,
    hours,
  });

  if (roleLoading) return <CenterSpinner label="Vérification du rôle…" />;
  if (roleError) return <CenterMessage title="Erreur" message={roleError.message} />;
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
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
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-ui inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              aria-label="Actualiser les données"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {isFetching ? "Chargement…" : "Actualiser"}
            </button>
          </div>
        </div>
        {data ? (
          <p className="font-ui text-muted-foreground mx-auto max-w-6xl px-4 pb-2 text-[11px]">
            Dernier snapshot :{" "}
            {new Date(data.generated_at).toLocaleTimeString("fr-FR")} · refresh manuel
          </p>
        ) : null}
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

            {/* ============ OKRs ============ */}
            <OkrSection okrs={data.okrs} />

            {/* ============ KPIs synthétiques ============ */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi
                icon={<Zap className="h-4 w-4" />}
                label="Appels LLM"
                value={data.llm.total_calls}
                sub={`${data.llm.error_rate_pct}% erreurs`}
                status={data.llm.status}
                tooltip="Nombre total d'appels au LLM (extract + describe). Source : table llm_extractions sur la fenêtre."
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
                tooltip="Temps de réponse au-dessus duquel se situent 5 % des appels les plus lents. Cible <8 s. Warning ≥12 s, critique ≥20 s."
              />
              <Kpi
                icon={<Sparkles className="h-4 w-4" />}
                label="Coût estimé"
                value={`$${data.llm.estimated_cost_usd.toFixed(3)}`}
                sub={`${formatTokens(data.llm.total_input_tokens + data.llm.total_output_tokens)} tokens`}
                status="ok"
                tooltip="Tokens × tarif Gemini Flash (0,075 $/M in, 0,30 $/M out). Approximatif. Warning ≥5 $/jour."
              />
              <Kpi
                icon={<Users className="h-4 w-4" />}
                label="Users actifs"
                value={data.usage.unique_active_users}
                sub={`${data.usage.visits_total} VTs créées`}
                status="ok"
                tooltip="Utilisateurs distincts ayant créé une VT ou envoyé un message dans la fenêtre."
              />
            </section>

            {/* ============ Fonctionnel (vrais KPIs métier) ============ */}
            <FunctionalSection data={data} />

            {/* ============ Sparkline 7j ============ */}
            <TimeSeriesSection ts={data.time_series} />

            {/* ============ Technique : LLM, Sync, Infra ============ */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card
                title="Santé LLM"
                status={data.llm.status}
                tooltip="Métriques techniques du moteur d'IA : latences, statuts, codes d'erreur, tokens consommés. Source : llm_extractions."
              >
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
                    ["Tokens sortie", formatTokens(data.llm.total_output_tokens)],
                  ]}
                />
                <SubList title="Par mode" entries={Object.entries(data.llm.by_mode)} />
                <SubList title="Par statut" entries={Object.entries(data.llm.by_status)} />
                {Object.keys(data.llm.by_error_code).length > 0 ? (
                  <SubList
                    title="Codes d'erreur"
                    entries={Object.entries(data.llm.by_error_code)}
                    danger
                  />
                ) : null}
              </Card>

              <Card
                title="Sync & Queue"
                status={data.sync_proxy.status}
                tooltip="Vue serveur de la sync (la queue Dexie locale n'est pas visible). Le 'plus ancien message sans réponse' détecte un Edge Function bloqué."
              >
                <DefList
                  items={[
                    ["VTs créées", data.sync_proxy.visits_created],
                    ["Messages insérés", data.sync_proxy.messages_inserted],
                    ["Attachments insérés", data.sync_proxy.attachments_inserted],
                    ["Versions JSON state", data.sync_proxy.json_state_versions],
                    [
                      "Plus ancien message sans réponse",
                      data.sync_proxy.oldest_pending_message_age_minutes != null
                        ? `${data.sync_proxy.oldest_pending_message_age_minutes} min`
                        : "Aucun",
                    ],
                  ]}
                />
              </Card>

              <Card
                title="Infra Cloud"
                status="ok"
                tooltip="Tailles des tables critiques + dernière écriture. Permet de détecter une table 'figée' ou un débordement inattendu."
              >
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
                          <td className="py-1 pr-2 font-mono text-[11px]">{t.name}</td>
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

              <Card
                title="Volume messages"
                status="ok"
                tooltip="Décomposition des messages échangés. messages_actions_card = nombre de cartes de patches IA générées."
              >
                <DefList
                  items={[
                    ["Messages user", data.usage.messages_user],
                    ["Messages assistant", data.usage.messages_assistant],
                    ["Cards d'actions IA", data.usage.messages_actions_card],
                    [
                      "Photos / PDF",
                      `${data.usage.attachments_photo} / ${data.usage.attachments_pdf}`,
                    ],
                  ]}
                />
              </Card>
            </section>

            {/* ============ Timeline ============ */}
            <Card
              title={`Timeline (${data.events.length})`}
              status="ok"
              tooltip="Chronologie des événements : erreurs LLM, pics de latence, alertes fonctionnelles. Filtrable par niveau et source."
            >
              <div className="mb-2 flex flex-wrap gap-1.5">
                <FilterChip active={eventLevel === "all"} onClick={() => setEventLevel("all")}>
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
                {(["all", "llm", "sync", "usage", "infra", "functional"] as const).map(
                  (s) => (
                    <FilterChip
                      key={s}
                      active={eventSource === s}
                      onClick={() => setEventSource(s)}
                    >
                      {s === "all" ? "Toutes sources" : s}
                    </FilterChip>
                  ),
                )}
              </div>
              <Timeline events={data.events} level={eventLevel} source={eventSource} />
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OKRs
// ---------------------------------------------------------------------------

function OkrSection({ okrs }: { okrs: MonitoringSnapshot["okrs"] }) {
  return (
    <section className="bg-card border-border rounded-lg border p-3 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="text-primary h-4 w-4" aria-hidden="true" />
          <h2 className="font-heading text-sm font-semibold">OKRs — {okrs.period}</h2>
          <InfoTooltip text="Objectives & Key Results : ce que le produit doit atteindre ce trimestre, mesuré sur la fenêtre temporelle sélectionnée. Édite les cibles dans supabase/functions/vtu-monitoring/index.ts (buildOkrs)." />
        </div>
      </header>
      <div className="space-y-3">
        {okrs.objectives.map((o) => (
          <ObjectiveCard key={o.id} objective={o} />
        ))}
      </div>
    </section>
  );
}

function ObjectiveCard({ objective }: { objective: Objective }) {
  const onTrackCount = objective.keyResults.filter((k) => k.on_track).length;
  const total = objective.keyResults.length;
  return (
    <div className="border-border rounded-md border p-2.5">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold">{objective.title}</h3>
        <span
          className={`font-ui rounded-full px-2 py-0.5 text-[10px] font-medium ${
            onTrackCount === total
              ? "bg-primary/15 text-primary"
              : onTrackCount > 0
                ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                : "bg-destructive/15 text-destructive"
          }`}
        >
          {onTrackCount}/{total} on track
        </span>
      </header>
      <p className="font-body text-muted-foreground mb-2 text-[12px]">
        {objective.description}
      </p>
      <ul className="space-y-2">
        {objective.keyResults.map((kr) => (
          <KeyResultRow key={kr.id} kr={kr} />
        ))}
      </ul>
    </div>
  );
}

function KeyResultRow({ kr }: { kr: KeyResult }) {
  const barColor = kr.on_track
    ? "bg-primary"
    : kr.progress_pct >= 50
      ? "bg-yellow-500"
      : "bg-destructive";
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="font-ui truncate text-[12px]">{kr.label}</span>
          <InfoTooltip text={`Source : ${kr.source}. Cible : ${kr.target} ${kr.unit} (${kr.higher_is_better ? "plus = mieux" : "moins = mieux"}).`} />
        </div>
        <span className="font-ui shrink-0 text-[11px] tabular-nums">
          <span className="font-medium">
            {formatNumber(kr.current)} {kr.unit}
          </span>
          <span className="text-muted-foreground"> / {kr.target}</span>
        </span>
      </div>
      <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.max(2, kr.progress_pct)}%` }}
          aria-label={`${kr.progress_pct} % vers la cible`}
        />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Fonctionnel
// ---------------------------------------------------------------------------

function FunctionalSection({ data }: { data: MonitoringSnapshot }) {
  const f = data.functional;
  return (
    <section className="bg-card border-border rounded-lg border p-3 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-primary h-4 w-4" aria-hidden="true" />
          <h2 className="font-heading text-sm font-semibold">Métriques fonctionnelles</h2>
          <InfoTooltip text="Indicateurs métier (pas techniques). Calculés sur les VTs créées dans la fenêtre. Permet d'évaluer la qualité réelle perçue par les thermiciens." />
          <GlobalStatusPill status={f.status} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricTile
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Cycle time moyen"
          value={f.cycle_time_minutes_avg !== null ? `${f.cycle_time_minutes_avg} min` : "—"}
          sub={f.cycle_time_minutes_median !== null ? `médiane ${f.cycle_time_minutes_median} min` : undefined}
          tooltip="Durée entre la création de la VT et son dernier événement (message ou attachment). Mesure le temps réellement passé sur une visite."
        />
        <MetricTile
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Time-to-first-IA"
          value={f.time_to_first_ai_seconds_avg !== null ? `${f.time_to_first_ai_seconds_avg.toFixed(1)} s` : "—"}
          tooltip="Délai moyen entre le 1er message du thermicien et la 1ère réponse de l'IA. Mesure la réactivité perçue."
        />
        <MetricTile
          icon={<Camera className="h-3.5 w-3.5" />}
          label="Médias par VT"
          value={f.media_per_visit_avg.toFixed(1)}
          sub={`${f.media_capture_rate_pct}% VT avec ≥1 média`}
          tooltip="count(attachments) / count(VTs). Mesure la richesse de la capture terrain. Cible : ≥3 médias/VT."
        />
        <MetricTile
          icon={<Database className="h-3.5 w-3.5" />}
          label="Complétude JSON"
          value={f.json_state_completeness_pct !== null ? `${f.json_state_completeness_pct}%` : "—"}
          tooltip="% de champs Field<T> avec une valeur non-nulle dans la dernière version du JSON state de chaque VT. Mesure si les VTs sont 'finies'."
        />
        <MetricTile
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Patches IA proposés"
          value={f.patches_proposed}
          sub={`${f.patches_validated} ✓ · ${f.patches_rejected} ✗ · ${f.patches_unvalidated} en attente`}
          tooltip="Champs où l'IA a fait une suggestion (source=ai_infer). Scan réel des Field<T> dans visit_json_state."
        />
        <MetricTile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Acceptation IA"
          value={`${f.patches_acceptance_rate_pct}%`}
          sub={`Cible ≥80%`}
          tooltip="validated / (validated + rejected). Mesure la qualité perçue des suggestions IA. <60% = signal qu'il faut améliorer le prompt."
        />
        <MetricTile
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Patches traités"
          value={`${f.patches_treatment_rate_pct}%`}
          sub={`Reste ${f.patches_unvalidated} à trier`}
          tooltip="(validated + rejected) / proposed. Si bas, les thermiciens laissent traîner les suggestions = friction UX."
        />
        <MetricTile
          icon={<Users className="h-3.5 w-3.5" />}
          label="VT avec IA"
          value={`${f.visits_with_ai_pct}%`}
          tooltip="% de VT créées dans la fenêtre ayant reçu ≥1 réponse de l'IA. Mesure l'adoption réelle de l'assistant."
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Time series 7j
// ---------------------------------------------------------------------------

function TimeSeriesSection({ ts }: { ts: TimeSeries }) {
  return (
    <section className="bg-card border-border rounded-lg border p-3 shadow-sm">
      <header className="mb-2 flex items-center gap-2">
        <h2 className="font-heading text-sm font-semibold">Tendance 7 jours</h2>
        <InfoTooltip text="Évolution jour par jour sur les 7 derniers jours (indépendant de la fenêtre choisie en haut). Permet de repérer un drop ou un pic." />
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Spark label="VT créées" days={ts.days} values={ts.visits_per_day} color="primary" />
        <Spark label="Appels LLM" days={ts.days} values={ts.llm_calls_per_day} color="primary" />
        <Spark label="Erreurs LLM" days={ts.days} values={ts.llm_errors_per_day} color="destructive" />
        <Spark
          label="Patches proposés"
          days={ts.days}
          values={ts.patches_proposed_per_day}
          color="primary"
        />
      </div>
    </section>
  );
}

function Spark({
  label,
  days,
  values,
  color,
}: {
  label: string;
  days: string[];
  values: number[];
  color: "primary" | "destructive";
}) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 32;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  const total = values.reduce((s, n) => s + n, 0);
  const stroke = color === "destructive" ? "stroke-destructive" : "stroke-primary";
  const today = values[values.length - 1] ?? 0;
  return (
    <div className="border-border rounded-md border p-2">
      <p className="font-ui text-muted-foreground text-[11px]">{label}</p>
      <p className="font-heading text-base font-semibold tabular-nums">
        {today}
        <span className="text-muted-foreground ml-1 text-[10px]">aujourd'hui</span>
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          strokeWidth={1.5}
          className={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="font-ui text-muted-foreground text-[10px]">
        Total 7j : {total} · {days[0].slice(5)} → {days[days.length - 1].slice(5)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants génériques
// ---------------------------------------------------------------------------

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="text-muted-foreground hover:text-foreground inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full"
        aria-label={open ? "Masquer l'info" : "Afficher l'info"}
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="bg-popover text-popover-foreground border-border absolute left-1/2 top-full z-50 mt-1 w-64 max-w-[80vw] -translate-x-1/2 rounded-md border p-2 text-[11px] leading-snug shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

function GlobalStatusPill({ status }: { status: Status }) {
  const cfg = {
    ok: { label: "OK", icon: CheckCircle2, className: "bg-primary/10 text-primary" },
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
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  status: Status;
  tooltip?: string;
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
        {tooltip ? <InfoTooltip text={tooltip} /> : null}
      </div>
      <p className="font-heading mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="font-ui text-muted-foreground text-[11px]">{sub}</p> : null}
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  sub,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tooltip: string;
}) {
  return (
    <div className="border-border rounded-md border p-2">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
        {icon}
        <span className="font-ui">{label}</span>
        <InfoTooltip text={tooltip} />
      </div>
      <p className="font-heading mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {sub ? <p className="font-ui text-muted-foreground text-[10px]">{sub}</p> : null}
    </div>
  );
}

function Card({
  title,
  status,
  tooltip,
  children,
}: {
  title: string;
  status: Status;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border-border rounded-lg border p-3 shadow-sm">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="font-heading text-sm font-semibold">{title}</h2>
          {tooltip ? <InfoTooltip text={tooltip} /> : null}
        </div>
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
              danger ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
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
            {typeof alert.value === "number" ? alert.value.toFixed(1) : alert.value}{" "}
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
  source: "all" | "llm" | "sync" | "usage" | "infra" | "functional";
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

function CenterMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <Database className="text-muted-foreground h-6 w-6" aria-hidden="true" />
      <h1 className="font-heading text-base font-semibold">{title}</h1>
      <p className="font-body text-muted-foreground max-w-sm text-sm">{message}</p>
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

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("fr-FR");
  return n.toFixed(1);
}
