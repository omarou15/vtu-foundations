import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Mic, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AttachmentSheet } from "./AttachmentSheet";

interface ChatInputBarProps {
  visitId: string;
  onSubmit: (content: string) => Promise<void> | void;
}

const MAX_LINES = 4;
const LINE_HEIGHT_PX = 20; // ~ correspond à text-sm leading-5

/**
 * Barre d'input du chat — KNOWLEDGE §5 (zones 20/60/20).
 *
 * - Textarea auto-resize : 1 ligne par défaut, max 4 lignes, puis scroll.
 * - Mobile : Enter = newline. Cmd/Ctrl + Enter = submit.
 * - Bouton ↑ : envoie le message texte.
 * - [+] : ouvre une BottomSheet avec stubs disabled (Phase 2).
 * - 🎙️ : disabled (audio Phase 2, toast informatif au tap).
 *
 * La barre reste fixée par le layout parent grâce à `.input-bar-safe-bottom`
 * qui combine safe-area + --kb-height (cf. styles.css + useVirtualKeyboard).
 */
export function ChatInputBar({ visitId, onSubmit }: ChatInputBarProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize : on ajuste la hauteur en fonction du scrollHeight, plafonné.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = LINE_HEIGHT_PX * MAX_LINES + 20; // padding interne ~ 20px
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !sending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSending(true);
    try {
      await onSubmit(trimmed);
      setValue("");
      // Reset height après envoi
      if (ref.current) ref.current.style.height = "auto";
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
        <div className="flex items-end gap-2 p-2">
          {/* Bouton [+] — attachements (stubs Phase 2) */}
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
                description: "Disponible en Phase 2.",
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

      <AttachmentSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
