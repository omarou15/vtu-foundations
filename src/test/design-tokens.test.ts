import { describe, it, expect } from "vitest";
import { tokens } from "../design-tokens";

/**
 * Smoke tests sur les design tokens.
 * Garantit que le contrat (clés + types) ne casse pas
 * silencieusement entre prompts.
 */
describe("design-tokens", () => {
  it("expose la couleur primaire Anthropic exacte", () => {
    expect(tokens.colors.primary).toBe("#d97757");
  });

  it("définit le fond chaleureux Anthropic", () => {
    expect(tokens.colors.bg).toBe("#faf9f5");
  });

  it("définit toutes les tailles typo de l'échelle", () => {
    expect(tokens.typography.sizes).toMatchObject({
      xs: 12,
      sm: 14,
      base: 16,
      md: 18,
      lg: 20,
      xl: 24,
      "2xl": 32,
    });
  });

  it("définit les 4 poids Inter", () => {
    expect(tokens.typography.weights).toEqual({
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    });
  });

  it("définit les 3 familles de fontes (Poppins/Lora/Inter)", () => {
    expect(tokens.typography.fontFamily.heading).toContain("Poppins");
    expect(tokens.typography.fontFamily.body).toContain("Lora");
    expect(tokens.typography.fontFamily.ui).toContain("Inter");
  });

  it("impose un touch target ≥ 44px", () => {
    expect(tokens.touch.minTarget).toBeGreaterThanOrEqual(44);
  });

  it("expose les radii de l'échelle 6/8/12/16/20", () => {
    expect(tokens.radii).toMatchObject({
      xs: 6,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
    });
  });
});
