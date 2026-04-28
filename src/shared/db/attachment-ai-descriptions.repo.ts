/**
 * Repository attachment_ai_descriptions (Dexie local, append-only).
 *
 * 1 row par (user, attachment, mode). Pas d'update : si on re-décrit, on
 * insère une nouvelle ligne (debug / re-run). UI lit la dernière par
 * (attachment_id, created_at desc).
 */

import { v4 as uuidv4 } from "uuid";
import {
  getDb,
  type LocalAttachmentAiDescription,
} from "@/shared/db/schema";
import type {
  AttachmentAiDescriptionRow,
  AttachmentAiDescriptionPayload,
  SyncQueueEntry,
} from "@/shared/types";

export interface AppendLocalAttachmentAiDescriptionInput {
  userId: string;
  visitId: string;
  organizationId?: string | null;
  attachmentId: string;
  provider: string;
  modelVersion: string;
  description: AttachmentAiDescriptionPayload;
  confidenceOverall?: number | null;
}

export async function appendLocalAttachmentAiDescription(
  input: AppendLocalAttachmentAiDescriptionInput,
): Promise<LocalAttachmentAiDescription> {
  const db = getDb();
  const now = new Date().toISOString();
  const row: AttachmentAiDescriptionRow = {
    id: uuidv4(),
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    visit_id: input.visitId,
    attachment_id: input.attachmentId,
    mode: "describe_media",
    provider: input.provider,
    model_version: input.modelVersion,
    description: input.description,
    confidence_overall: input.confidenceOverall ?? null,
    created_at: now,
  };
  const local: LocalAttachmentAiDescription = {
    ...row,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  const queueEntry: SyncQueueEntry = {
    table: "attachment_ai_descriptions",
    op: "insert",
    row_id: row.id,
    payload: serializeForSync(row),
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };

  await db.transaction(
    "rw",
    db.attachment_ai_descriptions,
    db.sync_queue,
    async () => {
      await db.attachment_ai_descriptions.add(local);
      await db.sync_queue.add(queueEntry);
    },
  );
  return local;
}

export async function getLatestAiDescriptionForAttachment(
  attachmentId: string,
): Promise<LocalAttachmentAiDescription | undefined> {
  const db = getDb();
  const list = await db.attachment_ai_descriptions
    .where("attachment_id")
    .equals(attachmentId)
    .toArray();
  list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return list[0];
}

export async function upsertAttachmentAiDescriptionFromRemote(
  row: AttachmentAiDescriptionRow,
): Promise<void> {
  const db = getDb();
  const local: LocalAttachmentAiDescription = {
    ...row,
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: new Date().toISOString(),
  };
  await db.attachment_ai_descriptions.put(local);
}

function serializeForSync(
  r: AttachmentAiDescriptionRow,
): Record<string, unknown> {
  return {
    id: r.id,
    user_id: r.user_id,
    organization_id: r.organization_id,
    visit_id: r.visit_id,
    attachment_id: r.attachment_id,
    mode: r.mode,
    provider: r.provider,
    model_version: r.model_version,
    description: r.description,
    confidence_overall: r.confidence_overall,
    created_at: r.created_at,
  };
}
