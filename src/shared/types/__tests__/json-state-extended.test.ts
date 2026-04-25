/**
 * Tests des sections étendues Phase 2 v2 (json-state.sections.ts).
 *
 * Vérifie : structure, defaults sections, custom_fields[], custom_observations,
 * schema_version=2, *_other libre, collections vides par défaut.
 */

import { describe, expect, it } from "vitest";
import {
  createInitialVisitJsonState,
  makeEmptyBuilding,
  makeEmptyCustomObservations,
  makeEmptyEcs,
  makeEmptyEnvelope,
  makeEmptyHeating,
  makeEmptyMeta,
  makeEmptyNotes,
  makeEmptyPathologies,
  makeEmptyPreconisations,
  VisitJsonStateSchema,
} from "@/shared/types";

const USER = "00000000-0000-0000-0000-00000000000a";
const VISIT = "11111111-1111-1111-1111-111111111111";

describe("schema_version", () => {
  it("createInitialVisitJsonState produit un state v2", () => {
    const s = createInitialVisitJsonState({
      visitId: VISIT,
      clientId: "c1",
      title: "T",
      thermicienId: USER,
    });
    expect(s.schema_version).toBe(2);
    expect(() => VisitJsonStateSchema.parse(s)).not.toThrow();
  });

  it("rejette schema_version=1 ou autre via z.literal(2)", () => {
    const s = createInitialVisitJsonState({
      visitId: VISIT,
      clientId: "c1",
      title: "T",
      thermicienId: USER,
    });
    const bad = { ...s, schema_version: 1 };
    expect(() => VisitJsonStateSchema.parse(bad)).toThrow();
  });
});

describe("sections — defaults vides", () => {
  it("makeEmptyMeta a needs_reclassification=false par défaut", () => {
    expect(makeEmptyMeta().needs_reclassification).toBe(false);
  });

  it("makeEmptyBuilding a custom_fields=[]", () => {
    expect(makeEmptyBuilding().custom_fields).toEqual([]);
  });

  it("makeEmptyEnvelope a 4 parts (murs/toiture/plancher_bas/ouvertures)", () => {
    const e = makeEmptyEnvelope();
    expect(e.murs).toBeDefined();
    expect(e.toiture).toBeDefined();
    expect(e.plancher_bas).toBeDefined();
    expect(e.ouvertures).toBeDefined();
    expect(e.custom_fields).toEqual([]);
  });

  it("makeEmptyHeating/Ecs : installations=[] custom_fields=[]", () => {
    expect(makeEmptyHeating().installations).toEqual([]);
    expect(makeEmptyHeating().custom_fields).toEqual([]);
    expect(makeEmptyEcs().installations).toEqual([]);
  });

  it("makeEmptyPathologies/Preconisations/Notes : items=[]", () => {
    expect(makeEmptyPathologies().items).toEqual([]);
    expect(makeEmptyPreconisations().items).toEqual([]);
    expect(makeEmptyNotes().items).toEqual([]);
  });

  it("makeEmptyCustomObservations : items=[] custom_fields=[]", () => {
    const co = makeEmptyCustomObservations();
    expect(co.items).toEqual([]);
    expect(co.custom_fields).toEqual([]);
  });
});

describe("*_other — convention libre (pas de validation Zod bloquante)", () => {
  it("building.wall_material_value='autre' sans wall_material_other → parse OK (UI-only)", () => {
    const s = createInitialVisitJsonState({
      visitId: VISIT,
      clientId: "c1",
      title: "T",
      thermicienId: USER,
    });
    s.building.wall_material_value = {
      value: "autre",
      source: "user",
      confidence: "high",
      updated_at: new Date().toISOString(),
      source_message_id: null,
    };
    // wall_material_other reste null → on n'attend PAS d'erreur Zod (UI-only)
    expect(() => VisitJsonStateSchema.parse(s)).not.toThrow();
  });
});

describe("custom_fields — array placeholder par défaut", () => {
  it("toutes les sections principales exposent un tableau custom_fields[]", () => {
    const s = createInitialVisitJsonState({
      visitId: VISIT,
      clientId: "c1",
      title: "T",
      thermicienId: USER,
    });
    expect(Array.isArray(s.building.custom_fields)).toBe(true);
    expect(Array.isArray(s.envelope.custom_fields)).toBe(true);
    expect(Array.isArray(s.heating.custom_fields)).toBe(true);
    expect(Array.isArray(s.ecs.custom_fields)).toBe(true);
    expect(Array.isArray(s.ventilation.custom_fields)).toBe(true);
    expect(Array.isArray(s.energy_production.custom_fields)).toBe(true);
    expect(Array.isArray(s.pathologies.custom_fields)).toBe(true);
    expect(Array.isArray(s.preconisations.custom_fields)).toBe(true);
  });
});
