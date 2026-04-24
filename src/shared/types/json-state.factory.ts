/**
 * VTU — Factory PUBLIQUE pour CustomField (Phase 2 It. 7)
 *
 * SEUL point d'entrée pour créer un CustomField. Garantit que le passage
 * par `resolveOrCreateRegistryEntry` est obligatoire — discipline enforced
 * by design.
 *
 * Si on veut créer un CustomField, on appelle `createCustomField`. Point.
 * Le builder bas-niveau `_buildCustomFieldSkeleton` reste privé et ne doit
 * JAMAIS être appelé en dehors de ce module.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  resolveOrCreateRegistryEntry,
  type SchemaRegistrySupabaseLike,
} from "@/shared/db/schema-registry.repo";
import {
  _buildCustomFieldSkeleton,
  type CustomField,
  type CustomFieldValueType,
} from "./json-state.custom-field";
import type { FieldConfidence, FieldSource } from "./json-state.field";

export interface CreateCustomFieldParams {
  sectionPath: string;
  fieldKey: string;
  labelFr: string;
  valueType: CustomFieldValueType;
  value: unknown;
  source: FieldSource;
  confidence: FieldConfidence;
  aiSuggested: boolean;
  /** ID utilisateur courant (requis pour le registry RLS-scoped). */
  userId: string;
  unit?: string | null;
  enumValues?: string[];
  createdByMessageId?: string | null;
}

/**
 * Crée un `CustomField` ancré sur une entrée `schema_registry`.
 *
 * Comportement :
 *  - Online : résolution serveur (match exact, fuzzy, INSERT idempotent).
 *  - Offline : URN déterministe + enqueue dans sync_queue, retourne
 *    `registry_id: null` + `offline_pending: true`.
 *
 * Le caller utilise `result.registry_urn` pour la traçabilité immédiate.
 * `result.registry_id` (UUID serveur) sera renseigné après réconciliation.
 */
export async function createCustomField(
  params: CreateCustomFieldParams,
): Promise<CustomField> {
  const { registry_urn, registry_id, offline_pending } =
    await resolveOrCreateRegistryEntry(
      supabase as unknown as SchemaRegistrySupabaseLike,
      {
        sectionPath: params.sectionPath,
        fieldKey: params.fieldKey,
        labelFr: params.labelFr,
        valueType: params.valueType,
        unit: params.unit ?? null,
        aiSuggested: params.aiSuggested,
        userId: params.userId,
      },
    );

  return _buildCustomFieldSkeleton({
    fieldKey: params.fieldKey,
    labelFr: params.labelFr,
    value: params.value,
    valueType: params.valueType,
    source: params.source,
    confidence: params.confidence,
    aiSuggested: params.aiSuggested,
    registry_urn,
    registry_id,
    offline_pending,
    createdByMessageId: params.createdByMessageId ?? null,
    unit: params.unit ?? null,
    enumValues: params.enumValues,
  });
}
