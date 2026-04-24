/**
 * VTU — Types DB partagés (Supabase ↔ Dexie miroir)
 *
 * Ces types décrivent la forme des entités telles qu'elles existent
 * côté Supabase. Côté Dexie, on étend chaque entité avec des champs
 * locaux de synchronisation (`SyncFields`). Voir `shared/db/schema.ts`.
 */

export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface SyncFields {
  /** État de synchronisation côté local. */
  sync_status: SyncStatus;
  /** Nombre de tentatives de sync (pour backoff). */
  sync_attempts: number;
  /** Dernier message d'erreur de sync, ou null si pas d'erreur. */
  sync_last_error: string | null;
  /** Timestamp de dernière mutation locale (ISO). */
  local_updated_at: string;
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export type VisitStatus = "draft" | "in_progress" | "done" | "archived";

export type MissionType = "audit_energetique" | "dpe" | "conseil" | "autre";

export type BuildingType =
  | "maison_individuelle"
  | "appartement"
  | "immeuble"
  | "tertiaire"
  | "autre";

export interface VisitRow {
  id: string;
  user_id: string;
  client_id: string;
  title: string;
  status: VisitStatus;
  /** Optimistic concurrency : chaque write envoie sa version. */
  version: number;
  /** Itération 4 — métadonnées renseignées à la création (modal). */
  address: string | null;
  mission_type: MissionType | null;
  building_type: BuildingType | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Messages (append-only)
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "assistant" | "system";
export type MessageKind = "text" | "audio" | "photo" | "system_event";

export interface MessageRow {
  id: string;
  user_id: string;
  visit_id: string;
  client_id: string;
  role: MessageRole;
  kind: MessageKind;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type AttachmentBucket = "visit-audio" | "visit-photos";

export interface AttachmentRow {
  id: string;
  message_id: string;
  user_id: string;
  visit_id: string;
  bucket: AttachmentBucket;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// visit_json_state (versionné)
// ---------------------------------------------------------------------------

import type { VisitJsonState } from "./json-state";

export interface VisitJsonStateRow {
  id: string;
  visit_id: string;
  user_id: string;
  version: number;
  state: VisitJsonState;
  created_by_message_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sync queue (outbox)
// ---------------------------------------------------------------------------

export type SyncQueueOp = "insert" | "update";
export type SyncQueueTable =
  | "visits"
  | "messages"
  | "attachments"
  | "visit_json_state"
  | "schema_registry"; // Phase 2 It. 7

export interface SyncQueueEntry {
  /** Auto-incrément Dexie. */
  id?: number;
  table: SyncQueueTable;
  op: SyncQueueOp;
  /** Clé primaire de la ligne concernée (UUID). */
  row_id: string;
  /** Payload sérialisé à envoyer. */
  payload: Record<string, unknown>;
  attempts: number;
  last_error: string | null;
  created_at: string;
  next_attempt_at: string;
}

// ---------------------------------------------------------------------------
// Schema Registry (Phase 2 It. 7)
// ---------------------------------------------------------------------------

export type SchemaRegistryStatus =
  | "candidate"
  | "active"
  | "deprecated"
  | "promoted";

export type SchemaRegistryValueType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "multi_enum";

export interface SchemaRegistryEntry {
  id: string;
  user_id: string;
  organization_id: string | null;
  registry_urn: string;
  field_key: string;
  section_path: string; // TOUJOURS canonisé (collections : ecs[] pas ecs[0])
  label_fr: string;
  value_type: SchemaRegistryValueType;
  unit: string | null;
  enum_values: string[];
  synonyms: string[];
  usage_count: number;
  first_seen_at: string;
  promoted_at: string | null;
  ai_suggested: boolean;
  description: string | null;
  parent_concept: string | null;
  semantic_embedding: unknown | null;
  status: SchemaRegistryStatus;
  created_at: string;
  updated_at: string;
}
