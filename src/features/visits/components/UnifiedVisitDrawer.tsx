/**
 * VTU — Itération 13 : Drawer unifié de la VT (3 familles).
 *
 * Un seul panneau qui regroupe TOUT ce qu'on peut consulter ou faire
 * sur une VT, organisé en 3 familles visuellement distinctes :
 *
 *   FAMILLE 1 — Features (analyse & exploration)
 *     · Synthèse   — fiche bâtiment lisible (it. 12)
 *     · JSON       — état brut + mode "À traiter" (it. 11)
 *     · Mapbox     — vue satellite (coming soon)
 *     · Actions IA — historique des propositions IA
 *
 *   FAMILLE 2 — Artifacts (documents)
 *     · Documents (avec sous-onglets Photos / Input / Output)
 *
 *   FAMILLE 3 — Exporter (envoi externe)
 *     · Monday.com (coming soon)
 *     · Email      (coming soon)
 *
 * UX :
 *   - Mobile : slide-up plein écran depuis le bas
 *   - Desktop : panneau side-right large
 *   - Header sticky : titre + barre de progression + sélecteur famille +
 *     pills onglets de la famille active
 *   - Famille + onglet courants mémorisés entre ouvertures (localStorage)
 *
 * Doctrine : "1 seul endroit pour TOUT". Le chat reste le mode capture,
 * ce drawer reste le mode revue, exploration et export.
 */

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Braces,
  ChevronDown,
  FileInput,
  FileOutput,
  FileText,
  FolderOpen,
  Images,
  Layers,
  Mail,
  MapPin,
  Send,
  Sparkles,
  Trello,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDb, getLatestLocalJsonState, type LocalMessage } from "@/shared/db";
import { listVisitMedia } from "@/shared/photo";
import { JsonStatePanel } from "@/features/json-state/components/JsonStatePanel";
import { findActiveConflicts } from "@/features/json-state/lib/conflicts";
import { countSummaryGlobals } from "../lib/summary";
import { VisitSummaryView } from "./VisitSummaryView";
import { AiActionsTab } from "./AiActionsTab";
import { MapboxTab } from "./MapboxTab";
import { PhotosTab } from "./PhotosTab";
import { ComingSoonPanel } from "./ComingSoonPanel";
import { ExportMondayTab } from "./ExportMondayTab";
import { ExportEmailTab } from "./ExportEmailTab";

export type DrawerTab =
  | "summary"
  | "json"
  | "mapbox"
  | "ai_actions"
  | "photos"
  | "input_docs"
  | "output_docs"
  | "export_monday"
  | "export_email";

export type DrawerFamily = "features" | "artifacts" | "exporter";

interface TabDef {
  key: DrawerTab;
  label: string;
  Icon: LucideIcon;
  comingSoon?: boolean;
}

interface FamilyDef {
  key: DrawerFamily;
  label: string;
  Icon: LucideIcon;
  tabs: TabDef[];
}

const FAMILIES: FamilyDef[] = [
  {
    key: "features",
    label: "Features",
    Icon: Layers,
    tabs: [
      { key: "summary", label: "Synthèse", Icon: FileText },
      { key: "json", label: "JSON", Icon: Braces },
      { key: "mapbox", label: "Mapbox", Icon: MapPin, comingSoon: true },
      { key: "ai_actions", label: "Actions IA", Icon: Sparkles },
    ],
  },
  {
    key: "artifacts",
    label: "Artifacts",
    Icon: FolderOpen,
    tabs: [
      { key: "photos", label: "Photos", Icon: Images },
      { key: "input_docs", label: "Input docs", Icon: FileInput, comingSoon: true },
      { key: "output_docs", label: "Output docs", Icon: FileOutput, comingSoon: true },
    ],
  },
  {
    key: "exporter",
    label: "Exporter",
    Icon: Send,
    tabs: [
      { key: "export_monday", label: "Monday.com", Icon: Trello, comingSoon: true },
      { key: "export_email", label: "Email", Icon: Mail, comingSoon: true },
    ],
  },
];

