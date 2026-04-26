import { useRef } from "react";
import { Camera, FileText, Mic } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/features/auth";
import {
  addMediaToVisit,
  detectDefaultProfile,
} from "@/shared/photo";

interface AttachmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string;
}

/**
 * AttachmentSheet — Itération 9, UX intention-first.
 *
 * 3 actions mutuellement exclusives :
 *  📷 Photo terrain → caméra arrière, profile="photo" par défaut
 *     (toggle vers "plan" dispo dans PhotoPreviewPanel)
 *  📄 Plan / document → galerie images + PDF, detectDefaultProfile()
 *  🎙 Dictée audio → désactivé (Phase 2 future, dictée clavier iOS suffit)
 *
 * Le profil choisi pilote `compressMedia` (cf. shared/photo/compress.ts).
 * L'utilisateur peut toujours basculer photo↔plan dans le PhotoPreviewPanel.
 */
export function AttachmentSheet({
  open,
  onOpenChange,
  visitId,
}: AttachmentSheetProps) {
  const userId = useAuth((s) => s.user?.id);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFiles(
    files: FileList | null,
    intent: "photo" | "import",
  ) {
    if (!files || files.length === 0) return;
    if (!userId) {
      toast.error("Session expirée");
      return;
    }
    onOpenChange(false);
    let added = 0;
    for (const file of Array.from(files)) {
      const profile =
        intent === "photo" ? "photo" : detectDefaultProfile(file);
      try {
        await addMediaToVisit({ visitId, userId, file, profile });
        added++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        toast.error(`Échec import ${file.name}`, { description: msg });
      }
    }
    if (added > 0) {
      toast.success(`${added} média${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}`, {
        description: "Sera envoyé avec votre prochain message",
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="safe-bottom safe-x rounded-t-2xl border-t border-border"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-heading text-base">
            Que veux-tu capturer&nbsp;?
          </SheetTitle>
          <SheetDescription className="font-body text-xs text-muted-foreground">
            Le média sera attaché à votre prochain message.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4 py-4">
          {/* 1. Photo terrain */}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="touch-target flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
            data-testid="attach-photo"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-ui text-sm font-medium">
                Prendre une photo
              </div>
              <div className="font-body text-xs text-muted-foreground">
                Caméra arrière — pour le terrain
              </div>
            </div>
          </button>

          {/* 2. Plan / document */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="touch-target flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
            data-testid="attach-plan"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-ui text-sm font-medium">
                Importer un plan ou document
              </div>
              <div className="font-body text-xs text-muted-foreground">
                Image ou PDF depuis la galerie
              </div>
            </div>
          </button>

          {/* 3. Dictée audio — placeholder Phase 2 */}
          <button
            type="button"
            disabled
            onClick={() =>
              toast.message("Dictée audio", {
                description:
                  "Bientôt — utilisez la dictée clavier iOS pour l'instant",
              })
            }
            className="touch-target flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-left opacity-60"
            aria-label="Dictée audio — bientôt disponible"
            data-testid="attach-audio"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Mic className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-ui text-sm font-medium text-muted-foreground">
                Dictée audio
              </div>
              <div className="font-body text-xs text-muted-foreground">
                Bientôt — utilisez la dictée clavier
              </div>
            </div>
          </button>
        </div>

        {/* Inputs cachés */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files, "photo")}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files, "import")}
        />
      </SheetContent>
    </Sheet>
  );
}
