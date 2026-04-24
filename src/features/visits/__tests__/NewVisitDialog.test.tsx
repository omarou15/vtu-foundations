/**
 * Tests Itération 4 — NewVisitDialog : tous champs requis, bouton disabled
 * tant qu'incomplet, submit appelle onSubmit avec valeurs typées.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewVisitDialog } from "../components/NewVisitDialog";

describe("NewVisitDialog", () => {
  it("bouton submit disabled tant qu'un champ manque, enabled une fois complet", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NewVisitDialog open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    const submitBtn = screen.getByRole("button", { name: /créer la visite/i });
    expect(submitBtn).toBeDisabled();

    // Title only → still disabled
    await user.type(screen.getByLabelText(/titre/i), "Maison Dupont");
    expect(submitBtn).toBeDisabled();

    // + address → still disabled
    await user.type(screen.getByLabelText(/adresse/i), "12 rue X");
    expect(submitBtn).toBeDisabled();

    // + mission_type
    await user.click(screen.getByLabelText(/type de mission/i));
    await user.click(screen.getByRole("option", { name: /audit énergétique/i }));
    expect(submitBtn).toBeDisabled();

    // + building_type → enabled
    await user.click(screen.getByLabelText(/typologie de bâtiment/i));
    await user.click(screen.getByRole("option", { name: /maison individuelle/i }));
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      title: "Maison Dupont",
      address: "12 rue X",
      mission_type: "audit_energetique",
      building_type: "maison_individuelle",
    });
  });

  it("trim les espaces du titre et de l'adresse avant submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NewVisitDialog open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText(/titre/i), "  Spaces  ");
    await user.type(screen.getByLabelText(/adresse/i), "  Rue X ");

    await user.click(screen.getByLabelText(/type de mission/i));
    await user.click(screen.getByRole("option", { name: /dpe/i }));

    await user.click(screen.getByLabelText(/typologie de bâtiment/i));
    await user.click(screen.getByRole("option", { name: /appartement/i }));

    await user.click(screen.getByRole("button", { name: /créer la visite/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Spaces", address: "Rue X" }),
    );
  });
});
