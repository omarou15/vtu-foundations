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
import { emptyField, aiInferField, type Field } from "@/shared/types/json-state.field";
import { listUnvalidatedAiFieldsInSection } from "@/features/json-state/lib/section-paths";
import type { LocalVisitJsonState } from "@/shared/db/schema";
import type { VisitJsonState } from "@/shared/types";
import type { AiFieldPatch } from "@/shared/llm";
import { getDb } from "@/shared/db/schema";
import { walkJsonPath } from "@/shared/llm/apply/path-utils";

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
  const { parent, key } = walkJsonPath(next as Record<string, unknown>, input.path);
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
  const { parent, key } = walkJsonPath(next as Record<string, unknown>, input.path);
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

/** Helper utilisé par les tests pour inspecter un Field<T>. */
export function readFieldAtPath(
  state: VisitJsonState,
  path: string,
): Field<unknown> | null {
  const { parent, key } = walkJsonPath(state as Record<string, unknown>, path);
  if (!parent || !key) return null;
  const cur = parent[key];
  if (!cur || typeof cur !== "object" || !("value" in (cur as object))) {
    return null;
  }
  return cur as Field<unknown>;
}

// ===========================================================================
// It. 11 — Validation/rejet en masse par section + override conflit IA
// ===========================================================================

export interface SectionOpInput {
  userId: string;
  visitId: string;
  /** Top-level section, ex: "envelope" / "heating". */
  sectionKey: string;
}

export interface SectionOpResult {
  status: "ok" | "noop";
  applied_count: number;
  /** Nouvelle version JSON state (présente seulement si applied_count > 0). */
  row?: LocalVisitJsonState;
  reason?: string;
}

/**
 * Valide en bloc TOUS les Field<T> ai_infer + unvalidated d'une section.
 * Une seule transaction → une seule nouvelle version JSON state.
 *
 * Idempotent : si rien à valider → status "noop", applied_count 0.
 */
export async function validateSectionPatches(
  input: SectionOpInput,
): Promise<SectionOpResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", applied_count: 0, reason: "no_state" };

  const candidates = listUnvalidatedAiFieldsInSection(
    last.state,
    input.sectionKey,
  );
  if (candidates.length === 0) {
    return { status: "noop", applied_count: 0, reason: "nothing_to_validate" };
  }

  const next = clone(last.state);
  const now = new Date().toISOString();

  for (const { path } of candidates) {
    const { parent, key } = walkJsonPath(next as Record<string, unknown>, path);
    if (!parent || !key) continue;
    const cur = parent[key] as Field<unknown> | undefined;
    if (!cur || cur.validation_status !== "unvalidated") continue;
    parent[key] = {
      ...cur,
      validation_status: "validated",
      validated_at: now,
      validated_by: input.userId,
      updated_at: now,
    };
  }

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: null,
  });
  return { status: "ok", applied_count: candidates.length, row };
}

/**
 * Rejette en bloc tous les Field<T> ai_infer + unvalidated d'une section.
 * Reset à un Field vide (cf. doctrine §rejectFieldPatch ci-dessus).
 */
export async function rejectSectionPatches(
  input: SectionOpInput,
): Promise<SectionOpResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", applied_count: 0, reason: "no_state" };

  const candidates = listUnvalidatedAiFieldsInSection(
    last.state,
    input.sectionKey,
  );
  if (candidates.length === 0) {
    return { status: "noop", applied_count: 0, reason: "nothing_to_reject" };
  }

  const next = clone(last.state);
  const now = new Date().toISOString();

  for (const { path } of candidates) {
    const { parent, key } = walkJsonPath(next as Record<string, unknown>, path);
    if (!parent || !key) continue;
    const cur = parent[key] as Field<unknown> | undefined;
    if (!cur) continue;
    // Tous les candidats sont par définition source="ai_infer" → reset complet.
    const reset = emptyField<unknown>();
    parent[key] = {
      ...reset,
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
    createdByMessageId: null,
  });
  return { status: "ok", applied_count: candidates.length, row };
}

// ---------------------------------------------------------------------------
// Override conflit : "Prendre la valeur IA"
// ---------------------------------------------------------------------------

export interface OverrideWithAiPatchInput {
  userId: string;
  visitId: string;
  /** Path du Field actuellement humain à overwrite. */
  path: string;
  /** Patch IA originel (proposed_patches). */
  patch: AiFieldPatch;
  /** Message porteur de la proposition (audit). */
  sourceMessageId: string;
  /** Id de l'extraction LLM qui a généré le patch (optionnel). */
  sourceExtractionId?: string;
}

/**
 * Bypass délibéré du gate "human_source_prime" : remplace la valeur
 * humaine par la valeur IA proposée, et marque immédiatement le Field
 * comme `validated` (puisque le user vient d'arbitrer en faveur de l'IA).
 *
 * Met à jour le message porteur pour mémoriser l'arbitrage (le conflit
 * disparait de findActiveConflicts).
 */
