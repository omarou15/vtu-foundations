/**
 * VTU — Dexie schema v1 (miroir local de Supabase + outbox)
 *
 * Doctrine offline-first (cf. KNOWLEDGE.md §2) :
 *  - Toutes les écritures passent par IndexedDB d'abord, puis sync vers Supabase.
 *  - Lecture toujours depuis IndexedDB (via useLiveQuery).
 *  - Chaque entité Dexie miroir étend la ligne Supabase avec `SyncFields`
 *    (sync_status, sync_attempts, sync_last_error, local_updated_at).
 *  - Une `sync_queue` séparée fait office d'outbox pour le replay engine
 *    (Itération 6).
 *
 * Phase 1 : schéma défini, ouverture v1, repos squelette. Pas de UI
 * branchée encore (Itération 4+).
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

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export class VtuDatabase extends Dexie {
  visits!: Table<LocalVisit, string>;
  messages!: Table<LocalMessage, string>;
  attachments!: Table<LocalAttachment, string>;
  visit_json_state!: Table<LocalVisitJsonState, string>;
  sync_queue!: Table<SyncQueueEntry, number>;

  constructor() {
    super("vtu");

    // -------- v1 --------
    // Indexes documentés ici (l'ordre des champs définit les index composés
    // utiles aux requêtes useLiveQuery + outbox replay).
    this.version(1).stores({
      // PK = id ; index secondaires : user_id, [user_id+updated_at], status, sync_status
      visits:
        "id, user_id, [user_id+updated_at], [user_id+status], status, sync_status, client_id, [user_id+client_id]",

      // PK = id ; queries fréquentes : par visit_id, ordre chrono
      messages:
        "id, visit_id, [visit_id+created_at], user_id, sync_status, client_id, [user_id+client_id]",

      // PK = id ; queries via message_id, visit_id
      attachments:
        "id, message_id, visit_id, user_id, sync_status",

      // PK = id ; query principale : dernière version d'une visite
      visit_json_state:
        "id, visit_id, [visit_id+version], user_id, sync_status",

      // Outbox : auto-increment id, indexé par état d'envoi
      sync_queue:
        "++id, [next_attempt_at+attempts], table, row_id, [table+row_id]",
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
