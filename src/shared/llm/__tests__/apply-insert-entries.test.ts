/**
 * It. 11.6 — Tests applyInsertEntries.
 *
 * Couvre :
 *   - Insertion réussie dans une collection connue, UUID généré, Field<T>
 *     posés en source="ai_infer" + validation_status="unvalidated".
 *   - Keys hors item_fields → ignorées (audit), mais l'entrée est créée
 *     si au moins une key valide.
 *   - Aucune key valide → entrée ignorée avec reason "no_valid_fields".
 *   - Collection inconnue → entrée ignorée.
 *   - Keys réservées (id, custom_fields) → ignorées.
 *   - Plusieurs entrées dans le même call : ordre append respecté.
 */

import { describe, expect, it } from "vitest";
import { applyInsertEntries } from "@/shared/llm/apply/apply-insert-entries";
import {
  buildSchemaMap,
  type SchemaMap,
} from "@/shared/types/json-state.schema-map";
import {
  createInitialVisitJsonState,
  type VisitJsonState,
} from "@/shared/types";
import type { AiInsertEntry } from "@/shared/llm/types";

const EXTRACTION = "ext-1";
const MESSAGE = "msg-1";
const VISIT_ID = "11111111-1111-1111-1111-111111111111";

function freshState(): { state: VisitJsonState; map: SchemaMap } {
  const state = createInitialVisitJsonState({
    visitId: VISIT_ID,
    clientId: "c1",
    title: "VT",
    thermicienId: "22222222-2222-2222-2222-222222222222",
  });
  const map = buildSchemaMap(state);
  return { state, map };
}

function op(
  collection: string,
  fields: Record<string, unknown>,
): AiInsertEntry {
  return {
    collection,
    fields,
    confidence: "medium",
    evidence_refs: [MESSAGE],
  };
}

describe("applyInsertEntries — happy path", () => {
  it("crée une entrée dans heating.installations avec UUID + Field<T>", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", {
          type_value: "PAC air-eau",
          fuel_value: "électricité",
          power_kw: 8,
        }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]!.collection).toBe("heating.installations");
    expect(r.applied[0]!.fields_set.sort()).toEqual([
      "fuel_value",
      "power_kw",
      "type_value",
    ]);
    expect(r.applied[0]!.entryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const entry = r.state.heating.installations[0];
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(r.applied[0]!.entryId);
    expect(entry!.type_value.value).toBe("PAC air-eau");
    expect(entry!.type_value.source).toBe("ai_infer");
    expect(entry!.type_value.validation_status).toBe("unvalidated");
    expect(entry!.fuel_value.value).toBe("électricité");
    expect(entry!.power_kw.value).toBe(8);
    // Champs non fournis : restent emptyField (value=null, source=init)
    expect(entry!.installation_year.value).toBeNull();
    expect(entry!.installation_year.source).toBe("init");
    // Champs techniques posés correctement
    expect(entry!.custom_fields).toEqual([]);
  });

  it("crée une entrée dans pathologies.items", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("pathologies.items", {
          category_value: "humidité",
          description: "trace dans la cave",
          severity_value: "moyenne",
        }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.state.pathologies.items[0]?.category_value.value).toBe("humidité");
    expect(r.state.pathologies.items[0]?.description.value).toBe(
      "trace dans la cave",
    );
  });

  it("plusieurs entrées dans le même call : ordre append", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", { type_value: "PAC" }),
        op("heating.installations", { type_value: "Chaudière gaz" }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(2);
    expect(r.state.heating.installations).toHaveLength(2);
    expect(r.state.heating.installations[0]?.type_value.value).toBe("PAC");
    expect(r.state.heating.installations[1]?.type_value.value).toBe(
      "Chaudière gaz",
    );
    // UUIDs distincts
    expect(r.state.heating.installations[0]?.id).not.toBe(
      r.state.heating.installations[1]?.id,
    );
  });
});