// Lookup tab → family pour les deep links via initialTab
const TAB_TO_FAMILY: Record<DrawerTab, DrawerFamily> = (() => {
  const map = {} as Record<DrawerTab, DrawerFamily>;
  for (const fam of FAMILIES) {
    for (const t of fam.tabs) map[t.key] = fam.key;
  }
  return map;
})();

interface UnifiedVisitDrawerProps {
  visitId: string;
  visitTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Onglet à pré-sélectionner. Override les valeurs mémorisées. */
  initialTab?: DrawerTab;
  /** Pour l'onglet JSON : pousse en mode "À traiter" à l'ouverture. */
  jsonInitialMode?: "tree" | "todo";
}

const FAMILY_KEY = "vtu:visit-drawer:family";
const TAB_KEY = "vtu:visit-drawer:tab";

function readStoredFamily(): DrawerFamily {
  if (typeof window === "undefined") return "features";
  try {
    const v = window.localStorage.getItem(FAMILY_KEY);
    if (v === "features" || v === "artifacts" || v === "exporter") return v;
  } catch {
    /* ignore */
  }
  return "features";
}

function readStoredTab(): DrawerTab {
  if (typeof window === "undefined") return "summary";
  try {
    const v = window.localStorage.getItem(TAB_KEY);
    if (v && (v in TAB_TO_FAMILY)) return v as DrawerTab;
  } catch {
    /* ignore */
  }
  return "summary";
}

