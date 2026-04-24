import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Braces, Menu } from "lucide-react";
import { toast } from "sonner";
import { getDb, appendLocalMessage } from "@/shared/db";
import { useAuth } from "@/features/auth";
import { useVirtualKeyboard } from "@/shared/hooks";
import { VisitsSidebar } from "@/features/visits";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  BUILDING_ICON,
  BUILDING_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/features/visits/lib/icons";
import { ChatInputBar, MessageList, useChatStore } from "@/features/chat";
import { JsonViewerDrawer } from "@/features/json-state";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);

  // Met à jour la variable CSS --kb-height pour garder l'input bar au-dessus du clavier.
  useVirtualKeyboard();

  const visit = useLiveQuery(
    () => getDb().visits.get(visitId),
    [visitId],
  );

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

  async function handleSubmit(content: string) {
    if (!userId) {
      toast.error("Session expirée — veuillez vous reconnecter.");
      return;
    }
    try {
      await appendLocalMessage({
        userId,
        visitId,
        role: "user",
        kind: "text",
        content,
      });
      // Note : Itération 6 enqueue sync_queue. Ici on append en local
      // simplement — la sync engine consommera les messages "pending"
      // et fera l'enqueue + push. Pour l'instant les messages restent
      // en sync_status "pending" comme prévu (KNOWLEDGE §8).
      const db = getDb();
      await db.sync_queue.add({
        table: "messages",
        op: "insert",
        row_id: crypto.randomUUID(), // placeholder — sera remplacé en It.6
        payload: { visit_id: visitId, content },
        attempts: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        next_attempt_at: new Date().toISOString(),
      });
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
        <SheetContent side="left" className="w-[88vw] max-w-[360px] p-0 md:hidden">
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
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"
              aria-label="Ouvrir la liste des visites"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="touch-target hidden items-center justify-center rounded-md text-foreground hover:bg-accent md:inline-flex"
              aria-label="Retour"
            >
              <ArrowLeft className="h-5 w-5" />
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
              onClick={() => setJsonOpen(true)}
              className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent"
              aria-label="Ouvrir l'état JSON"
              data-testid="open-json-viewer"
            >
              <Braces className="h-5 w-5" />
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
        </header>

        {/* MILIEU : messages — flex-1 + scrollable */}
        <section
          className="min-h-0 flex-1 overflow-y-auto bg-background"
          aria-label="Messages de la visite"
        >
          <MessageList visitId={visit.id} />
        </section>

        {/* BAS : input bar — fixée au-dessus du clavier via .input-bar-safe-bottom */}
        <ChatInputBar visitId={visit.id} onSubmit={handleSubmit} />
      </main>

      <JsonViewerDrawer
        visitId={visit.id}
        open={jsonOpen}
        onOpenChange={setJsonOpen}
      />
    </div>
  );
}
