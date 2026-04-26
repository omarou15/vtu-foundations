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
 *  - Une `schema_registry` mirror les entrées du vocabulaire métier
 *    (Itération 7) — permet le matching offline + l'optimistic local upsert.
 *
 * Versions :
 *  - v1 : visits, messages, attachments, visit_json_state, sync_queue
 *  - v2 : ajout sync_state (curseurs de pull, par table)
 *  - v3 : ajout schema_registry (vocabulaire métier, mirror local)
 *  - v4 : pipeline médias (It. 9) — extension index attachments + table
 *         attachment_blobs (blobs lourds isolés du store métier)
 */

import Dexie, { type Table } from "dexie";
import type {
  AttachmentRow,
  MessageRow,
  SchemaRegistryEntry,
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
export type LocalSchemaRegistryEntry = SchemaRegistryEntry & SyncFields;

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

/**
 * It. 9 — Blobs lourds (compressed + thumbnail) stockés à part de la
 * table métier `attachments`. La FK locale est `attachment_id` (= row id).
 * Cleanup TTL délégué à It. 12 (housekeeping).
 */
export interface AttachmentBlobRow {
  attachment_id: string;
  /** Version compressée (ou file brut pour PDF). */
  compressed: Blob;
  /** Thumbnail. NULL pour les PDF (rendu via icône SVG inline). */
  thumbnail: Blob | null;
  created_at: string;
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
  schema_registry!: Table<LocalSchemaRegistryEntry, string>;
  attachment_blobs!: Table<AttachmentBlobRow, string>;

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
    this.version(2).stores({
      sync_state: "&key",
    });

    // -------- v3 -------- (Itération 7 : Schema Registry mirror)
    // Index principaux :
    //   - registry_urn UNIQUE local (cohérent avec UNIQUE(user_id, registry_urn) côté DB)
    //   - [section_path+field_key] pour le matching exact local (évite un trip réseau)
    //   - section_path pour énumérer les fields d'une section (UI It. 11)
    //   - sync_status pour que l'engine puisse retrouver les pending
    this.version(3).stores({
      schema_registry:
        "id, &registry_urn, section_path, [section_path+field_key], status, sync_status",
    });

    // -------- v4 -------- (Itération 9 : pipeline médias)
    // - attachments : ajout sha256 + index composé pour la dedup informatif
    //   et [visit_id+sync_status] pour la liste des drafts (PhotoPreviewPanel).
    //   Le statut "draft" (sync_status) signifie : créé localement mais pas
    //   encore enqueue dans sync_queue (en attente d'un message porteur).
    // - attachment_blobs : nouvelle table, blobs lourds isolés du store métier.
    this.version(4).stores({
      attachments:
        "id, message_id, visit_id, user_id, sync_status, sha256, [user_id+sha256], [visit_id+sync_status]",
      attachment_blobs: "&attachment_id, created_at",
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
