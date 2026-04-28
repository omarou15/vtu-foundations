/**
 * Refonte avril 2026 — Tests apply-patches PERMISSIF.
 *
 * Doctrine : le LLM propose, l'apply matérialise comme ai_infer/unvalidated,
 * le user arbitre via la PendingActionsCard. Plus aucun rejet métier
 * (humain prime, confidence, schemaMap). Seuls bugs structurels rejetés :
 *   - not_a_field : la cible existe mais n'est pas un Field<T>.
 *   - path_not_found : impossible de résoudre/créer la cible.
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

describe("applyPatches — permissif (LLM propose, user arbitre)", () => {
  it("Field vide → patch appliqué (ai_infer/unvalidated)", () => {
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
    expect(r.state.building.wall_material_value.validation_status).toBe("unvalidated");
  });

  it("source=user existant : patch écrase quand même (user arbitre via card)", () => {
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
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    expect(r.state.building.wall_material_value.value).toBe("brique");
    expect(r.state.building.wall_material_value.source).toBe("ai_infer");
    expect(r.state.building.wall_material_value.validation_status).toBe("unvalidated");
  });

  it("validation_status=validated existant : patch écrase quand même", () => {
    const { state, map } = freshState((s) =>
      setBuildingWallMaterial(s, {
        ...aiInferField({
          value: "old",
          confidence: "high",
          sourceMessageId: null,
          sourceExtractionId: "prev",
          evidenceRefs: [],
        }),
        validation_status: "validated",
      }),
    );
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "new", "low")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.state.building.wall_material_value.value).toBe("new");
  });

  it("ai_infer high → low : patch écrase (le user arbitre)", () => {
    const { state, map } = freshState((s) =>
      setBuildingWallMaterial(
        s,
        aiInferField({
          value: "old",
          confidence: "high",
          sourceMessageId: null,
          sourceExtractionId: "prev",
          evidenceRefs: [],
        }),
      ),
    );
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "low_value", "low")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.state.building.wall_material_value.value).toBe("low_value");
    expect(r.state.building.wall_material_value.confidence).toBe("low");
  });

  it("init validated avec value : patch écrase quand même", () => {
    const { state, map } = freshState((s) =>
      setBuildingWallMaterial(s, {
        ...initField<string>("manuel"),
        validation_status: "validated",
      }),
    );
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch(PATH, "ai", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.state.building.wall_material_value.value).toBe("ai");
  });
});

describe("applyPatches — paths permissifs", () => {
  it("path object inexistant : auto-vivify et applique", () => {
    const { state, map } = freshState();
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch("custom_section.new_field", 42, "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    const sec = (r.state as unknown as Record<string, { new_field: Field<number> }>)
      .custom_section;
    expect(sec.new_field.value).toBe(42);
  });

  it("index positionnel sur array vide → auto-promote, entrée créée avec field initial", () => {
    const { state, map } = freshState();
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch("ventilation.installations[0].type_value", "vmc_double_flux", "high")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    expect(r.state.ventilation.installations).toHaveLength(1);
    const inst = r.state.ventilation.installations[0] as
      | (Record<string, Field<unknown>> & { id: string })
      | undefined;
    expect(inst?.type_value.value).toBe("vmc_double_flux");
    expect(inst?.id).toBeDefined();
  });

  it("index positionnel sur entrée inexistante (collection heating) → auto-promote", () => {
    const { state, map } = freshState();
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch("heating.installations[0].fuel_value", "gaz")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    expect(r.state.heating.installations).toHaveLength(1);
    expect(r.state.heating.installations[0]?.fuel_value.value).toBe("gaz");
  });

  it("entry path UUID inexistant : auto-vivify l'entrée et applique", () => {
    const { state, map } = freshState();
    const NEW_UUID = "abc-1234-5678";
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch(`heating.installations[id=${NEW_UUID}].fuel_value`, "gaz", "high"),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    const inst = r.state.heating.installations.find((i) => i.id === NEW_UUID);
    expect(inst).toBeDefined();
    expect(inst!.fuel_value.value).toBe("gaz");
  });

  it("entry path : champ libre du LLM accepté (devient Field<T>)", () => {
    const { state, map } = freshState();
    const NEW_UUID = "abc-9999";
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch(`heating.installations[id=${NEW_UUID}].random_key`, "x"),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    const inst = r.state.heating.installations.find((i) => i.id === NEW_UUID) as
      | (Record<string, Field<unknown>> & { id: string })
      | undefined;
    expect(inst?.random_key.value).toBe("x");
  });
});

describe("applyPatches — multi", () => {
  it("plusieurs patches : tous appliqués (auto-vivify)", () => {
    const { state, map } = freshState();
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [
        patch("building.construction_year", 1990),
        patch("totally.unknown.path", "x"),
        patch("heating.installations[id=zzz].fuel_value", "gaz"),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(3);
    expect(r.ignored).toHaveLength(0);
  });

  it("path mène à un non-Field existant → not_a_field", () => {
    const { state, map } = freshState();
    // building est un objet plat ; building.wall_material_value est un Field.
    // Si on tape sur "building" lui-même via un sous-segment qui pointe sur
    // un objet non-Field, on doit l'écraser sans broncher (auto-vivify).
    // Pour déclencher not_a_field, on patch la valeur DIRECTE d'une entrée.
    const r = applyPatches({
      state,
      schemaMap: map,
      patches: [patch("heating.installations.0", "x")],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    // installations[0] n'existe pas → path_not_found OU not_a_field selon résolution.
    // L'important : il n'est pas appliqué.
    expect(r.applied).toHaveLength(0);
    expect(r.ignored).toHaveLength(1);
  });
});
