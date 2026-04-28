/**
 * VTU — Schema Map du JSON state (It. 11.6)
 *
 * Carte structurée du JSON state injectée dans le ContextBundle pour que
 * le LLM sache EXACTEMENT :
 *   - quels paths d'objet sont des Field<T> qu'il peut modifier (`set_field`)
 *   - quelles collections existent et quels champs leurs items acceptent
 *     (`insert_entry`)
 *   - quelles entrées sont actuellement présentes (avec UUID stable) pour
 *     un `set_field` ciblé sur une entrée existante via `[id=…]`
 *
 * Doctrine VTU :
 *   - L'IA propose dans le cadre de cette carte. Hors carte → custom_field.
 *   - Pas d'index positionnel `[N]`. Les entrées sont identifiées par UUID.
 *   - Une nouvelle entrée passe par `insert_entry`, jamais par auto-vivify.
 *
 * Implémentation : hybride
 *   - `object_fields` est calculé en walkant l'instance state (tout leaf
 *     ayant la forme d'un Field<T> est listé). Ça reflète automatiquement
 *     l'ajout d'une nouvelle section/champ dans `json-state.sections.ts`
 *     sans effort de maintenance ici.
 *   - `collections` est piloté par un registre déclaratif `COLLECTIONS_REGISTRY`
 *     qui mappe chaque path de collection à son schéma Zod. Le registre
 *     est l'unique endroit à éditer pour qu'une nouvelle collection soit
 *     reconnue.
 */

import type { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  CustomObservationEntrySchema,
  EcsInstallationSchema,
  EnergyProductionItemSchema,
  HeatingInstallationSchema,
  IndustrielProcessItemSchema,
  NoteEntrySchema,
  PathologyEntrySchema,
  PreconisationEntrySchema,
  TertiaireHorsCvcItemSchema,
  VentilationInstallationSchema,
} from "./json-state.sections";
import type { VisitJsonState } from "./json-state";
import { emptyField, type Field } from "./json-state.field";

// ---------------------------------------------------------------------------
// Registre des collections — unique source de vérité pour le LLM
// ---------------------------------------------------------------------------

/**
 * Pour chaque collection (array d'items à UUID), son schéma d'item.
 * Ajouter une entrée ici quand on crée une nouvelle collection dans
 * `json-state.sections.ts`.
 *
 * Les keys "id" et "custom_fields" sont retirées automatiquement — on
 * n'expose au LLM que les champs sémantiques.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COLLECTIONS_REGISTRY: Record<string, z.ZodObject<any>> = {
  "heating.installations": HeatingInstallationSchema,
  "ecs.installations": EcsInstallationSchema,
  "ventilation.installations": VentilationInstallationSchema,
  "energy_production.installations": EnergyProductionItemSchema,
  "industriel_processes.installations": IndustrielProcessItemSchema,
  "tertiaire_hors_cvc.installations": TertiaireHorsCvcItemSchema,
  "pathologies.items": PathologyEntrySchema,
  "preconisations.items": PreconisationEntrySchema,
  "notes.items": NoteEntrySchema,
  "custom_observations.items": CustomObservationEntrySchema,
};

const COLLECTION_PATHS = new Set(Object.keys(COLLECTIONS_REGISTRY));

/**
 * Champs jamais exposés au LLM dans `item_fields` (techniques ou gérés
 * séparément).
 */
const ITEM_FIELDS_BLACKLIST = new Set([
  "id",
  "custom_fields",
  "created_at",
  "related_message_id",
]);

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface SchemaMapEntry {
  /** UUID stable de l'entrée (pour `set_field` ciblé). */
  id: string;
  /**
   * Résumé court (≤ 80 chars) destiné au LLM pour qu'il choisisse
   * la bonne entrée à modifier. Construit à partir des champs *_value
   * remplis et de l'année si disponible.
   */
  summary: string;
}

export interface SchemaMapCollection {
  /**
   * Champs valides sur un item de cette collection
   * (ex: `["type_value", "fuel_value", "power_kw", …]`).
   * Les champs techniques (id, custom_fields, created_at) sont filtrés.
   */
  item_fields: string[];
  /** Entrées actuellement présentes (avec leur UUID). */
  current_entries: SchemaMapEntry[];
}

