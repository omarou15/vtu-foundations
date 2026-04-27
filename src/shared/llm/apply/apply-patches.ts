/**
 * apply-patches : applique les patches IA sur un VisitJsonState (clone).
 *
 * Gates (corrections 1-7 + A v2.2) :
 *  - validation_status === "validated" → IGNORÉ (humain prime, garde-fou).
 *  - source ∈ {user, voice, photo_ocr, import} ET value !== null → IGNORÉ.
 *  - source === "ai_infer" + validation_status === "unvalidated" :
 *      - si score(cur.confidence) >= score(patch.confidence) - 0.1
 *        → IGNORÉ (lower_or_equal_confidence_than_current).
 *      - sinon overwrite OK (un patch high peut écraser un low/medium plus
 *        ancien ; égalité bloque pour préserver la 1re extraction).
 *  - source === "init" / "ai_infer" avec value === null → patch OK.
 *
 * Sortie : nouveau state (immutable) + liste des patches effectivement
 * appliqués + raisons d'ignorance pour audit/UI.
 */

import {
  aiInferField,
  type Field,
  type FieldConfidence,
} from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import type { AiFieldPatch } from "../types";

export interface ApplyPatchesInput {
  state: VisitJsonState;
  patches: AiFieldPatch[];
  sourceMessageId: string | null;
  sourceExtractionId: string;
}

export interface ApplyPatchesResult {
  state: VisitJsonState;
  applied: Array<{ path: string }>;
  ignored: Array<{ path: string; reason: string }>;
}

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
    const segments = patch.path.split(".");
    if (segments.length < 2) {
      ignored.push({ path: patch.path, reason: "invalid_path" });
      continue;
    }

    const target = walk(next, segments);
    if (!target.parent || !target.key) {
      ignored.push({ path: patch.path, reason: "path_not_found" });
      continue;
    }
    const cur = target.parent[target.key] as Field<unknown> | undefined;
    if (!cur || typeof cur !== "object" || !("value" in cur)) {
      ignored.push({ path: patch.path, reason: "not_a_field" });
      continue;
    }

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

    // Correction A v2.2 : gate confidence sur ai_infer + unvalidated.
    if (
      cur.source === "ai_infer" &&
      cur.validation_status === "unvalidated" &&
      cur.value !== null &&
      cur.value !== undefined
    ) {
      if (confidenceScore(cur.confidence) >= confidenceScore(patch.confidence) - 0.1) {
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

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function walk(
  root: Record<string, unknown>,
  segments: string[],
): { parent: Record<string, unknown> | null; key: string | null } {
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
