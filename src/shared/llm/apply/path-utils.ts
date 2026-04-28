/**
 * Helpers de parsing de paths IA — It. 11.6.
 *
 * Syntaxe acceptée par le LLM :
 *   - `building.wall_material_value`               (object field plat)
 *   - `envelope.murs.material_value`               (sous-objet)
 *   - `heating.installations[id=abc-123].type`     (entrée de collection par UUID)
 *   - `heating.installations[0].type_value`        (entrée positionnelle legacy)
 */

import { parseEntryPath } from "@/shared/types/json-state.schema-map";

type JsonObject = Record<string, unknown>;

const POSITIONAL_RE = /^([a-z0-9_.]+)\[(\d+)\]\.([a-z0-9_]+)$/;

export interface PathTarget {
  parent: JsonObject | null;
  key: string | null;
}

/**
 * Walker unifié pour les paths IA — utilisé par les call sites côté user
 * (validation/reject d'un patch via `PendingActionsCard`, vues debug).
 *
 * Détecte automatiquement la syntaxe :
 *   - `collection[id=…].field` → walkEntryPath
 *   - `collection[N].field` → walkPositionPath
 *   - sinon → walkObjectPath (path dot-notation simple)
 *
 * Renvoie `{ parent: null, key: null }` si le path n'est pas résoluble.
 *
 * Pour la validation côté apply-patches (qui exige aussi schemaMap), voir
 * `applyPatches` directement.
 */
export function walkJsonPath(
  root: JsonObject,
  path: string,
): PathTarget {
  const entry = parseEntryPath(path);
  if (entry) {
    return walkEntryPath(root, entry.collection, entry.entryId, entry.field);
  }
  const positional = parsePositionPath(path);
  if (positional) {
    return walkPositionPath(
      root,
      positional.collection,
      positional.index,
      positional.field,
    );
  }
  return walkObjectPath(root, path);
}

/**
 * Walk un path dot-notation simple (sans index). Renvoie le parent
 * et la dernière clé pour permettre une affectation.
 *
 * Pour les paths avec `[id=…]`, utiliser `walkEntryPath` à la place.
 */
export function walkObjectPath(root: JsonObject, path: string): PathTarget {
  const segments = path.split(".");
  if (segments.length < 2) return { parent: null, key: null };
  if (segments.some((s) => s.length === 0)) return { parent: null, key: null };

  let cur: unknown = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) {
      return { parent: null, key: null };
    }
    cur = (cur as JsonObject)[segments[i]!];
  }

  if (!cur || typeof cur !== "object" || Array.isArray(cur)) {
    return { parent: null, key: null };
  }
  return { parent: cur as JsonObject, key: segments[segments.length - 1]! };
}

/**
 * Pour un path de la forme `heating.installations[id=abc].type_value`,
 * trouve l'entrée par UUID dans la collection et renvoie le parent
 * (l'entrée elle-même) + la clé du champ.
 *
 * Renvoie null si :
 *   - le path n'a pas la forme attendue
 *   - la collection n'existe pas
 *   - aucune entrée avec cet UUID
 */
export function walkEntryPath(
  root: JsonObject,
  collection: string,
  entryId: string,
  field: string,
): PathTarget {
  const segments = collection.split(".");
  let cur: unknown = root;
  for (const seg of segments) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) {
      return { parent: null, key: null };
    }
    cur = (cur as JsonObject)[seg];
  }
  if (!Array.isArray(cur)) return { parent: null, key: null };
  const entry = (cur as JsonObject[]).find((e) => e?.id === entryId);
  if (!entry || typeof entry !== "object") return { parent: null, key: null };
  return { parent: entry, key: field };
}

export function parsePositionPath(
  path: string,
): { collection: string; index: number; field: string } | null {
  const m = path.match(POSITIONAL_RE);
  if (!m) return null;
  const [, collection, indexStr, field] = m;
  if (!collection || !indexStr || !field) return null;
  return { collection, index: Number(indexStr), field };
}

export function walkPositionPath(
  root: JsonObject,
  collection: string,
  index: number,
  field: string,
): PathTarget {
  const segments = collection.split(".");
  let cur: unknown = root;
  for (const seg of segments) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) {
      return { parent: null, key: null };
    }
    cur = (cur as JsonObject)[seg];
  }
  if (!Array.isArray(cur)) return { parent: null, key: null };
  const entry = (cur as unknown[])[index];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { parent: null, key: null };
  }
  return { parent: entry as JsonObject, key: field };
}
