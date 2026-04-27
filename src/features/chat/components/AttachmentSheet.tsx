import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Camera,
  FileText,
  Mic,
  Plus,
  Send,
  Trash2,
  X,
  Loader2,
  Image as ImageIcon,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth";
import {
  addMediaToVisit,
  detectDefaultProfile,
  discardDraftMedia,
  listDraftMedia,
  getAttachmentBlob,
} from "@/shared/photo";
import { attachPendingMediaToMessage } from "@/shared/photo";
import { appendLocalMessage } from "@/shared/db";
import type { LocalAttachment } from "@/shared/db/schema";

interface AttachmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string;
}

type Mode = "menu" | "burst" | "import-photos" | "import-docs";

const MAX_BATCH = 10;

/**
 * AttachmentSheet — It. 10.6 (rafale + multi-import).
 *
 * Mode "menu" : 3 intentions (Photo terrain / Plan-document / Audio).
 * Mode "burst" : capture caméra continue. Après chaque shot, retour dans
 *   la sheet avec preview grille des photos prises dans cette session.
 *   2 CTA : « Prendre une autre » | « Envoyer (N) ».
 * Mode "import" : multi-sélection galerie iOS native, liste des fichiers
 *   choisis avec retrait, bouton « Envoyer (N) ».
 *
 * Doctrine offline-first : chaque média est stocké en Dexie (draft) dès
 * la capture/sélection. Au "Envoyer", on crée 1 message kind=photo|document
 * et on rattache TOUS les drafts via attachPendingMediaToMessage().
 *
 * Si fermeture avec drafts non envoyés → AlertDialog confirmation.
 */
