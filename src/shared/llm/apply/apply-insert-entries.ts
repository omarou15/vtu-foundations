/**
 * apply-insert-entries : crée de nouvelles entrées dans une collection
 * connue (ex: `heating.installations`, `pathologies.items`).
 *
 * Doctrine It. 11.6 :
 *   - L'UUID est généré ici, JAMAIS par le LLM. Stable + non-collision.
 *   - Le squelette de l'entrée est posé via `buildEmptyCollectionEntry`
 *     qui lit les keys du Zod schema → ajout automatique d'un champ
 *     dans `json-state.sections.ts` propage ici sans effort.
 *   - Pour chaque key fournie par le LLM dans `fields`, on construit
 *     un Field<T> via `aiInferField` (source=ai_infer, validation_status
 *     =unvalidated, evidence_refs, etc.).
 *   - Keys inconnues du `item_fields` (= hors schema_map) → IGNORÉES
 *     pour cette key seule (warning logué dans `ignored_keys`), mais
 *     l'entrée elle-même est créée avec les keys valides.
 *   - Collection inconnue → entrée IGNORÉE complètement avec
 *     `unknown_collection`.
 *
 * Ne touche pas aux entrées existantes — pour modifier une entrée
 * existante, l'IA doit utiliser `set_field` avec syntaxe
 * `collection[id=…].field`.
 */

import { aiInferField } from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import {
  buildEmptyCollectionEntry,
  isReservedItemKey,
  type SchemaMap,
} from "@/shared/types/json-state.schema-map";
import type { AiInsertEntry } from "../types";

export interface ApplyInsertEntriesInput {
  state: VisitJsonState;
  schemaMap: SchemaMap;
  insertEntries: AiInsertEntry[];
  sourceMessageId: string | null;
  sourceExtractionId: string;
}

export interface ApplyInsertEntriesResult {
  state: VisitJsonState;
  applied: Array<{
    collection: string;
    entryId: string;
    /** Keys du LLM que l'on a effectivement matérialisées en Field<T>. */
    fields_set: string[];
    /** Keys du LLM qui n'étaient pas dans item_fields — ignorées (audit). */
    ignored_keys: string[];
  }>;
  ignored: Array<{
    collection: string;
    reason: ApplyInsertIgnoreReason;
  }>;
}

export type ApplyInsertIgnoreReason =
  | "unknown_collection"
  | "no_valid_fields"
  | "collection_not_array";

export function applyInsertEntries(
  input: ApplyInsertEntriesInput,
): ApplyInsertEntriesResult {
  const next = clone(input.state) as unknown as Record<string, unknown>;
  const applied: ApplyInsertEntriesResult["applied"] = [];
  const ignored: ApplyInsertEntriesResult["ignored"] = [];

  for (const op of input.insertEntries) {
    // 1. Vérifie que la collection est connue
    const collectionDef = input.schemaMap.collections[op.collection];
    if (!collectionDef) {
      ignored.push({ collection: op.collection, reason: "unknown_collection" });
      continue;
    }

    // 2. Filtre les keys fournies : doivent être ∈ item_fields et pas réservées
    const validKeys: string[] = [];
    const ignoredKeys: string[] = [];
    for (const key of Object.keys(op.fields)) {
      if (isReservedItemKey(key)) {
        ignoredKeys.push(key);
        continue;
      }
      if (!collectionDef.item_fields.includes(key)) {
        ignoredKeys.push(key);
        continue;
      }
      validKeys.push(key);
    }

    // 3. Au moins un field valide est requis pour créer une entrée
    if (validKeys.length === 0) {
      ignored.push({ collection: op.collection, reason: "no_valid_fields" });
      continue;
    }

    // 4. Build skeleton + override avec les valeurs du LLM
    const skeleton = buildEmptyCollectionEntry(op.collection);
    if (!skeleton) {
      // Ne devrait pas arriver — collectionDef vient du même registre.
      ignored.push({ collection: op.collection, reason: "unknown_collection" });
      continue;
    }
    const evidenceRefs = op.evidence_refs ?? [];
    for (const key of validKeys) {
      skeleton[key] = aiInferField({
        value: op.fields[key],
        confidence: op.confidence,
        sourceMessageId: input.sourceMessageId,
        sourceExtractionId: input.sourceExtractionId,
        evidenceRefs,
      });
    }

    // 5. Append à l'array de la collection
    const arr = readArrayAtPath(next, op.collection);
    if (!arr) {
      ignored.push({ collection: op.collection, reason: "collection_not_array" });
      continue;
    }
    arr.push(skeleton);

    applied.push({
      collection: op.collection,
      entryId: skeleton.id as string,
      fields_set: validKeys,
      ignored_keys: ignoredKeys,
    });
  }

  return {
    state: next as unknown as VisitJsonState,
    applied,
    ignored,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function readArrayAtPath(
  root: Record<string, unknown>,
  path: string,
): unknown[] | null {
  const segments = path.split(".");
  let cur: unknown = root;
  for (const seg of segments) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return Array.isArray(cur) ? (cur as unknown[]) : null;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
