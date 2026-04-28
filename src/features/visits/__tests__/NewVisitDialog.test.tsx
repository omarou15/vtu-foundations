/**
 * Tests Itération 12 — NewVisitDialog : tous champs requis, bouton disabled
 * tant qu'incomplet, submit appelle onSubmit avec valeurs typées et inclut
 * les nouveaux champs (date/heure auto, GPS, sous-secteur tertiaire, libres "autre").
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewVisitDialog } from "../components/NewVisitDialog";

beforeEach(() => {
  // Mock geolocation : refuse → GPS reste null, formulaire reste submittable.
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (
        _ok: PositionCallback,
        err: PositionErrorCallback,
      ) => {
        err({
          code: 1,
          message: "denied",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NewVisitDialog", () => {
  it("bouton submit disabled tant qu'un champ manque, enabled une fois complet", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NewVisitDialog open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    const submitBtn = screen.getByRole("button", { name: /créer la visite/i });
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/titre/i), "Maison Dupont");
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/adresse/i), "12 rue X");
    expect(submitBtn).toBeDisabled();

    await user.click(screen.getByLabelText(/type de mission/i));
    await user.click(screen.getByRole("option", { name: /audit énergétique/i }));
    expect(submitBtn).toBeDisabled();

    await user.click(screen.getByLabelText(/typologie de bâtiment/i));
    await user.click(screen.getByRole("option", { name: /^maison individuelle$/i }));
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Maison Dupont",
        address: "12 rue X",
        mission_type: "audit_energetique",
        building_type: "maison_individuelle",
        gps: null,
        visit_started_at: expect.any(String),
      }),
    );
  });

  it("Mission = Autre → champ libre requis pour valider", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NewVisitDialog open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText(/titre/i), "T");
    await user.type(screen.getByLabelText(/adresse/i), "A");
    await user.click(screen.getByLabelText(/type de mission/i));
    await user.click(screen.getByRole("option", { name: /^autre$/i }));
    await user.click(screen.getByLabelText(/typologie de bâtiment/i));
    await user.click(screen.getByRole("option", { name: /^maison individuelle$/i }));

    const submitBtn = screen.getByRole("button", { name: /créer la visite/i });
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/précisez la mission/i), "Diagnostic réglementaire");
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mission_type: "autre",
        mission_type_other: "Diagnostic réglementaire",
      }),
    );
  });

  it("Bâtiment = Tertiaire → sous-secteur requis", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NewVisitDialog open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText(/titre/i), "T");
    await user.type(screen.getByLabelText(/adresse/i), "A");
    await user.click(screen.getByLabelText(/type de mission/i));
    await user.click(screen.getByRole("option", { name: /^dpe$/i }));
    await user.click(screen.getByLabelText(/typologie de bâtiment/i));
    await user.click(screen.getByRole("option", { name: /^tertiaire$/i }));

    const submitBtn = screen.getByRole("button", { name: /créer la visite/i });
    expect(submitBtn).toBeDisabled();

    await user.click(screen.getByLabelText(/sous-secteur tertiaire/i));
    await user.click(screen.getByRole("option", { name: /^bureau$/i }));
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        building_type: "tertiaire",
        tertiaire_subtype: "bureau",
      }),
    );
  });

  it("Tertiaire + Autres secteurs → champ libre requis", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NewVisitDialog open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText(/titre/i), "T");
    await user.type(screen.getByLabelText(/adresse/i), "A");
    await user.click(screen.getByLabelText(/type de mission/i));
    await user.click(screen.getByRole("option", { name: /^dpe$/i }));
    await user.click(screen.getByLabelText(/typologie de bâtiment/i));
    await user.click(screen.getByRole("option", { name: /^tertiaire$/i }));
    await user.click(screen.getByLabelText(/sous-secteur tertiaire/i));
    await user.click(screen.getByRole("option", { name: /autres secteurs/i }));

    const submitBtn = screen.getByRole("button", { name: /créer la visite/i });
    expect(submitBtn).toBeDisabled();

    await user.type(
      screen.getByLabelText(/précisez le secteur/i),
      "Datacenter",
    );
    expect(submitBtn).toBeEnabled();
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
    await user.click(screen.getByRole("option", { name: /^dpe$/i }));

    await user.click(screen.getByLabelText(/typologie de bâtiment/i));
    await user.click(screen.getByRole("option", { name: /^appartement$/i }));

    await user.click(screen.getByRole("button", { name: /créer la visite/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Spaces", address: "Rue X" }),
    );
  });
});
