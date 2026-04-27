/**
 * VTU — Itération 12 : Helpers de synthèse pour VisitSummaryView.
 *
 * Vue lecture seule type "fiche bâtiment Notion". Pour chaque section
 * top-level du JSON state, on compose :
 *  - les entries (champ + valeur formatée + statut visuel)
 *  - les compteurs (rempli / vide)
 *  - les médias regroupés par section (linked_sections[0])
 *
 * Pur, idempotent, testable unitaire.
 */

import type { LocalAttachment, LocalMessage } from "@/shared/db";
import type { VisitJsonState } from "@/shared/types";
import type { Field } from "@/shared/types/json-state.field";
import { listFieldsInSection } from "@/features/json-state/lib/section-paths";
import { findActiveConflicts } from "@/features/json-state/lib/conflicts";
import { labelForPath, formatPatchValue } from "@/shared/llm/path-labels";
import {
  listCriticalChecks,
  listEmptyCriticalPaths,
} from "./critical-fields";

export type SummaryEntryStatus =
  | "ok"
  | "ai_unvalidated"
  | "conflict"
  | "empty_critical";

export interface SummaryEntry {
  path: string;
  label: string;
  /** Valeur formatée prête à afficher ("—" si vide). */
  displayValue: string;
  status: SummaryEntryStatus;
  /** Vrai si valeur null/undefined/"". */
  isEmpty: boolean;
  /** Confidence si dispo (utile pour pastille IA). */
  confidence: Field<unknown>["confidence"];
  source: Field<unknown>["source"];
}

export interface SummaryGlobals {
  validated: number;
  aiUnvalidated: number;
  emptyCritical: number;
  conflicts: number;
}

/**
 * Construit la liste d'entries pour une section top-level.
 *
 * - Non-Field (primitives) ignorés (déjà couverts par les Field<T>).
 * - Les `*_other` ne sont pas dédupliqués mais le rendu UI peut les
 *   masquer si la valeur principale est différente de "autre".
 */
export function buildSectionSummary(
  state: VisitJsonState | null | undefined,
  sectionKey: string,
  conflictPaths: Set<string>,
  emptyCriticalPaths: Set<string>,
): SummaryEntry[] {
  if (!state) return [];
  const fields = listFieldsInSection(state, sectionKey);
  const out: SummaryEntry[] = [];

  for (const { path, field } of fields) {
    const isEmpty =
      field.value === null ||
      field.value === undefined ||
      field.value === "";

    let status: SummaryEntryStatus = "ok";
    if (conflictPaths.has(path)) status = "conflict";
    else if (
      field.source === "ai_infer" &&
      field.validation_status === "unvalidated" &&
      !isEmpty
    )
      status = "ai_unvalidated";
    else if (isEmpty && emptyCriticalPaths.has(path))
      status = "empty_critical";

    out.push({
      path,
      label: labelForPath(path),
      displayValue: isEmpty ? "—" : formatPatchValue(field.value),
      status,
      isEmpty,
      confidence: field.confidence,
      source: field.source,
    });
  }

  return out;
}

/**
 * Compteurs globaux pour le bandeau "18 ✓ · 4 IA · 2 ⚠".
 */
export function countSummaryGlobals(
  state: VisitJsonState | null | undefined,
  messages: LocalMessage[],
): SummaryGlobals {
  if (!state) {
    return { validated: 0, aiUnvalidated: 0, emptyCritical: 0, conflicts: 0 };
  }

  let validated = 0;
  let aiUnvalidated = 0;

  walkFields(state, (f) => {
    const isEmpty =
      f.value === null || f.value === undefined || f.value === "";
    if (isEmpty) return;
    if (f.validation_status === "validated") validated++;
    else if (f.source === "ai_infer" && f.validation_status === "unvalidated")
      aiUnvalidated++;
  });

  const emptyCritical = listEmptyCriticalPaths(state).length;
  const conflicts = findActiveConflicts(state, messages).length;

  return { validated, aiUnvalidated, emptyCritical, conflicts };
}

/**
 * Regroupe les médias par section (clé = `linked_sections[0]`, fallback
 * "other").
 */
export function groupMediaBySection(
  media: LocalAttachment[],
): Record<string, LocalAttachment[]> {
  const out: Record<string, LocalAttachment[]> = {};
  for (const m of media) {
    const section = m.linked_sections?.[0]?.split(".")[0] ?? "other";
    (out[section] ||= []).push(m);
  }
  return out;
}

/**
 * Retourne true si la section n'a aucun champ rempli ET aucun média.
 * Utilisé par l'UI pour replier les sections "vides non critiques".
 */
export function isSectionFullyEmpty(
  entries: SummaryEntry[],
  mediaCount: number,
): boolean {
  if (mediaCount > 0) return false;
  return entries.every((e) => e.isEmpty);
}

/**
 * Helper : true si la section contient au moins 1 champ critique vide.
 */
export function sectionHasCriticalEmpty(
  state: VisitJsonState | null | undefined,
  sectionKey: string,
): boolean {
  if (!state) return false;
  return listCriticalChecks(state).some(
    (c) => c.path.startsWith(`${sectionKey}.`) && c.isEmpty(state),
  );
}

// ---------------------------------------------------------------------------
// internal walker

const FIELD_KEYS = ["value", "source", "confidence", "updated_at"];

function isField(v: unknown): v is Field<unknown> {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return FIELD_KEYS.every((k) => k in obj);
}

function walkFields(
  node: unknown,
  visit: (f: Field<unknown>) => void,
): void {
  if (isField(node)) {
    visit(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkFields(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      walkFields(v, visit);
    }
  }
}
