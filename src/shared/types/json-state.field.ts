/**
 * VTU — Field<T> isolé pour casser les cycles d'import.
 *
 * It. 10 — Extension validation_status :
 *  - Tout patch IA crée un Field<T> avec source="ai_infer" et
 *    validation_status="unvalidated".
 *  - L'utilisateur peut ensuite valider/rejeter (UI It. 11).
 *  - Une valeur saisie par humain ou import (source != ai_infer) est
 *    considérée "validated" (back-fill rétro-actif via migration).
 *  - Garde-fou apply-patches : un Field validated n'est JAMAIS overwrité
 *    par l'IA. Un Field user/voice/photo_ocr/import avec value non-null
 *    n'est JAMAIS overwrité par l'IA (humain prime, toutes modalités).
 *
 * Les nouveaux champs sont rendus optionnels (Zod `.default(...)`) pour
 * rester rétrocompatibles avec les states v2 non encore migrés. La
 * migration `migrateVisitJsonState` back-fille les valeurs cohérentes.
 */

import { z } from "zod";

export const FieldSourceSchema = z.enum([
  "init",
  "user",
  "voice",
  "photo_ocr",
  "ai_infer",
  "import",
]);
export type FieldSource = z.infer<typeof FieldSourceSchema>;

export const FieldConfidenceSchema = z.enum(["low", "medium", "high"]);
export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;

export const ValidationStatusSchema = z.enum([
  "unvalidated",
  "validated",
  "rejected",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

export interface Field<T> {
  value: T | null;
  source: FieldSource;
  confidence: FieldConfidence | null;
  updated_at: string;
  source_message_id: string | null;
  // --- It. 10 ---
  validation_status: ValidationStatus;
  validated_at: string | null;
  validated_by: string | null;
  source_extraction_id: string | null;
  evidence_refs: string[];
}

export const fieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    source: FieldSourceSchema,
    confidence: FieldConfidenceSchema.nullable(),
    updated_at: z.string(),
    source_message_id: z.string().uuid().nullable(),
    validation_status: ValidationStatusSchema.default("unvalidated"),
    validated_at: z.string().nullable().default(null),
    validated_by: z.string().nullable().default(null),
    source_extraction_id: z.string().nullable().default(null),
    evidence_refs: z.array(z.string()).default([]),
  });

// ---------------------------------------------------------------------------
// Helpers de construction utilisés par les factories de sections.
// ---------------------------------------------------------------------------

/**
 * Field vide (value null, source="init"). validation_status="unvalidated"
 * mais sans valeur la notion ne s'applique pas — par défaut Zod cohérent.
 */
export function emptyField<T>(): Field<T> {
  return {
    value: null,
    source: "init",
    confidence: null,
    updated_at: new Date().toISOString(),
    source_message_id: null,
    validation_status: "unvalidated",
    validated_at: null,
    validated_by: null,
    source_extraction_id: null,
    evidence_refs: [],
  };
}

/**
 * Field initialisé par le système (création de VT, valeurs connues).
 * Considéré "validated" puisque posé par le système avec confiance haute.
 */
export function initField<T>(value: T): Field<T> {
  const now = new Date().toISOString();
  return {
    value,
    source: "init",
    confidence: "high",
    updated_at: now,
    source_message_id: null,
    validation_status: "validated",
    validated_at: now,
    validated_by: null,
    source_extraction_id: null,
    evidence_refs: [],
  };
}

/**
 * Helper interne — construit un Field<T> issu d'un patch IA.
 * Réservé à `shared/llm/apply/apply-patches.ts`. Force source="ai_infer"
 * et validation_status="unvalidated". Les `evidence_refs` doivent inclure
 * le message porteur (et les attachments associés si applicable).
 */
export function aiInferField<T>(args: {
  value: T;
  confidence: FieldConfidence;
  sourceMessageId: string | null;
  sourceExtractionId: string;
  evidenceRefs: string[];
}): Field<T> {
  return {
    value: args.value,
    source: "ai_infer",
    confidence: args.confidence,
    updated_at: new Date().toISOString(),
    source_message_id: args.sourceMessageId,
    validation_status: "unvalidated",
    validated_at: null,
    validated_by: null,
    source_extraction_id: args.sourceExtractionId,
    evidence_refs: args.evidenceRefs,
  };
}

/**
 * Helper rétro-actif : back-fille un Field<T> qui n'a pas encore les
 * champs It. 10. Source != "ai_infer" → status = "validated", validated_at
 * recopié depuis updated_at. Source == "ai_infer" → status = "unvalidated".
 * Idempotent : si déjà rempli, no-op.
 *
 * Utilisé par `migrateVisitJsonState` (deep walk) et par les tests.
 */
export function backfillFieldIfMissing(f: Record<string, unknown>): void {
  if ("validation_status" in f) return;
  const source = typeof f.source === "string" ? f.source : "init";
  const updatedAt = typeof f.updated_at === "string" ? f.updated_at : null;
  f.validation_status = source === "ai_infer" ? "unvalidated" : "validated";
  f.validated_at = source === "ai_infer" ? null : updatedAt;
  f.validated_by = null;
  f.source_extraction_id = null;
  f.evidence_refs = [];
}
