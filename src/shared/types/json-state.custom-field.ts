/**
 * VTU — CustomField (champ ad-hoc attaché à n'importe quelle section)
 *
 * Doctrine (KNOWLEDGE §13) :
 *  - Tout CustomField est ANCRÉ par un `registry_urn` URN stable à vie
 *    (`urn:vtu:schema:{canonical_section_path}.{field_key}:v1`).
 *  - L'URN est DÉTERMINISTE (calculé sans réseau) → garantit l'offline-first.
 *  - `registry_id` = UUID serveur. `null` si offline ou en attente de sync.
 *  - `offline_pending` = true tant que le mirror Dexie n'est pas synchronisé.
 *
 * IMPORTANT : `_buildCustomFieldSkeleton` est PRIVÉ (préfixe `_`).
 * Le SEUL point d'entrée public est `createCustomField` (json-state.factory.ts)
 * qui force le passage par `resolveOrCreateRegistryEntry`. C'est la garantie
 * structurelle anti-prolifération.
 */

import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  type Field,
  fieldSchema,
  type FieldConfidence,
  type FieldSource,
} from "./json-state.field";

// ---------------------------------------------------------------------------
// Value type — quel format peut prendre la valeur d'un CustomField
// ---------------------------------------------------------------------------

export const CustomFieldValueTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "enum",       // value: une string parmi enum_values
  "multi_enum", // value: tableau de strings parmi enum_values
]);
export type CustomFieldValueType = z.infer<typeof CustomFieldValueTypeSchema>;

// ---------------------------------------------------------------------------
// CustomField — valeur ad-hoc avec ancrage registry
// ---------------------------------------------------------------------------

const customFieldValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const CustomFieldSchema = z.object({
  id: z.string().uuid(),
  key: fieldSchema(z.string().min(1)),
  label: fieldSchema(z.string().min(1)),
  value: fieldSchema(customFieldValue),
  value_type: fieldSchema(CustomFieldValueTypeSchema),
  enum_values: fieldSchema(z.array(z.string())),
  unit: fieldSchema(z.string()),
  ai_suggested: fieldSchema(z.boolean()),
  promoted_to_structural: fieldSchema(z.boolean()),
  /** URN stable à vie. TOUJOURS présent (déterministe, calculable offline). */
  registry_urn: z.string(),
  /** UUID serveur. `null` si offline ou en attente de réconciliation. */
  registry_id: z.string().uuid().nullable(),
  /** `true` tant que la sync mirror Dexie → Supabase n'est pas terminée. */
  offline_pending: z.boolean().default(false),
  created_at: z.string(),
  created_by_message_id: z.string().uuid().nullable(),
});
export type CustomField = z.infer<typeof CustomFieldSchema>;

// ---------------------------------------------------------------------------
// Builder PRIVÉ — NE PAS appeler en dehors de `createCustomField`
// ---------------------------------------------------------------------------

interface BuildSkeletonInput {
  fieldKey: string;
  labelFr: string;
  value: unknown;
  valueType: CustomFieldValueType;
  source: FieldSource;
  confidence: FieldConfidence;
  aiSuggested: boolean;
  registry_urn: string;
  registry_id: string | null;
  offline_pending: boolean;
  createdByMessageId?: string | null;
  unit?: string | null;
  enumValues?: string[];
}

function makeField<T>(
  value: T | null,
  source: FieldSource,
  confidence: FieldConfidence | null,
  sourceMessageId: string | null = null,
): Field<T> {
  return {
    value,
    source,
    confidence,
    updated_at: new Date().toISOString(),
    source_message_id: sourceMessageId,
  };
}

/**
 * Builder bas niveau. PRIVÉ — usage uniquement par `createCustomField`
 * (json-state.factory.ts) qui garantit que le registry a été résolu d'abord.
 */
export function _buildCustomFieldSkeleton(
  input: BuildSkeletonInput,
): CustomField {
  const now = new Date().toISOString();
  const messageId = input.createdByMessageId ?? null;
  // value est un union (string|number|boolean|string[]) — on accepte tel quel
  // sans cast : Zod validera lors du parse.
  return {
    id: uuidv4(),
    key: makeField(input.fieldKey, input.source, input.confidence, messageId),
    label: makeField(input.labelFr, input.source, input.confidence, messageId),
    value: makeField(
      input.value as string | number | boolean | string[] | null,
      input.source,
      input.confidence,
      messageId,
    ),
    value_type: makeField(input.valueType, "init", "high", messageId),
    enum_values: makeField(input.enumValues ?? null, "init", "high", messageId),
    unit: makeField(input.unit ?? null, "init", "high", messageId),
    ai_suggested: makeField(input.aiSuggested, "init", "high", messageId),
    promoted_to_structural: makeField(false, "init", "high", messageId),
    registry_urn: input.registry_urn,
    registry_id: input.registry_id,
    offline_pending: input.offline_pending,
    created_at: now,
    created_by_message_id: messageId,
  };
}
