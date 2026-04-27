/**
 * VTU — Types DB partagés (Supabase ↔ Dexie miroir)
 *
 * Ces types décrivent la forme des entités telles qu'elles existent
 * côté Supabase. Côté Dexie, on étend chaque entité avec des champs
 * locaux de synchronisation (`SyncFields`). Voir `shared/db/schema.ts`.
 */

/**
 * Statuts de synchronisation locaux.
 *
 * - "draft"   : (It. 9) row créée mais pas encore enqueue dans sync_queue
 *               (cas attachment en attente d'être rattaché à un message).
 * - "pending" : enqueue, attend traitement par l'engine.
 * - "syncing" : en cours de traitement.
 * - "synced"  : confirmé côté serveur.
 * - "failed"  : abandonnée après MAX_ATTEMPTS.
 */
export type SyncStatus =
  | "draft"
  | "pending"
  | "syncing"
  | "synced"
  | "failed";

export interface SyncFields {
  sync_status: SyncStatus;
  sync_attempts: number;
  sync_last_error: string | null;
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
  version: number;
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
export type MessageKind =
  | "text"
  | "audio"
  | "photo"
  | "document"
  | "system_event"
  | "actions_card";

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

export type AttachmentBucket = "visit-audio" | "visit-photos" | "attachments";

export type MediaProfile = "photo" | "plan" | "pdf";

export interface AttachmentRow {
  id: string;
  message_id: string | null;
  user_id: string;
  visit_id: string;
  bucket: AttachmentBucket;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  compressed_path: string | null;
  thumbnail_path: string | null;
  width_px: number | null;
  height_px: number | null;
  sha256: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  format: string | null;
  media_profile: MediaProfile | null;
  linked_sections: string[];
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
  /** It. 10 — lien optionnel vers la ligne llm_extractions à l'origine. */
  source_extraction_id?: string | null;
}

// ---------------------------------------------------------------------------
// Sync queue (outbox)
// ---------------------------------------------------------------------------

/**
 * Opérations supportées par l'engine.
 *  - "insert" / "update" : ligne SQL standard.
 *  - "attachment_upload" (It. 9) : pipeline en 3 étapes — upload Storage
 *    compressé + thumbnail puis INSERT attachments. Différé tant que le
 *    message porteur n'est pas synced côté serveur (RLS).
 *  - "describe_media" (It. 10) : appel LLM décrit visuel (multimodal).
 *    Différé tant que l'attachment n'est pas synced (URL signée requise).
 *  - "llm_route_and_dispatch" (It. 10) : router hybride sur un message
 *    user. Branche sur extract_from_message OU conversational_query.
 *    Attend que les médias liés soient describe_media-d.
 */
export type SyncQueueOp =
  | "insert"
  | "update"
  | "attachment_upload"
  | "describe_media"
  | "llm_route_and_dispatch";

export type SyncQueueTable =
  | "visits"
  | "messages"
  | "attachments"
  | "visit_json_state"
  | "schema_registry"
  | "llm_extractions"
  | "attachment_ai_descriptions";

export interface SyncQueueEntry {
  id?: number;
  table: SyncQueueTable;
  op: SyncQueueOp;
  row_id: string;
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
  section_path: string;
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

// ---------------------------------------------------------------------------
// LLM extractions (It. 10) — audit trail append-only
// ---------------------------------------------------------------------------

export type LlmMode =
  | "router"
  | "describe_media"
  | "extract_from_message"
  | "conversational_query";

export type LlmExtractionStatus =
  | "success"
  | "partial"
  | "failed"
  | "rate_limited"
  | "malformed";

export interface LlmExtractionRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  visit_id: string;
  message_id: string | null;
  attachment_id: string | null;
  mode: LlmMode;
  provider: string;
  model_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  confidence_overall: number | null;
  context_bundle: Record<string, unknown>;
  raw_request_summary: Record<string, unknown>;
  stable_prompt_hash: string | null;
  provider_request_id: string | null;
  raw_response: Record<string, unknown>;
  patches_count: number;
  custom_fields_count: number;
  status: LlmExtractionStatus;
  warnings: string[];
  error_message: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Attachment AI descriptions (It. 10) — append-only, 1 row par (user, attachment, mode)
// ---------------------------------------------------------------------------

export interface AttachmentAiDescriptionRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  visit_id: string;
  attachment_id: string;
  mode: "describe_media";
  provider: string;
  model_version: string;
  description: AttachmentAiDescriptionPayload;
  confidence_overall: number | null;
  created_at: string;
}

/**
 * Payload `description` d'une attachment_ai_description.
 * Schema 2 niveaux : court (caption) + détaillé (≤180 mots).
 * `skipped: true` pour les PDFs (pas envoyés à Gemini Phase 2).
 */
export interface AttachmentAiDescriptionPayload {
  skipped?: boolean;
  reason?: string;
  short_caption: string;
  detailed_description: string | null;
  structured_observations: Array<{
    section_hint: string;
    observation: string;
  }>;
  ocr_text: string | null;
}
