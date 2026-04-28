/**
 * apply-insert-entries : crée de nouvelles entrées dans une collection.
 *
 * Refonte avril 2026 — couche PERMISSIVE :
 *   - L'UUID est généré ici, JAMAIS par le LLM.
 *   - Si la collection est connue du registre → squelette construit via
 *     `buildEmptyCollectionEntry` puis override avec les keys du LLM.
 *   - Si la collection est INCONNUE → on crée quand même un array à ce
 *     path et on pose une entrée minimale `{ id, custom_fields, …LLM keys
 *     converties en Field<T>… }`. Le user pourra refuser via la card.
 *   - Plus de filtre `item_fields` : toute key fournie devient un Field<T>
 *     (sauf keys réservées id/custom_fields/created_at/related_message_id).
 *   - `fields: {}` accepté : on crée juste l'entrée vide. Le user pourra
 *     la refuser.
 *
 * Sortie : `applied` liste les entrées créées (avec leurs keys posées).
 * `ignored` est désormais quasi-toujours vide — ne reste que `collection_not_array`
 * dans le cas où un conteneur intermédiaire serait d'un type incompatible.
 */

import { aiInferField } from "@/shared/types/json-state.field";
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
  }>;
  ignored: Array<{
    collection: string;
    reason: ApplyInsertIgnoreReason;
  }>;
}

export type ApplyInsertIgnoreReason = "collection_not_array";

export function applyInsertEntries(
  input: ApplyInsertEntriesInput,
): ApplyInsertEntriesResult {
  const next = clone(input.state) as unknown as Record<string, unknown>;
  const applied: ApplyInsertEntriesResult["applied"] = [];
  const ignored: ApplyInsertEntriesResult["ignored"] = [];

  for (const op of input.insertEntries) {
    // 1. Squelette : utilise le registre si connu, sinon entrée minimale.
    const skeleton =
      buildEmptyCollectionEntry(op.collection) ??
      ({
        id: uuidv4(),
        custom_fields: [],
      } as Record<string, unknown>);

    // 2. Pose les keys LLM en Field<T> (sauf réservées).
    const validKeys: string[] = [];
    const ignoredKeys: string[] = [];
    const evidenceRefs = op.evidence_refs ?? [];
    for (const key of Object.keys(op.fields ?? {})) {
      if (isReservedItemKey(key)) {
        ignoredKeys.push(key);
        continue;
      }
      skeleton[key] = aiInferField({
        value: op.fields[key],
        confidence: op.confidence,
        sourceMessageId: input.sourceMessageId,
        sourceExtractionId: input.sourceExtractionId,
        evidenceRefs,
      });
      validKeys.push(key);
    }

    // 3. Append à l'array (auto-vivify si absent / collection inconnue).
    const arr = ensureArrayAtPath(next, op.collection);
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

function ensureArrayAtPath(
  root: Record<string, unknown>,
  path: string,
): unknown[] | null {
  const segments = path.split(".");
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i]!;
    const next = cur[seg];
    if (next === undefined || next === null) {
      cur[seg] = {};
      cur = cur[seg] as Record<string, unknown>;
    } else if (typeof next === "object" && !Array.isArray(next)) {
      cur = next as Record<string, unknown>;
    } else {
      return null;
    }
  }
  const last = segments[segments.length - 1]!;
  const existing = cur[last];
  if (existing === undefined || existing === null) {
    const arr: unknown[] = [];
    cur[last] = arr;
    return arr;
  }
  if (Array.isArray(existing)) return existing;
  return null;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
