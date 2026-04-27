/**
 * VTU — It. 12 — Tests des helpers de synthèse (vue lecture humaine).
 *
 * Tests purs : on construit un VisitJsonState minimal et on vérifie le
 * compteur global, le statut par entry de section, et le regroupement
 * des médias par section.
 */

import { describe, expect, it } from "vitest";
import {
  buildSectionSummary,
  countSummaryGlobals,
  groupMediaBySection,
  isSectionFullyEmpty,
} from "@/features/visits/lib/summary";
import {
  countEmptyCriticalFields,
  listEmptyCriticalPaths,
} from "@/features/visits/lib/critical-fields";
import {
  aiInferField,
  initField,
  type Field,
} from "@/shared/types/json-state.field";
import { createInitialVisitJsonState, type VisitJsonState } from "@/shared/types";
import type { LocalAttachment, LocalMessage } from "@/shared/db";

const BASE = {
  visitId: "11111111-1111-1111-1111-111111111111",
  clientId: "client-1",
  title: "T",
  thermicienId: "22222222-2222-2222-2222-222222222222",
};

function clone(s: VisitJsonState): VisitJsonState {
  return JSON.parse(JSON.stringify(s)) as VisitJsonState;
}

function userField<T>(value: T): Field<T> {
  const now = new Date().toISOString();
  return {
    value,
    source: "user",
    confidence: "high",
    updated_at: now,
    source_message_id: null,
    source_extraction_id: null,
    evidence_refs: [],
    validation_status: "validated",
    validated_at: now,
    validated_by: null,
  };
}

// ---------------------------------------------------------------------------
// buildSectionSummary
// ---------------------------------------------------------------------------

describe("buildSectionSummary", () => {
  it("classe les entries en ok / ai_unvalidated / conflict / empty_critical", () => {
    const s = clone(createInitialVisitJsonState(BASE));
    // 1 champ humain validé
    (s.building as Record<string, unknown>).construction_year = userField(1985);
    // 1 champ IA non validé
    (s.building as Record<string, unknown>).surface_habitable_m2 = aiInferField({
      value: 120,
      confidence: "medium",
      sourceMessageId: null,
      sourceExtractionId: "ext-1",
      evidenceRefs: [],
    });
    // 1 champ vide critique : building.nb_niveaux laissé vide

    const conflictPaths = new Set<string>(["building.surface_terrain_m2"]);
    const emptyCritical = new Set<string>(listEmptyCriticalPaths(s));

    const entries = buildSectionSummary(
      s,
      "building",
      conflictPaths,
      emptyCritical,
    );

    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));
    expect(byPath["building.construction_year"]?.status).toBe("ok");
    expect(byPath["building.construction_year"]?.displayValue).toBe("1985");

    expect(byPath["building.surface_habitable_m2"]?.status).toBe("ai_unvalidated");

    expect(byPath["building.nb_niveaux"]?.status).toBe("empty_critical");
    expect(byPath["building.nb_niveaux"]?.isEmpty).toBe(true);

    // surface_terrain_m2 est vide ET marqué conflit → conflict prime
    expect(byPath["building.surface_terrain_m2"]?.status).toBe("conflict");
  });

  it("retourne [] pour une section inconnue", () => {
    const s = createInitialVisitJsonState(BASE);
    expect(buildSectionSummary(s, "nope", new Set(), new Set())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// countSummaryGlobals
// ---------------------------------------------------------------------------

describe("countSummaryGlobals", () => {
  it("compte validés, IA non validés et critiques vides", () => {
    const s = clone(createInitialVisitJsonState(BASE));
    (s.building as Record<string, unknown>).construction_year = userField(2000);
    (s.building as Record<string, unknown>).surface_habitable_m2 = aiInferField({
      value: 80,
      confidence: "high",
      sourceMessageId: null,
      sourceExtractionId: "ext",
      evidenceRefs: [],
    });

    const g = countSummaryGlobals(s, []);
    // initField met les meta/visit_id etc. à validated → on vérifie >=
    expect(g.validated).toBeGreaterThanOrEqual(1);
    expect(g.aiUnvalidated).toBe(1);
    expect(g.conflicts).toBe(0);
    // building.nb_niveaux + meta.address... critiques vides
    expect(g.emptyCritical).toBeGreaterThan(0);
  });

  it("retourne des zéros si pas de state", () => {
    expect(countSummaryGlobals(null, [])).toEqual({
      validated: 0,
      aiUnvalidated: 0,
      emptyCritical: 0,
      conflicts: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// groupMediaBySection
// ---------------------------------------------------------------------------

describe("groupMediaBySection", () => {
  function mkAttachment(id: string, sections: string[]): LocalAttachment {
    return {
      id,
      message_id: null,
      user_id: "u",
      visit_id: "v",
      bucket: "attachments",
      storage_path: "p",
      mime_type: "image/jpeg",
      size_bytes: 0,
      metadata: {},
      created_at: new Date().toISOString(),
      compressed_path: "p",
      thumbnail_path: null,
      width_px: null,
      height_px: null,
      sha256: null,
      gps_lat: null,
      gps_lng: null,
      format: "image/jpeg",
      media_profile: "photo",
      linked_sections: sections,
      sync_status: "synced",
      sync_attempts: 0,
      sync_last_error: null,
      local_updated_at: new Date().toISOString(),
    } as unknown as LocalAttachment;
  }

  it("regroupe par première section et fallback 'other'", () => {
    const list = [
      mkAttachment("a", ["heating.installations"]),
      mkAttachment("b", ["heating.fuel_value"]),
      mkAttachment("c", ["envelope.murs"]),
      mkAttachment("d", []),
    ];
    const g = groupMediaBySection(list);
    expect(g.heating.length).toBe(2);
    expect(g.envelope.length).toBe(1);
    expect(g.other.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isSectionFullyEmpty
// ---------------------------------------------------------------------------

describe("isSectionFullyEmpty", () => {
  it("true si toutes les entries sont vides ET aucun média", () => {
    expect(
      isSectionFullyEmpty(
        [
          {
            path: "x",
            label: "x",
            displayValue: "—",
            status: "ok",
            isEmpty: true,
            confidence: null,
            source: "init",
          },
        ],
        0,
      ),
    ).toBe(true);
  });

  it("false dès qu'il y a au moins 1 média", () => {
    expect(isSectionFullyEmpty([], 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// critical-fields
// ---------------------------------------------------------------------------

describe("critical-fields", () => {
  it("compte plusieurs critiques vides sur une VT neuve", () => {
    const s = createInitialVisitJsonState(BASE);
    expect(countEmptyCriticalFields(s)).toBeGreaterThan(0);
  });

  it("retire ECS du critique si typologie tertiaire", () => {
    const s = clone(createInitialVisitJsonState(BASE));
    (s.meta as Record<string, unknown>).building_typology =
      initField("tertiaire");
    const paths = listEmptyCriticalPaths(s);
    expect(paths).not.toContain("ecs.installations");
  });
});

// Avoid unused-import warning on LocalMessage (kept for clarity)
void (null as unknown as LocalMessage);
