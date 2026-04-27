import { useEffect, useRef, useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { X, ChevronLeft, ChevronRight, Sparkles, FileText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getDb, type LocalAttachment } from "@/shared/db";
import { getAttachmentBlob } from "@/shared/photo";
import { supabase } from "@/integrations/supabase/client";

interface MediaLightboxProps {
  attachments: LocalAttachment[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SIGNED_URL_TTL_S = 600;
const SWIPE_THRESHOLD_PX = 60;

/**
 * MediaLightbox — It. 10.6.
 *
 * Plein écran, swipe horizontal entre médias, fermeture par X / tap fond /
 * Escape / swipe vers le bas. Pour chaque média : essaie d'abord le blob
 * local (instantané, offline), sinon URL signée Supabase Storage. Affiche
 * la description IA si disponible.
 */
export function MediaLightbox({
  attachments,
  initialIndex,
  open,
  onOpenChange,
}: MediaLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [translateX, setTranslateX] = useState(0);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  // Escape pour fermer + flèches clavier
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setIndex((i) => Math.min(attachments.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, attachments.length, onOpenChange]);

  const current = attachments[index];

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setTranslateX(0);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = (e.touches[0].clientY ?? 0) - (touchStartY.current ?? 0);
    if (Math.abs(dx) > Math.abs(dy)) setTranslateX(dx);
  }
  function handleTouchEnd() {
    if (touchStartX.current === null) {
      setTranslateX(0);
      return;
    }
    if (translateX > SWIPE_THRESHOLD_PX && index > 0) {
      setIndex(index - 1);
    } else if (
      translateX < -SWIPE_THRESHOLD_PX &&
      index < attachments.length - 1
    ) {
      setIndex(index + 1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setTranslateX(0);
  }

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] gap-0 border-0 bg-black/95 p-0 sm:rounded-none"
      >
        {/* Header */}
        <div className="safe-top safe-x absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/70 to-transparent">
          <span className="font-ui rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white tabular-nums backdrop-blur">
            {index + 1} / {attachments.length}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fermer"
            className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Image */}
        <div
          className="relative flex h-full w-full items-center justify-center overflow-hidden"
          onClick={(e) => {
            // Tap sur fond noir = fermer (mais pas sur l'image)
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            style={{
              transform: `translateX(${translateX}px)`,
              transition: translateX === 0 ? "transform 0.2s ease-out" : "none",
            }}
            className="flex h-full w-full items-center justify-center"
          >
            <LightboxMedia attachment={current} />
          </div>

          {/* Flèches desktop */}
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              aria-label="Précédent"
              className="touch-target absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20 md:inline-flex"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}
          {index < attachments.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex(index + 1)}
              aria-label="Suivant"
              className="touch-target absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20 md:inline-flex"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
        </div>

        {/* Footer description IA */}
        <AiDescriptionFooter attachmentId={current.id} />
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// LightboxMedia — affiche image (local blob → fallback URL signée) ou PDF
// ===========================================================================

function LightboxMedia({ attachment }: { attachment: LocalAttachment }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);

    void (async () => {
      // 1. Tenter le blob local en premier (instantané + offline)
      const blob = await getAttachmentBlob(attachment.id);
      if (cancelled) return;
      if (blob?.compressed) {
        objectUrl = URL.createObjectURL(blob.compressed);
        setSrc(objectUrl);
        return;
      }
      // 2. Fallback URL signée Supabase Storage (cross-device)
      if (!attachment.compressed_path) return;
      const { data } = await supabase.storage
        .from(attachment.bucket)
        .createSignedUrl(attachment.compressed_path, SIGNED_URL_TTL_S);
      if (cancelled) return;
      if (data?.signedUrl) setSrc(data.signedUrl);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.bucket, attachment.compressed_path]);

  if (attachment.media_profile === "pdf") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 text-center text-white">
        <FileText className="h-16 w-16 opacity-80" />
        <p className="font-ui text-sm">Document PDF</p>
        {src ? (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="font-ui rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur hover:bg-white/20"
          >
            Ouvrir le PDF
          </a>
        ) : null}
      </div>
    );
  }

  if (!src) {
    return (
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    );
  }

  return (
    <img
      src={src}
      alt="Média en plein écran"
      className="max-h-full max-w-full object-contain select-none"
      draggable={false}
    />
  );
}

// ===========================================================================
// AiDescriptionFooter — affiche la description IA si disponible
// ===========================================================================

function AiDescriptionFooter({ attachmentId }: { attachmentId: string }) {
  const description = useLiveQuery(
    async () => {
      const rows = await getDb()
        .attachment_ai_descriptions.where("attachment_id")
        .equals(attachmentId)
        .toArray();
      if (rows.length === 0) return null;
      return rows.sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )[0];
    },
    [attachmentId],
    null,
  );

  const caption = useMemo(() => {
    if (!description) return null;
    const d = description.description as { short_caption?: string };
    return d.short_caption ?? null;
  }, [description]);

  if (!caption) return null;

  return (
    <div className="safe-bottom safe-x absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-4">
      <div className="flex items-start gap-2 text-white">
        <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p className="font-body text-sm leading-snug">{caption}</p>
      </div>
    </div>
  );
}
