/**
 * It. 10 — Tests apply-patches (gates de sécurité IA).
 *
 * Couvre la doctrine LLM-propose/user-valide :
 *  - validation_status="validated" → IGNORÉ.
 *  - source ∈ {user, voice, photo_ocr, import} ET value !== null → IGNORÉ.
 *  - source="ai_infer" + unvalidated : gate confidence (Correction A v2.2)
 *    - low → high : OVERWRITE.
 *    - high → low : IGNORÉ.
 *    - medium → medium : IGNORÉ (égalité, 1re extraction prime).
 *  - value=null → patch OK.
 */

import { describe, expect, it } from "vitest";
import { applyPatches } from "@/shared/llm/apply/apply-patches";
import {
  aiInferField,
  emptyField,
  initField,
} from "@/shared/types/json-state.field";
import type { Field } from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import type { AiFieldPatch } from "@/shared/llm/types";

const EXTRACTION = "ext-1";
const MESSAGE = "msg-1";

function makeMinimalState(
  overrideHeating: Record<string, Field<unknown>>,
): VisitJsonState {
  // On ne valide pas le state contre le schéma Zod ici : on patch un champ
  // dans heating et on lit le résultat. apply-patches walk le path "."
  // sans validation, donc un Field<T> nu suffit.
  const baseHeating = { fuel_type: emptyField<string>() };
  const merged = { ...baseHeating, ...overrideHeating };
  return {
    schema_version: 2,
    meta: {} as VisitJsonState["meta"],
    building: {} as VisitJsonState["building"],
    envelope: {} as VisitJsonState["envelope"],
    heating: merged as unknown as VisitJsonState["heating"],
    ecs: {} as VisitJsonState["ecs"],
    ventilation: {} as VisitJsonState["ventilation"],
    energy_production: {} as VisitJsonState["energy_production"],
    industriel_processes: {} as VisitJsonState["industriel_processes"],
    tertiaire_hors_cvc: {} as VisitJsonState["tertiaire_hors_cvc"],
    pathologies: {} as VisitJsonState["pathologies"],
    preconisations: {} as VisitJsonState["preconisations"],
    notes: {} as VisitJsonState["notes"],
    custom_observations: {} as VisitJsonState["custom_observations"],
  };
}

function patch(
  path: string,
  value: unknown,
  confidence: AiFieldPatch["confidence"] = "medium",
): AiFieldPatch {
  return { path, value, confidence, evidence_refs: [MESSAGE] };
}

describe("applyPatches — gates IA", () => {
  it("Field vide (source=init, value=null) → patch appliqué", () => {
    const state = makeMinimalState({});
    const r = applyPatches({
      state,
      patches: [patch("heating.fuel_type", "gaz", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    const f = (r.state.heating as unknown as Record<string, Field<string>>)
      .fuel_type;
    expect(f.value).toBe("gaz");
    expect(f.source).toBe("ai_infer");
    expect(f.confidence).toBe("high");
  });

  it("source=user avec value → IGNORÉ (human_source_prime)", () => {
    const state = makeMinimalState({
      fuel_type: {
        ...emptyField<string>(),
        value: "fioul",
        source: "user",
      },
    });
    const r = applyPatches({
      state,
      patches: [patch("heating.fuel_type", "gaz", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("human_source_prime");
  });

  it.each(["voice", "photo_ocr", "import"] as const)(
    "source=%s avec value → IGNORÉ",
    (src) => {
      const state = makeMinimalState({
        fuel_type: {
          ...emptyField<string>(),
          value: "fioul",
          source: src,
        },
      });
      const r = applyPatches({
        state,
        patches: [patch("heating.fuel_type", "gaz", "high")],
        sourceMessageId: MESSAGE,
        sourceExtractionId: EXTRACTION,
      });
      expect(r.applied).toHaveLength(0);
      expect(r.ignored[0]?.reason).toBe("human_source_prime");
    },
  );

  it("validation_status=validated → IGNORÉ même si ai_infer", () => {
    const f = aiInferField({
      value: "fioul",
      confidence: "low",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    f.validation_status = "validated";
    const state = makeMinimalState({ fuel_type: f });
    const r = applyPatches({
      state,
      patches: [patch("heating.fuel_type", "gaz", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("validated_by_human");
  });

  it("ai_infer unvalidated low → high : OVERWRITE", () => {
    const f = aiInferField({
      value: "fioul",
      confidence: "low",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    const state = makeMinimalState({ fuel_type: f });
    const r = applyPatches({
      state,
      patches: [patch("heating.fuel_type", "gaz", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    const after = (r.state.heating as unknown as Record<string, Field<string>>)
      .fuel_type;
    expect(after.value).toBe("gaz");
    expect(after.confidence).toBe("high");
  });

  it("ai_infer unvalidated high → low : IGNORÉ", () => {
    const f = aiInferField({
      value: "gaz",
      confidence: "high",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    const state = makeMinimalState({ fuel_type: f });
    const r = applyPatches({
      state,
      patches: [patch("heating.fuel_type", "fioul", "low")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("lower_or_equal_confidence_than_current");
  });

  it("ai_infer unvalidated medium → medium : IGNORÉ (égalité)", () => {
    const f = aiInferField({
      value: "gaz",
      confidence: "medium",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    const state = makeMinimalState({ fuel_type: f });
    const r = applyPatches({
      state,
      patches: [patch("heating.fuel_type", "fioul", "medium")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("lower_or_equal_confidence_than_current");
  });

  it("init validated avec value → IGNORÉ via validated_by_human", () => {
    // initField produit validation_status='validated' → bloqué
    const state = makeMinimalState({ fuel_type: initField<string>("gaz") });
    const r = applyPatches({
      state,
      patches: [patch("heating.fuel_type", "fioul", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("validated_by_human");
  });

  it("path inexistant → ignored path_not_found", () => {
    const state = makeMinimalState({});
    const r = applyPatches({
      state,
      patches: [patch("nope.field", 42)],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(["path_not_found", "not_a_field"]).toContain(r.ignored[0]?.reason);
  });

  it("plusieurs patches : applied et ignored coexistent", () => {
    const state = makeMinimalState({
      fuel_type: {
        ...emptyField<string>(),
        value: "fioul",
        source: "user", // bloqué
      },
    });
    const r = applyPatches({
      state,
      patches: [
        patch("heating.fuel_type", "gaz", "high"),
        patch("heating.unknown", "x", "high"),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored).toHaveLength(2);
  });
});
