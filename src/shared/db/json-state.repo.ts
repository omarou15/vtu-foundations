/**
 * VTU — Repository visit_json_state (Dexie local, versionné)
 *
 * Une nouvelle ligne par version. Jamais d'UPDATE en place.
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalVisitJsonState } from "@/shared/db/schema";
import type { VisitJsonState, VisitJsonStateRow } from "@/shared/types";

interface InsertLocalJsonStateInput {
  userId: string;
  visitId: string;
  version: number;
  state: VisitJsonState;
  createdByMessageId?: string | null;
}

export async function insertLocalJsonState(
  input: InsertLocalJsonStateInput,
): Promise<LocalVisitJsonState> {
  const db = getDb();
  const now = new Date().toISOString();
  const row: LocalVisitJsonState = {
    id: uuidv4(),
    visit_id: input.visitId,
    user_id: input.userId,
    version: input.version,
    state: input.state,
    created_by_message_id: input.createdByMessageId ?? null,
    created_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };
  await db.visit_json_state.add(row);
  return row;
}

/** Retourne la dernière version connue localement pour une visite. */
export async function getLatestLocalJsonState(
  visitId: string,
): Promise<LocalVisitJsonState | undefined> {
  const db = getDb();
  return db.visit_json_state
    .where("[visit_id+version]")
    .between([visitId, 0], [visitId, Number.MAX_SAFE_INTEGER])
    .reverse()
    .first();
}

export async function upsertJsonStateFromRemote(
  row: VisitJsonStateRow,
): Promise<void> {
  const db = getDb();
  // Unique par (visit_id, version) côté Supabase → idempotent ici aussi.
  const existing = await db.visit_json_state
    .where("[visit_id+version]")
    .equals([row.visit_id, row.version])
    .first();
  if (existing) return;

  const local: LocalVisitJsonState = {
    ...row,
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: new Date().toISOString(),
  };
  await db.visit_json_state.put(local);
}
