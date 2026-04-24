import { describe, it, expect } from "vitest";
import { tokens } from "../design-tokens";

/**
 * Smoke tests sur les design tokens.
 * Garantit que le contrat (clés + types) ne casse pas
 * silencieusement entre prompts.
 */
describe("design-tokens", () => {
  it("expose la couleur primaire VTU exacte", () => {
    expect(tokens.colors.primary).toBe("#FF6B35");
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
