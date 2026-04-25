/**
 * Tests des bornes physiques du JSON state (KNOWLEDGE §12).
 *
 * RÈGLE : ces bornes rejettent UNIQUEMENT les hallucinations IA. Elles
 * doivent TOUJOURS accepter un cas réel français (Tour Montparnasse,
 * campus 150k m², chaufferie 5MW, monument an 1100, etc.).
 */

import { describe, expect, it } from "vitest";
import {
  EFFICIENCY_PCT_BOUND,
  makeYearBound,
  NON_NEGATIVE_INT,
  POSITIVE_NUMBER,
} from "@/shared/types/json-state.bounds";

describe("json-state bounds — accepte le réel français", () => {
  it("Tour Montparnasse : 59 niveaux acceptés", () => {
    expect(() => NON_NEGATIVE_INT.parse(59)).not.toThrow();
  });

  it("Campus Energyco : 150 000 m² acceptés (pas de borne max)", () => {
    expect(() => POSITIVE_NUMBER.parse(150_000)).not.toThrow();
  });

  it("Chaufferie collective : 5 MW = 5000 kW acceptés", () => {
    expect(() => POSITIVE_NUMBER.parse(5_000)).not.toThrow();
  });

  it("Monument historique : an 1100 accepté avec min=-500", () => {
    const bound = makeYearBound(-500);
    expect(() => bound.parse(1100)).not.toThrow();
  });
});

describe("json-state bounds — rejette les hallucinations IA", () => {
  it("Année 3024 rejetée (futur lointain impossible)", () => {
    const bound = makeYearBound(-500);
    expect(() => bound.parse(3024)).toThrow();
  });

  it("Surface négative rejetée", () => {
    expect(() => POSITIVE_NUMBER.parse(-50)).toThrow();
  });

  it("Efficacité 150% rejetée (> 100)", () => {
    expect(() => EFFICIENCY_PCT_BOUND.parse(150)).toThrow();
  });
});
