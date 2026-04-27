/**
 * VTU — Tests It. 11 — listFieldsInSection / findActiveConflicts.
 *
 * Helpers purs, sans Dexie. On construit un VisitJsonState minimal,
 * on injecte des Field<T>, et on vérifie le filtrage par section et
 * la détection de conflits humain ↔ IA via les metadata du message
 * porteur.
 */

import { describe, expect, it } from "vitest";
import {
  listFieldsInSection,
  listUnvalidatedAiFieldsInSection,
  listSectionsWithUnvalidatedAi,
} from "@/features/json-state/lib/section-paths";
import { findActiveConflicts } from "@/features/json-state/lib/conflicts";
import {
  aiInferField,
  emptyField,
  userField,
} from "@/shared/types/json-state.field";
import { createInitialVisitJsonState, type VisitJsonState } from "@/shared/types";
import type { LocalMessage } from "@/shared/db";

const BASE = {
  visitId: "11111111-1111-1111-1111-111111111111",
  clientId: "client-1",
  title: "T",
  thermicienId: "22222222-2222-2222-2222-222222222222",
};

function withAiField(state: VisitJsonState, mutate: (s: VisitJsonState) => void) {
  const next = JSON.parse(JSON.stringify(state)) as VisitJsonState;
  mutate(next);
  return next;
}

describe("listUnvalidatedAiFieldsInSection", () => {
  it("repère un Field IA non-validé dans la section heating", () => {
    const s = withAiField(createInitialVisitJsonState(BASE), (n) => {
      (n.heating as Record<string, unknown>).fuel_value = aiInferField({
        value: "gaz",
        confidence: "medium",
        sourceMessageId: null,
        sourceExtractionId: "x",
        evidenceRefs: [],
      });
    });
    const fields = listUnvalidatedAiFieldsInSection(s, "heating");
    expect(fields.map((f) => f.path)).toContain("heating.fuel_value");
  });

  it("ignore les Field humains et les Field IA déjà validés", () => {
    const s = withAiField(createInitialVisitJsonState(BASE), (n) => {
      (n.heating as Record<string, unknown>).fuel_value = userField({
        value: "fioul",
        userId: "u",
      });
      const ai = aiInferField({
        value: "elec",
        confidence: "high",
        sourceMessageId: null,
        sourceExtractionId: "x",
        evidenceRefs: [],
      });
      (n.heating as Record<string, unknown>).heater_age_years = {
        ...ai,
        validation_status: "validated",
      };
    });
    const fields = listUnvalidatedAiFieldsInSection(s, "heating");
    expect(fields).toEqual([]);
  });

  it("section inconnue → []", () => {
    const s = createInitialVisitJsonState(BASE);
    expect(listFieldsInSection(s, "ghost")).toEqual([]);
    expect(listUnvalidatedAiFieldsInSection(s, "ghost")).toEqual([]);
  });
});

describe("listSectionsWithUnvalidatedAi", () => {
  it("liste uniquement les sections contenant un IA unvalidated", () => {
    const s = withAiField(createInitialVisitJsonState(BASE), (n) => {
      (n.heating as Record<string, unknown>).fuel_value = aiInferField({
        value: "gaz",
        confidence: "low",
        sourceMessageId: null,
        sourceExtractionId: "x",
        evidenceRefs: [],
      });
    });
    expect(listSectionsWithUnvalidatedAi(s)).toEqual(["heating"]);
  });
});

describe("findActiveConflicts", () => {
  it("détecte un conflit humain ↔ IA via metadata.ignored_paths", () => {
    const s = withAiField(createInitialVisitJsonState(BASE), (n) => {
      (n.heating as Record<string, unknown>).fuel_value = userField({
        value: "fioul",
        userId: "u",
      });
    });
    const messages: LocalMessage[] = [
      {
        id: "m-1",
        user_id: "u",
        visit_id: BASE.visitId,
        client_id: "c-1",
        role: "assistant",
        kind: "actions_card",
        content: "x",
        metadata: {
          proposed_patches: [
            {
              path: "heating.fuel_value",
              value: "gaz",
              confidence: "medium",
              evidence_refs: [],
            },
          ],
          ignored_paths: [
            { path: "heating.fuel_value", reason: "human_source_prime" },
          ],
        },
        created_at: new Date().toISOString(),
        sync_status: "synced",
        sync_attempts: 0,
        sync_last_error: null,
        local_updated_at: new Date().toISOString(),
      },
    ];
    const conflicts = findActiveConflicts(s, messages);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.path).toBe("heating.fuel_value");
    expect(conflicts[0]!.humanValue).toContain("fioul");
    expect(conflicts[0]!.aiValue).toContain("gaz");
  });

  it("filtre les conflits déjà arbitrés via conflict_resolutions", () => {
    const s = withAiField(createInitialVisitJsonState(BASE), (n) => {
      (n.heating as Record<string, unknown>).fuel_value = userField({
        value: "fioul",
        userId: "u",
      });
    });
    const messages: LocalMessage[] = [
      {
        id: "m-1",
        user_id: "u",
        visit_id: BASE.visitId,
        client_id: "c-1",
        role: "assistant",
        kind: "conflict_card",
        content: "x",
        metadata: {
          proposed_patches: [
            { path: "heating.fuel_value", value: "gaz", confidence: "medium", evidence_refs: [] },
          ],
          ignored_paths: [
            { path: "heating.fuel_value", reason: "human_source_prime" },
          ],
          conflict_resolutions: { "heating.fuel_value": "kept_human" },
        },
        created_at: new Date().toISOString(),
        sync_status: "synced",
        sync_attempts: 0,
        sync_last_error: null,
        local_updated_at: new Date().toISOString(),
      },
    ];
    expect(findActiveConflicts(s, messages)).toEqual([]);
  });

  it("filtre les conflits où le Field n'est plus humain (effacé)", () => {
    const s = withAiField(createInitialVisitJsonState(BASE), (n) => {
      // Reset à empty → cur.value === null, plus en conflit.
      (n.heating as Record<string, unknown>).fuel_value = emptyField<string>();
    });
    const messages: LocalMessage[] = [
      {
        id: "m-1",
        user_id: "u",
        visit_id: BASE.visitId,
        client_id: "c-1",
        role: "assistant",
        kind: "actions_card",
        content: "x",
        metadata: {
          proposed_patches: [
            { path: "heating.fuel_value", value: "gaz", confidence: "medium", evidence_refs: [] },
          ],
          ignored_paths: [
            { path: "heating.fuel_value", reason: "human_source_prime" },
          ],
        },
        created_at: new Date().toISOString(),
        sync_status: "synced",
        sync_attempts: 0,
        sync_last_error: null,
        local_updated_at: new Date().toISOString(),
      },
    ];
    expect(findActiveConflicts(s, messages)).toEqual([]);
  });
});
