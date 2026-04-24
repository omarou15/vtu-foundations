/**
 * Tests Itération 5 — détection low-confidence dans le JSON state.
 */

import { describe, expect, it } from "vitest";
import {
  countLowConfidenceFields,
  findLowConfidenceFieldPaths,
} from "@/features/json-state";
import { createInitialVisitJsonState, type VisitJsonState } from "@/shared/types";

const baseInput = {
  visitId: "11111111-1111-1111-1111-111111111111",
  clientId: "client-123",
  title: "T",
  thermicienId: "22222222-2222-2222-2222-222222222222",
};

function withLowConfidenceOnAddress(): VisitJsonState {
  const s = createInitialVisitJsonState({
    ...baseInput,
    address: "12 rue X",
    buildingType: "maison_individuelle",
  });
  // Force low confidence sur address (simule un OCR fragile)
  s.meta.address.confidence = "low";
  return s;
}

describe("findLowConfidenceFieldPaths / countLowConfidenceFields", () => {
  it("0 par défaut sur un state initial", () => {
    const s = createInitialVisitJsonState(baseInput);
    expect(countLowConfidenceFields(s)).toBe(0);
    expect(findLowConfidenceFieldPaths(s)).toEqual([]);
  });

  it("repère un Field<T> à confidence 'low'", () => {
    const s = withLowConfidenceOnAddress();
    const paths = findLowConfidenceFieldPaths(s);
    expect(paths).toEqual(["meta.address"]);
    expect(countLowConfidenceFields(s)).toBe(1);
  });

  it("ne descend pas dans Field.value (pas de faux positif)", () => {
    const s = createInitialVisitJsonState(baseInput);
    // Glisse un objet "piégé" dans value qui ressemble à un Field
    s.meta.title.value = JSON.stringify({
      value: "x",
      source: "user",
      confidence: "low",
      updated_at: "now",
    });
    expect(countLowConfidenceFields(s)).toBe(0);
  });

  it("compte plusieurs champs low en parallèle", () => {
    const s = createInitialVisitJsonState({
      ...baseInput,
      address: "x",
      buildingType: "appartement",
    });
    s.meta.address.confidence = "low";
    s.meta.building_type.confidence = "low";
    s.meta.title.confidence = "low";
    expect(countLowConfidenceFields(s)).toBe(3);
  });
});
