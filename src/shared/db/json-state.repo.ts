/**
 * VTU — Repository visit_json_state (Dexie local, versionné)
 *
 * Une nouvelle ligne par version. Jamais d'UPDATE en place.
 *
 * It. 7 : `upsertJsonStateFromRemote` passe le `state` reçu par
 * `migrateVisitJsonState` AVANT le put local. Garantit qu'un VT Phase 1
 * pull cross-device est rétro-compatible v2 (mapping building_type →
 * building_typology, hydration sections vides, etc.).
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalVisitJsonState } from "@/shared/db/schema";
import type {
  SyncQueueEntry,
  VisitJsonState,
  VisitJsonStateRow,
} from "@/shared/types";
import { migrateVisitJsonState } from "@/shared/types/json-state.migrate";

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

  // It. 7 : migration v1 → v2 si nécessaire (rétrocompat pull cross-device).
  // migrateVisitJsonState est idempotent (no-op si déjà v2).
  let migratedState: VisitJsonState;
  try {
    migratedState = migrateVisitJsonState(row.state);
  } catch (err) {
    // Si schema_version inconnue, on log et on conserve le state brut pour
    // ne pas bloquer le pull. Le viewer affichera tel quel.
    console.warn("[upsertJsonStateFromRemote] migration échouée", err);
    migratedState = row.state;
  }

  const local: LocalVisitJsonState = {
    ...row,
    state: migratedState,
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: new Date().toISOString(),
  };
  await db.visit_json_state.put(local);
}
