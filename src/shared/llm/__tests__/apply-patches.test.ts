/**
 * It. 11.6 — Tests apply-patches (gates de sécurité IA + path strict).
 *
 * Couvre la doctrine LLM-propose/user-valide :
 *  - Path doit être ∈ schemaMap.object_fields ou collection[id=…].field.
 *  - Index positionnel `[N]` REJETÉ (positional_index_forbidden).
 *  - Path inventé REJETÉ (path_not_in_schema).
 *  - validation_status="validated" → IGNORÉ.
 *  - source ∈ {user, voice, photo_ocr, import} ET value !== null → IGNORÉ.
 *  - source="ai_infer" + unvalidated : gate confidence (Correction A v2.2)
 *    - low → high : OVERWRITE.
 *    - high → low : IGNORÉ.
 *    - medium → medium : IGNORÉ (égalité, 1re extraction prime).
 *  - value=null → patch OK.
 *
 * Stratégie : on utilise un état réel `createInitialVisitJsonState` et un
 * path réel (`building.wall_material_value`) pour exercer tous les gates
 * sur un Field<string> fixe ; les gates ne dépendent pas du path précis.
 */

import { describe, expect, it } from "vitest";
import { applyPatches } from "@/shared/llm/apply/apply-patches";
import {
  aiInferField,
  emptyField,
  initField,
  type Field,
} from "@/shared/types/json-state.field";
import {
  buildSchemaMap,
  type SchemaMap,
} from "@/shared/types/json-state.schema-map";
import {
  createInitialVisitJsonState,
  type VisitJsonState,
} from "@/shared/types";
import type { AiFieldPatch } from "@/shared/llm/types";

const EXTRACTION = "ext-1";
const MESSAGE = "msg-1";
const VISIT_ID = "11111111-1111-1111-1111-111111111111";
const THERMICIEN_ID = "22222222-2222-2222-2222-222222222222";

/** Path utilisé par tous les tests de gates : meta.title est un Field<string>. */
const PATH = "building.wall_material_value";

function freshState(
  override?: (s: VisitJsonState) => void,
): { state: VisitJsonState; map: SchemaMap } {
  const state = createInitialVisitJsonState({
    visitId: VISIT_ID,
    clientId: "c1",
    title: "VT",
    thermicienId: THERMICIEN_ID,
  });
  if (override) override(state);
  const map = buildSchemaMap(state);
  return { state, map };
}

function patch(
  path: string,
  value: unknown,
  confidence: AiFieldPatch["confidence"] = "medium",
): AiFieldPatch {
  return { path, value, confidence, evidence_refs: [MESSAGE] };
}

function setBuildingWallMaterial(s: VisitJsonState, f: Field<string>): void {
  s.building.wall_material_value = f;
}

