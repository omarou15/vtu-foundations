/**
 * apply-patches : applique les patches IA `set_field` sur un VisitJsonState.
 *
 * Refonte avril 2026 — couche PERMISSIVE :
 *   - Plus aucun rejet basé sur "humain prime" / confidence / schemaMap.
 *   - Le LLM propose, l'apply layer matérialise, le user arbitre via la
 *     PendingActionsCard (validate / reject).
 *   - Auto-vivification : si le path mène à une entrée par UUID inconnu,
 *     on crée silencieusement l'entrée minimale dans la collection si
 *     celle-ci est connue. Si la collection elle-même est inconnue, on
 *     auto-vivifie un array (le path devient juste un endroit où poser
 *     un Field — le user pourra rejeter via la card).
 *   - Index positionnel `[N]` : résolu à l'entrée correspondante si elle
 *     existe, sinon auto-promu en création d'entrée.
 *
 * Lot A.5 durcissement — zéro rejet : tout patch matérialise son chemin,
 * écrase les conteneurs incompatibles si nécessaire, puis pose un Field<T>
 * `ai_infer/unvalidated`. `ignored` reste dans le contrat pour compatibilité,
 * mais il est toujours vide.
 */

import { aiInferField } from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import {
  buildEmptyCollectionEntry,
  parseEntryPath,
  type SchemaMap,
} from "@/shared/types/json-state.schema-map";
import { v4 as uuidv4 } from "uuid";
import type { AiFieldPatch } from "../types";

export interface ApplyPatchesInput {
  state: VisitJsonState;
  /** Conservé pour signature stable mais plus utilisé pour rejeter. */
  schemaMap: SchemaMap;
  patches: AiFieldPatch[];
  sourceMessageId: string | null;
  sourceExtractionId: string;
}

export interface ApplyPatchesResult {
  state: VisitJsonState;
  applied: Array<{ path: string }>;
  /** Compat debug historique : toujours vide en doctrine permissive totale. */
  ignored: [];
}

const POSITIONAL_RE = /^([a-z0-9_.]+)\[(\d+)\]\.([a-z0-9_]+)$/;

export function applyPatches(input: ApplyPatchesInput): ApplyPatchesResult {
  const next = clone(input.state);
  const root = next as unknown as Record<string, unknown>;
  const applied: ApplyPatchesResult["applied"] = [];

  for (const patch of input.patches) {
    const target = resolvePatchTarget(root, patch.path);
    target.parent[target.key] = aiInferField({
      value: patch.value,
      confidence: patch.confidence,
      sourceMessageId: input.sourceMessageId,
      sourceExtractionId: input.sourceExtractionId,
      evidenceRefs: patch.evidence_refs,
    });
    applied.push({ path: patch.path });
  }

  return { state: next, applied, ignored: [] };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ResolveResult = { parent: Record<string, unknown>; key: string };

function resolvePatchTarget(
  root: Record<string, unknown>,
  path: string,
): ResolveResult {
  // 1. Path d'entrée par UUID : `collection[id=…].field`
  const entry = parseEntryPath(path);
  if (entry) {
    const arr = forceArrayAtPath(root, entry.collection);
    let item = arr.find(
      (e): e is Record<string, unknown> =>
        !!e && typeof e === "object" && (e as Record<string, unknown>).id === entry.entryId,
    );
    if (!item) {
      // Auto-vivify : on crée une entrée minimale avec l'UUID donné.
      const skeleton =
        buildEmptyCollectionEntry(entry.collection) ??
        ({ id: entry.entryId, custom_fields: [] } as Record<string, unknown>);
      skeleton.id = entry.entryId;
      arr.push(skeleton);
      item = skeleton;
    }
    return { parent: item, key: entry.field };
  }

  // 2. Index positionnel `collection[N].field` — auto-promote en insert si
  //    l'entrée à l'index N n'existe pas (Lot A.5 fix 1).
  const m = path.match(POSITIONAL_RE);
  if (m) {
    const [, collection, indexStr, field] = m;
    const arr = forceArrayAtPath(root, collection!);
    const idx = Number(indexStr);
    while (arr.length <= idx) {
      const filler =
        buildEmptyCollectionEntry(collection!) ??
        ({ id: uuidv4(), custom_fields: [] } as Record<string, unknown>);
      if (!filler.id) filler.id = uuidv4();
      arr.push(filler);
    }
    const item = arr[idx];
    if (!item || typeof item !== "object") {
      const skeleton =
        buildEmptyCollectionEntry(collection!) ??
        ({ id: uuidv4(), custom_fields: [] } as Record<string, unknown>);
      if (!skeleton.id) skeleton.id = uuidv4();
      arr[idx] = skeleton;
      return { parent: skeleton, key: field! };
    }
    return { parent: item as Record<string, unknown>, key: field! };
  }

  // 3. Path d'object field plat — auto-vivify les conteneurs intermédiaires.
  const t = ensureObjectPath(root, path);
  return { parent: t.parent, key: t.key };
}

/**
 * Comme walkObjectPath mais auto-vivifie les conteneurs intermédiaires
 * absents (objet vide). Le dernier segment n'est PAS créé — il sera
 * posé par le caller comme Field<T>.
 */
function ensureObjectPath(
  root: Record<string, unknown>,
  path: string,
): { parent: Record<string, unknown>; key: string } {
  const segments = path.split(".").filter((s) => s.length > 0);
  if (segments.length === 0) return { parent: root, key: "_value" };
  if (segments.length === 1) return { parent: root, key: segments[0]! };
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
  return { parent: cur, key: segments[segments.length - 1]! };
}

/**
 * Force un array à un path dot-notation. Tout conteneur incompatible est
 * écrasé : doctrine permissive totale, le LLM propose, l'utilisateur arbitre.
 */
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
