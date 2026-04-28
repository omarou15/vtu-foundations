/**
 * VTU — Types LLM (It. 10)
 *
 * Types partagés entre router, providers, prompts, apply.
 */

import type { LlmMode } from "@/shared/types";

export type { LlmMode };

/**
 * ContextBundle — payload sérialisable injecté dans tous les prompts.
 * Sérialisation déterministe (clés triées) → permet caching prompt
 * Gemini (cf. KNOWLEDGE §15) et hash stable pour audit trail.
 */
export interface ContextBundle {
  /** schema_version IS injecté tel quel (informatif, pas exécutable). */
  schema_version: number;
  visit: {
    id: string;
    mission_type: string | null;
    building_type: string | null;
  };
  /** Snapshot des sections clés (filtré, 5-passes compressables). */
  state_summary: Record<string, unknown>;
  /** Historique récent (textes courts, ordre chronologique). */
  recent_messages: Array<{
    role: "user" | "assistant" | "system";
    kind: string;
    content: string | null;
    created_at: string;
  }>;
  /** Descriptions IA déjà calculées pour les attachments cités. */
  attachments_context: Array<{
    id: string;
    media_profile: string | null;
    short_caption: string | null;
    detailed_description: string | null;
    ocr_text: string | null;
  }>;
  /**
   * It. 14.1 — Attachments mentionnés (recent_messages ou message courant)
   * dont l'analyse visuelle n'a PAS encore produit de description.
   * Le LLM doit explicitement refuser d'inventer leur contenu.
   */
  pending_attachments: Array<{
    id: string;
    media_profile: string | null;
    reason: "no_description_yet" | "ai_disabled_when_sent";
  }>;
  /**
   * It. 11.6 — Schema map du JSON state. Le LLM s'appuie dessus pour
   * choisir entre :
   *   - `set_field` (path ∈ object_fields OU collection.[id=…].field)
   *   - `insert_entry` (collection ∈ schema_map.collections)
   *   - `custom_field` (le reste)
   * Format compact : entries listées avec id court + summary, pas le state
   * complet. Le state_summary porte la donnée brute en parallèle.
   */
  schema_map: {
    object_fields: string[];
    collections: Record<
      string,
      {
        item_fields: string[];
        entries_count: number;
        entries_summary: string[];
      }
    >;
  };
  /** Nomenclature pertinente (paths déterminés via mission_type). */
  nomenclature_hints: Record<string, unknown>;
}

/**
 * Patch IA `set_field` — modifie un Field<T> existant.
 *
 * Path syntaxe acceptée :
 *   - `building.wall_material_value` (object field plat)
 *   - `envelope.murs.material_value` (sous-objet)
 *   - `heating.installations[id=abc-123].type_value` (entrée collection par UUID)
 *
 * REJETÉ par l'apply layer (plus jamais accepté) :
 *   - `heating.installations[0].type_value` (index positionnel) →
 *     forcer le LLM à utiliser `insert_entry` ou `[id=…]`.
 */
export interface AiFieldPatch {
  path: string;
  value: unknown;
  confidence: "low" | "medium" | "high";
  /** IDs message + attachments servant de preuve. */
  evidence_refs: string[];
}

/**
 * Patch IA `insert_entry` — ajoute une nouvelle entrée à une collection.
 *
 * UUID généré par l'apply layer (jamais par le LLM). Tous les `fields`
 * fournis sont posés en source="ai_infer", validation_status="unvalidated".
 * Les champs absents restent `emptyField()`.
 */
export interface AiInsertEntry {
  /** Path absolu vers la collection, ex: "heating.installations". */
  collection: string;
  /**
   * Valeurs initiales pour les champs de l'item, ex: { type_value: "PAC", power_kw: 8 }.
   * Les keys doivent être ∈ schema_map.collections[collection].item_fields.
   */
  fields: Record<string, unknown>;
  confidence: "low" | "medium" | "high";
  evidence_refs: string[];
}

/** Custom field ajouté par l'IA (vocabulaire émergent). */
export interface AiCustomField {
  section_path: string;
  field_key: string;
  label_fr: string;
  value: unknown;
  value_type: "string" | "number" | "boolean" | "enum" | "multi_enum";
  unit: string | null;
  confidence: "low" | "medium" | "high";
  evidence_refs: string[];
}

/** Sortie du mode "extract_from_message" — 3 verbes distincts. */
export interface ExtractResult {
  patches: AiFieldPatch[];
  insert_entries: AiInsertEntry[];
  custom_fields: AiCustomField[];
  warnings: string[];
  confidence_overall: number;
}

/** Sortie du mode "describe_media". */
export interface DescribeMediaResult {
  short_caption: string;
  detailed_description: string | null;
  structured_observations: Array<{
    section_hint: string;
    observation: string;
  }>;
  ocr_text: string | null;
  confidence_overall: number;
  warnings: string[];
}

/** Sortie du mode "router". */
export type RouterDecision =
  | { route: "ignore"; reason: string }
  | { route: "extract"; reason: string }
  | { route: "conversational"; reason: string };

/** Sortie du mode "conversational_query" (réponse libre + sources). */
export interface ConversationalResult {
  answer_markdown: string;
  evidence_refs: string[];
  confidence_overall: number;
  warnings: string[];
}

/** Métadonnées brutes provider (tokens, cost, latence). */
export interface ProviderMeta {
  provider: string;
  model_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number;
  provider_request_id: string | null;
}

/** Erreurs typées remontées par le provider. */
export type LlmErrorCode =
  | "rate_limited"
  | "payment_required"
  | "malformed_response"
  | "context_too_large"
  | "network"
  | "unknown";

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
