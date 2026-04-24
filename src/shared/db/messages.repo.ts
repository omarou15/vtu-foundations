/**
 * VTU — Repository messages (Dexie local, append-only)
 *
 * Append-only : pas d'update. Toute correction = nouveau message.
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalMessage } from "@/shared/db/schema";
import type { MessageKind, MessageRole, MessageRow } from "@/shared/types";

interface AppendLocalMessageInput {
  userId: string;
  visitId: string;
  role: MessageRole;
  kind?: MessageKind;
  content?: string | null;
  metadata?: Record<string, unknown>;
}

export async function appendLocalMessage(
  input: AppendLocalMessageInput,
): Promise<LocalMessage> {
  const db = getDb();
  const now = new Date().toISOString();
  const message: LocalMessage = {
    id: uuidv4(),
    user_id: input.userId,
    visit_id: input.visitId,
    client_id: uuidv4(),
    role: input.role,
    kind: input.kind ?? "text",
    content: input.content ?? null,
    metadata: input.metadata ?? {},
    created_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };
  await db.messages.add(message);
  return message;
}

export async function listLocalMessagesByVisit(
  visitId: string,
): Promise<LocalMessage[]> {
  const db = getDb();
  return db.messages
    .where("[visit_id+created_at]")
    .between([visitId, ""], [visitId, "\uffff"])
    .toArray();
}

/**
 * Idempotence : insert avec same (user_id, client_id) → no-op.
 */
export async function upsertMessageFromRemote(row: MessageRow): Promise<void> {
  const db = getDb();
  const existing = await db.messages
    .where("[user_id+client_id]")
    .equals([row.user_id, row.client_id])
    .first();

  if (existing) return; // append-only : pas de mise à jour

  const local: LocalMessage = {
    ...row,
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: new Date().toISOString(),
  };
  await db.messages.put(local);
}