export function UnifiedVisitDrawer({
  visitId,
  visitTitle,
  open,
  onOpenChange,
  initialTab,
  jsonInitialMode = "tree",
}: UnifiedVisitDrawerProps) {
  const [family, setFamily] = useState<DrawerFamily>(() =>
    initialTab ? TAB_TO_FAMILY[initialTab] : readStoredFamily(),
  );
  const [tab, setTab] = useState<DrawerTab>(() => initialTab ?? readStoredTab());
  // Signal pour reset le mode interne du JsonStatePanel quand on rouvre
  // explicitement sur "À traiter".
  const [jsonResetSignal, setJsonResetSignal] = useState(0);

  // À chaque ouverture : restaurer ou imposer l'onglet demandé
  useEffect(() => {
    if (!open) return;
    if (initialTab) {
      setFamily(TAB_TO_FAMILY[initialTab]);
      setTab(initialTab);
      if (initialTab === "json") setJsonResetSignal((n) => n + 1);
    } else {
      const storedFam = readStoredFamily();
      const storedTab = readStoredTab();
      // Garde-fou : l'onglet stocké appartient bien à la famille stockée
      const fam = TAB_TO_FAMILY[storedTab] ?? storedFam;
      setFamily(fam);
      setTab(storedTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab, jsonInitialMode]);

  // Persistance famille + tab
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(FAMILY_KEY, family);
      window.localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignore */
    }
  }, [family, tab]);

  // Switcher de famille : sélectionner le 1er onglet de la nouvelle famille
  const handleFamilyChange = (next: DrawerFamily) => {
    if (next === family) return;
    const fam = FAMILIES.find((f) => f.key === next);
    if (!fam) return;
    setFamily(next);
    setTab(fam.tabs[0].key);
  };

  // ----- Données pour la barre de progression globale & badges -----
  const latest = useLiveQuery(() => getLatestLocalJsonState(visitId), [visitId]);
  const messages = useLiveQuery(
    () => getDb().messages.where("visit_id").equals(visitId).toArray(),
    [visitId],
    [] as LocalMessage[],
  );
  const media = useLiveQuery(() => listVisitMedia(visitId), [visitId], []);

  const globals = useMemo(
    () => countSummaryGlobals(latest?.state ?? null, messages),
    [latest, messages],
  );
  const conflictsCount = useMemo(
    () => (latest ? findActiveConflicts(latest.state, messages).length : 0),
    [latest, messages],
  );

  const total = globals.validated + globals.aiUnvalidated + globals.emptyCritical;
  const progress = total === 0 ? 0 : Math.round((globals.validated / total) * 100);

  const activeFamily = FAMILIES.find((f) => f.key === family) ?? FAMILIES[0];

  const badgeFor = (key: DrawerTab): number => {
    if (key === "ai_actions") return globals.aiUnvalidated + conflictsCount;
    if (key === "photos") return media.length;
    return 0;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideCloseButton
        className="safe-top safe-bottom safe-x flex h-[100dvh] w-full flex-col gap-0 rounded-none border-0 p-0 sm:h-[100dvh] sm:max-w-none md:right-0 md:left-auto md:h-[100dvh] md:max-w-2xl md:rounded-l-xl md:border-l"
        data-testid="unified-visit-drawer"
      >
        {/* ============== Header sticky ============== */}
        <SheetHeader className="border-b border-border/60 bg-card/60 p-3 text-left">
          {/* Niveau 1 : titre + progression + close */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-heading truncate text-sm font-semibold text-foreground">
                {visitTitle}
              </SheetTitle>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Progression de la visite"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  data-testid="drawer-progress"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="font-ui shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {progress}%
                </span>
              </div>
              <p className="font-ui mt-0.5 text-[10px] text-muted-foreground">
                {globals.validated} validé{globals.validated > 1 ? "s" : ""} ·{" "}
                {globals.aiUnvalidated} IA · {globals.emptyCritical} critique
                {globals.emptyCritical > 1 ? "s" : ""}
                {conflictsCount > 0 ? (
                  <span className="text-destructive">
                    {" "}
                    · {conflictsCount} conflit{conflictsCount > 1 ? "s" : ""}
                  </span>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="touch-target inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Fermer"
              data-testid="drawer-close"
            >
              <ChevronDown className="h-5 w-5 md:hidden" />
              <X className="hidden h-5 w-5 md:block" />
            </button>
          </div>

          {/* Niveau 2 : segmented control des familles */}
          <div
            className="mt-3 grid grid-cols-3 gap-0.5 rounded-lg bg-muted/60 p-0.5"
            role="tablist"
            aria-label="Familles d'onglets"
            data-testid="drawer-family-switcher"
          >
            {FAMILIES.map(({ key, label, Icon }) => {
              const active = family === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleFamilyChange(key)}
                  data-testid={`drawer-family-${key}`}
                  className={[
                    "font-ui inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-wide transition",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Niveau 3 : pills onglets de la famille active */}
          <nav
            className="mt-2 flex gap-0.5 overflow-x-auto"
            role="tablist"
            aria-label={`Onglets ${activeFamily.label}`}
          >
            {activeFamily.tabs.map(({ key, label, Icon, comingSoon }) => {
              const active = tab === key;
              const badge = badgeFor(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(key)}
                  data-testid={`drawer-tab-${key}`}
                  className={[
                    "font-ui group relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-medium transition",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                  {comingSoon ? (
                    <span
                      className="font-ui inline-flex items-center rounded-full bg-muted-foreground/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                      aria-label="Bientôt disponible"
                    >
                      soon
                    </span>
                  ) : null}
                  {badge > 0 ? (
                    <span
                      className={[
                        "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted-foreground/20 text-foreground",
                      ].join(" ")}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </SheetHeader>

        {/* ============== Contenu de l'onglet courant ============== */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "summary" ? (
            <div className="h-full overflow-y-auto">
              <VisitSummaryView
                visitId={visitId}
                visitTitle={visitTitle}
                embedded
              />
            </div>
          ) : null}
          {tab === "json" ? (
            <JsonStatePanel
              visitId={visitId}
              initialMode={jsonInitialMode}
              resetSignal={jsonResetSignal}
            />
          ) : null}
          {tab === "mapbox" ? <MapboxTab /> : null}
          {tab === "ai_actions" ? (
            <AiActionsTab
              visitId={visitId}
              onCloseDrawer={() => onOpenChange(false)}
            />
          ) : null}
          {tab === "documents" ? <DocumentsTab visitId={visitId} /> : null}
          {tab === "export_monday" ? <ExportMondayTab /> : null}
          {tab === "export_email" ? <ExportEmailTab /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
