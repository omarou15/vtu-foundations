/**
 * Schema de sortie d'extract_from_message.
 *
 * - patches[] : modifications de Field<T> existants
 * - custom_fields[] : nouveaux champs (vocabulaire émergent)
 * - warnings[] : ambiguïtés non résolues
 *
 * Doctrine : on accepte enum-libres au schema niveau LLM. Le filtrage
 * réel (apply-patches gates) est fait par le code TS, pas par le schema.
 */
import { z } from "zod";

const ConfidenceSchema = z.enum(["low", "medium", "high"]);

export const AiFieldPatchSchema = z.object({
  path: z.string().min(1).max(120),
  value: z.unknown(),
  confidence: ConfidenceSchema,
  evidence_refs: z.array(z.string()).max(20).default([]),
});

export const AiCustomFieldSchema = z.object({
  section_path: z.string().min(1).max(80),
  field_key: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
  label_fr: z.string().min(1).max(120),
  value: z.unknown(),
  value_type: z.enum(["string", "number", "boolean", "enum", "multi_enum"]),
  unit: z.string().max(20).nullable(),
  confidence: ConfidenceSchema,
  evidence_refs: z.array(z.string()).max(20).default([]),
});

export const ExtractOutputSchema = z.object({
  patches: z.array(AiFieldPatchSchema).max(40).default([]),
  custom_fields: z.array(AiCustomFieldSchema).max(20).default([]),
  warnings: z.array(z.string().max(200)).max(20).default([]),
  confidence_overall: z.number().min(0).max(1),
});

export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;
