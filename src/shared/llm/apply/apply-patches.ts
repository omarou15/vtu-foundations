/**
 * apply-patches : applique les patches IA `set_field` sur un VisitJsonState.
 *
 * It. 11.6 — strict :
 *   - Path doit être ∈ schemaMap.object_fields, OU avoir la forme
 *     `collection[id=…].field` avec collection ∈ schemaMap.collections
 *     et l'entrée `id` présente dans `current_entries`.
 *   - Index positionnel `[N]` REJETÉ (`positional_index_forbidden`).
 *   - Plus jamais d'auto-vivify silencieuse — le LLM utilise `insert_entry`
 *     pour créer ou `[id=…]` pour modifier.
 *
 * Gates conservés (corrections 1-7 + A v2.2) :
 *   - validation_status === "validated" → IGNORÉ (humain prime).
 *   - source ∈ {user, voice, photo_ocr, import} ET value !== null → IGNORÉ.
 *   - source === "ai_infer" + unvalidated : gate confidence — un patch
 *     avec confidence ≤ confidence courante (-0.1 marge) est IGNORÉ.
 *
 * Sortie : nouveau state + applied[] + ignored[] avec raisons explicites.
 */

import {
  aiInferField,
  type Field,
  type FieldConfidence,
} from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import {
  isKnownObjectFieldPath,
  isPositionalIndexPath,
  parseEntryPath,
  type SchemaMap,
} from "@/shared/types/json-state.schema-map";
import type { AiFieldPatch } from "../types";
import { walkEntryPath, walkObjectPath } from "./path-utils";

export interface ApplyPatchesInput {
  state: VisitJsonState;
  schemaMap: SchemaMap;
  patches: AiFieldPatch[];
  sourceMessageId: string | null;
  sourceExtractionId: string;
}

export interface ApplyPatchesResult {
  state: VisitJsonState;
  applied: Array<{ path: string }>;
  ignored: Array<{ path: string; reason: ApplyPatchIgnoreReason }>;
}

export type ApplyPatchIgnoreReason =
  | "positional_index_forbidden"
  | "path_not_in_schema"
  | "entry_not_found"
  | "field_not_in_collection_item"
  | "path_not_found"
  | "not_a_field"
  | "validated_by_human"
  | "human_source_prime"
  | "lower_or_equal_confidence_than_current";

const HUMAN_SOURCES = new Set(["user", "voice", "photo_ocr", "import"]);

function confidenceScore(c: FieldConfidence | null | undefined): number {
  if (c === "high") return 0.9;
  if (c === "medium") return 0.7;
  if (c === "low") return 0.4;
  return 0;
}

export function applyPatches(input: ApplyPatchesInput): ApplyPatchesResult {
  const next = clone(input.state);
  const applied: ApplyPatchesResult["applied"] = [];
  const ignored: ApplyPatchesResult["ignored"] = [];

  for (const patch of input.patches) {
    // 1. Refus immédiat des indexes positionnels — le LLM doit utiliser
    //    `[id=…]` ou `insert_entry`.
    if (isPositionalIndexPath(patch.path)) {
      ignored.push({ path: patch.path, reason: "positional_index_forbidden" });
      continue;
    }

    // 2. Résolution path → (parent, key) selon syntaxe :
    //    - object field plat → schemaMap.object_fields
    //    - entry field UUID  → parseEntryPath + walkEntryPath
    const target = resolvePatchTarget(
      next as unknown as Record<string, unknown>,
      input.schemaMap,
      patch.path,
    );
    if (target.reason !== "ok") {
      ignored.push({ path: patch.path, reason: target.reason });
      continue;
    }

    const cur = target.parent[target.key] as Field<unknown> | undefined;
    if (!cur || typeof cur !== "object" || !("value" in cur)) {
      ignored.push({ path: patch.path, reason: "not_a_field" });
      continue;
    }

    // 3. Gates de sécurité (humain prime, confidence)
    if (cur.validation_status === "validated") {
      ignored.push({ path: patch.path, reason: "validated_by_human" });
      continue;
    }
    if (
      cur.value !== null &&
      cur.value !== undefined &&
      HUMAN_SOURCES.has(cur.source)
    ) {
      ignored.push({ path: patch.path, reason: "human_source_prime" });
      continue;
    }
    if (
      cur.source === "ai_infer" &&
      cur.validation_status === "unvalidated" &&
      cur.value !== null &&
      cur.value !== undefined
    ) {
      if (
        confidenceScore(cur.confidence) >=
        confidenceScore(patch.confidence) - 0.1
      ) {
        ignored.push({
          path: patch.path,
          reason: "lower_or_equal_confidence_than_current",
        });
        continue;
      }
    }

    target.parent[target.key] = aiInferField({
      value: patch.value,
      confidence: patch.confidence,
      sourceMessageId: input.sourceMessageId,
      sourceExtractionId: input.sourceExtractionId,
      evidenceRefs: patch.evidence_refs,
    });
    applied.push({ path: patch.path });
  }

  return { state: next, applied, ignored };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ResolveResult =
  | { reason: "ok"; parent: Record<string, unknown>; key: string }
  | { reason: ApplyPatchIgnoreReason };

function resolvePatchTarget(
  root: Record<string, unknown>,
  map: SchemaMap,
  path: string,
): ResolveResult {
  // a) Path d'entrée par UUID : `collection[id=…].field`
  const entry = parseEntryPath(path);
  if (entry) {
    if (!(entry.collection in map.collections)) {
      return { reason: "path_not_in_schema" };
    }
    const collection = map.collections[entry.collection]!;
    if (!collection.item_fields.includes(entry.field)) {
      return { reason: "field_not_in_collection_item" };
    }
    const known = collection.current_entries.some((e) => e.id === entry.entryId);
    if (!known) {
      return { reason: "entry_not_found" };
    }
    const t = walkEntryPath(root, entry.collection, entry.entryId, entry.field);
    if (!t.parent || !t.key) return { reason: "path_not_found" };
    return { reason: "ok", parent: t.parent, key: t.key };
  }

  // b) Path d'object field plat
  if (!isKnownObjectFieldPath(map, path)) {
    return { reason: "path_not_in_schema" };
  }
  const t = walkObjectPath(root, path);
  if (!t.parent || !t.key) return { reason: "path_not_found" };
  return { reason: "ok", parent: t.parent, key: t.key };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
