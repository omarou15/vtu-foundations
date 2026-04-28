/**
 * apply-insert-entries : crée de nouvelles entrées dans une collection.
 *
 * Refonte avril 2026 — couche PERMISSIVE :
 *   - L'UUID est généré ici, JAMAIS par le LLM.
 *   - Si la collection est connue du registre → squelette construit via
 *     `buildEmptyCollectionEntry` puis override avec les keys du LLM.
 *   - Si la collection est INCONNUE → on crée quand même un array à ce
 *     path et on pose une entrée minimale.
 *   - `fields: {}` accepté : entrée créée vide marquée `is_empty`.
 *
 * Lot A.5 — fix 2 + fix 3 :
 *   - Dedup intra-call : si une entrée a déjà été créée DANS CE CALL sur
 *     la même collection avec au moins une key+value en commun, on merge
 *     les nouveaux fields dedans au lieu de créer une 2e entrée.
 *   - `is_empty: true` quand `validKeys.length === 0` (entrée fantôme).
 *
 * Lot A.5 durcissement — zéro rejet : la collection cible est toujours
 * forcée en array, même si le path traverse un primitif. `ignored` reste
 * dans le contrat pour compatibilité, mais il est toujours vide.
 */

import { aiInferField, type Field } from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import { v4 as uuidv4 } from "uuid";
import {
  buildEmptyCollectionEntry,
  isReservedItemKey,
  type SchemaMap,
} from "@/shared/types/json-state.schema-map";
import type { AiInsertEntry } from "../types";

export interface ApplyInsertEntriesInput {
  state: VisitJsonState;
  /** Conservé pour signature stable (plus utilisé pour rejeter). */
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
    fields_set: string[];
    /** Keys ignorées car réservées (id, custom_fields, etc.). */
    ignored_keys: string[];
    /** Lot A.5 fix 2 — entrée mergée dans une entrée existante du même call. */
    merged_into_existing?: boolean;
    /** Lot A.5 fix 3 — entrée créée sans aucun field valide. */
    is_empty?: boolean;
  }>;
  /** Compat debug historique : toujours vide en doctrine permissive totale. */
  ignored: [];
}

export function applyInsertEntries(
  input: ApplyInsertEntriesInput,
): ApplyInsertEntriesResult {
  const next = clone(input.state) as unknown as Record<string, unknown>;
  const applied: ApplyInsertEntriesResult["applied"] = [];

  for (const op of input.insertEntries) {
    // 1. Force l'array cible (auto-vivify/overwrite si absent ou incompatible).
    const arr = forceArrayAtPath(next, op.collection);

    const opFields = op.fields ?? {};
    const evidenceRefs = op.evidence_refs ?? [];

    // 2. Lot A.5 fix 2 — Dedup intra-call : chercher une entrée déjà créée
    //    dans CE call sur la même collection avec au moins une key+value
    //    primitive identique.
    const existingThisCall = applied
      .filter((a) => a.collection === op.collection)
      .map((a) =>
        arr.find(
          (e): e is Record<string, unknown> =>
            !!e &&
            typeof e === "object" &&
            (e as Record<string, unknown>).id === a.entryId,
        ),
      )
      .filter((e): e is Record<string, unknown> => !!e);

    const mergeTarget = existingThisCall.find((entry) => {
      for (const [k, v] of Object.entries(opFields)) {
        if (isReservedItemKey(k)) continue;
        const cur = entry[k];
        if (isFieldShape(cur) && cur.value === v) return true;
      }
      return false;
    });

    if (mergeTarget) {
      const mergedKeys: string[] = [];
      const mergedIgnored: string[] = [];
      for (const [k, v] of Object.entries(opFields)) {
        if (isReservedItemKey(k)) {
          mergedIgnored.push(k);
          continue;
        }
        // Ne pas écraser un Field<T> déjà rempli (source != init OU value != null).
        const cur = mergeTarget[k];
        if (isFieldShape(cur) && !isEmptyInitField(cur)) continue;
        mergeTarget[k] = aiInferField({
          value: v,
          confidence: op.confidence,
          sourceMessageId: input.sourceMessageId,
          sourceExtractionId: input.sourceExtractionId,
          evidenceRefs,
        });
        mergedKeys.push(k);
      }
      applied.push({
        collection: op.collection,
        entryId: mergeTarget.id as string,
        fields_set: mergedKeys,
        ignored_keys: mergedIgnored,
        merged_into_existing: true,
      });
      continue;
    }

    // 3. Pas de merge → créer une nouvelle entrée.
    const skeleton =
      buildEmptyCollectionEntry(op.collection) ??
      ({
        id: uuidv4(),
        custom_fields: [],
      } as Record<string, unknown>);

    const validKeys: string[] = [];
    const ignoredKeys: string[] = [];
    for (const key of Object.keys(opFields)) {
      if (isReservedItemKey(key)) {
        ignoredKeys.push(key);
        continue;
      }
      skeleton[key] = aiInferField({
        value: opFields[key],
        confidence: op.confidence,
        sourceMessageId: input.sourceMessageId,
        sourceExtractionId: input.sourceExtractionId,
        evidenceRefs,
      });
      validKeys.push(key);
    }

    arr.push(skeleton);

    applied.push({
      collection: op.collection,
      entryId: skeleton.id as string,
      fields_set: validKeys,
      ignored_keys: ignoredKeys,
      ...(validKeys.length === 0 ? { is_empty: true } : {}),
    });
  }

  return {
    state: next as unknown as VisitJsonState,
    applied,
    ignored: [],
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isFieldShape(node: unknown): node is Field<unknown> {
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  return "value" in o && "source" in o && "validation_status" in o;
}

function isEmptyInitField(f: Field<unknown>): boolean {
  return f.source === "init" && (f.value === null || f.value === undefined);
}

function forceArrayAtPath(
  root: Record<string, unknown>,
  path: string,
): unknown[] {
  const segments = path.split(".").filter((s) => s.length > 0);
  if (segments.length === 0) return [];
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i]!;
    const next = cur[seg];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[seg] = {};
      cur = cur[seg] as Record<string, unknown>;
    } else {
      cur = next as Record<string, unknown>;
    }
  }
  const last = segments[segments.length - 1]!;
  const existing = cur[last];
  if (!Array.isArray(existing)) {
    const arr: unknown[] = [];
    cur[last] = arr;
    return arr;
  }
  return existing;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
