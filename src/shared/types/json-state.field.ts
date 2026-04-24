/**
 * VTU — Field<T> isolé pour casser les cycles d'import.
 *
 * Initialement défini dans json-state.ts (Phase 1). Extrait en module dédié
 * It. 7 pour permettre à `custom-field.ts` et `sections.ts` de l'importer
 * sans remonter à json-state.ts (qui dépend désormais d'eux).
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

export interface Field<T> {
  value: T | null;
  source: FieldSource;
  confidence: FieldConfidence | null;
  updated_at: string;
  source_message_id: string | null;
}

export const fieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    source: FieldSourceSchema,
    confidence: FieldConfidenceSchema.nullable(),
    updated_at: z.string(),
    source_message_id: z.string().uuid().nullable(),
  });

// Helpers de construction utilisés par les factories de sections.

export function emptyField<T>(): Field<T> {
  return {
    value: null,
    source: "init",
    confidence: null,
    updated_at: new Date().toISOString(),
    source_message_id: null,
  };
}

export function initField<T>(value: T): Field<T> {
  return {
    value,
    source: "init",
    confidence: "high",
    updated_at: new Date().toISOString(),
    source_message_id: null,
  };
}
