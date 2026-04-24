/**
 * VTU — Dexie schema (miroir local de Supabase + outbox + sync state)
 *
 * Doctrine offline-first (cf. KNOWLEDGE.md §2) :
 *  - Toutes les écritures passent par IndexedDB d'abord, puis sync vers Supabase.
 *  - Lecture toujours depuis IndexedDB (via useLiveQuery).
 *  - Chaque entité Dexie miroir étend la ligne Supabase avec `SyncFields`
 *    (sync_status, sync_attempts, sync_last_error, local_updated_at).
 *  - Une `sync_queue` séparée fait office d'outbox pour le replay engine.
 *  - Une `sync_state` (key/value) stocke les curseurs de pull cross-device
 *    (Itération 6.5).
 *
 * Versions :
 *  - v1 : visits, messages, attachments, visit_json_state, sync_queue
 *  - v2 : ajout sync_state (curseurs de pull, par table)
 */

import Dexie, { type Table } from "dexie";
import type {
  AttachmentRow,
  MessageRow,
  SyncFields,
  SyncQueueEntry,
  VisitJsonStateRow,
  VisitRow,
} from "@/shared/types";

// ---------------------------------------------------------------------------
// Local row types : Supabase row + champs locaux de sync
// ---------------------------------------------------------------------------

export type LocalVisit = VisitRow & SyncFields;
export type LocalMessage = MessageRow & SyncFields;
export type LocalAttachment = AttachmentRow & SyncFields;
export type LocalVisitJsonState = VisitJsonStateRow & SyncFields;

/**
 * Curseur de pull cross-device. `key` typique :
 *   - "visits:last_pulled_at"
 *   - "visit_json_state:last_pulled_at"
 *   - "messages:last_pulled_at:{visitId}"
 */
export interface SyncStateRow {
  key: string;
  value: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export class VtuDatabase extends Dexie {
  visits!: Table<LocalVisit, string>;
  messages!: Table<LocalMessage, string>;
  attachments!: Table<LocalAttachment, string>;
  visit_json_state!: Table<LocalVisitJsonState, string>;
  sync_queue!: Table<SyncQueueEntry, number>;
  sync_state!: Table<SyncStateRow, string>;

  constructor() {
    super("vtu");

    // -------- v1 --------
    this.version(1).stores({
      visits:
        "id, user_id, [user_id+updated_at], [user_id+status], status, sync_status, client_id, [user_id+client_id]",
      messages:
        "id, visit_id, [visit_id+created_at], user_id, sync_status, client_id, [user_id+client_id]",
      attachments:
        "id, message_id, visit_id, user_id, sync_status",
      visit_json_state:
        "id, visit_id, [visit_id+version], user_id, sync_status",
      sync_queue:
        "++id, [next_attempt_at+attempts], table, row_id, [table+row_id]",
    });

    // -------- v2 -------- (Itération 6.5 : pull cross-device)
    // Ajout d'une table key/value pour les curseurs de pull.
    // Migration automatique : Dexie ajoute la table sans toucher aux autres.
    this.version(2).stores({
      sync_state: "&key",
    });
  }
}

// Singleton lazy : on n'ouvre IndexedDB que côté client (pas en SSR).
let _db: VtuDatabase | null = null;

export function getDb(): VtuDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error(
      "[VTU] IndexedDB indisponible (SSR ou environnement non-navigateur).",
    );
  }
  if (!_db) {
    _db = new VtuDatabase();
  }
  return _db;
}

/** Reset uniquement utilisé par les tests. */
export function __resetDbForTests(): void {
  _db = null;
}
