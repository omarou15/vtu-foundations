/**
 * Section "Dev — Inspecteur IA" — Paramètres.
 *
 * Doctrine VTU (refonte avril 2026) :
 *  - Le LLM propose, le user dispose. Aucun rejet silencieux côté apply.
 *  - Toute proposition (patches, insert_entries, custom_fields) est convertie
 *    en action et présentée sur la PendingActionsCard.
 *
 * Page 100 % lecture, 100 % live : on ne montre QUE ce qui s'est réellement
 * passé sur le chat (dernier appel IA persisté dans `llm_extractions`).
 * Pas de catalogue documentaire statique — la doc vit dans le code.
 *
 * Limite assumée : le prompt système et le prompt utilisateur assemblé
 * ne sont pas (encore) persistés. Un futur lot enrichira l'audit.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Copy, Database } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb, type LocalLlmExtraction } from "@/shared/db/schema";

export const Route = createFileRoute("/_authenticated/settings/dev")({
  component: DevInspectorPage,
});

// ---------------------------------------------------------------------------
// Composant racine
// ---------------------------------------------------------------------------

function DevInspectorPage() {
  return (
    <div className="flex flex-col">
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background md:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <Link
            to="/"
            className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent"
            aria-label="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-heading text-base font-semibold tracking-tight">
            Dev — Inspecteur IA
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10 safe-bottom">
        <header className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Inspecteur IA
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            Dernier échange réel entre le chat et le modèle. Doctrine
            « pure proposition » : le LLM propose, le user dispose. Aucun
            rejet silencieux — toute suggestion arrive sur la
            PendingActionsCard pour arbitrage.
          </p>
        </header>

        <LastCallSection />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dernier appel IA (live depuis `llm_extractions`)
// ---------------------------------------------------------------------------

function LastCallSection() {
  const lastCall = useLiveQuery(async () => {
    const db = getDb();
    const all = await db.llm_extractions
      .orderBy("created_at")
      .reverse()
      .limit(50)
      .toArray();
    return (
      all.find(
        (e) =>
          e.mode === "extract_from_message" || e.mode === "conversational_query",
      ) ?? all[0] ?? null
    );
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        icon={<Database className="h-4 w-4" />}
        title="Ce qui est envoyé à l'IA"
        subtitle="Dernier appel chat persisté localement (extract / conversational / describe_media)."
      />
      {lastCall === undefined ? (
        <CardShell>
          <p className="font-body text-sm text-muted-foreground">Chargement…</p>
        </CardShell>
      ) : !lastCall ? (
        <CardShell>
          <p className="font-body text-sm text-muted-foreground">
            Aucun appel IA enregistré localement pour le moment. Lance une
            conversation depuis le chat pour voir apparaître les détails ici.
          </p>
        </CardShell>
      ) : (
        <CallInspector call={lastCall} />
      )}
    </section>
  );
}

function CallInspector({ call }: { call: LocalLlmExtraction }) {
  const bundle = call.context_bundle as Record<string, unknown> | null;
  const recent = useMemo(() => {
    if (!bundle) return null;
    const r = (bundle as { recent_messages?: unknown }).recent_messages;
    return Array.isArray(r) ? r : null;
  }, [bundle]);

  return (
    <CardShell>
      {/* Header méta */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Badge variant="outline" className="font-ui">{call.mode}</Badge>
        <Badge variant={call.status === "success" ? "default" : "destructive"} className="font-ui">
          {call.status}
        </Badge>
        <Badge variant="secondary" className="font-ui">{call.model_version}</Badge>
        <span className="font-ui text-xs text-muted-foreground">
          {new Date(call.created_at).toLocaleString("fr-FR")}
        </span>
        {call.latency_ms != null && (
          <span className="font-ui text-xs text-muted-foreground">
            {call.latency_ms} ms
          </span>
        )}
        {call.input_tokens != null && (
          <span className="font-ui text-xs text-muted-foreground">
            in:{call.input_tokens} / out:{call.output_tokens ?? "?"}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <JsonAccordion label="Context bundle complet" data={bundle} defaultOpen />
        <JsonAccordion
          label={`Historique réellement envoyé (${recent?.length ?? 0} messages — illimité par défaut, compression progressive si dépassement budget)`}
          data={recent ?? "Non disponible dans ce dump"}
        />
        <JsonAccordion
          label="Schema map (collections autorisées + entrées existantes)"
          data={(bundle as { schema_map?: unknown } | null)?.schema_map ?? "Non disponible"}
        />
        <JsonAccordion
          label="Descriptions photos incluses"
          data={(bundle as { attachment_descriptions?: unknown } | null)?.attachment_descriptions ?? []}
        />
        <JsonAccordion
          label="raw_request_summary (résumé du prompt côté engine)"
          data={call.raw_request_summary}
        />
        <JsonAccordion
          label="Réponse brute du modèle (raw_response)"
          data={call.raw_response}
        />
        {call.warnings && call.warnings.length > 0 && (
          <JsonAccordion label="Warnings" data={call.warnings} defaultOpen />
        )}
        {call.error_message && (
          <p className="font-body rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <strong className="font-ui font-semibold">Erreur : </strong>
            {call.error_message}
          </p>
        )}
        <p className="font-body mt-2 text-[11px] italic text-muted-foreground">
          Limite connue : le prompt système et le prompt utilisateur assemblé
          ne sont pas persistés pour ce dump. Un futur lot enregistrera tout
          dans <code className="font-ui">raw_request_summary</code>.
        </p>
      </div>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Primitives UI internes
// ---------------------------------------------------------------------------

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="font-heading flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      <p className="font-body text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {children}
    </div>
  );
}

function JsonAccordion({
  label,
  data,
  defaultOpen = false,
}: {
  label: string;
  data: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const json = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  function copy() {
    void navigator.clipboard.writeText(json).then(
      () => toast.success("Copié dans le presse-papier"),
      () => toast.error("Échec de la copie"),
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-ui flex w-full items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/60"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="relative bg-background">
          <div className="absolute right-2 top-2 z-10">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={copy}
            >
              <Copy className="mr-1 h-3 w-3" />
              <span className="font-ui text-[10px]">Copier</span>
            </Button>
          </div>
          <pre className="font-ui max-h-96 overflow-auto p-3 pr-20 text-[11px] leading-relaxed text-foreground">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
