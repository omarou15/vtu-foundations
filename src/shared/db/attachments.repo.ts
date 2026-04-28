/**
 * Repository attachments (Dexie local mirror).
 *
 * Les créations locales passent par `shared/photo/repo.ts`. Ce fichier ne
 * contient que l'hydratation depuis le backend pour le cross-device.
 */

import { getDb, type LocalAttachment } from "./schema";
import type { AttachmentRow } from "@/shared/types";

export async function upsertAttachmentFromRemote(
  row: AttachmentRow,
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const local: LocalAttachment = {
    ...row,
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };
  await db.attachments.put(local);
}