export interface SchemaMap {
  /**
   * Tous les paths absolus vers un Field<T> dans les sections à shape
   * fixe (ex: `building.wall_material_value`, `envelope.murs.material_value`).
   * EXCLUT les fields à l'intérieur des collections (ceux-là sont décrits
   * via `collections.<path>.item_fields`).
   */
  object_fields: string[];
  /**
   * Collections (arrays d'items à UUID stable) — clé = path absolu vers
   * l'array, ex: `"heating.installations"`.
   */
  collections: Record<string, SchemaMapCollection>;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Construit la SchemaMap pour un état donné. Pure (pas d'I/O).
 *
 * Coût : un walk récursif du state + une itération sur chaque collection
 * du registre. Insignifiant pour les tailles de state typiques (< 100 KB).
 */
export function buildSchemaMap(state: VisitJsonState): SchemaMap {
  const object_fields: string[] = [];
  walkObjectFields(state as unknown as Record<string, unknown>, "", object_fields);

  const collections: Record<string, SchemaMapCollection> = {};
  for (const [path, schema] of Object.entries(COLLECTIONS_REGISTRY)) {
    const item_fields = Object.keys(schema.shape).filter(
      (k) => !ITEM_FIELDS_BLACKLIST.has(k),
    );
    const arr = readArrayAtPath(state, path);
    const current_entries: SchemaMapEntry[] = (arr ?? []).map((item) => ({
      id: itemId(item),
      summary: summarizeItem(item, item_fields),
    }));
    collections[path] = { item_fields, current_entries };
  }

  return { object_fields, collections };
}

/**
 * True si le path est connu de la SchemaMap (object_field OU
 * collection.<id>.field). Utilisé par l'apply layer pour rejeter les
 * paths inventés par l'IA.
 *
 * Format des paths supportés :
 *   - `building.wall_material_value` (object field)
 *   - `heating.installations[id=abc-123].type_value` (entry field)
 *   Pas d'index positionnel `[N]` — refusé volontairement.
 */
export function isKnownObjectFieldPath(map: SchemaMap, path: string): boolean {
  return map.object_fields.includes(path);
}

/**
 * Pour un path de la forme `heating.installations[id=abc].type_value`,
 * renvoie `{ collection: "heating.installations", entryId: "abc", field: "type_value" }`
 * ou null si la syntaxe ne matche pas.
 */
export function parseEntryPath(
  path: string,
): { collection: string; entryId: string; field: string } | null {
  // Cherche `[id=…]` quelque part dans le path.
  const m = path.match(/^([a-z0-9_.]+)\[id=([0-9a-fA-F-]+)\]\.([a-z0-9_]+)$/);
  if (!m) return null;
  const [, collection, entryId, field] = m;
  if (!collection || !entryId || !field) return null;
  return { collection, entryId, field };
}

/**
 * True si le path est positionnel (`installations[0].xxx`) — ces paths
 * sont REJETÉS par l'apply layer pour forcer le LLM à utiliser :
 *   - `insert_entry` (créer)
 *   - `set_field` avec `[id=…]` (modifier existant)
 */
export function isPositionalIndexPath(path: string): boolean {
  return /\[\d+\]/.test(path);
}

/**
 * True si la collection est connue du registre.
 */
export function isKnownCollection(map: SchemaMap, collection: string): boolean {
  return collection in map.collections;
}

/**
 * Construit un squelette d'entrée vide pour une collection donnée. Utilisé
 * par l'apply layer (`insert_entry`) pour matérialiser une nouvelle entrée
 * avec :
 *   - `id`: UUID v4 fraîchement généré
 *   - `custom_fields`: []
 *   - `created_at`: ISO now (pour notes/observations)
 *   - `related_message_id`: null (pour notes/observations)
 *   - tous les autres keys (Field<T>) : `emptyField()`
 *
 * Renvoie null si la collection n'est pas dans le registre.
 *
 * Note : ce builder est volontairement guidé par les **keys du Zod schema**,
 * pas par une whitelist hardcodée. Ajouter un champ à un schéma d'item
 * dans `json-state.sections.ts` propage automatiquement ici sans aucun
 * changement.
 */
export function buildEmptyCollectionEntry(
  collection: string,
): Record<string, unknown> | null {
  const schema = COLLECTIONS_REGISTRY[collection];
  if (!schema) return null;
  const now = new Date().toISOString();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema.shape)) {
    if (key === "id") {
      out.id = uuidv4();
    } else if (key === "custom_fields") {
      out.custom_fields = [];
    } else if (key === "created_at") {
      out.created_at = now;
    } else if (key === "related_message_id") {
      out.related_message_id = null;
    } else {
      // Convention : tous les autres keys sont des Field<T> (cf. schemas
      // dans json-state.sections.ts).
      out[key] = emptyField<unknown>();
    }
  }
  return out;
}

