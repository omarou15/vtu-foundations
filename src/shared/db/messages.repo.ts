/**
 * VTU — Repository messages (Dexie local, append-only)
 *
 * Append-only : pas d'update. Toute correction = nouveau message.
 *
 * Itération 5 : `appendLocalMessage` est ATOMIQUE — insert message +
 * enqueue sync_queue dans une seule transaction Dexie (rw). Cohérent
 * avec `createLocalVisit` (Itération 4).
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalMessage } from "@/shared/db/schema";
import type {
  MessageKind,
  MessageRole,
  MessageRow,
  SyncQueueEntry,
} from "@/shared/types";

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

  const queueEntry: SyncQueueEntry = {
    table: "messages",
    op: "insert",
    row_id: message.id,
    payload: serializeMessageForSync(message),
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };

  // It. 10 — Trigger LLM route_and_dispatch pour les messages user
  // « substantiels » (≥10 chars OU au moins 1 attachment annoncé via metadata).
  // It. 10.7 — Gate supplémentaire : le toggle IA de la visite (passé via
  //   metadata.ai_enabled). Si explicitement false → aucun dispatch.
  //   Default true pour rétrocompat tests/sync legacy.
  // Anti-boucle : assistant/system jamais déclenchés ici.
  const attachmentCount =
    typeof input.metadata?.attachment_count === "number"
      ? (input.metadata.attachment_count as number)
      : 0;
  const aiEnabled = input.metadata?.ai_enabled !== false;
  const contentLen = (input.content ?? "").length;
  const shouldDispatchLlm =
    aiEnabled &&
    input.role === "user" &&
    (contentLen >= 10 || attachmentCount > 0);

  const llmDispatchEntry: SyncQueueEntry | null = shouldDispatchLlm
    ? {
        table: "messages",
        op: "llm_route_and_dispatch",
        row_id: message.id,
        payload: { message_id: message.id, visit_id: input.visitId },
        attempts: 0,
        last_error: null,
        created_at: now,
        next_attempt_at: now,
      }
    : null;

  await db.transaction("rw", db.messages, db.sync_queue, async () => {
    await db.messages.add(message);
    await db.sync_queue.add(queueEntry);
    if (llmDispatchEntry) {
      await db.sync_queue.add(llmDispatchEntry);
    }
  });

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

// ---------------------------------------------------------------------------
// Serializer (payload pour sync_queue → Supabase)
// Sépare les champs sync_* (locaux) des champs DB (envoyés à Supabase).
// ---------------------------------------------------------------------------

function serializeMessageForSync(m: LocalMessage): Record<string, unknown> {
  return {
    id: m.id,
    user_id: m.user_id,
    visit_id: m.visit_id,
    client_id: m.client_id,
    role: m.role,
    kind: m.kind,
    content: m.content,
    metadata: m.metadata,
    created_at: m.created_at,
  };
}
