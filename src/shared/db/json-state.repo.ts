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

// ---------------------------------------------------------------------------
// It. 10 — appendJsonStateVersion (local pur, enqueue sync)
// ---------------------------------------------------------------------------

export interface AppendJsonStateVersionInput {
  userId: string;
  visitId: string;
  state: VisitJsonState;
  createdByMessageId?: string | null;
  /** Lien vers l'extraction LLM à l'origine (audit trail). */
  sourceExtractionId?: string | null;
}

/**
 * Crée une nouvelle version (version=last+1) localement et enqueue
 * pour sync vers Supabase. ATOMIQUE.
 *
 * Si aucune version locale n'existe encore, démarre à version=1.
 */
export async function appendJsonStateVersion(
  input: AppendJsonStateVersionInput,
): Promise<LocalVisitJsonState> {
  const db = getDb();
  const now = new Date().toISOString();
  const last = await getLatestLocalJsonState(input.visitId);
  const nextVersion = (last?.version ?? 0) + 1;

  const row: LocalVisitJsonState = {
    id: uuidv4(),
    visit_id: input.visitId,
    user_id: input.userId,
    version: nextVersion,
    state: input.state,
    created_by_message_id: input.createdByMessageId ?? null,
    source_extraction_id: input.sourceExtractionId ?? null,
    created_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  const queueEntry: SyncQueueEntry = {
    table: "visit_json_state",
    op: "insert",
    row_id: row.id,
    payload: {
      id: row.id,
      visit_id: row.visit_id,
      user_id: row.user_id,
      version: row.version,
      state: row.state,
      created_by_message_id: row.created_by_message_id,
      source_extraction_id: row.source_extraction_id,
      created_at: row.created_at,
    },
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };

  await db.transaction(
    "rw",
    db.visit_json_state,
    db.sync_queue,
    async () => {
      await db.visit_json_state.add(row);
      await db.sync_queue.add(queueEntry);
    },
  );
  return row;
}