describe("applyInsertEntries — permissif", () => {
  it("collection inconnue → auto-vivify et entrée créée", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [op("fictif.section", { x: 1 })],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]!.collection).toBe("fictif.section");
    expect(r.ignored).toHaveLength(0);
  });

  it("collection qui traverse un primitif → écrase, force array, entrée créée", () => {
    const { state, map } = freshState();
    (state as unknown as Record<string, unknown>).fictif = "primitive";
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [op("fictif.section", { x: 1 })],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.ignored).toHaveLength(0);
    const arr = (r.state as unknown as Record<string, { section: unknown[] }>)
      .fictif.section;
    expect(arr).toHaveLength(1);
    expect((arr[0] as Record<string, { value: unknown }>).x.value).toBe(1);
  });

  it("aucun field valide : entrée créée vide quand même (user arbitre)", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", { champ_invente: "x", autre: "y" }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]!.fields_set.sort()).toEqual(["autre", "champ_invente"]);
    expect(r.state.heating.installations).toHaveLength(1);
  });

  it("keys réservées (id, custom_fields) → filtrées, entrée créée", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", {
          id: "le-llm-essaie-de-poser-un-id",
          custom_fields: ["nope"],
          type_value: "PAC",
        }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]!.fields_set).toEqual(["type_value"]);
    expect(r.applied[0]!.ignored_keys.sort()).toEqual([
      "custom_fields",
      "id",
    ]);
    expect(r.applied[0]!.entryId).not.toBe("le-llm-essaie-de-poser-un-id");
  });
});

describe("applyInsertEntries — keys libres", () => {
  it("keys hors item_fields acceptées comme Field<T> sur entrée connue", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", {
          type_value: "PAC",
          fuel_value: "électricité",
          marque: "Daikin",
          random_key: 42,
        }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]!.fields_set.sort()).toEqual([
      "fuel_value",
      "marque",
      "random_key",
      "type_value",
    ]);
    expect(r.applied[0]!.ignored_keys).toEqual([]);
  });
});

describe("applyInsertEntries — Lot A.5 dedup intra-call", () => {
  it("2 inserts même collection avec field commun → mergés en 1 entrée", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", { type_value: "PAC", power_kw: 12 }),
        op("heating.installations", { type_value: "PAC", brand: "Daikin" }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(2);
    expect(r.state.heating.installations).toHaveLength(1);
    expect(r.applied[1]!.merged_into_existing).toBe(true);
    const entry = r.state.heating.installations[0]!;
    expect(entry.type_value.value).toBe("PAC");
    expect(entry.power_kw.value).toBe(12);
    expect((entry as unknown as Record<string, { value: unknown }>).brand?.value)
      .toBe("Daikin");
  });

  it("3 variantes PAC avec field commun → 1 seule entrée mergée", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", { type_value: "PAC", power_kw: 12 }),
        op("heating.installations", { type_value: "PAC", brand: "Hitachi" }),
        op("heating.installations", { type_value: "PAC", fuel_value: "électricité" }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(3);
    expect(r.ignored).toHaveLength(0);
    expect(r.state.heating.installations).toHaveLength(1);
    const entry = r.state.heating.installations[0] as unknown as Record<
      string,
      { value: unknown }
    >;
    expect(entry.type_value.value).toBe("PAC");
    expect(entry.power_kw.value).toBe(12);
    expect(entry.brand.value).toBe("Hitachi");
    expect(entry.fuel_value.value).toBe("électricité");
  });

  it("2 inserts SANS field commun → 2 entrées distinctes (pas de dedup)", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", { type_value: "PAC" }),
        op("heating.installations", { type_value: "Chaudière gaz" }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(2);
    expect(r.state.heating.installations).toHaveLength(2);
    expect(r.applied[1]!.merged_into_existing).toBeUndefined();
  });

  it("merge ne doit pas écraser un Field<T> déjà posé", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", { type_value: "PAC", power_kw: 12 }),
        op("heating.installations", { type_value: "PAC", power_kw: 99 }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.state.heating.installations).toHaveLength(1);
    expect(r.state.heating.installations[0]!.power_kw.value).toBe(12);
  });
});

describe("applyInsertEntries — Lot A.5 entrée vide", () => {
  it("insert avec uniquement keys réservées → entrée vide marquée is_empty", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [
        op("heating.installations", { id: "x", custom_fields: [] }),
      ],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]!.is_empty).toBe(true);
    expect(r.applied[0]!.fields_set).toEqual([]);
    expect(r.state.heating.installations).toHaveLength(1);
  });

  it("insert avec fields valides → pas de is_empty", () => {
    const { state, map } = freshState();
    const r = applyInsertEntries({
      state,
      schemaMap: map,
      insertEntries: [op("heating.installations", { type_value: "PAC" })],
      sourceMessageId: MESSAGE,
      sourceExtractionId: EXTRACTION,
    });
    expect(r.applied[0]!.is_empty).toBeUndefined();
  });
});