describe("applyPatches — gates IA", () => {
  it("Field vide (source=init, value=null) → patch appliqué", () => {
    const { state, map } = freshState();
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "brique", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    expect(r.state.building.wall_material_value.value).toBe("brique");
    expect(r.state.building.wall_material_value.source).toBe("ai_infer");
    expect(r.state.building.wall_material_value.confidence).toBe("high");
  });

  it("source=user avec value → IGNORÉ (human_source_prime)", () => {
    const { state, map } = freshState((s) =>
      setBuildingWallMaterial(s, {
        ...emptyField<string>(),
        value: "pierre",
        source: "user",
      }),
    );
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "brique", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("human_source_prime");
  });

  it.each(["voice", "photo_ocr", "import"] as const)(
    "source=%s avec value → IGNORÉ",
    (src) => {
      const { state, map } = freshState((s) =>
        setBuildingWallMaterial(s, {
          ...emptyField<string>(),
          value: "pierre",
          source: src,
        }),
      );
      const r = applyPatches({
        state,
        schemaMap: map,
        patches: [patch(PATH, "brique", "high")],
        sourceMessageId: MESSAGE,
        sourceExtractionId: EXTRACTION,
      });
      expect(r.applied).toHaveLength(0);
      expect(r.ignored[0]?.reason).toBe("human_source_prime");
    },
  );

  it("validation_status=validated → IGNORÉ même si ai_infer", () => {
    const f = aiInferField({
      value: "pierre",
      confidence: "low",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    f.validation_status = "validated";
    const { state, map } = freshState((s) => setBuildingWallMaterial(s, f));
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "brique", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("validated_by_human");
  });

  it("ai_infer unvalidated low → high : OVERWRITE", () => {
    const f = aiInferField({
      value: "pierre",
      confidence: "low",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    const { state, map } = freshState((s) => setBuildingWallMaterial(s, f));
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "brique", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.state.building.wall_material_value.value).toBe("brique");
    expect(r.state.building.wall_material_value.confidence).toBe("high");
  });

  it("ai_infer unvalidated high → low : IGNORÉ", () => {
    const f = aiInferField({
      value: "brique",
      confidence: "high",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    const { state, map } = freshState((s) => setBuildingWallMaterial(s, f));
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "pierre", "low")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe(
      "lower_or_equal_confidence_than_current",
    );
  });

  it("ai_infer unvalidated medium → medium : IGNORÉ (égalité)", () => {
    const f = aiInferField({
      value: "brique",
      confidence: "medium",
      sourceMessageId: MESSAGE,
      sourceExtractionId: "old",
      evidenceRefs: [],
    });
    const { state, map } = freshState((s) => setBuildingWallMaterial(s, f));
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "pierre", "medium")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe(
      "lower_or_equal_confidence_than_current",
    );
  });

  it("init validated avec value → IGNORÉ via validated_by_human", () => {
    // initField produit validation_status='validated' → bloqué
    const { state, map } = freshState((s) =>
      setBuildingWallMaterial(s, initField<string>("brique")),
    );
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "pierre", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("validated_by_human");
  });
});

describe("applyPatches — paths stricts (It. 11.6)", () => {
  it("path inexistant → REJETÉ avec path_not_in_schema", () => {
    const { state, map } = freshState();
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch("nope.fictif", 42)],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("path_not_in_schema");
  });

  it("index positionnel installations[0] → REJETÉ avec positional_index_forbidden", () => {
    const { state, map } = freshState();
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch("heating.installations[0].type_value", "chaudiere_gaz", "high"),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("positional_index_forbidden");
  });

  it("entry path UUID inexistant → REJETÉ avec entry_not_found", () => {
    const { state, map } = freshState();
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch(
          `heating.installations[id=${fakeId}].type_value`,
          "PAC",
          "high",
        ),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("entry_not_found");
  });

  it("entry path UUID valide → patch sur l'entrée modifié", () => {
    const entryId = "33333333-3333-3333-3333-333333333333";
    const { state } = freshState();
    state.heating.installations.push({
      id: entryId,
      type_value: emptyField<string>(),
      type_other: emptyField<string>(),
      fuel_value: emptyField<string>(),
      fuel_other: emptyField<string>(),
      power_kw: emptyField<number>(),
      installation_year: emptyField<number>(),
      brand: emptyField<string>(),
      efficiency_pct: emptyField<number>(),
      custom_fields: [],
    });
    const map = buildSchemaMap(state);
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch(
          `heating.installations[id=${entryId}].type_value`,
          "PAC air-eau",
          "high",
        ),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.state.heating.installations[0]?.type_value.value).toBe(
      "PAC air-eau",
    );
    expect(r.state.heating.installations[0]?.type_value.source).toBe("ai_infer");
  });

  it("entry path : champ absent du collection.item_fields → REJETÉ", () => {
    const entryId = "33333333-3333-3333-3333-333333333333";
    const { state } = freshState();
    state.heating.installations.push({
      id: entryId,
      type_value: emptyField<string>(),
      type_other: emptyField<string>(),
      fuel_value: emptyField<string>(),
      fuel_other: emptyField<string>(),
      power_kw: emptyField<number>(),
      installation_year: emptyField<number>(),
      brand: emptyField<string>(),
      efficiency_pct: emptyField<number>(),
      custom_fields: [],
    });
    const map = buildSchemaMap(state);
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch(
          `heating.installations[id=${entryId}].champ_invente`,
          "x",
          "high",
        ),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0]?.reason).toBe("field_not_in_collection_item");
  });
});

describe("applyPatches — multi", () => {
  it("plusieurs patches : applied et ignored coexistent", () => {
    const { state, map } = freshState((s) =>
      setBuildingWallMaterial(s, {
        ...emptyField<string>(),
        value: "pierre",
        source: "user", // bloqué (humain prime)
      }),
    );
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch(PATH, "brique", "high"), // bloqué human_source_prime
        patch("building.construction_year", 1990, "high"), // appliqué
        patch("nope.fictif", "x", "high"), // path_not_in_schema
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]?.path).toBe("building.construction_year");
    expect(r.ignored).toHaveLength(2);
  });
});
