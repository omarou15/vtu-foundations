/**
 * Tests purs canonicalizeSectionPath + buildRegistryUrn.
 * Aucun Dexie/Supabase requis.
 */

import { describe, expect, it } from "vitest";
import {
  buildRegistryUrn,
  canonicalizeSectionPath,
} from "@/shared/db/schema-registry.repo";

describe("canonicalizeSectionPath", () => {
  it("ecs[0].calorifuge_material → ecs[].calorifuge_material", () => {
    expect(canonicalizeSectionPath("ecs[0].calorifuge_material")).toBe(
      "ecs[].calorifuge_material",
    );
  });

  it("cvc.heating.installations[3].power_kw → ...installations[].power_kw", () => {
    expect(
      canonicalizeSectionPath("cvc.heating.installations[3].power_kw"),
    ).toBe("cvc.heating.installations[].power_kw");
  });

  it("préserve un path sans collection (building.construction_year)", () => {
    expect(canonicalizeSectionPath("building.construction_year")).toBe(
      "building.construction_year",
    );
  });

  it("a[0].b[1].c → a[].b[].c (multiples niveaux)", () => {
    expect(canonicalizeSectionPath("a[0].b[1].c")).toBe("a[].b[].c");
  });
});

describe("buildRegistryUrn — déterministe + canonisé", () => {
  it("URN pattern v1 calculé sans réseau", () => {
    expect(buildRegistryUrn("building", "construction_year")).toBe(
      "urn:vtu:schema:building.construction_year:v1",
    );
  });

  it("Indexes collection écrasés en [] avant URN (offline-first)", () => {
    const a = buildRegistryUrn("ecs[0]", "calorifuge_material");
    const b = buildRegistryUrn("ecs[5]", "calorifuge_material");
    expect(a).toBe(b);
    expect(a).toBe("urn:vtu:schema:ecs[].calorifuge_material:v1");
  });
});
