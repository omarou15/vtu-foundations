import { describe, expect, it } from "vitest";
import {
  MODELS_CATALOG,
  ALLOWED_MODEL_IDS,
  DEFAULT_MODEL_TIER,
  getModelByTier,
  getModelIdByTier,
} from "@/features/settings/models-catalog";

describe("models-catalog", () => {
  it("expose exactement 4 tiers économique/moyen/supérieur/premium", () => {
    expect(MODELS_CATALOG.map((m) => m.tier)).toEqual([
      "economic",
      "standard",
      "advanced",
      "premium",
    ]);
  });

  it("modelId uniques", () => {
    const ids = MODELS_CATALOG.map((m) => m.modelId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ALLOWED_MODEL_IDS reflète le catalogue", () => {
    expect([...ALLOWED_MODEL_IDS].sort()).toEqual(
      MODELS_CATALOG.map((m) => m.modelId).sort(),
    );
  });

  it("getModelIdByTier(default) renvoie un id du catalogue", () => {
    expect(ALLOWED_MODEL_IDS).toContain(getModelIdByTier(DEFAULT_MODEL_TIER));
  });

  it("getModelByTier renvoie le tier demandé", () => {
    expect(getModelByTier("premium").tier).toBe("premium");
  });

  it("recall ∈ [0,1] et prix > 0 pour tous les tiers", () => {
    for (const m of MODELS_CATALOG) {
      expect(m.estimatedRecall).toBeGreaterThan(0);
      expect(m.estimatedRecall).toBeLessThanOrEqual(1);
      expect(m.pricePerMTokensInput).toBeGreaterThan(0);
      expect(m.pricePerMTokensOutput).toBeGreaterThan(0);
    }
  });
});
