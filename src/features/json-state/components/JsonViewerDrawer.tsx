import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { JsonView, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import {
  Copy,
  Check,
  AlertTriangle,
  X,
  Camera,
  Layers,
  FileText,
  Sparkles,
  ListFilter,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { getDb, getLatestLocalJsonState, type LocalMessage } from "@/shared/db";
import { listVisitMedia } from "@/shared/photo";
import {
  rejectSectionPatches,
  validateSectionPatches,
} from "@/shared/db/json-state.validate.repo";
import { useAuth } from "@/features/auth";
import {
  countLowConfidenceFields,
  countUnvalidatedAiFields,
} from "../lib/inspect";
import {
  listSectionsWithUnvalidatedAi,
  listUnvalidatedAiFieldsInSection,
} from "../lib/section-paths";
import { findActiveConflicts } from "../lib/conflicts";
import { labelForPath, formatPatchValue } from "@/shared/llm/path-labels";

interface JsonViewerDrawerProps {
  visitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-sélectionne le mode "À traiter" à l'ouverture (it. 11). */
  initialMode?: "tree" | "todo";
}

/** Libellés FR des sections top-level. */
const SECTION_LABELS: Record<string, string> = {
  meta: "Identité de la visite",
  building: "Bâtiment",
  envelope: "Enveloppe",
  walls: "Murs",
  roof: "Toiture",
  windows: "Menuiseries",
  floor: "Plancher bas",
  heating: "Chauffage",
  hot_water: "Eau chaude sanitaire",
  ventilation: "Ventilation",
  cooling: "Climatisation",
  process: "Procédés",
  appliances: "Équipements",
  lighting: "Éclairage",
  observations: "Observations",
  recommendations: "Recommandations",
  notes: "Notes",
};

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key.replace(/_/g, " ");
}

/**
 * Drawer JSON viewer — KNOWLEDGE §2 (JSON = source de vérité).
 *
 * It. 11 :
 *  - Toggle "Arbre / À traiter" : en mode "À traiter", on liste par
 *    section les Field<T> IA non-validés + les conflits actifs, avec
 *    actions de masse "Tout valider" / "Tout rejeter" par section.
 *  - Sticky header de section, animation discrète, layout type Linear.
 */
export function JsonViewerDrawer({
  visitId,
  open,
  onOpenChange,
  initialMode = "tree",
}: JsonViewerDrawerProps) {
  const userId = useAuth((s) => s.user?.id);
  const latest = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
  );
  const allMessages = useLiveQuery(
    () =>
      getDb().messages.where("visit_id").equals(visitId).toArray(),
    [visitId],
    [] as LocalMessage[],
  );

  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"tree" | "todo">(initialMode);

  // Re-sync mode si initialMode change (header badges)
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const lowCount = useMemo(
    () => (latest ? countLowConfidenceFields(latest.state) : 0),
    [latest],
  );
  const unvalidatedAiCount = useMemo(
    () => (latest ? countUnvalidatedAiFields(latest.state) : 0),
    [latest],
  );
  const activeConflicts = useMemo(
    () => (latest ? findActiveConflicts(latest.state, allMessages) : []),
    [latest, allMessages],
  );
  const conflictPathsBySection = useMemo(() => {
    const map: Record<string, typeof activeConflicts> = {};
    for (const c of activeConflicts) {
      const section = c.path.split(".")[0]!;
      (map[section] ||= []).push(c);
    }
    return map;
  }, [activeConflicts]);

  // Sections avec quelque chose à traiter (champ IA OU conflit).
  const todoSections = useMemo(() => {
    if (!latest) return [] as string[];
    const fromAi = listSectionsWithUnvalidatedAi(latest.state);
    const fromConflicts = Object.keys(conflictPathsBySection);
    const all = new Set<string>([...fromAi, ...fromConflicts]);
    return Array.from(all);
  }, [latest, conflictPathsBySection]);

  const media = useLiveQuery(() => listVisitMedia(visitId), [visitId], []);
  const mediaStats = useMemo(() => {
    const photo = media.filter((m) => m.media_profile === "photo").length;
    const plan = media.filter((m) => m.media_profile === "plan").length;
    const pdf = media.filter((m) => m.media_profile === "pdf").length;
    return { total: media.length, photo, plan, pdf };
  }, [media]);

  async function handleCopy() {
    if (!latest) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(latest.state, null, 2),
      );
      setCopied(true);
      toast.success("JSON copié", {
        description: `Version ${latest.version}`,
      });
    } catch {
      toast.error("Impossible de copier le JSON");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideCloseButton
        className="safe-top safe-bottom safe-x flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border p-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="font-heading text-base">
                {latest ? `JSON state v${latest.version}` : "État JSON"}
              </SheetTitle>
              <SheetDescription className="font-body text-xs text-muted-foreground">
                Source de vérité — versionné, append-only.
              </SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopy()}
                disabled={!latest}
                className="font-ui"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copié
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copier JSON
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Fermer le panneau JSON"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Badges synthèse */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {lowCount > 0 ? (
              <span
                className="font-ui inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-medium text-warning"
                role="status"
                data-testid="low-confidence-badge"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {lowCount} champ{lowCount > 1 ? "s" : ""} à vérifier
              </span>
            ) : null}
            {unvalidatedAiCount > 0 ? (
              <span
                className="font-ui inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                role="status"
                data-testid="unvalidated-ai-badge"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {unvalidatedAiCount} IA à valider
              </span>
            ) : null}
            {activeConflicts.length > 0 ? (
              <span
                className="font-ui inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive"
                role="status"
                data-testid="active-conflicts-badge"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {activeConflicts.length} conflit
                {activeConflicts.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          {/* Compteurs médias */}
          <div
            className="mt-2 flex flex-wrap items-center gap-2"
            data-testid="media-counters"
          >
            <span className="font-ui inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {mediaStats.total} média{mediaStats.total > 1 ? "s" : ""}
            </span>
            {mediaStats.photo > 0 ? (
              <span className="font-ui inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Camera className="h-3 w-3" /> {mediaStats.photo}
              </span>
            ) : null}
            {mediaStats.plan > 0 ? (
              <span className="font-ui inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Layers className="h-3 w-3" /> {mediaStats.plan}
              </span>
            ) : null}
            {mediaStats.pdf > 0 ? (
              <span className="font-ui inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <FileText className="h-3 w-3" /> {mediaStats.pdf}
              </span>
            ) : null}
          </div>

          {/* Toggle Arbre / À traiter */}
          <div
            className="mt-3 inline-flex self-start rounded-lg bg-muted p-0.5"
            role="tablist"
            aria-label="Mode d'affichage du JSON"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "tree"}
              onClick={() => setMode("tree")}
              data-testid="json-mode-tree"
              className={[
                "font-ui rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                mode === "tree"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              Arbre
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "todo"}
              onClick={() => setMode("todo")}
              data-testid="json-mode-todo"
              className={[
                "font-ui inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                mode === "todo"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <ListFilter className="h-3 w-3" aria-hidden="true" />
              À traiter
              {unvalidatedAiCount + activeConflicts.length > 0 ? (
                <span className="bg-primary text-primary-foreground ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                  {unvalidatedAiCount + activeConflicts.length}
                </span>
              ) : null}
            </button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          {!latest ? (
            <p className="font-body p-4 text-sm text-muted-foreground">
              État pas encore chargé (synchro en cours).
            </p>
          ) : mode === "tree" ? (
            <div className="p-4 font-mono text-xs" data-testid="json-viewer-tree">
              <JsonView
                data={latest.state as unknown as object}
                style={defaultStyles}
                shouldExpandNode={(level) => level < 2}
                clickToExpandNode
              />
            </div>
          ) : (
            <TodoView
              userId={userId ?? null}
              visitId={visitId}
              state={latest.state}
              sections={todoSections}
              conflictsBySection={conflictPathsBySection}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Mode "À traiter"
// ---------------------------------------------------------------------------

interface TodoViewProps {
  userId: string | null;
  visitId: string;
  state: import("@/shared/types").VisitJsonState;
  sections: string[];
  conflictsBySection: Record<string, ReturnType<typeof findActiveConflicts>>;
}

function TodoView({
  userId,
  visitId,
  state,
  sections,
  conflictsBySection,
}: TodoViewProps) {
  if (sections.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <span className="bg-primary/10 text-primary inline-flex h-12 w-12 items-center justify-center rounded-full">
          <Check className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="font-body text-sm text-foreground">Tout est arbitré.</p>
        <p className="font-ui text-muted-foreground text-xs">
          Tu peux générer le rapport sereinement.
        </p>
      </div>
    );
  }

  return (
    <ul
      className="divide-border divide-y"
      data-testid="json-viewer-todo"
    >
      {sections.map((sec) => (
        <SectionBlock
          key={sec}
          userId={userId}
          visitId={visitId}
          state={state}
          sectionKey={sec}
          conflicts={conflictsBySection[sec] ?? []}
        />
      ))}
    </ul>
  );
}

function SectionBlock({
  userId,
  visitId,
  state,
  sectionKey,
  conflicts,
}: {
  userId: string | null;
  visitId: string;
  state: import("@/shared/types").VisitJsonState;
  sectionKey: string;
  conflicts: ReturnType<typeof findActiveConflicts>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState<"none" | "validate" | "reject">("none");

  const aiFields = useMemo(
    () => listUnvalidatedAiFieldsInSection(state, sectionKey),
    [state, sectionKey],
  );

  const total = aiFields.length + conflicts.length;
  if (total === 0) return null;

  const onValidateAll = async () => {
    if (!userId || busy !== "none" || aiFields.length === 0) return;
    setBusy("validate");
    try {
      const r = await validateSectionPatches({
        userId,
        visitId,
        sectionKey,
      });
      if (r.status === "ok") {
        toast.success(
          `${r.applied_count} champ${r.applied_count > 1 ? "s" : ""} validé${r.applied_count > 1 ? "s" : ""} (${sectionLabel(sectionKey)})`,
        );
      }
    } catch (err) {
      toast.error("Validation en masse échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy("none");
    }
  };

  const onRejectAll = async () => {
    if (!userId || busy !== "none" || aiFields.length === 0) return;
    setBusy("reject");
    try {
      const r = await rejectSectionPatches({
        userId,
        visitId,
        sectionKey,
      });
      if (r.status === "ok") {
        toast.success(
          `${r.applied_count} champ${r.applied_count > 1 ? "s" : ""} rejeté${r.applied_count > 1 ? "s" : ""} (${sectionLabel(sectionKey)})`,
        );
      }
    } catch (err) {
      toast.error("Rejet en masse échoué", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy("none");
    }
  };

  return (
    <li data-testid={`section-block-${sectionKey}`}>
      {/* Sticky section header */}
      <div className="bg-background/95 sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="font-ui text-foreground inline-flex items-center gap-1.5 text-[12px] font-semibold"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={[
              "h-3.5 w-3.5 transition-transform",
              expanded ? "" : "-rotate-90",
            ].join(" ")}
            aria-hidden="true"
          />
          {sectionLabel(sectionKey)}
        </button>
        <span className="font-ui text-muted-foreground text-[10px]">
          {aiFields.length > 0 ? `${aiFields.length} IA` : null}
          {aiFields.length > 0 && conflicts.length > 0 ? " · " : null}
          {conflicts.length > 0 ? (
            <span className="text-destructive">
              {conflicts.length} conflit{conflicts.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {aiFields.length > 0 ? (
            <>
              <button
                type="button"
                onClick={onRejectAll}
                disabled={busy !== "none"}
                aria-label={`Tout rejeter (${sectionLabel(sectionKey)})`}
                className="border-border text-muted-foreground hover:bg-muted font-ui inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium disabled:opacity-50"
                data-testid={`reject-section-${sectionKey}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Tout rejeter
              </button>
              <button
                type="button"
                onClick={onValidateAll}
                disabled={busy !== "none"}
                aria-label={`Tout valider (${sectionLabel(sectionKey)})`}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-ui inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm disabled:opacity-50"
                data-testid={`validate-section-${sectionKey}`}
              >
                <Check className="h-3 w-3" aria-hidden="true" />
                Tout valider
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Liste des champs */}
      {expanded ? (
        <ul className="divide-border/40 divide-y">
          {aiFields.map(({ path, field }) => (
            <li
              key={path}
              className="flex items-center justify-between gap-2 px-3 py-2"
              data-testid={`todo-field-${path}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-ui text-foreground truncate text-[12px] font-medium">
                  {labelForPath(path)}
                </p>
                <p className="font-body text-muted-foreground truncate text-[12px]">
                  {formatPatchValue(field.value)}
                  <ConfidenceMark
                    confidence={field.confidence ?? "medium"}
                  />
                </p>
              </div>
              <span className="font-ui bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> IA
              </span>
            </li>
          ))}
          {conflicts.map((c) => (
            <li
              key={`conflict-${c.path}`}
              className="px-3 py-2"
              data-testid={`todo-conflict-${c.path}`}
            >
              <p className="font-ui text-foreground truncate text-[12px] font-medium">
                {c.label}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <div className="bg-muted/40 rounded px-1.5 py-1">
                  <p className="font-ui text-muted-foreground text-[9px] uppercase tracking-wide">
                    Vous
                  </p>
                  <p className="font-body text-foreground line-clamp-2 text-[12px]">
                    {c.humanValue}
                  </p>
                </div>
                <div className="bg-muted/40 rounded px-1.5 py-1">
                  <p className="font-ui text-muted-foreground text-[9px] uppercase tracking-wide">
                    IA
                  </p>
                  <p className="font-body text-foreground line-clamp-2 text-[12px]">
                    {c.aiValue}
                  </p>
                </div>
              </div>
              <p className="font-ui text-muted-foreground mt-1 text-[10px] italic">
                Arbitre depuis le chat (carte conflit).
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ConfidenceMark({
  confidence,
}: {
  confidence: "low" | "medium" | "high";
}) {
  const labels = { low: "·", medium: "··", high: "···" } as const;
  return (
    <span
      className="text-muted-foreground ml-1.5 text-[10px] tracking-wider"
      aria-label={`Confiance ${confidence}`}
    >
      {labels[confidence]}
    </span>
  );
}
