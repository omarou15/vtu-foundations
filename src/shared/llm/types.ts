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
  /** Nomenclature pertinente (paths déterminés via mission_type). */
  nomenclature_hints: Record<string, unknown>;
}

/** Patch IA visant un Field<T> ciblé du JSON state. */
export interface AiFieldPatch {
  /** Path dot-notation, ex: "heating.fuel_type". */
  path: string;
  value: unknown;
  confidence: "low" | "medium" | "high";
  /** IDs message + attachments servant de preuve. */
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

/** Sortie du mode "extract_from_message". */
export interface ExtractResult {
  patches: AiFieldPatch[];
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
