/**
 * VTU — Repository médias (Itération 9)
 *
 * Workflow draft → pending → synced :
 *
 *   addMediaToVisit(file, profile)
 *      ├─ compressMedia → blobs + metadata
 *      ├─ dedup local SHA-256 (informatif, n'empêche jamais l'insert)
 *      ├─ INSERT attachments (sync_status="draft", message_id=null)
 *      └─ INSERT attachment_blobs
 *      ❌ AUCUNE entry sync_queue à ce stade
 *
 *   attachPendingMediaToMessage(visitId, messageId)
 *      ├─ UPDATE attachments draft → message_id=messageId, sync_status="pending"
 *      └─ INSERT sync_queue × N (op="attachment_upload")
 *      = SEUL point qui passe draft → pending et enqueue
 *
 *   discardDraftMedia(attachmentId)
 *      └─ DELETE row + blob (queue vide → rien à nettoyer côté queue)
 *
 * Toutes les opérations sont transactionnelles (Dexie rw).
 */

import { v4 as uuidv4 } from "uuid";
import {
  getDb,
  type AttachmentBlobRow,
  type LocalAttachment,
} from "@/shared/db/schema";
import { canonicalizeSectionPath } from "@/shared/db/schema-registry.repo";
import type { MediaProfile, SyncQueueEntry } from "@/shared/types";
import { compressMedia } from "@/shared/photo/compress";
import { detectDefaultProfile } from "@/shared/photo/compress";

// ---------------------------------------------------------------------------
// addMediaToVisit
// ---------------------------------------------------------------------------

interface AddMediaInput {
  visitId: string;
  userId: string;
  file: File;
  /** Si non fourni, `detectDefaultProfile(file)` est utilisé. */
  profile?: MediaProfile;
  linkedSections?: string[];
}

export interface AddMediaResult {
  attachment: LocalAttachment;
  /** True si une row antérieure du même user partage le même sha256. */
  is_duplicate: boolean;
  /** Id de la row originale, si dedup détecté. */
  duplicate_of?: string;
}