export async function overrideWithAiPatch(
  input: OverrideWithAiPatchInput,
): Promise<ValidateResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", reason: "no_state" };

  const next = clone(last.state);
  const { parent, key } = walkJsonPath(next as Record<string, unknown>, input.path);
  if (!parent || !key) return { status: "noop", reason: "path_not_found" };

  const now = new Date().toISOString();

  // 1. Pose la valeur IA sous forme de Field ai_infer puis valide.
  const aiField = aiInferField({
    value: input.patch.value,
    confidence: input.patch.confidence,
    sourceMessageId: input.sourceMessageId,
    sourceExtractionId: input.sourceExtractionId ?? "user_override",
    evidenceRefs: input.patch.evidence_refs ?? [],
  });
  parent[key] = {
    ...aiField,
    validation_status: "validated",
    validated_at: now,
    validated_by: input.userId,
    updated_at: now,
  };

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: input.sourceMessageId,
  });

  // 2. Marque le conflit comme arbitré dans la metadata du message porteur.
  await markConflictResolved({
    messageId: input.sourceMessageId,
    path: input.path,
    decision: "took_ai",
  });

  return { status: "ok", row };
}

/**
 * Variante "Garder la mienne" : valide la valeur humaine actuelle
 * (passe validation_status à "validated") + marque le conflit comme
 * arbitré dans la metadata du message porteur.
 *
 * Note : la valeur humaine reste exactement ce qu'elle était. On ne
 * crée une nouvelle version que pour figer le validation_status.
 */
export async function keepHumanValue(input: {
  userId: string;
  visitId: string;
  path: string;
  sourceMessageId: string;
}): Promise<ValidateResult> {
  const r = await validateFieldPatch({
    userId: input.userId,
    visitId: input.visitId,
    path: input.path,
    sourceMessageId: input.sourceMessageId,
  });
  await markConflictResolved({
    messageId: input.sourceMessageId,
    path: input.path,
    decision: "kept_human",
  });
  return r;
}

/**
 * Met à jour `metadata.conflict_resolutions[path]` du message assistant
 * porteur pour signifier que le user a tranché. La carte conflit sera
 * filtrée out par `findActiveConflicts`.
 *
 * Lecture/écriture purement locale Dexie — pas de sync (la metadata
 * du message a déjà été synced avant l'arbitrage ; pour Phase 3 on
 * pourra enqueue un `update` op si besoin de cross-device sync de
 * l'arbitrage).
 */
async function markConflictResolved(input: {
  messageId: string;
  path: string;
  decision: "kept_human" | "took_ai";
}): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.messages, async () => {
    const m = await db.messages.get(input.messageId);
    if (!m) return;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const resolutions =
      typeof meta.conflict_resolutions === "object" &&
      meta.conflict_resolutions !== null
        ? { ...(meta.conflict_resolutions as Record<string, unknown>) }
        : {};
    resolutions[input.path] = input.decision;
    await db.messages.update(input.messageId, {
      metadata: { ...meta, conflict_resolutions: resolutions },
      local_updated_at: new Date().toISOString(),
    });
  });
}

// ===========================================================================
// Lot A — Validation/rejet d'insert_entries et custom_fields
// ===========================================================================

export interface InsertEntryOpInput {
  userId: string;
  visitId: string;
  /** Path absolu de la collection, ex: "heating.installations". */
  collection: string;
  /** UUID de l'entrée à valider/rejeter. */
  entryId: string;
  sourceMessageId?: string | null;
}

/**
 * Valide TOUS les Field<T> d'une entrée de collection (passe leur
 * validation_status à "validated"). Les keys techniques (id,
 * custom_fields, created_at, related_message_id) sont ignorées.
 */
export async function validateInsertEntry(
  input: InsertEntryOpInput,
): Promise<ValidateResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", reason: "no_state" };

  const next = clone(last.state);
  const collection = readArrayInState(next, input.collection);
  if (!Array.isArray(collection)) {
    return { status: "noop", reason: "collection_not_found" };
  }
  const entry = collection.find(
    (e) => e && typeof e === "object" && (e as { id?: string }).id === input.entryId,
  ) as Record<string, unknown> | undefined;
  if (!entry) return { status: "noop", reason: "entry_not_found" };

  const now = new Date().toISOString();
  let touched = 0;
  for (const [k, v] of Object.entries(entry)) {
    if (RESERVED_ENTRY_KEYS.has(k)) continue;
    if (!isFieldShape(v)) continue;
    const f = v as Field<unknown>;
    if (f.validation_status === "validated") continue;
    entry[k] = {
      ...f,
      validation_status: "validated",
      validated_at: now,
      validated_by: input.userId,
      updated_at: now,
    };
    touched += 1;
  }

  if (touched === 0) return { status: "noop", reason: "nothing_to_validate" };

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: input.sourceMessageId ?? null,
  });
  return { status: "ok", row };
}

