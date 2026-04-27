/**
 * apply-patches : applique les patches IA sur un VisitJsonState (clone).
 *
 * Gates (corrections 1-7 + A) :
 *  - validation_status === "validated" → IGNORÉ (humain prime, garde-fou).
 *  - source ∈ {user, voice, photo_ocr, import} ET value !== null → IGNORÉ.
 *  - source === "ai_infer" OU source === "init" avec value === null → patch OK.
 *
 * Sortie : nouveau state (immutable) + liste des patches effectivement
 * appliqués + raisons d'ignorance pour audit/UI.
 */

import {
  aiInferField,
  type Field,
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
