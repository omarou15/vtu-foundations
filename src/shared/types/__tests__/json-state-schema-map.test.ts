/**
 * Tests buildSchemaMap (It. 11.6).
 *
 * Vérifie :
 *   - object_fields liste tous les Field<T> à shape fixe
 *   - object_fields exclut les Field<T> à l'intérieur des collections
 *   - collections expose les item_fields (sans id, custom_fields, etc.)
 *   - current_entries reflète bien les UUIDs présents dans le state
 *   - parseEntryPath / isPositionalIndexPath / isKnownObjectFieldPath
 */

import { describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  buildSchemaMap,
  isKnownObjectFieldPath,
  isPositionalIndexPath,
  parseEntryPath,
} from "@/shared/types/json-state.schema-map";
import { createInitialVisitJsonState, type VisitJsonState } from "@/shared/types";
import { emptyField, initField } from "@/shared/types/json-state.field";

const VISIT_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "client-1";
const THERMICIEN_ID = "22222222-2222-2222-2222-222222222222";

function freshState(): VisitJsonState {
  return createInitialVisitJsonState({
    visitId: VISIT_ID,
    clientId: CLIENT_ID,
    title: "VT test",
    thermicienId: THERMICIEN_ID,
  });
}

describe("buildSchemaMap — object_fields", () => {
  it("inclut les Field<T> de meta", () => {
    const map = buildSchemaMap(freshState());
    expect(map.object_fields).toContain("meta.visit_id");
    expect(map.object_fields).toContain("meta.title");
    expect(map.object_fields).toContain("meta.address");
    expect(map.object_fields).toContain("meta.building_typology");
  });

  it("inclut les Field<T> de building", () => {
    const map = buildSchemaMap(freshState());
    expect(map.object_fields).toContain("building.construction_year");
    expect(map.object_fields).toContain("building.surface_habitable_m2");
    expect(map.object_fields).toContain("building.wall_material_value");
    expect(map.object_fields).toContain("building.wall_material_other");
  });

  it("inclut les Field<T> imbriqués de envelope (sous-objets murs/toiture/…)", () => {
    const map = buildSchemaMap(freshState());
    expect(map.object_fields).toContain("envelope.murs.material_value");
    expect(map.object_fields).toContain("envelope.murs.insulation_value");
    expect(map.object_fields).toContain("envelope.toiture.material_value");
    expect(map.object_fields).toContain("envelope.plancher_bas.insulation_value");
    expect(map.object_fields).toContain("envelope.ouvertures.insulation_value");
  });

  it("EXCLUT le scalaire boolean meta.needs_reclassification", () => {
    const map = buildSchemaMap(freshState());
    expect(map.object_fields).not.toContain("meta.needs_reclassification");
  });

  it("EXCLUT schema_version (scalaire racine)", () => {
    const map = buildSchemaMap(freshState());
    expect(map.object_fields).not.toContain("schema_version");
  });

  it("EXCLUT les Field internes aux collections (non listés en object_fields)", () => {
    const state = freshState();
    state.heating.installations.push({
      id: uuidv4(),
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
    // Aucun Field interne à une collection ne doit apparaître en object_fields.
    expect(
      map.object_fields.some((p) => p.startsWith("heating.installations")),
    ).toBe(false);
  });

  it("EXCLUT les arrays custom_fields[] (mécanisme parallèle)", () => {
    const map = buildSchemaMap(freshState());
    expect(
      map.object_fields.some((p) => p.endsWith("custom_fields")),
    ).toBe(false);
  });
});

describe("buildSchemaMap — collections", () => {
  it("liste les 10 collections connues du registre", () => {
    const map = buildSchemaMap(freshState());
    expect(Object.keys(map.collections).sort()).toEqual(
      [
        "custom_observations.items",
        "ecs.installations",
        "energy_production.installations",
        "heating.installations",
        "industriel_processes.installations",
        "notes.items",
        "pathologies.items",
        "preconisations.items",
        "tertiaire_hors_cvc.installations",
        "ventilation.installations",
      ].sort(),
    );
  });

  it("item_fields de heating.installations expose les champs métier sans techniques", () => {
    const map = buildSchemaMap(freshState());
    const heating = map.collections["heating.installations"];
    expect(heating).toBeDefined();
    expect(heating!.item_fields).toEqual(
      expect.arrayContaining([
        "type_value",
        "fuel_value",
        "power_kw",
        "installation_year",
        "efficiency_pct",
      ]),
    );
    expect(heating!.item_fields).not.toContain("id");
    expect(heating!.item_fields).not.toContain("custom_fields");
  });

  it("item_fields de notes.items exclut created_at et related_message_id", () => {
    const map = buildSchemaMap(freshState());
    const notes = map.collections["notes.items"];
    expect(notes).toBeDefined();
    expect(notes!.item_fields).toContain("content");
    expect(notes!.item_fields).not.toContain("id");
    expect(notes!.item_fields).not.toContain("created_at");
    expect(notes!.item_fields).not.toContain("related_message_id");
  });

  it("current_entries vide quand la collection est vide", () => {
    const map = buildSchemaMap(freshState());
    expect(map.collections["heating.installations"]!.current_entries).toEqual([]);
  });

  it("current_entries reflète les UUIDs présents avec un summary", () => {
    const state = freshState();
    const id1 = uuidv4();
    const id2 = uuidv4();
    state.heating.installations.push(
      {
        id: id1,
        type_value: initField<string>("PAC air-eau"),
        type_other: emptyField<string>(),
        fuel_value: initField<string>("électricité"),
        fuel_other: emptyField<string>(),
        power_kw: initField<number>(8),
        installation_year: initField<number>(2024),
        brand: emptyField<string>(),
        efficiency_pct: emptyField<number>(),
        custom_fields: [],
      },
      {
        id: id2,
        type_value: initField<string>("chaudière gaz"),
        type_other: emptyField<string>(),
        fuel_value: initField<string>("gaz"),
        fuel_other: emptyField<string>(),
        power_kw: emptyField<number>(),
        installation_year: emptyField<number>(),
        brand: emptyField<string>(),
        efficiency_pct: emptyField<number>(),
        custom_fields: [],
      },
    );
    const map = buildSchemaMap(state);
    const entries = map.collections["heating.installations"]!.current_entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toBe(id1);
    expect(entries[0]!.summary).toContain("PAC air-eau");
    expect(entries[1]!.id).toBe(id2);
    expect(entries[1]!.summary).toContain("chaudière gaz");
  });
});

describe("parseEntryPath", () => {
  it("parse un path UUID-based", () => {
    const result = parseEntryPath(
      "heating.installations[id=abc-123-def].type_value",
    );
    expect(result).toEqual({
      collection: "heating.installations",
      entryId: "abc-123-def",
      field: "type_value",
    });
  });

  it("parse un path UUID complet", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const result = parseEntryPath(`ecs.installations[id=${id}].fuel_value`);
    expect(result?.entryId).toBe(id);
  });

  it("renvoie null pour un path positionnel", () => {
    expect(parseEntryPath("heating.installations[0].type_value")).toBeNull();
  });

  it("renvoie null pour un path sans entrée", () => {
    expect(parseEntryPath("building.construction_year")).toBeNull();
  });
});

describe("isPositionalIndexPath", () => {
  it("détecte les indexes positionnels", () => {
    expect(isPositionalIndexPath("heating.installations[0].type_value")).toBe(true);
    expect(isPositionalIndexPath("a.b[12].c")).toBe(true);
  });

  it("ignore les paths UUID-based", () => {
    expect(
      isPositionalIndexPath("heating.installations[id=abc].type_value"),
    ).toBe(false);
  });

  it("ignore les paths plats", () => {
    expect(isPositionalIndexPath("building.construction_year")).toBe(false);
  });
});

describe("isKnownObjectFieldPath", () => {
  it("accepte les paths déclarés dans le schéma", () => {
    const map = buildSchemaMap(freshState());
    expect(isKnownObjectFieldPath(map, "building.wall_material_value")).toBe(true);
    expect(isKnownObjectFieldPath(map, "envelope.murs.material_value")).toBe(true);
  });

  it("rejette les paths inventés", () => {
    const map = buildSchemaMap(freshState());
    expect(isKnownObjectFieldPath(map, "building.nope")).toBe(false);
    expect(isKnownObjectFieldPath(map, "fictif.section.field")).toBe(false);
  });
});