/**
 * Liste des keys techniques d'un item de collection (id, custom_fields,
 * created_at, related_message_id). Utilisé par l'apply layer pour
 * rejeter un `insert_entry` qui essaierait de poser ces keys directement.
 */
export function isReservedItemKey(key: string): boolean {
  return ITEM_FIELDS_BLACKLIST.has(key);
}

/**
 * Liste des paths exposés au LLM dans une représentation compacte.
 * Utilisé pour limiter la taille du contextBundle si nécessaire.
 */
export function compactSchemaMap(map: SchemaMap): {
  object_fields: string[];
  collections: Record<
    string,
    { item_fields: string[]; entries_count: number; entries_summary: string[] }
  >;
} {
  const collections: Record<
    string,
    { item_fields: string[]; entries_count: number; entries_summary: string[] }
  > = {};
  for (const [path, c] of Object.entries(map.collections)) {
    collections[path] = {
      item_fields: c.item_fields,
      entries_count: c.current_entries.length,
      entries_summary: c.current_entries.map(
        (e) => `${e.id.slice(0, 8)}: ${e.summary}`,
      ),
    };
  }
  return { object_fields: map.object_fields, collections };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Walk récursif : tout objet ayant la forme `{ value, source, validation_status, … }`
 * est traité comme un Field<T> et son path absolu est ajouté à `out`.
 *
 * S'arrête sur :
 *   - les arrays (gérés par le registre des collections)
 *   - les `custom_fields` (mécanisme parallèle, pas exposé en object_fields)
 *   - les paths qui matchent une collection (déjà couverts par le registre)
 */
function walkObjectFields(
  node: unknown,
  prefix: string,
  out: string[],
): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  if (isFieldShape(node)) {
    out.push(prefix);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "custom_fields") continue;
    if (key === "schema_version") continue;
    if (key === "needs_reclassification") continue;
    const childPath = prefix ? `${prefix}.${key}` : key;
    if (COLLECTION_PATHS.has(childPath)) continue;
    walkObjectFields(value, childPath, out);
  }
}

/**
 * True si l'objet a la forme structurelle d'un Field<T>.
 */
function isFieldShape(node: unknown): node is Field<unknown> {
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  return (
    "value" in o &&
    "source" in o &&
    "updated_at" in o &&
    "validation_status" in o
  );
}

/**
 * Résolution simple d'un path dot-notation vers un array.
 * Renvoie `null` si le path ne mène pas à un array.
 */
function readArrayAtPath(
  state: VisitJsonState,
  path: string,
): unknown[] | null {
  const segments = path.split(".");
  let cur: unknown = state;
  for (const seg of segments) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return Array.isArray(cur) ? (cur as unknown[]) : null;
}

/**
 * Extrait l'UUID d'une entrée. Renvoie `"<missing-id>"` si absent
 * (ne devrait pas arriver — toutes les schemas d'item exigent `id`).
 */
function itemId(item: unknown): string {
  if (!item || typeof item !== "object") return "<missing-id>";
  const id = (item as Record<string, unknown>).id;
  return typeof id === "string" ? id : "<missing-id>";
}

/**
 * Résumé court d'une entrée pour le LLM (≤ 80 chars). Concatène les
 * `*_value` non-null et l'année d'installation si présente.
 */
function summarizeItem(item: unknown, item_fields: string[]): string {
  if (!item || typeof item !== "object") return "(entrée vide)";
  const o = item as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of item_fields) {
    if (parts.length >= 3) break;
    const val = o[key];
    if (!val || typeof val !== "object") continue;
    const f = val as Record<string, unknown>;
    if (f.value === null || f.value === undefined) continue;
    if (key.endsWith("_other")) continue; // bruit, ne pas afficher
    if (typeof f.value === "string" || typeof f.value === "number") {
      parts.push(String(f.value));
    }
  }
  const summary = parts.join(" · ");
  return summary.length > 0 ? summary.slice(0, 80) : "(entrée vide)";
}
