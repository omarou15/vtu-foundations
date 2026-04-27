/**
 * VTU — Itération 12 : Vue Synthèse (lecture humaine d'une VT).
 *
 * Lecture seule. Accessible depuis le menu hamburger en haut de la VT.
 * Pensée pour relire en fin de visite ou montrer à un client.
 *
 * Layout : header sticky + carte récap globale + carte par section
 * top-level (icône thématique, valeurs formatées, badges statut, strip
 * de miniatures photos).
 *
 * Pas d'édition ici — pour modifier, on revient au chat ou au drawer JSON.
 */

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Home,
  Layers,
  Flame,
  Droplets,
  Wind,
  Snowflake,
  Sun,
  Cog,
  Lightbulb,
  AlertTriangle,
  ListChecks,
  StickyNote,
  Sparkles,
  CheckCircle2,
  Camera,
  ChevronRight,
  FileText,
  ImageOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getDb, type LocalAttachment, type LocalMessage } from "@/shared/db";
import { getLatestLocalJsonState } from "@/shared/db";
import { listVisitMedia } from "@/shared/photo";
import { findActiveConflicts } from "@/features/json-state/lib/conflicts";
import {
  buildSectionSummary,
  countSummaryGlobals,
  groupMediaBySection,
  isSectionFullyEmpty,
  sectionHasCriticalEmpty,
  type SummaryEntry,
} from "../lib/summary";
import { listEmptyCriticalPaths } from "../lib/critical-fields";
import { MediaLightbox } from "@/features/chat/components/MediaLightbox";

interface VisitSummaryViewProps {
  visitId: string;
  visitTitle: string;
}

// ---------------------------------------------------------------------------
// Section meta : ordre, libellé, icône thématique.
// ---------------------------------------------------------------------------

interface SectionDef {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Section identité = rendue spécialement (pas de strip photo). */
  isMeta?: boolean;
}

// On utilise Layers pour "Enveloppe" — pas d'icône brique dispo dans
// lucide-react. Icônes thématiques choisies pour rester reconnaissables
// (Flame=chauffage, Droplets=ECS, Wind=ventilation, Snowflake=clim, Sun=PV).
const SECTIONS: SectionDef[] = [
  { key: "meta", label: "Identification", Icon: Home, isMeta: true },
  { key: "building", label: "Bâtiment", Icon: Home },
  { key: "envelope", label: "Enveloppe", Icon: Layers },
  { key: "heating", label: "Chauffage", Icon: Flame },
  { key: "ecs", label: "Eau chaude sanitaire", Icon: Droplets },
  { key: "ventilation", label: "Ventilation", Icon: Wind },
  { key: "cooling", label: "Climatisation", Icon: Snowflake },
  { key: "energy_production", label: "Production d'énergie", Icon: Sun },
  { key: "industriel_processes", label: "Procédés industriels", Icon: Cog },
  { key: "tertiaire_hors_cvc", label: "Tertiaire hors CVC", Icon: Lightbulb },
  { key: "pathologies", label: "Pathologies", Icon: AlertTriangle },
  { key: "preconisations", label: "Préconisations", Icon: ListChecks },
  { key: "notes", label: "Notes", Icon: StickyNote },
  { key: "custom_observations", label: "Observations libres", Icon: StickyNote },
];


// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function VisitSummaryView({ visitId, visitTitle }: VisitSummaryViewProps) {
  const latest = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
  );
  const messages = useLiveQuery(
    () => getDb().messages.where("visit_id").equals(visitId).toArray(),
    [visitId],
    [] as LocalMessage[],
  );
  const media = useLiveQuery(
    () => listVisitMedia(visitId),
    [visitId],
    [] as LocalAttachment[],
  );

  const state = latest?.state ?? null;

  const conflictPaths = useMemo(() => {
    const set = new Set<string>();
    if (!state) return set;
    for (const c of findActiveConflicts(state, messages)) set.add(c.path);
    return set;
  }, [state, messages]);

  const emptyCriticalPaths = useMemo(() => {
    if (!state) return new Set<string>();
    return new Set(listEmptyCriticalPaths(state));
  }, [state]);

  const globals = useMemo(
    () => countSummaryGlobals(state, messages),
    [state, messages],
  );

  const mediaBySection = useMemo(
    () => groupMediaBySection(media),
    [media],
  );

  // Lightbox sur strip photos
  const [lightbox, setLightbox] = useState<{
    items: LocalAttachment[];
    index: number;
  } | null>(null);

  if (!state) {
    return (
      <div className="flex min-h-dvh flex-col bg-background safe-x">
        <SummaryHeader visitId={visitId} />
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
          <p className="font-body text-sm text-muted-foreground">
            Synthèse pas encore disponible — synchro en cours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background safe-x">
      <SummaryHeader visitId={visitId} title={visitTitle} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 md:px-6 md:py-6">
        {/* Bandeau global */}
        <GlobalCounters globals={globals} />

        {/* Cartes par section */}
        <div className="mt-4 space-y-3">
          {SECTIONS.map((sec) => {
            const entries = buildSectionSummary(
              state,
              sec.key,
              conflictPaths,
              emptyCriticalPaths,
            );
            const sectionMedia = mediaBySection[sec.key] ?? [];
            const hasCritical = sectionHasCriticalEmpty(state, sec.key);
            const fullyEmpty = isSectionFullyEmpty(entries, sectionMedia.length);

            // Cache les sections sans aucun Field<T> (rare — sections vides
            // côté schéma, on n'a rien à montrer).
            if (entries.length === 0 && sectionMedia.length === 0 && !hasCritical) {
              return null;
            }

            return (
              <SectionCard
                key={sec.key}
                visitId={visitId}
                section={sec}
                entries={entries}
                media={sectionMedia}
                fullyEmpty={fullyEmpty}
                hasCritical={hasCritical}
                onOpenMedia={(items, index) => setLightbox({ items, index })}
              />
            );
          })}
        </div>

        <p className="font-ui mt-6 text-center text-[11px] text-muted-foreground">
          Vue lecture seule — pour modifier, retournez au chat ou ouvrez le JSON.
        </p>
      </main>

      {lightbox ? (
        <MediaLightbox
          attachments={lightbox.items}
          initialIndex={lightbox.index}
          open={true}
          onOpenChange={(o) => {
            if (!o) setLightbox(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function SummaryHeader({
  visitId,
  title,
}: {
  visitId: string;
  title?: string;
}) {
  return (
    <header className="safe-top safe-x sticky top-0 z-20 shrink-0 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-3 md:px-6">
        <Link
          to="/visits/$visitId"
          params={{ visitId }}
          className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent"
          aria-label="Retour au chat de la visite"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-sm font-semibold text-foreground">
            Synthèse
          </h1>
          {title ? (
            <p className="font-ui truncate text-xs text-muted-foreground">
              {title}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Bandeau compteurs globaux
// ---------------------------------------------------------------------------

function GlobalCounters({
  globals,
}: {
  globals: ReturnType<typeof countSummaryGlobals>;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      data-testid="summary-globals"
    >
      <CounterPill
        icon={CheckCircle2}
        value={globals.validated}
        label="validés"
        tone="success"
      />
      <CounterPill
        icon={Sparkles}
        value={globals.aiUnvalidated}
        label="IA à valider"
        tone="primary"
      />
      <CounterPill
        icon={AlertTriangle}
        value={globals.emptyCritical}
        label="vides critiques"
        tone="warning"
      />
      <CounterPill
        icon={AlertTriangle}
        value={globals.conflicts}
        label="conflits"
        tone="destructive"
      />
    </div>
  );
}

function CounterPill({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  tone: "success" | "primary" | "warning" | "destructive";
}) {
  const toneCls =
    tone === "success"
      ? "bg-primary/5 text-foreground border-primary/20"
      : tone === "primary"
        ? "bg-primary/10 text-primary border-primary/20"
        : tone === "warning"
          ? "bg-warning/10 text-warning border-warning/20"
          : "bg-destructive/10 text-destructive border-destructive/20";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${toneCls}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <div className="font-heading text-base font-semibold leading-none">
          {value}
        </div>
        <div className="font-ui text-[10px] uppercase tracking-wide opacity-80">
          {label}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carte de section
// ---------------------------------------------------------------------------

function SectionCard({
  visitId,
  section,
  entries,
  media,
  fullyEmpty,
  hasCritical,
  onOpenMedia,
}: {
  visitId: string;
  section: SectionDef;
  entries: SummaryEntry[];
  media: LocalAttachment[];
  fullyEmpty: boolean;
  hasCritical: boolean;
  onOpenMedia: (items: LocalAttachment[], index: number) => void;
}) {
  const filledCount = entries.filter((e) => !e.isEmpty).length;
  // Section repliée par défaut si vide ET non critique.
  const [expanded, setExpanded] = useState(!fullyEmpty || hasCritical);

  const Icon = section.Icon;

  return (
    <section
      className="rounded-xl border border-border bg-card shadow-sm"
      data-testid={`summary-section-${section.key}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="bg-secondary text-secondary-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold text-foreground">
            {section.label}
          </h2>
          <p className="font-ui text-[11px] text-muted-foreground">
            {filledCount} champ{filledCount > 1 ? "s" : ""} renseigné
            {filledCount > 1 ? "s" : ""}
            {media.length > 0
              ? ` · ${media.length} photo${media.length > 1 ? "s" : ""}`
              : null}
          </p>
        </div>
        {hasCritical ? (
          <span
            className="font-ui inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning"
            aria-label="Champ critique manquant"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />À compléter
          </span>
        ) : null}
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className="border-t border-border/60 px-4 py-3">
          {entries.length === 0 && media.length === 0 ? (
            <EmptyHint visitId={visitId} />
          ) : (
            <>
              {entries.length > 0 ? (
                <ul className="space-y-1.5">
                  {entries.map((e) => (
                    <EntryRow key={e.path} entry={e} visitId={visitId} />
                  ))}
                </ul>
              ) : null}

              {media.length > 0 ? (
                <PhotoStrip
                  media={media}
                  onOpen={(i) => onOpenMedia(media, i)}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function EmptyHint({ visitId }: { visitId: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
      <span className="font-ui text-xs text-muted-foreground">
        Aucune information saisie pour cette section.
      </span>
      <Link
        to="/visits/$visitId"
        params={{ visitId }}
        className="font-ui inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Compléter
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EntryRow({
  entry,
  visitId,
}: {
  entry: SummaryEntry;
  visitId: string;
}) {
  const isAi = entry.status === "ai_unvalidated";
  const isConflict = entry.status === "conflict";
  const isEmptyCritical = entry.status === "empty_critical";

  return (
    <li
      className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0"
      data-status={entry.status}
    >
      <div className="min-w-0 flex-1">
        <p className="font-ui truncate text-[12px] text-muted-foreground">
          {entry.label}
        </p>
        <p
          className={`font-body truncate text-sm ${
            entry.isEmpty
              ? "text-muted-foreground/60 italic"
              : isAi
                ? "italic text-foreground"
                : "text-foreground"
          }`}
        >
          {entry.displayValue}
        </p>
      </div>

      {isAi ? (
        <span
          className="font-ui inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
          aria-label="Suggestion IA non validée"
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          IA
        </span>
      ) : null}
      {isConflict ? (
        <span
          className="font-ui inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
          aria-label="Conflit non résolu"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Conflit
        </span>
      ) : null}
      {isEmptyCritical ? (
        <Link
          to="/visits/$visitId"
          params={{ visitId }}
          className="font-ui inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning hover:bg-warning/25"
          aria-label="Compléter ce champ critique"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Compléter
        </Link>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Strip photo
// ---------------------------------------------------------------------------

function PhotoStrip({
  media,
  onOpen,
}: {
  media: LocalAttachment[];
  onOpen: (index: number) => void;
}) {
  return (
    <div
      className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      role="group"
      aria-label="Photos de la section"
    >
      {media.map((m, i) => (
        <PhotoThumb key={m.id} attachment={m} onClick={() => onOpen(i)} />
      ))}
    </div>
  );
}

function PhotoThumb({
  attachment,
  onClick,
}: {
  attachment: LocalAttachment;
  onClick: () => void;
}) {
  const isPdf = attachment.media_profile === "pdf";
  const blob = useLiveQuery(
    async () => {
      if (isPdf) return null;
      const row = await getDb().attachment_blobs.get(attachment.id);
      return row?.thumbnail ?? row?.compressed ?? null;
    },
    [attachment.id, isPdf],
    null as Blob | null,
  );

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-transform active:scale-95"
      aria-label="Voir le média"
    >
      {isPdf ? (
        <div className="bg-primary/5 text-primary flex h-full w-full flex-col items-center justify-center">
          <FileText className="h-5 w-5" aria-hidden="true" />
          <span className="font-ui text-[9px] font-medium">PDF</span>
        </div>
      ) : url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {attachment.sync_status === "synced" ? (
            <ImageOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4 animate-pulse" aria-hidden="true" />
          )}
        </div>
      )}
    </button>
  );
}
