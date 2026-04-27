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
 *  - v5 : cerveau LLM (It. 10) — llm_extractions + attachment_ai_descriptions
 *         + index composé `[op+row_id]` sur sync_queue (re-enqueue ciblée).
 */

import Dexie, { type Table } from "dexie";
import type {
  AttachmentAiDescriptionRow,
  AttachmentRow,
  LlmExtractionRow,
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
export type LocalLlmExtraction = LlmExtractionRow & SyncFields;
export type LocalAttachmentAiDescription = AttachmentAiDescriptionRow &
  SyncFields;

export interface SyncStateRow {
  key: string;
  value: string;
}

export interface AttachmentBlobRow {
  attachment_id: string;
  compressed: Blob;
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
  llm_extractions!: Table<LocalLlmExtraction, string>;
  attachment_ai_descriptions!: Table<LocalAttachmentAiDescription, string>;

  constructor() {
    super("vtu");

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

    this.version(2).stores({
      sync_state: "&key",
    });

    this.version(3).stores({
      schema_registry:
        "id, &registry_urn, section_path, [section_path+field_key], status, sync_status",
    });

    this.version(4).stores({
      attachments:
        "id, message_id, visit_id, user_id, sync_status, sha256, [user_id+sha256], [visit_id+sync_status]",
      attachment_blobs: "&attachment_id, created_at",
    });

    // -------- v5 -------- (Itération 10 : cerveau LLM)
    // - llm_extractions : audit trail (append-only)
    // - attachment_ai_descriptions : 1 row par (user, attachment, mode)
    // - sync_queue : ajout index composé [op+row_id] pour re-enqueue
    //   ciblée (réveiller un llm_route_and_dispatch quand un
    //   describe_media de la même VT vient d'aboutir).
    this.version(5).stores({
      sync_queue:
        "++id, [next_attempt_at+attempts], table, row_id, [table+row_id], op, [op+row_id]",
      llm_extractions:
        "id, visit_id, message_id, attachment_id, mode, sync_status, created_at",
      attachment_ai_descriptions:
        "id, attachment_id, visit_id, sync_status, created_at",
    });
  }
}

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

export function __resetDbForTests(): void {
  _db = null;
}
