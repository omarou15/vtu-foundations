/**
 * Tests path-labels (It. 10.5).
 */

import { describe, expect, it } from "vitest";
import {
  formatPatchValue,
  labelForPath,
  labelForSection,
} from "@/shared/llm/path-labels";

describe("labelForPath", () => {
  it("rend des libellés FR pour les paths connus", () => {
    expect(labelForPath("heating.fuel_value")).toBe(
      "Chauffage · Énergie / combustible",
    );
    expect(labelForPath("ventilation.type_value")).toBe(
      "Ventilation · Type",
    );
    expect(labelForPath("meta.address")).toBe("Identité de la visite · Adresse");
  });

  it("humanise les paths inconnus", () => {
    expect(labelForPath("foo_bar.baz_qux")).toBe("Foo Bar · Baz Qux");
  });

  it("gère les paths nestés", () => {
    expect(labelForPath("appliances.items.0.power_kw")).toContain(
      "Puissance",
    );
  });
});

describe("labelForSection", () => {
  it("rend la section connue", () => {
    expect(labelForSection("heating")).toBe("Chauffage");
    expect(labelForSection("hot_water")).toBe("Eau chaude sanitaire");
  });
  it("humanise une section inconnue", () => {
    expect(labelForSection("plomberie_speciale")).toBe("Plomberie Speciale");
  });
});

describe("formatPatchValue", () => {
  it("affiche — pour null/undefined", () => {
    expect(formatPatchValue(null)).toBe("—");
    expect(formatPatchValue(undefined)).toBe("—");
  });
  it("formate booléens en FR", () => {
    expect(formatPatchValue(true)).toBe("Oui");
    expect(formatPatchValue(false)).toBe("Non");
  });
  it("formate les nombres", () => {
    expect(formatPatchValue(42)).toBe("42");
    expect(formatPatchValue(12.345)).toBe("12.35");
  });
  it("garde les strings telles quelles", () => {
    expect(formatPatchValue("gaz naturel")).toBe("gaz naturel");
  });
});
