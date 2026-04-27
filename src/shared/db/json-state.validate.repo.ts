/**
 * VTU — Validation / rejet inline d'un Field<T> proposé par l'IA.
 *
 * It. 10.5 — Permet à l'utilisateur de valider ou rejeter en 1 clic un
 * patch IA depuis la PendingActionsCard du chat. Chaque action crée une
 * NOUVELLE version de visit_json_state (append-only, doctrine §2).
 *
 * Règles :
 *  - validate : value conservée, source conservée, validation_status =
 *    "validated", validated_at = now, validated_by = userId.
 *  - reject :
 *      - si source === "ai_infer" → reset à un Field vide (value=null,
 *        source="init", validation_status="rejected").
 *      - sinon (humain ou import) → on marque seulement le statut comme
 *        "rejected" sans toucher la value (préserve les saisies humaines).
 *
 * Idempotent côté UI : si le statut cible est déjà atteint, no-op.
 */

import {
  appendJsonStateVersion,
  getLatestLocalJsonState,
} from "@/shared/db/json-state.repo";
import { emptyField, type Field } from "@/shared/types/json-state.field";
import type { LocalVisitJsonState } from "@/shared/db/schema";
import type { VisitJsonState } from "@/shared/types";

export interface ValidatePatchInput {
  userId: string;
  visitId: string;
  /** Path dot-notation (ex: "heating.fuel_value"). */
  path: string;
  /** Lien vers le message assistant porteur de la proposition (audit). */
  sourceMessageId?: string | null;
}

export type ValidateResult =
  | { status: "ok"; row: LocalVisitJsonState }
  | { status: "noop"; reason: string };

/**
 * Valide un Field<T> existant : passe son validation_status à "validated".
 * Crée une nouvelle version JSON state.
 */
export async function validateFieldPatch(
  input: ValidatePatchInput,
): Promise<ValidateResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", reason: "no_state" };

  const next = clone(last.state);
  const { parent, key } = walk(next as Record<string, unknown>, input.path);
  if (!parent || !key) return { status: "noop", reason: "path_not_found" };

  const cur = parent[key] as Field<unknown> | undefined;
  if (!cur || typeof cur !== "object" || !("value" in cur)) {
    return { status: "noop", reason: "not_a_field" };
  }
  if (cur.validation_status === "validated") {
    return { status: "noop", reason: "already_validated" };
  }

  const now = new Date().toISOString();
  parent[key] = {
    ...cur,
    validation_status: "validated",
    validated_at: now,
    validated_by: input.userId,
    updated_at: now,
  };

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: input.sourceMessageId ?? null,
  });
  return { status: "ok", row };
}

/**
 * Rejette un Field<T> proposé : reset à null si source ai_infer, sinon
 * marque "rejected" sans toucher la value.
 */
export async function rejectFieldPatch(
  input: ValidatePatchInput,
): Promise<ValidateResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", reason: "no_state" };

  const next = clone(last.state);
  const { parent, key } = walk(next as Record<string, unknown>, input.path);
  if (!parent || !key) return { status: "noop", reason: "path_not_found" };

  const cur = parent[key] as Field<unknown> | undefined;
  if (!cur || typeof cur !== "object" || !("value" in cur)) {
    return { status: "noop", reason: "not_a_field" };
  }
  if (cur.validation_status === "rejected") {
    return { status: "noop", reason: "already_rejected" };
  }

  const now = new Date().toISOString();
  if (cur.source === "ai_infer") {
    // Reset complet — la valeur IA n'a aucune valeur historique à préserver.
    const reset = emptyField<unknown>();
    parent[key] = {
      ...reset,
      validation_status: "rejected",
      validated_at: now,
      validated_by: input.userId,
      updated_at: now,
    };
  } else {
    // Source humaine : ne pas écraser la valeur, juste marquer le statut.
    parent[key] = {
      ...cur,
      validation_status: "rejected",
      validated_at: now,
      validated_by: input.userId,
      updated_at: now,
    };
  }

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: input.sourceMessageId ?? null,
  });
  return { status: "ok", row };
}

// ---------------------------------------------------------------------------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function walk(
  root: Record<string, unknown>,
  path: string,
): { parent: Record<string, unknown> | null; key: string | null } {
  const segments = path.split(".");
  if (segments.length < 2) return { parent: null, key: null };
  let cur: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    if (!cur || typeof cur !== "object") return { parent: null, key: null };
    cur = (cur as Record<string, unknown>)[segments[i]!];
  }
  if (!cur || typeof cur !== "object") return { parent: null, key: null };
  return {
    parent: cur as Record<string, unknown>,
    key: segments[segments.length - 1]!,
  };
}

/** Helper utilisé par les tests pour inspecter un Field<T>. */
export function readFieldAtPath(
  state: VisitJsonState,
  path: string,
): Field<unknown> | null {
  const { parent, key } = walk(state as Record<string, unknown>, path);
  if (!parent || !key) return null;
  const cur = parent[key];
  if (!cur || typeof cur !== "object" || !("value" in (cur as object))) {
    return null;
  }
  return cur as Field<unknown>;
}