export function AttachmentSheet({
  open,
  onOpenChange,
  visitId,
}: AttachmentSheetProps) {
  const userId = useAuth((s) => s.user?.id);
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const docsRef = useRef<HTMLInputElement | null>(null);

  // Drafts médias de cette VT — réactif Dexie. C'est notre source de vérité
  // pour le compteur et la grille de preview.
  const drafts = useLiveQuery(
    () => listDraftMedia(visitId),
    [visitId],
    [] as LocalAttachment[],
  );

  const draftCount = drafts.length;

  // Reset mode quand la sheet se ferme proprement
  useEffect(() => {
    if (!open) {
      setMode("menu");
      setBusy(false);
    }
  }, [open]);

  async function handleCameraFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!userId) {
      toast.error("Session expirée");
      return;
    }
    setBusy(true);
    try {
      // iOS Safari avec capture="environment" renvoie 1 fichier à la fois
      // — on traite quand même un FileList pour robustesse.
      for (const file of Array.from(files)) {
        if (drafts.length + 1 > MAX_BATCH) {
          toast.error(`Maximum ${MAX_BATCH} médias par envoi`);
          break;
        }
        await addMediaToVisit({
          visitId,
          userId,
          file,
          profile: "photo",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Capture échouée", { description: msg });
    } finally {
      setBusy(false);
      // Reset l'input pour autoriser une nouvelle capture du MEME fichier
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  async function handleImportFiles(
    files: FileList | null,
    forcedProfile: "photo" | null,
    inputRef: React.MutableRefObject<HTMLInputElement | null>,
  ) {
    if (!files || files.length === 0) return;
    if (!userId) {
      toast.error("Session expirée");
      return;
    }
    const arr = Array.from(files);
    const room = MAX_BATCH - drafts.length;
    if (arr.length > room) {
      toast.warning(`Limite ${MAX_BATCH} médias`, {
        description: `Seuls les ${room} premiers seront ajoutés.`,
      });
    }
    setBusy(true);
    for (const file of arr.slice(0, Math.max(0, room))) {
      const profile = forcedProfile ?? detectDefaultProfile(file);
      try {
        await addMediaToVisit({ visitId, userId, file, profile });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        toast.error(`Échec import ${file.name}`, { description: msg });
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSend() {
    if (!userId || drafts.length === 0) return;
    setBusy(true);
    try {
      const allPdf = drafts.every((d) => d.media_profile === "pdf");
      const message = await appendLocalMessage({
        userId,
        visitId,
        role: "user",
        kind: allPdf ? "document" : "photo",
        content: null,
      });
      await attachPendingMediaToMessage(visitId, message.id);
      toast.success(
        `${drafts.length} média${drafts.length > 1 ? "s" : ""} envoyé${drafts.length > 1 ? "s" : ""}`,
      );
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Envoi impossible", { description: msg });
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscardAll() {
    for (const d of drafts) {
      await discardDraftMedia(d.id);
    }
    setConfirmCloseOpen(false);
    onOpenChange(false);
  }

  function requestClose(next: boolean) {
    if (!next && draftCount > 0 && (mode === "burst" || mode === "import")) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(next);
  }

  function openCameraNative() {
    setMode("burst");
    // Tick suivant pour s'assurer que l'input est monté
    requestAnimationFrame(() => cameraRef.current?.click());
  }

  function openGalleryNative() {
    setMode("import");
    requestAnimationFrame(() => fileRef.current?.click());
  }

  return (
    <>
      <Sheet open={open} onOpenChange={requestClose}>
        <SheetContent
          side="bottom"
          className="safe-bottom safe-x rounded-t-2xl border-t border-border max-h-[88dvh] overflow-y-auto"
        >
          {mode === "menu" ? (
            <MenuView
              onPickPhoto={openCameraNative}
              onPickGallery={openGalleryNative}
            />
          ) : null}

          {mode === "burst" ? (
            <BurstView
              drafts={drafts}
              busy={busy}
              onCaptureMore={() => cameraRef.current?.click()}
              onSend={() => void handleSend()}
              onBack={() => requestClose(false)}
            />
          ) : null}

          {mode === "import" ? (
            <ImportView
              drafts={drafts}
              busy={busy}
              onPickMore={() => fileRef.current?.click()}
              onSend={() => void handleSend()}
              onBack={() => requestClose(false)}
            />
          ) : null}

          {/* Inputs cachés montés en permanence pour réutilisation */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleCameraFiles(e.target.files)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => void handleImportFiles(e.target.files)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmCloseOpen}
        onOpenChange={setConfirmCloseOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Garder les {draftCount} média{draftCount > 1 ? "s" : ""} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vos médias resteront en attente dans cette visite et seront
              joints au prochain message. Vous pouvez aussi tout supprimer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setConfirmCloseOpen(false);
                onOpenChange(false);
              }}
            >
              Garder pour plus tard
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={() => void handleDiscardAll()}
              className="text-destructive"
            >
              Tout supprimer
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ===========================================================================
// MenuView — choix d'intention initial
// ===========================================================================

function MenuView({
  onPickPhoto,
  onPickGallery,
}: {
  onPickPhoto: () => void;
  onPickGallery: () => void;
}) {
  return (
    <>
      <SheetHeader className="text-left">
        <SheetTitle className="font-heading text-base">
          Que veux-tu capturer&nbsp;?
        </SheetTitle>
        <SheetDescription className="font-body text-xs text-muted-foreground">
          Plusieurs médias possibles avant envoi.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-2 px-4 py-4">
        <IntentButton
          icon={Camera}
          title="Prendre des photos"
          subtitle="Caméra arrière — rafale terrain"
          onClick={onPickPhoto}
          testId="attach-photo"
        />
        <IntentButton
          icon={FileText}
          title="Importer plans / documents"
          subtitle="Galerie multi-sélection ou PDF"
          onClick={onPickGallery}
          testId="attach-plan"
        />
        <IntentButton
          icon={Mic}
          title="Dictée audio"
          subtitle="Bientôt — utilisez la dictée clavier iOS"
          disabled
          testId="attach-audio"
        />
      </div>
    </>
  );
}

function IntentButton({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
  testId,
}: {
  icon: typeof Camera;
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`touch-target flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors ${
        disabled ? "bg-muted/40 opacity-60" : "bg-card hover:bg-accent active:scale-[0.98]"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          disabled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`font-ui text-sm font-medium ${disabled ? "text-muted-foreground" : ""}`}
        >
          {title}
        </div>
        <div className="font-body text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </button>
  );
}

// ===========================================================================
// BurstView — capture rafale
// ===========================================================================

function BurstView({
  drafts,
  busy,
  onCaptureMore,
  onSend,
  onBack,
}: {
  drafts: LocalAttachment[];
  busy: boolean;
  onCaptureMore: () => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const count = drafts.length;
  const reachedMax = count >= MAX_BATCH;
  return (
    <>
      <SheetHeader className="text-left">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="touch-target -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <SheetTitle className="font-heading text-base">
            Photos terrain
          </SheetTitle>
          <span className="font-ui ml-auto inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary tabular-nums">
            {count} / {MAX_BATCH}
          </span>
        </div>
        <SheetDescription className="font-body text-xs text-muted-foreground">
          Continue la rafale puis envoie en un seul message.
        </SheetDescription>
      </SheetHeader>

      <div className="px-4 py-4">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
            <Camera className="h-10 w-10 text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">
              Aucune photo encore. La caméra s&apos;est ouverte&nbsp;: prends ta
              première prise.
            </p>
          </div>
        ) : (
          <DraftGrid drafts={drafts} />
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCaptureMore}
            disabled={busy || reachedMax}
            className="touch-target flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            data-testid="burst-capture-more"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="font-ui text-sm font-medium">
              {count === 0 ? "Prendre" : "Prendre une autre"}
            </span>
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={busy || count === 0}
            className="touch-target flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground transition-colors disabled:opacity-50"
            data-testid="burst-send"
          >
            <Send className="h-4 w-4" />
            <span className="font-ui text-sm font-medium">
              Envoyer{count > 0 ? ` (${count})` : ""}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// ImportView — multi-sélection galerie
// ===========================================================================

function ImportView({
  drafts,
  busy,
  onPickMore,
  onSend,
  onBack,
}: {
  drafts: LocalAttachment[];
  busy: boolean;
  onPickMore: () => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const count = drafts.length;
  const reachedMax = count >= MAX_BATCH;
  return (
    <>
      <SheetHeader className="text-left">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="touch-target -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <SheetTitle className="font-heading text-base">
            Plans &amp; documents
          </SheetTitle>
          <span className="font-ui ml-auto inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary tabular-nums">
            {count} / {MAX_BATCH}
          </span>
        </div>
        <SheetDescription className="font-body text-xs text-muted-foreground">
          Sélection multiple supportée. PDFs et images mélangés OK.
        </SheetDescription>
      </SheetHeader>

      <div className="px-4 py-4">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">
              Sélectionne plusieurs fichiers depuis la galerie ou les
              documents.
            </p>
          </div>
        ) : (
          <DraftList drafts={drafts} />
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPickMore}
            disabled={busy || reachedMax}
            className="touch-target flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            data-testid="import-pick-more"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="font-ui text-sm font-medium">
              {count === 0 ? "Choisir" : "Ajouter"}
            </span>
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={busy || count === 0}
            className="touch-target flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground transition-colors disabled:opacity-50"
            data-testid="import-send"
          >
            <Send className="h-4 w-4" />
            <span className="font-ui text-sm font-medium">
              Envoyer{count > 0 ? ` (${count})` : ""}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// Helpers visuels
// ===========================================================================

function DraftGrid({ drafts }: { drafts: LocalAttachment[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {drafts.map((d) => (
        <DraftThumb key={d.id} draft={d} />
      ))}
    </div>
  );
}

function DraftThumb({ draft }: { draft: LocalAttachment }) {
  const url = useDraftThumbUrl(draft);
  return (
    <div
      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted animate-in fade-in zoom-in-95 duration-200"
      data-testid={`burst-thumb-${draft.id}`}
    >
      {url ? (
        <img
          src={url}
          alt="Photo capturée"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <button
        type="button"
        onClick={() => void discardDraftMedia(draft.id)}
        aria-label="Retirer cette photo"
        className="touch-target absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/85 text-foreground shadow backdrop-blur transition-transform active:scale-90"
        data-testid={`burst-remove-${draft.id}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DraftList({ drafts }: { drafts: LocalAttachment[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {drafts.map((d) => (
        <DraftRow key={d.id} draft={d} />
      ))}
    </ul>
  );
}

function DraftRow({ draft }: { draft: LocalAttachment }) {
  const url = useDraftThumbUrl(draft);
  const isPdf = draft.media_profile === "pdf";
  const sizeKb = useMemo(() => {
    const kb = (draft.size_bytes ?? 0) / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} Mo` : `${Math.round(kb)} Ko`;
  }, [draft.size_bytes]);
  const name = useMemo(() => {
    const parts = (draft.compressed_path ?? "").split("/");
    return parts[parts.length - 1] || draft.id.slice(0, 8);
  }, [draft.compressed_path, draft.id]);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {isPdf ? (
          <div className="flex h-full w-full items-center justify-center text-primary">
            <FileText className="h-6 w-6" />
          </div>
        ) : url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-ui truncate text-sm font-medium">{name}</p>
        <p className="font-body text-xs text-muted-foreground">
          {isPdf ? "PDF" : draft.media_profile === "plan" ? "Plan" : "Photo"} ·{" "}
          {sizeKb}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void discardDraftMedia(draft.id)}
        aria-label="Retirer ce fichier"
        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        data-testid={`import-remove-${draft.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function useDraftThumbUrl(draft: LocalAttachment): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    if (draft.media_profile === "pdf") {
      setUrl(null);
      return;
    }
    void (async () => {
      const blob = await getAttachmentBlob(draft.id);
      if (cancelled || !blob?.thumbnail) return;
      created = URL.createObjectURL(blob.thumbnail);
      setUrl(created);
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [draft.id, draft.media_profile]);
  return url;
}
