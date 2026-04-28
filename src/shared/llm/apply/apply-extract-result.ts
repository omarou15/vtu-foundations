/**
 * apply-extract-result : orchestrateur des 3 verbes d'une réponse
 * `extract_from_message`.
 *
 * Doctrine It. 11.6 — l'apply layer est strict :
 *   1. `patches[]`        → applyPatches (set_field sur object/entry connu)
 *   2. `insert_entries[]` → applyInsertEntries (création UUID dans collection connue)
 *   3. `custom_fields[]`  → applyCustomFields (vocabulaire émergent → registry)
 *
 * Aucune auto-vivify. Aucun fail silencieux. Toute opération qui ne
 * passe pas un gate produit une ligne dans `ignored` avec une raison
 * explicite, surfacée dans la PendingActionsCard.
 *
 * Ordre d'exécution : patches → insert_entries → custom_fields.
 * Les opérations sont indépendantes (pas de dépendance entre verbes
 * dans le même call), l'ordre est juste une convention pour la lecture
 * de logs.
 */

import type { VisitJsonState } from "@/shared/types";
import type { SchemaMap } from "@/shared/types/json-state.schema-map";
import type {
  AiCustomField,
  AiFieldPatch,
  AiInsertEntry,
} from "../types";
import {
  applyCustomFields,
  type ApplyCustomFieldsResult,
} from "./apply-custom-fields";
import {
  applyInsertEntries,
  type ApplyInsertEntriesResult,
} from "./apply-insert-entries";
import { applyPatches, type ApplyPatchesResult } from "./apply-patches";

export interface ApplyExtractResultInput {
  state: VisitJsonState;
  schemaMap: SchemaMap;
  patches: AiFieldPatch[];
  insertEntries: AiInsertEntry[];
  customFields: AiCustomField[];
  sourceMessageId: string | null;
  sourceExtractionId: string;
}

export interface ApplyExtractResultOutput {
  state: VisitJsonState;
  patches: ApplyPatchesResult;
  insertEntries: ApplyInsertEntriesResult;
  customFields: ApplyCustomFieldsResult;
  /** Compteur synthétique pour décider d'un appendJsonStateVersion. */
  totalApplied: number;
}

export function applyExtractResult(
  input: ApplyExtractResultInput,
): ApplyExtractResultOutput {
  const patches = applyPatches({
    state: input.state,
    schemaMap: input.schemaMap,
    patches: input.patches,
    sourceMessageId: input.sourceMessageId,
    sourceExtractionId: input.sourceExtractionId,
  });

  const insertEntries = applyInsertEntries({
    state: patches.state,
    schemaMap: input.schemaMap,
    insertEntries: input.insertEntries,
    sourceMessageId: input.sourceMessageId,
    sourceExtractionId: input.sourceExtractionId,
  });

  const customFields = applyCustomFields({
    state: insertEntries.state,
    customFields: input.customFields,
    sourceMessageId: input.sourceMessageId,
    sourceExtractionId: input.sourceExtractionId,
  });

  const totalApplied =
    patches.applied.length +
    insertEntries.applied.length +
    customFields.applied.length;

  return {
    state: customFields.state,
    patches,
    insertEntries,
    customFields,
    totalApplied,
  };
}
