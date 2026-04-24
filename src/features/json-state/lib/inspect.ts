/**
 * VTU — Helpers d'inspection du JSON state pour le viewer.
 *
 * Le viewer affiche le state brut tel qu'il est stocké (objet
 * `{ schema_version, meta, ... }`), mais on a besoin de :
 *  - Repérer les champs `Field<T>` à confidence "low" pour les
 *    surligner en orange (KNOWLEDGE §2 + brief Itération 5).
 *  - Compter ces champs pour afficher un badge récapitulatif.
 *
 * La détection est structurelle : un objet est un `Field<T>` s'il
 * possède au moins les clés (value, source, confidence, updated_at).
 */

import type { VisitJsonState } from "@/shared/types";

const FIELD_KEYS = ["value", "source", "confidence", "updated_at"];

function isField(value: unknown): value is {
  value: unknown;
  source: string;
  confidence: string | null;
  updated_at: string;
} {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return FIELD_KEYS.every((k) => k in obj);
}

/**
 * Parcours profond du state, retourne la liste des chemins (dot-notation)
 * pointant vers un Field<T> dont la confidence vaut "low".
 */
export function findLowConfidenceFieldPaths(state: VisitJsonState): string[] {
  const paths: string[] = [];

  function walk(value: unknown, path: string) {
    if (isField(value)) {
      if (value.confidence === "low") paths.push(path);
      return; // On ne descend pas dans .value
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  }

  walk(state, "");
  return paths;
}

export function countLowConfidenceFields(state: VisitJsonState): number {
  return findLowConfidenceFieldPaths(state).length;
}
