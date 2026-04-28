import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  LayoutDashboard,
  List,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { appendLocalMessage, getDb, getLatestLocalJsonState, type LocalMessage } from "@/shared/db";
import { useAuth } from "@/features/auth";
import { useVirtualKeyboard } from "@/shared/hooks";
import { useConnectionStore, useMessagesSync } from "@/shared/sync";
import { VisitsSidebar, UnifiedVisitDrawer, type DrawerTab } from "@/features/visits";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
// (dropdown menu retiré : le hamburger ouvre directement la liste des visites)
import {
  BUILDING_ICON,
  BUILDING_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/features/visits/lib/icons";
import { ChatInputBar, MessageList, VisitAttachmentSyncStatus, useChatStore } from "@/features/chat";
import { countUnvalidatedAiFields } from "@/features/json-state/lib/inspect";
import { findActiveConflicts } from "@/features/json-state/lib/conflicts";
import { VisitDebugPanel } from "@/features/debug/VisitDebugPanel";

/**
 * Itération 5 — écran chat d'une visite (zones 20/60/20).
 *
 * - Header (haut) : nav + contexte VT + toggle IA + bouton JSON.
 * - Liste de messages (milieu) : useLiveQuery, append-only.
 * - Input bar (bas) : textarea auto-resize + [+] + 🎙️ + ↑.
 *
 * Doctrine respectée :
 *  - Pas de mutation IA (toggle inerte côté backend).
 *  - Pas d'audio/photo (stubs Phase 2).
 *  - L'input bar reste fixe au-dessus du clavier (useVirtualKeyboard).
 */
export const Route = createFileRoute("/_authenticated/visits/$visitId")({
  component: VisitChatPage,
});

function VisitChatPage() {
  const { visitId } = Route.useParams();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);
  const aiEnabled = useChatStore((s) => s.isAiEnabled(visitId));
  const setAiEnabled = useChatStore((s) => s.setAiEnabled);
  const isOnline = useConnectionStore((s) => s.isOnline);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab | undefined>(undefined);
  const [jsonInitialMode, setJsonInitialMode] = useState<"tree" | "todo">("tree");

  // Met à jour la variable CSS --kb-height pour garder l'input bar au-dessus du clavier.
  useVirtualKeyboard();

  // Pull lazy + Realtime sur cette VT (Itération 6.5).
  // Idempotent côté local, cleanup automatique au unmount.
  useMessagesSync(visitId);

  const visit = useLiveQuery(
    () => getDb().visits.get(visitId),
    [visitId],
  );

  // It. 11 — compteurs "à valider" / "conflits" pour les badges header.
  const latestState = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
  );
  const visitMessages = useLiveQuery(
    () =>
      getDb().messages.where("visit_id").equals(visitId).toArray(),
    [visitId],
    [] as LocalMessage[],
  );
  const unvalidatedCount = useMemo(
    () => (latestState ? countUnvalidatedAiFields(latestState.state) : 0),
    [latestState],
  );
  const conflictsCount = useMemo(
    () =>
      latestState
        ? findActiveConflicts(latestState.state, visitMessages).length
        : 0,
    [latestState, visitMessages],
  );

  const openDrawer = (tab?: DrawerTab, jsonMode: "tree" | "todo" = "tree") => {
    setDrawerInitialTab(tab);
    setJsonInitialMode(jsonMode);
    setDrawerOpen(true);
  };

  if (visit === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Visite introuvable
        </h1>
        <p className="font-body mt-2 text-sm text-muted-foreground">
          Cette visite n'existe pas (ou plus) sur cet appareil.
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="font-ui mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  const Icon = visit.building_type
    ? BUILDING_ICON[visit.building_type]
    : BUILDING_ICON.autre;
  const buildingLabel = visit.building_type
    ? BUILDING_LABEL[visit.building_type]
    : "Type non précisé";

  async function handleSubmit(input: {
    content: string;
    kind: import("@/shared/types").MessageKind;
    attachmentCount?: number;
    aiEnabled?: boolean;
  }): Promise<{ id: string } | void> {
    if (!userId) {
      toast.error("Session expirée — veuillez vous reconnecter.");
      return;
    }
    try {
      // appendLocalMessage est atomique : insert + enqueue sync_queue
      // dans une transaction Dexie (cf. messages.repo.ts).
      const message = await appendLocalMessage({
        userId,
        visitId,
        role: "user",
        kind: input.kind,
        content: input.content,
        metadata: {
          attachment_count: input.attachmentCount ?? 0,
          ai_enabled: input.aiEnabled ?? aiEnabled,
        },
      });
      return { id: message.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Envoi impossible", { description: message });
    }
  }

  return (
    <div className="flex h-dvh flex-row bg-background safe-x">
      {/* Sidebar desktop persistante */}
      <div className="hidden border-r border-border md:flex md:w-[360px]">
        <VisitsSidebar activeVisitId={visit.id} />
      </div>

      {/* Sidebar mobile en drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          hideCloseButton
          className="w-[88vw] max-w-[360px] p-0 md:hidden"
        >
          <VisitsSidebar
            activeVisitId={visit.id}
            onClose={() => setSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Colonne chat — layout 20/60/20 en flex column */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* HAUT : header VT + toggle IA + bouton JSON */}
        <header className="safe-top safe-x shrink-0 border-b border-border bg-card">
          <div className="flex h-14 items-center gap-2 px-3">
            {/* Hamburger : ouvre directement la liste des visites
                (sidebar mobile, ou retour à la liste sur desktop). */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
                  navigate({ to: "/" });
                } else {
                  setSidebarOpen(true);
                }
              }}
              className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent"
              aria-label="Liste des visites"
              data-testid="visit-menu-trigger"
            >
              <List className="h-5 w-5" />
            </button>

            <div
              className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary"
              aria-hidden="true"
            >
              <Icon className="h-4 w-4 text-secondary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading truncate text-sm font-semibold text-foreground">
                {visit.title}
              </h1>
              <p className="font-ui truncate text-xs text-muted-foreground">
                {visit.address ?? buildingLabel}
              </p>
            </div>
            <span
              className={`font-ui shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[visit.status]}`}
            >
              {STATUS_LABEL[visit.status]}
            </span>
            <button
              type="button"
              onClick={() => openDrawer()}
              className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent"
              aria-label="Ouvrir le panneau VT"
              data-testid="open-json-viewer"
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>
          </div>

          {/* Sous-header : toggle IA */}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <Switch
                id={`ai-toggle-${visit.id}`}
                checked={aiEnabled}
                onCheckedChange={(v) => setAiEnabled(visit.id, v)}
                aria-label="Activer l'IA pour cette visite"
              />
              <Label
                htmlFor={`ai-toggle-${visit.id}`}
                className="font-ui cursor-pointer text-xs"
              >
                IA
              </Label>
            </div>
            <div className="flex items-center gap-2">
              {/* It. 11 — badges cliquables : ouvrent le drawer en mode "À traiter". */}
              {unvalidatedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => openDrawer("json", "todo")}
                  aria-label={`${unvalidatedCount} champ${unvalidatedCount > 1 ? "s" : ""} à valider — ouvrir`}
                  data-testid="header-unvalidated-badge"
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {unvalidatedCount} à valider
                </button>
              ) : null}
              {conflictsCount > 0 ? (
                <button
                  type="button"
                  onClick={() => openDrawer("json", "todo")}
                  className="font-ui inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive transition hover:bg-destructive/15 active:bg-destructive/20"
                  aria-label={`${conflictsCount} conflit${conflictsCount > 1 ? "s" : ""} — ouvrir`}
                  data-testid="header-conflicts-badge"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {conflictsCount} conflit{conflictsCount > 1 ? "s" : ""}
                </button>
              ) : null}
              {!isOnline ? (
                <span
                  className="font-ui inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  data-testid="offline-badge"
                  role="status"
                >
                  <WifiOff className="h-3 w-3" aria-hidden="true" />
                  Hors ligne
                </span>
              ) : null}
              {aiEnabled ? (
                <span
                  className="font-ui rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary"
                  data-testid="ai-status-badge"
                >
                  IA active
                </span>
              ) : (
                <span
                  className="font-ui rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  data-testid="ai-status-badge"
                >
                  IA désactivée
                </span>
              )}
            </div>
          </div>
        </header>

        {/* MILIEU : messages — flex-1 + scrollable */}
        <section
          className="min-h-0 flex-1 overflow-y-auto bg-background"
          aria-label="Messages de la visite"
        >
          {userId ? (
            <MessageList visitId={visit.id} userId={userId} />
          ) : null}
        </section>

        {/* Statut sync/analyse des pièces jointes (It. 14.1) */}
        <VisitAttachmentSyncStatus visitId={visit.id} />

        {/* BAS : input bar — fixée au-dessus du clavier via .input-bar-safe-bottom */}
        <ChatInputBar visitId={visit.id} onSubmit={handleSubmit} />
      </main>

      <UnifiedVisitDrawer
        visitId={visit.id}
        visitTitle={visit.title}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        initialTab={drawerInitialTab}
        jsonInitialMode={jsonInitialMode}
      />
    </div>
  );
}
