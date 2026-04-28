/**
 * It. 11.6 — Tests applyExtractResult (orchestrateur des 3 verbes).
 *
 * Couvre le flux end-to-end : un seul call LLM peut produire à la fois
 * des patches (set_field), insert_entries, et custom_fields. L'orchestrateur
 * doit les enchaîner correctement et compter les opérations appliquées.
 */

import { describe, expect, it } from "vitest";
import { applyExtractResult } from "@/shared/llm/apply/apply-extract-result";
import {
  buildSchemaMap,
} from "@/shared/types/json-state.schema-map";
import {
  createInitialVisitJsonState,
  type VisitJsonState,
} from "@/shared/types";

const EXTRACTION = "ext-1";
const MESSAGE = "msg-1";

function freshState(): VisitJsonState {
  return createInitialVisitJsonState({
    visitId: "11111111-1111-1111-1111-111111111111",
    clientId: "c1",
    title: "VT",
    thermicienId: "22222222-2222-2222-2222-222222222222",
  });
}

describe("applyExtractResult — orchestrateur 3 verbes", () => {
  it("flux mixte : 1 patch + 1 insert + 1 custom_field → tous appliqués, 1 nouvelle version", () => {
    const state = freshState();
    const schemaMap = buildSchemaMap(state);
    const out = applyExtractResult({
      state,
      schemaMap,
      patches: [
        {
          path: "building.construction_year",
          value: 1990,
          confidence: "high",
          evidence_refs: [MESSAGE],
        },
      ],
      insertEntries: [
        {
          collection: "heating.installations",
          fields: { type_value: "PAC air-eau", power_kw: 8 },
          confidence: "medium",
          evidence_refs: [MESSAGE],
        },
      ],
      customFields: [
        {
          section_path: "building",
          field_key: "annee_renovation",
          label_fr: "Année de rénovation",
          value: 2015,
          value_type: "number",
          unit: null,
          confidence: "medium",
          evidence_refs: [MESSAGE],
        },
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });

    expect(out.totalApplied).toBe(3);
    expect(out.patches.applied).toHaveLength(1);
    expect(out.insertEntries.applied).toHaveLength(1);
    expect(out.customFields.applied).toHaveLength(1);

    expect(out.state.building.construction_year.value).toBe(1990);
    expect(out.state.heating.installations[0]?.type_value.value).toBe(
      "PAC air-eau",
    );
    expect(
      out.state.building.custom_fields.some(
        (cf) => cf.field_key === "annee_renovation",
      ),
    ).toBe(true);
  });

  it("flux vide → totalApplied = 0, state inchangé structurellement", () => {
    const state = freshState();
    const schemaMap = buildSchemaMap(state);
    const out = applyExtractResult({
      state,
      schemaMap,
      patches: [],
      insertEntries: [],
      customFields: [],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });

    expect(out.totalApplied).toBe(0);
    expect(out.state.heating.installations).toHaveLength(0);
    expect(out.state.building.custom_fields).toEqual([]);
  });

  it("1 patch valide + 1 patch invalide (positional) + 1 insert valide", () => {
    const state = freshState();
    const schemaMap = buildSchemaMap(state);
    const out = applyExtractResult({
      state,
      schemaMap,
      patches: [
        {
          path: "building.construction_year",
          value: 1990,
          confidence: "high",
          evidence_refs: [],
        },
        {
          path: "heating.installations[0].type_value",
          value: "x",
          confidence: "high",
          evidence_refs: [],
        },
      ],
      insertEntries: [
        {
          collection: "heating.installations",
          fields: { type_value: "PAC" },
          confidence: "medium",
          evidence_refs: [],
        },
      ],
      customFields: [],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });

    expect(out.totalApplied).toBe(2); // 1 patch + 1 insert
    expect(out.patches.applied).toHaveLength(1);
    expect(out.patches.ignored).toHaveLength(1);
    expect(out.patches.ignored[0]?.reason).toBe("positional_index_forbidden");
    expect(out.insertEntries.applied).toHaveLength(1);
  });

  it("schemaMap reflète l'état initial : un patch sur entrée pré-existante doit utiliser [id=…]", () => {
    const state = freshState();
    // Aucun heating.installations → patches sur entry forcément invalides
    const schemaMap = buildSchemaMap(state);
    const out = applyExtractResult({
      state,
      schemaMap,
      patches: [
        // L'IA doit d'abord faire un insert_entry, pas un set_field
        {
          path: "heating.installations[id=fake-uuid].type_value",
          value: "PAC",
          confidence: "high",
          evidence_refs: [],
        },
      ],
      insertEntries: [],
      customFields: [],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });

    expect(out.totalApplied).toBe(0);
    expect(out.patches.ignored[0]?.reason).toBe("entry_not_found");
  });
});
