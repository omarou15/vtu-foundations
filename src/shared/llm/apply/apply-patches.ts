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
 *     existe. Sinon ignoré (path_not_found) — pas de création silencieuse
 *     car l'index n'a pas de sémantique stable.
 *
 * Ne rejette plus que les vrais problèmes structurels :
 *   - `not_a_field` : la cible existe mais n'est pas un Field<T>.
 *   - `path_not_found` : impossible de résoudre/créer la cible.
 *
 * Ces "ignored" restent disponibles pour debug mais ne bloquent plus
 * l'utilisateur : ils n'apparaissent plus dans une carte de conflit.
 */

import {
  aiInferField,
  emptyField,
  type Field,
} from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import {
  buildEmptyCollectionEntry,
  parseEntryPath,
  type SchemaMap,
} from "@/shared/types/json-state.schema-map";
import { v4 as uuidv4 } from "uuid";
import type { AiFieldPatch } from "../types";
import { walkObjectPath } from "./path-utils";

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
  ignored: Array<{ path: string; reason: ApplyPatchIgnoreReason }>;
}

export type ApplyPatchIgnoreReason =
  | "not_a_field"
  | "path_not_found";

const POSITIONAL_RE = /^([a-z0-9_.]+)\[(\d+)\]\.([a-z0-9_]+)$/;

export function applyPatches(input: ApplyPatchesInput): ApplyPatchesResult {
  const next = clone(input.state);
  const root = next as unknown as Record<string, unknown>;
  const applied: ApplyPatchesResult["applied"] = [];
  const ignored: ApplyPatchesResult["ignored"] = [];

  for (const patch of input.patches) {
    const target = resolvePatchTarget(root, patch.path);
    if (target.reason !== "ok") {
      ignored.push({ path: patch.path, reason: target.reason });
      continue;
    }

    const cur = target.parent[target.key] as Field<unknown> | undefined;

    // Si la cible existe mais n'est PAS un Field<T>, on ne peut rien faire.
    if (cur !== undefined && cur !== null && !isFieldShape(cur)) {
      ignored.push({ path: patch.path, reason: "not_a_field" });
      continue;
    }

    // Si la cible n'existe pas (cas auto-vivified), on pose un Field neuf.
    // Sinon on remplace par un nouvel ai_infer (le user décide via card).
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
  path: string,
): ResolveResult {
  // 1. Path d'entrée par UUID : `collection[id=…].field`
  const entry = parseEntryPath(path);
  if (entry) {
    const arr = ensureArrayAtPath(root, entry.collection);
    if (!arr) return { reason: "path_not_found" };
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
    return { reason: "ok", parent: item, key: entry.field };
  }

  // 2. Index positionnel `collection[N].field` — auto-promote en insert si
  //    l'entrée à l'index N n'existe pas (Lot A.5 fix 1).
  const m = path.match(POSITIONAL_RE);
  if (m) {
    const [, collection, indexStr, field] = m;
    const arr = ensureArrayAtPath(root, collection!);
    if (!arr) return { reason: "path_not_found" };
    const idx = Number(indexStr);
    const item = arr[idx];
    if (!item || typeof item !== "object") {
      // Promote : crée une nouvelle entrée minimale et l'append.
      // L'index positionnel n'a pas de sémantique stable cross-call, donc
      // on ne tente pas de "remplir les trous" — on append en queue.
      const skeleton =
        buildEmptyCollectionEntry(collection!) ??
        ({ id: uuidv4(), custom_fields: [] } as Record<string, unknown>);
      if (!skeleton.id) skeleton.id = uuidv4();
      arr.push(skeleton);
      return { reason: "ok", parent: skeleton, key: field! };
    }
    return { reason: "ok", parent: item as Record<string, unknown>, key: field! };
  }

  // 3. Path d'object field plat — auto-vivify les conteneurs intermédiaires.
  const t = ensureObjectPath(root, path);
  if (!t.parent || !t.key) return { reason: "path_not_found" };
  return { reason: "ok", parent: t.parent, key: t.key };
}

/**
 * Comme walkObjectPath mais auto-vivifie les conteneurs intermédiaires
 * absents (objet vide). Le dernier segment n'est PAS créé — il sera
 * posé par le caller comme Field<T>.
 */
function ensureObjectPath(
  root: Record<string, unknown>,
  path: string,
): { parent: Record<string, unknown> | null; key: string | null } {
  const segments = path.split(".");
  if (segments.length < 2 || segments.some((s) => s.length === 0)) {
    // Cas trivial : path à un seul segment → on essaie quand même via walkObjectPath
    const t = walkObjectPath(root, path);
    return { parent: t.parent, key: t.key };
  }
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
      // Type incompatible (array, primitif) — refuse pour ne pas corrompre.
      return { parent: null, key: null };
    }
  }
  return { parent: cur, key: segments[segments.length - 1]! };
}

/**
 * Résout (ou crée) un array à un path dot-notation. Retourne null si un
 * conteneur intermédiaire est d'un type incompatible (primitif).
 */
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

function isFieldShape(node: unknown): node is Field<unknown> {
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  return "value" in o && "source" in o && "validation_status" in o;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// emptyField gardé importé pour compat éventuelle des call-sites de tests.
void emptyField;
