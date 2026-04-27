import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Sparkles } from "lucide-react";
import { getDb, type LocalAttachment } from "@/shared/db";
import { getAttachmentBlob } from "@/shared/photo";
import { MediaLightbox } from "./MediaLightbox";

interface MessageAttachmentsProps {
  messageId: string;
  isUser: boolean;
}

/**
 * Affiche les attachments d'un message dans le chat (grille thumbnails).
 * Tap → ouvre la lightbox swipable. Lecture réactive Dexie.
 */
export function MessageAttachments({ messageId, isUser }: MessageAttachmentsProps) {
  const attachments = useLiveQuery(
    () =>
      getDb()
        .attachments.where("message_id")
        .equals(messageId)
        .toArray(),
    [messageId],
    [] as LocalAttachment[],
  );
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  // Layout : 1 = pleine largeur, 2 = 2 cols, 3+ = 3 cols
  const cols =
    attachments.length === 1 ? 1 : attachments.length === 2 ? 2 : 3;

  return (
    <>
      <div
        className={`grid gap-1 mb-1 ${
          cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3"
        } ${isUser ? "max-w-[260px]" : "max-w-[280px]"}`}
        role="group"
        aria-label={`${attachments.length} média${attachments.length > 1 ? "s" : ""}`}
      >
        {attachments.map((a, i) => (
          <AttachmentThumb
            key={a.id}
            attachment={a}
            onClick={() => setOpenIdx(i)}
            single={cols === 1}
          />
        ))}
      </div>
      {openIdx !== null ? (
        <MediaLightbox
          attachments={attachments}
          initialIndex={openIdx}
          open={openIdx !== null}
          onOpenChange={(o) => {
            if (!o) setOpenIdx(null);
          }}
        />
      ) : null}
    </>
  );
}

function AttachmentThumb({
  attachment,
  onClick,
  single,
}: {
  attachment: LocalAttachment;
  onClick: () => void;
  single: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isPdf = attachment.media_profile === "pdf";

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    if (isPdf) return;
    void (async () => {
      const blob = await getAttachmentBlob(attachment.id);
      if (cancelled || !blob?.thumbnail) return;
      created = URL.createObjectURL(blob.thumbnail);
      setUrl(created);
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [attachment.id, isPdf]);

  // Badge ✨ si description IA dispo
  const hasAi = useLiveQuery(
    async () => {
      const rows = await getDb()
        .attachment_ai_descriptions.where("attachment_id")
        .equals(attachment.id)
        .toArray();
      return rows.length > 0;
    },
    [attachment.id],
    false,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg border border-border bg-muted transition-transform active:scale-95 ${
        single ? "aspect-[4/3]" : "aspect-square"
      }`}
      aria-label="Voir le média en plein écran"
      data-testid={`msg-attachment-${attachment.id}`}
    >
      {isPdf ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-primary/5 text-primary">
          <FileText className="h-6 w-6" />
          <span className="font-ui text-[10px] font-medium">PDF</span>
        </div>
      ) : url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
      {hasAi ? (
        <span
          className="pointer-events-none absolute right-1 bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
          aria-label="Analysé par l'IA"
        >
          <Sparkles className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