export async function addMediaToVisit(
  input: AddMediaInput,
): Promise<AddMediaResult> {
  const db = getDb();
  const profile = input.profile ?? detectDefaultProfile(input.file);
  const compressed = await compressMedia(input.file, profile);

  // Dedup informatif local : on cherche un attachment du même user avec
  // le même sha256. Le résultat ne bloque PAS l'insert (même photo dans
  // 2 VTs = légitime), il est juste retourné pour affichage UI.
  const duplicate = await db.attachments
    .where("[user_id+sha256]")
    .equals([input.userId, compressed.metadata.sha256])
    .first();

  const id = uuidv4();
  const now = new Date().toISOString();
  const ext = extensionFromFormat(compressed.metadata.format);
  const subdir = profile === "photo" ? "photos" : profile === "plan" ? "plans" : "pdfs";
  const compressedPath = `${input.userId}/${input.visitId}/${subdir}/${id}.${ext}`;
  const thumbnailPath =
    compressed.thumbnail !== null
      ? `${input.userId}/${input.visitId}/${subdir}/${id}.thumb.${extensionFromFormat(
          compressed.metadata.thumbnail_format ?? compressed.metadata.format,
        )}`
      : null;

  const linkedSections = (input.linkedSections ?? []).map(
    canonicalizeSectionPath,
  );

  const attachment: LocalAttachment = {
    id,
    message_id: null,
    user_id: input.userId,
    visit_id: input.visitId,
    bucket: "attachments",
    storage_path: compressedPath, // identique à compressed_path
    mime_type: compressed.metadata.format,
    size_bytes: compressed.metadata.size_bytes,
    metadata: {},
    created_at: now,
    compressed_path: compressedPath,
    thumbnail_path: thumbnailPath,
    width_px: compressed.metadata.width_px,
    height_px: compressed.metadata.height_px,
    sha256: compressed.metadata.sha256,
    gps_lat: compressed.metadata.gps?.lat ?? null,
    gps_lng: compressed.metadata.gps?.lng ?? null,
    format: compressed.metadata.format,
    media_profile: profile,
    linked_sections: linkedSections,
    sync_status: "draft", // ⚠ pas "pending" — pas encore enqueue
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  const blob: AttachmentBlobRow = {
    attachment_id: id,
    compressed: compressed.compressed,
    thumbnail: compressed.thumbnail,
    created_at: now,
  };

  await db.transaction(
    "rw",
    [db.attachments, db.attachment_blobs],
    async () => {
      await db.attachments.add(attachment);
      await db.attachment_blobs.add(blob);
    },
  );

  return {
    attachment,
    is_duplicate: Boolean(duplicate),
    duplicate_of: duplicate?.id,
  };
}

// ---------------------------------------------------------------------------
// attachPendingMediaToMessage — SEUL point qui transitionne draft → pending
// ---------------------------------------------------------------------------

export interface AttachResult {
  attached_count: number;
}

export async function attachPendingMediaToMessage(
  visitId: string,
  messageId: string,
): Promise<AttachResult> {
  const db = getDb();
  const now = new Date().toISOString();

  let attached = 0;

  await db.transaction(
    "rw",
    [db.attachments, db.sync_queue],
    async () => {
      const drafts = await db.attachments
        .where("[visit_id+sync_status]")
        .equals([visitId, "draft"])
        .toArray();

      for (const draft of drafts) {
        await db.attachments.update(draft.id, {
          message_id: messageId,
          sync_status: "pending",
          local_updated_at: now,
        });

        const queueEntry: SyncQueueEntry = {
          table: "attachments",
          op: "attachment_upload",
          row_id: draft.id,
          payload: {
            attachment_id: draft.id,
            message_id: messageId,
          },
          attempts: 0,
          last_error: null,
          created_at: now,
          next_attempt_at: now,
        };
        await db.sync_queue.add(queueEntry);
        attached++;
      }
    },
  );

  return { attached_count: attached };
}

// ---------------------------------------------------------------------------
// discardDraftMedia — cleanup d'un draft (jamais enqueue)
// ---------------------------------------------------------------------------

export async function discardDraftMedia(attachmentId: string): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.attachments, db.attachment_blobs],
    async () => {
      const row = await db.attachments.get(attachmentId);
      // Sécurité : ne supprime QUE les draft (jamais un attachment déjà
      // pending/synced via cette API).
      if (!row || row.sync_status !== "draft") return;
      await db.attachments.delete(attachmentId);
      await db.attachment_blobs.delete(attachmentId);
    },
  );
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

export async function listVisitMedia(
  visitId: string,
): Promise<LocalAttachment[]> {
  const db = getDb();
  return db.attachments.where("visit_id").equals(visitId).toArray();
}

export async function listDraftMedia(
  visitId: string,
): Promise<LocalAttachment[]> {
  const db = getDb();
  return db.attachments
    .where("[visit_id+sync_status]")
    .equals([visitId, "draft"])
    .toArray();
}

export async function getAttachmentBlob(
  attachmentId: string,
): Promise<AttachmentBlobRow | undefined> {
  const db = getDb();
  return db.attachment_blobs.get(attachmentId);
}

export async function linkMediaToSection(
  attachmentId: string,
  sectionPath: string,
): Promise<void> {
  const db = getDb();
  const canonical = canonicalizeSectionPath(sectionPath);
  await db.transaction("rw", db.attachments, async () => {
    const row = await db.attachments.get(attachmentId);
    if (!row) return;
    if (row.linked_sections.includes(canonical)) return;
    const next = [...row.linked_sections, canonical];
    await db.attachments.update(attachmentId, {
      linked_sections: next,
      local_updated_at: new Date().toISOString(),
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extensionFromFormat(format: string): string {
  switch (format) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "application/pdf":
      return "pdf";
    default: {
      const [, sub] = format.split("/");
      return (sub ?? "bin").replace(/[^a-z0-9]/gi, "");
    }
  }
}
