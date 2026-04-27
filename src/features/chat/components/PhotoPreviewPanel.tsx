import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Loader2, X, AlertTriangle, Camera, Layers, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getDb } from "@/shared/db";
import {
  compressMedia,
  discardDraftMedia,
  listDraftMedia,
  getAttachmentBlob,
} from "@/shared/photo";
import type { LocalAttachment } from "@/shared/db/schema";
import type { MediaProfile } from "@/shared/types";

interface PhotoPreviewPanelProps {
  visitId: string;
}

/**
 * PhotoPreviewPanel — Itération 9.
 *
 * Affichage horizontal scrollable des médias en sync_status="draft" pour
 * la VT courante (en attente d'être rattachés au prochain message).
 *
 * Pour chaque draft :
 *  - Thumbnail depuis Dexie (URL.createObjectURL, cleanup au unmount).
 *  - Badge profil : 📷 photo / 📄 plan / PDF.
 *  - Toggle photo↔plan (sauf PDF) → recompresse + remplace blob atomiquement.
 *  - Bouton ✕ pour discarder.
 *  - Badge ⚠ "Doublon" informatif si le SHA-256 existe ailleurs.
 */
export function PhotoPreviewPanel({ visitId }: PhotoPreviewPanelProps) {
  const drafts = useLiveQuery(
    () => listDraftMedia(visitId),
    [visitId],
    [] as LocalAttachment[],
  );

  if (!drafts || drafts.length === 0) return null;

  return (
    <div
      className="safe-x flex gap-2 overflow-x-auto border-t border-border bg-card/50 px-2 py-2"
      data-testid="photo-preview-panel"
    >
      {drafts.map((draft) => (
        <DraftThumb key={draft.id} draft={draft} />
      ))}
    </div>
  );
}

function DraftThumb({ draft }: { draft: LocalAttachment }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Charger le thumbnail (createObjectURL avec cleanup)
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    if (draft.media_profile === "pdf") {
      // Pas de thumbnail blob → on rendra l'icône SVG
      setThumbUrl(null);
      return;
    }
    void (async () => {
      const blob = await getAttachmentBlob(draft.id);
      if (cancelled || !blob || !blob.thumbnail) return;
      url = URL.createObjectURL(blob.thumbnail);
      setThumbUrl(url);
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft.id, draft.media_profile]);

  const profileBadge = useMemo(() => {
    if (draft.media_profile === "pdf")
      return { label: "PDF", icon: FileText };
    if (draft.media_profile === "plan")
      return { label: "Plan", icon: Layers };
    return { label: "Photo", icon: Camera };
  }, [draft.media_profile]);

  // is_duplicate dérivé : on ne stocke pas le flag, on relit la table.
  const db = getDb();
  const isDuplicate = useLiveQuery(
    async () => {
      if (!draft.sha256) return false;
      const matches = await db.attachments
        .where("[user_id+sha256]")
        .equals([draft.user_id, draft.sha256])
        .toArray();
      return matches.filter((m) => m.id !== draft.id).length > 0;
    },
    [draft.id, draft.sha256, draft.user_id],
    false,
  );

  // It. 10 — badge ✨ si une description IA existe pour cet attachment.
  // Sur les drafts (pré-attach) c'est toujours false ; le hook reste
  // câblé pour les surfaces futures qui rendront des thumbnails déjà
  // uploadés (e.g. drawer "Voir tous", It. 11).
  const hasAiDescription = useLiveQuery(
    async () => {
      try {
        const rows = await db.attachment_ai_descriptions
          .where("attachment_id")
          .equals(draft.id)
          .toArray();
        return rows.length > 0;
      } catch {
        return false;
      }
    },
    [draft.id],
    false,
  );

  async function handleToggleProfile() {
    if (draft.media_profile === "pdf") return;
    const next: MediaProfile =
      draft.media_profile === "photo" ? "plan" : "photo";
    setBusy(true);
    try {
      const blob = await getAttachmentBlob(draft.id);
      if (!blob) throw new Error("Blob local introuvable");
      // On a besoin d'un File pour compressMedia → on reconstruit depuis le blob.
      const file = new File([blob.compressed], `${draft.id}`, {
        type: draft.format ?? "image/webp",
      });
      const recompressed = await compressMedia(file, next);

      await db.transaction(
        "rw",
        [db.attachments, db.attachment_blobs],
        async () => {
          await db.attachments.update(draft.id, {
            media_profile: next,
            width_px: recompressed.metadata.width_px,
            height_px: recompressed.metadata.height_px,
            size_bytes: recompressed.metadata.size_bytes,
            format: recompressed.metadata.format,
            sha256: recompressed.metadata.sha256,
            local_updated_at: new Date().toISOString(),
          });
          await db.attachment_blobs.put({
            attachment_id: draft.id,
            compressed: recompressed.compressed,
            thumbnail: recompressed.thumbnail,
            created_at: new Date().toISOString(),
          });
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Changement de profil impossible", { description: msg });
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    await discardDraftMedia(draft.id);
  }

  const Icon = profileBadge.icon;

  return (
    <div
      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
      data-testid={`draft-thumb-${draft.id}`}
    >
      {thumbUrl ? (
        // eslint-disable-next-line jsx-a11y/img-redundant-alt
        <img
          src={thumbUrl}
          alt="Aperçu média en attente"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <FileText className="h-8 w-8" aria-hidden="true" />
        </div>
      )}

      {/* Badge profil top-left */}
      <div className="font-ui pointer-events-none absolute left-1 top-1 flex items-center gap-0.5 rounded bg-background/80 px-1 py-0.5 text-[9px] font-medium backdrop-blur">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {profileBadge.label}
      </div>

      {/* Toggle profil top-right (sauf PDF) */}
      {draft.media_profile !== "pdf" ? (
        <button
          type="button"
          onClick={() => void handleToggleProfile()}
          disabled={busy}
          className="touch-target absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur disabled:opacity-50"
          aria-label={
            draft.media_profile === "photo"
              ? "Basculer vers profil Plan"
              : "Basculer vers profil Photo"
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : draft.media_profile === "photo" ? (
            <Layers className="h-3.5 w-3.5" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}

      {/* Suppression bottom-right */}
      <button
        type="button"
        onClick={() => void handleDiscard()}
        className="touch-target absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive/90 text-destructive-foreground"
        aria-label="Supprimer ce média"
        data-testid={`draft-discard-${draft.id}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Badge doublon bottom-left */}
      {isDuplicate ? (
        <div
          className="font-ui pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-warning/90 px-1 py-0.5 text-[9px] font-medium text-warning-foreground"
          aria-label="Doublon détecté"
        >
          <AlertTriangle className="h-3 w-3" />
          Dup
        </div>
      ) : null}

      {/* It. 10 — Badge ✨ description IA disponible */}
      {hasAiDescription ? (
        <div
          className="pointer-events-none absolute right-1 bottom-8 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-sm"
          aria-label="Analysé par l'IA"
          data-testid={`ai-described-${draft.id}`}
        >
          <Sparkles className="h-3 w-3" />
        </div>
      ) : null}
    </div>
  );
}
