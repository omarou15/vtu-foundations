/**
 * VTU — Collecte récursive des paths de Field<T> par section (It. 11)
 *
 * Utilisé par :
 *  - validateSectionPatches / rejectSectionPatches (backend) pour
 *    appliquer en bloc une opération sur tous les Field IA non-validés
 *    d'une section.
 *  - JsonViewerFiltered (UI) pour rendre la liste à plat des champs
 *    d'une section en mode "À traiter".
 *
 * Section = top-level key du state (ex: "envelope", "heating", "meta").
 * Pas de support sub-section (l'arbitrage par sub-section est rare en
 * pratique terrain, et les sections top-level mappent déjà sur le
 * découpage métier).
 */

import type { VisitJsonState } from "@/shared/types";
import type { Field } from "@/shared/types/json-state.field";

const FIELD_KEYS = ["value", "source", "confidence", "updated_at"];

function isField(v: unknown): v is Field<unknown> {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return FIELD_KEYS.every((k) => k in obj);
}

interface FieldEntry {
  path: string;
  field: Field<unknown>;
}

/**
 * Liste tous les Field<T> contenus dans une section (deep walk).
 * `sectionKey` = clé top-level du state (ex: "envelope").
 *
 * Si la section n'existe pas → [].
 */
export function listFieldsInSection(
  state: VisitJsonState | null | undefined,
  sectionKey: string,
): FieldEntry[] {
  if (!state) return [];
  const root = (state as unknown as Record<string, unknown>)[sectionKey];
  if (!root || typeof root !== "object") return [];

  const results: FieldEntry[] = [];

  function walk(node: unknown, path: string) {
    if (isField(node)) {
      results.push({ path, field: node });
      return; // Ne pas descendre dans .value (peut être un objet domaine)
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  }

  walk(root, sectionKey);
  return results;
}

/**
 * Filtre les Field "candidat à validation IA" : source="ai_infer" ET
 * validation_status="unvalidated" ET value non-null.
 */
export function listUnvalidatedAiFieldsInSection(
  state: VisitJsonState | null | undefined,
  sectionKey: string,
): FieldEntry[] {
  return listFieldsInSection(state, sectionKey).filter(
    (e) =>
      e.field.source === "ai_infer" &&
      e.field.validation_status === "unvalidated" &&
      e.field.value !== null &&
      e.field.value !== undefined,
  );
}

/**
 * Liste les sections top-level qui contiennent au moins 1 Field IA
 * non-validé. Conserve l'ordre déclaratif du state.
 */
export function listSectionsWithUnvalidatedAi(
  state: VisitJsonState | null | undefined,
): string[] {
  if (!state) return [];
  const out: string[] = [];
  for (const key of Object.keys(state as object)) {
    if (key === "schema_version" || key === "meta_internal") continue;
    if (listUnvalidatedAiFieldsInSection(state, key).length > 0) {
      out.push(key);
    }
  }
  return out;
}
