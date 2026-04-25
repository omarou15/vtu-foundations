/**
 * Tests de la migration JSON state v1 → v2 (json-state.migrate.ts).
 *
 * Couvre : mapping building_type, immeuble→null+flag, idempotence (rerun
 * sur v2 = no-op), calculation_method null+flag, préservation meta v1,
 * collections initialisées à [].
 */

import { describe, expect, it } from "vitest";
import {
  isAlreadyMigrated,
  migrateVisitJsonState,
} from "@/shared/types/json-state.migrate";

function v1Raw(buildingType: string | null) {
  const now = "2026-01-01T00:00:00.000Z";
  const f = (v: unknown) => ({
    value: v,
    source: "user",
    confidence: "high",
    updated_at: now,
    source_message_id: null,
  });
  return {
    schema_version: 1,
    meta: {
      visit_id: f("11111111-1111-1111-1111-111111111111"),
      client_id: f("c1"),
      title: f("T"),
      address: f("12 rue Test"),
      visit_date: { value: null, source: "init", confidence: null, updated_at: now, source_message_id: null },
      thermicien_id: f("00000000-0000-0000-0000-00000000000a"),
      thermicien_name: f("Omar"),
      client_name: { value: null, source: "init", confidence: null, updated_at: now, source_message_id: null },
      client_phone: { value: null, source: "init", confidence: null, updated_at: now, source_message_id: null },
      client_email: { value: null, source: "init", confidence: null, updated_at: now, source_message_id: null },
      ...(buildingType !== null ? { building_type: f(buildingType) } : {}),
    },
  };
}

describe("migrateVisitJsonState — mapping building_type → building_typology", () => {
  it("maison_individuelle → maison", () => {
    const m = migrateVisitJsonState(v1Raw("maison_individuelle"));
    expect(m.meta.building_typology.value).toBe("maison");
    expect(m.schema_version).toBe(2);
  });

  it("immeuble → null + needs_reclassification=true", () => {
    const m = migrateVisitJsonState(v1Raw("immeuble"));
    expect(m.meta.building_typology.value).toBeNull();
    expect(m.meta.needs_reclassification).toBe(true);
  });

  it("tertiaire → tertiaire", () => {
    const m = migrateVisitJsonState(v1Raw("tertiaire"));
    expect(m.meta.building_typology.value).toBe("tertiaire");
  });

  it("building_type absent → typology vide + flag", () => {
    const m = migrateVisitJsonState(v1Raw(null));
    expect(m.meta.building_typology.value).toBeNull();
    expect(m.meta.needs_reclassification).toBe(true);
  });
});

describe("migrateVisitJsonState — idempotence", () => {
  it("re-run sur un state déjà v2 = no-op (pas de double migration)", () => {
    const m1 = migrateVisitJsonState(v1Raw("maison_individuelle"));
    const m2 = migrateVisitJsonState(m1);
    expect(m2.schema_version).toBe(2);
    expect(m2.meta.building_typology.value).toBe("maison");
  });

  it("isAlreadyMigrated reconnaît v2", () => {
    const m1 = migrateVisitJsonState(v1Raw("maison_individuelle"));
    expect(isAlreadyMigrated(m1)).toBe(true);
    expect(isAlreadyMigrated({ schema_version: 1 })).toBe(false);
  });
});

describe("migrateVisitJsonState — collections + meta complémentaires", () => {
  it("initialise toutes les nouvelles collections à []", () => {
    const m = migrateVisitJsonState(v1Raw("maison_individuelle"));
    expect(m.heating.installations).toEqual([]);
    expect(m.ecs.installations).toEqual([]);
    expect(m.pathologies.items).toEqual([]);
    expect(m.preconisations.items).toEqual([]);
    expect(m.notes.items).toEqual([]);
    expect(m.custom_observations.items).toEqual([]);
  });

  it("calculation_method reste null + needs_reclassification=true", () => {
    const m = migrateVisitJsonState(v1Raw("maison_individuelle"));
    expect(m.meta.calculation_method.value).toBeNull();
    expect(m.meta.needs_reclassification).toBe(true);
  });

  it("préserve les champs meta v1 (address, title)", () => {
    const m = migrateVisitJsonState(v1Raw("maison_individuelle"));
    expect(m.meta.address.value).toBe("12 rue Test");
    expect(m.meta.title.value).toBe("T");
  });

  it("external_source = 'manual' après migration", () => {
    const m = migrateVisitJsonState(v1Raw("maison_individuelle"));
    expect(m.meta.external_source.value).toBe("manual");
  });
});

describe("migrateVisitJsonState — schema_version inconnue", () => {
  it("throw si schema_version absent ou ≠ 1/2", () => {
    expect(() => migrateVisitJsonState({ schema_version: 99, meta: {} })).toThrow();
    expect(() => migrateVisitJsonState({ meta: {} })).toThrow();
  });
});