/**
 * Supprime une entrée d'une collection. Conserve un audit léger dans
 * `metadata.rejected_inserts[]` du message porteur.
 */
export async function rejectInsertEntry(
  input: InsertEntryOpInput,
): Promise<ValidateResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", reason: "no_state" };

  const next = clone(last.state);
  const collection = readArrayInState(next, input.collection);
  if (!Array.isArray(collection)) {
    return { status: "noop", reason: "collection_not_found" };
  }
  const idx = collection.findIndex(
    (e) => e && typeof e === "object" && (e as { id?: string }).id === input.entryId,
  );
  if (idx < 0) return { status: "noop", reason: "entry_not_found" };

  collection.splice(idx, 1);

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: input.sourceMessageId ?? null,
  });

  if (input.sourceMessageId) {
    await appendRejectedAudit({
      messageId: input.sourceMessageId,
      kind: "insert",
      payload: { collection: input.collection, entry_id: input.entryId },
    });
  }
  return { status: "ok", row };
}

export interface CustomFieldOpInput {
  userId: string;
  visitId: string;
  /** Section top-level (ex: "heating", "envelope.murs"). */
  sectionPath: string;
  /** Clé du custom_field (ex: "co2_taux"). */
  fieldKey: string;
  sourceMessageId?: string | null;
}

/**
 * Valide un custom_field : passe son validation_status à "validated".
 */
export async function validateCustomField(
  input: CustomFieldOpInput,
): Promise<ValidateResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", reason: "no_state" };

  const next = clone(last.state);
  const list = readCustomFieldsAt(next, input.sectionPath);
  if (!list) return { status: "noop", reason: "section_not_found" };

  const cf = list.find((f) => (f as { field_key?: string }).field_key === input.fieldKey);
  if (!cf) return { status: "noop", reason: "custom_field_not_found" };
  if ((cf as { validation_status?: string }).validation_status === "validated") {
    return { status: "noop", reason: "already_validated" };
  }

  const now = new Date().toISOString();
  Object.assign(cf, {
    validation_status: "validated",
    validated_at: now,
    validated_by: input.userId,
    updated_at: now,
  });

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: input.sourceMessageId ?? null,
  });
  return { status: "ok", row };
}

/**
 * Supprime un custom_field de la section. Audit dans
 * `metadata.rejected_custom_fields[]` du message porteur.
 */
export async function rejectCustomField(
  input: CustomFieldOpInput,
): Promise<ValidateResult> {
  const last = await getLatestLocalJsonState(input.visitId);
  if (!last) return { status: "noop", reason: "no_state" };

  const next = clone(last.state);
  const list = readCustomFieldsAt(next, input.sectionPath);
  if (!list) return { status: "noop", reason: "section_not_found" };

  const idx = list.findIndex(
    (f) => (f as { field_key?: string }).field_key === input.fieldKey,
  );
  if (idx < 0) return { status: "noop", reason: "custom_field_not_found" };

  list.splice(idx, 1);

  const row = await appendJsonStateVersion({
    userId: input.userId,
    visitId: input.visitId,
    state: next,
    createdByMessageId: input.sourceMessageId ?? null,
  });

  if (input.sourceMessageId) {
    await appendRejectedAudit({
      messageId: input.sourceMessageId,
      kind: "custom_field",
      payload: { section_path: input.sectionPath, field_key: input.fieldKey },
    });
  }
  return { status: "ok", row };
}

// ---------------------------------------------------------------------------
// Internals Lot A
// ---------------------------------------------------------------------------

const RESERVED_ENTRY_KEYS = new Set([
  "id",
  "custom_fields",
  "created_at",
  "related_message_id",
]);

function isFieldShape(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return "value" in o && "source" in o && "validation_status" in o;
}

function readArrayInState(
  state: VisitJsonState,
  path: string,
): unknown[] | null {
  const segs = path.split(".");
  let cur: unknown = state;
  for (const s of segs) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[s];
  }
  return Array.isArray(cur) ? cur : null;
}

function readCustomFieldsAt(
  state: VisitJsonState,
  sectionPath: string,
): Array<Record<string, unknown>> | null {
  const segs = sectionPath.split(".");
  let cur: unknown = state;
  for (const s of segs) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[s];
  }
  if (!cur || typeof cur !== "object") return null;
  const list = (cur as Record<string, unknown>).custom_fields;
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : null;
}

async function appendRejectedAudit(input: {
  messageId: string;
  kind: "insert" | "custom_field";
  payload: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.messages, async () => {
    const m = await db.messages.get(input.messageId);
    if (!m) return;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const key =
      input.kind === "insert" ? "rejected_inserts" : "rejected_custom_fields";
    const arr = Array.isArray(meta[key])
      ? [...(meta[key] as unknown[])]
      : [];
    arr.push({ ...input.payload, rejected_at: new Date().toISOString() });
    await db.messages.update(input.messageId, {
      metadata: { ...meta, [key]: arr },
      local_updated_at: new Date().toISOString(),
    });
  });
}
