/**
 * Tests Itération 4 — groupement par date + recherche normalisée.
 */

import { describe, expect, it } from "vitest";
import { bucketOf, groupVisitsByDate } from "../lib/grouping";
import { filterVisitsByQuery, normalize } from "../lib/search";
import type { LocalVisit } from "@/shared/db";

const REF = new Date("2026-04-15T10:00:00.000Z"); // Mercredi

function makeVisit(id: string, updatedAt: string, title: string, address: string | null = null): LocalVisit {
  return {
    id,
    user_id: "u1",
    client_id: id,
    title,
    status: "draft",
    version: 1,
    address,
    mission_type: null,
    building_type: null,
    created_at: updatedAt,
    updated_at: updatedAt,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: updatedAt,
  };
}

describe("bucketOf", () => {
  it("classe today / yesterday / this_week / older", () => {
    // REF = mercredi 15 avril
    expect(bucketOf("2026-04-15T08:00:00.000Z", REF)).toBe("today");
    expect(bucketOf("2026-04-14T18:00:00.000Z", REF)).toBe("yesterday");
    // Lundi 13 avril → début de semaine
    expect(bucketOf("2026-04-13T09:00:00.000Z", REF)).toBe("this_week");
    // Dimanche 12 avril → semaine précédente
    expect(bucketOf("2026-04-12T09:00:00.000Z", REF)).toBe("older");
    expect(bucketOf("2026-01-01T00:00:00.000Z", REF)).toBe("older");
  });
});

describe("groupVisitsByDate", () => {
  it("groupe et conserve l'ordre des buckets", () => {
    const visits: LocalVisit[] = [
      makeVisit("a", "2026-04-15T08:00:00.000Z", "Aujourd'hui"),
      makeVisit("b", "2026-04-14T08:00:00.000Z", "Hier"),
      makeVisit("c", "2026-04-13T08:00:00.000Z", "Cette semaine"),
      makeVisit("d", "2026-04-01T08:00:00.000Z", "Vieux"),
    ];
    const groups = groupVisitsByDate(visits, REF);
    expect(groups.map((g) => g.bucket)).toEqual([
      "today",
      "yesterday",
      "this_week",
      "older",
    ]);
    expect(groups[0]!.visits[0]!.title).toBe("Aujourd'hui");
  });

  it("omet les buckets vides", () => {
    const visits: LocalVisit[] = [
      makeVisit("a", "2026-04-15T08:00:00.000Z", "T1"),
      makeVisit("b", "2026-04-01T08:00:00.000Z", "T2"),
    ];
    const groups = groupVisitsByDate(visits, REF);
    expect(groups.map((g) => g.bucket)).toEqual(["today", "older"]);
  });
});

describe("normalize + filterVisitsByQuery", () => {
  it("normalize retire accents et casse", () => {
    expect(normalize("Église")).toBe("eglise");
    expect(normalize("  ÉCOLE Élémentaire ")).toBe("ecole elementaire");
  });

  it("retourne tout si query vide", () => {
    const visits = [makeVisit("a", "2026-04-15", "T1"), makeVisit("b", "2026-04-15", "T2")];
    expect(filterVisitsByQuery(visits, "")).toHaveLength(2);
    expect(filterVisitsByQuery(visits, "   ")).toHaveLength(2);
  });

  it("filtre sur title et address, accents-insensible", () => {
    const visits: LocalVisit[] = [
      makeVisit("a", "2026-04-15", "Église Saint-Martin", "Place de l'Église"),
      makeVisit("b", "2026-04-15", "Maison Dupont", "12 rue de la Paix"),
      makeVisit("c", "2026-04-15", "Immeuble Voltaire", "30 bd Voltaire"),
    ];
    expect(filterVisitsByQuery(visits, "egli").map((v) => v.id)).toEqual(["a"]);
    expect(filterVisitsByQuery(visits, "VOLT").map((v) => v.id)).toEqual(["c"]);
    expect(filterVisitsByQuery(visits, "paix").map((v) => v.id)).toEqual(["b"]);
    expect(filterVisitsByQuery(visits, "zzz")).toHaveLength(0);
  });
});
