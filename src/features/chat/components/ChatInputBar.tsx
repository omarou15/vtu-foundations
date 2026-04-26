import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Mic, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AttachmentSheet } from "./AttachmentSheet";
import { PhotoPreviewPanel } from "./PhotoPreviewPanel";
import { listDraftMedia, attachPendingMediaToMessage } from "@/shared/photo";
import type { LocalAttachment } from "@/shared/db/schema";
import type { MessageKind } from "@/shared/types";

interface ChatInputBarProps {
  visitId: string;
  /**
   * Reçoit le contenu texte (peut être vide si on n'envoie que des médias)
   * + le `kind` calculé d'après les drafts attachés. Doit retourner le
   * message créé (id requis pour rattacher les médias).
   */
  onSubmit: (input: {
    content: string;
    kind: MessageKind;
  }) => Promise<{ id: string } | void> | { id: string } | void;
}

const MAX_LINES = 4;
const LINE_HEIGHT_PX = 20; // ~ correspond à text-sm leading-5

/**
 * Barre d'input du chat — KNOWLEDGE §5 (zones 20/60/20).
 *
 * It. 9 :
 *  - PhotoPreviewPanel rendu au-dessus de l'input quand des drafts existent.
 *  - Au submit : compute kind (text/photo/document) + appelle
 *    `attachPendingMediaToMessage(visitId, message.id)` pour transitionner
 *    les drafts en pending et enqueue les uploads.
 *  - Submit autorisé si TEXTE non vide OU au moins 1 draft.
 */
export function ChatInputBar({ visitId, onSubmit }: ChatInputBarProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [allPdf, setAllPdf] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize : on ajuste la hauteur en fonction du scrollHeight, plafonné.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = LINE_HEIGHT_PX * MAX_LINES + 20; // padding interne ~ 20px
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  // Drafts médias — useLiveQuery (subscription Dexie réactive). Évite un
  // setInterval qui continuerait de tourner en arrière-plan iPhone.
  // On relit quand même juste avant submit pour éviter une race avec un
  // toggle profile en cours.
  const drafts = useLiveQuery(
    () => listDraftMedia(visitId),
    [visitId],
    [] as LocalAttachment[],
  );

  const draftCount = drafts.length;
  const allPdf = useMemo(
    () =>
      drafts.length > 0 && drafts.every((d) => d.media_profile === "pdf"),
    [drafts],
  );

  const trimmed = value.trim();
  const canSubmit = (trimmed.length > 0 || draftCount > 0) && !sending;

  function computeKind(count: number, allArePdf: boolean): MessageKind {
    if (count === 0) return "text";
    if (allArePdf) return "document";
    return "photo";
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSending(true);
    try {
      // Relit les drafts JUSTE avant l'envoi (la liste a pu changer).
      const currentDrafts = await listDraftMedia(visitId);
      const kind = computeKind(
        currentDrafts.length,
        currentDrafts.length > 0 &&
          currentDrafts.every((d) => d.media_profile === "pdf"),
      );

      const result = await onSubmit({ content: trimmed, kind });
      // Si onSubmit a renvoyé { id }, on rattache les drafts.
      if (
        currentDrafts.length > 0 &&
        result &&
        typeof result === "object" &&
        "id" in result &&
        typeof result.id === "string"
      ) {
        await attachPendingMediaToMessage(visitId, result.id);
      }
      setValue("");
      // Reset height après envoi
      if (ref.current) ref.current.style.height = "auto";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Envoi impossible", { description: msg });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter = submit ; Enter seul = newline (mobile-friendly).
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <>
      <div
        className="input-bar-safe-bottom safe-x border-t border-border bg-card"
        data-testid="chat-input-bar"
      >
        {/* Aperçu drafts médias (It. 9) */}
        <PhotoPreviewPanel visitId={visitId} />

        <div className="flex items-end gap-2 p-2">
          {/* Bouton [+] — ouvre l'AttachmentSheet intention-first */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="touch-target shrink-0 rounded-full"
            onClick={() => setSheetOpen(true)}
            aria-label="Ajouter une pièce jointe"
          >
            <Plus className="h-5 w-5" />
          </Button>

          {/* Textarea auto-resize */}
          <label htmlFor={`chat-input-${visitId}`} className="sr-only">
            Message
          </label>
          <textarea
            id={`chat-input-${visitId}`}
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez la visite…"
            rows={1}
            className="font-body min-h-[40px] flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-ring"
            style={{ maxHeight: LINE_HEIGHT_PX * MAX_LINES + 20 }}
            aria-label="Saisir un message"
          />

          {/* Bouton micro — stub Phase 2 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="touch-target shrink-0 rounded-full"
            onClick={() =>
              toast.message("Dictée vocale", {
                description:
                  "Bientôt — utilisez la dictée clavier iOS pour l'instant.",
              })
            }
            aria-label="Dictée vocale (bientôt disponible)"
          >
            <Mic className="h-5 w-5" />
          </Button>

          {/* Bouton submit — toujours en bas droite (loi de Fitts) */}
          <Button
            type="button"
            size="icon"
            className="touch-target shrink-0 rounded-full"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            aria-label="Envoyer le message"
            data-testid="chat-submit"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <AttachmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        visitId={visitId}
      />
    </>
  );
}
