/**
 * Tests It. 11 — validateSectionPatches / rejectSectionPatches /
 * overrideWithAiPatch / keepHumanValue.
 *
 * Couvre :
 *  - validation en masse d'une section (1 nouvelle version, N champs).
 *  - noop si rien à valider.
 *  - override IA : remplace la valeur humaine et marque conflit résolu.
 *  - keepHuman : valide la valeur humaine et marque conflit résolu.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  appendJsonStateVersion,
  appendLocalMessage,
  createLocalVisit,
  getDb,
  getLatestLocalJsonState,
} from "@/shared/db";
import {
  keepHumanValue,
  overrideWithAiPatch,
  readFieldAtPath,
  rejectSectionPatches,
  validateSectionPatches,
} from "@/shared/db/json-state.validate.repo";
import { aiInferField } from "@/shared/types/json-state.field";

const USER = "00000000-0000-0000-0000-00000000aaaa";

beforeEach(async () => {
  __resetDbForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("vtu");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

afterEach(async () => {
  const db = getDb();
  if (db.isOpen()) db.close();
  __resetDbForTests();
});

async function setupSectionWithTwoAiFields() {
  const { visit, initialState } = await createLocalVisit({
    userId: USER,
    title: "VT bulk",
    thermicienName: "Test",
  });
  const next = JSON.parse(JSON.stringify(initialState));
  (next.heating as Record<string, unknown>).fuel_value = aiInferField({
    value: "gaz",
    confidence: "high",
    sourceMessageId: null,
    sourceExtractionId: "ext",
    evidenceRefs: [],
  });
  (next.heating as Record<string, unknown>).heater_age_years = aiInferField({
    value: 12,
    confidence: "medium",
    sourceMessageId: null,
    sourceExtractionId: "ext",
    evidenceRefs: [],
  });
  await appendJsonStateVersion({
    userId: USER,
    visitId: visit.id,
    state: next,
  });
  return visit;
}

describe("validateSectionPatches", () => {
  it("valide en bloc tous les Field IA non-validés d'une section (1 version)", async () => {
    const visit = await setupSectionWithTwoAiFields();
    const before = (await getLatestLocalJsonState(visit.id))!.version;

    const r = await validateSectionPatches({
      userId: USER,
      visitId: visit.id,
      sectionKey: "heating",
    });
    expect(r.status).toBe("ok");
    expect(r.applied_count).toBe(2);

    const after = await getLatestLocalJsonState(visit.id);
    expect(after!.version).toBe(before + 1);
    expect(
      readFieldAtPath(after!.state, "heating.fuel_value")!.validation_status,
    ).toBe("validated");
    expect(
      readFieldAtPath(after!.state, "heating.heater_age_years")!
        .validation_status,
    ).toBe("validated");
  });

  it("noop si rien à valider", async () => {
    const { visit } = await createLocalVisit({
      userId: USER,
      title: "VT vide",
      thermicienName: "Test",
    });
    const r = await validateSectionPatches({
      userId: USER,
      visitId: visit.id,
      sectionKey: "heating",
    });
    expect(r.status).toBe("noop");
    expect(r.applied_count).toBe(0);
  });
});

describe("rejectSectionPatches", () => {
  it("reset à null tous les Field IA non-validés (1 version)", async () => {
    const visit = await setupSectionWithTwoAiFields();
    const r = await rejectSectionPatches({
      userId: USER,
      visitId: visit.id,
      sectionKey: "heating",
    });
    expect(r.status).toBe("ok");
    expect(r.applied_count).toBe(2);

    const after = await getLatestLocalJsonState(visit.id);
    expect(readFieldAtPath(after!.state, "heating.fuel_value")!.value).toBeNull();
    expect(
      readFieldAtPath(after!.state, "heating.fuel_value")!.validation_status,
    ).toBe("rejected");
  });
});

describe("overrideWithAiPatch / keepHumanValue", () => {
  it("override remplace la valeur humaine + marque conflict_resolutions=took_ai", async () => {
    const { visit, initialState } = await createLocalVisit({
      userId: USER,
      title: "VT conflit",
      thermicienName: "Test",
    });
    // 1. Pose une valeur humaine
    const next = JSON.parse(JSON.stringify(initialState));
    (next.heating as Record<string, unknown>).fuel_value = {
      value: "fioul",
      source: "user",
      confidence: "high",
      updated_at: new Date().toISOString(),
      source_message_id: null,
      source_extraction_id: null,
      evidence_refs: [],
      validation_status: "unvalidated",
      validated_at: null,
      validated_by: null,
    };
    await appendJsonStateVersion({
      userId: USER,
      visitId: visit.id,
      state: next,
    });

    // 2. Crée un message conflict_card porteur du patch IA
    const msg = await appendLocalMessage({
      userId: USER,
      visitId: visit.id,
      role: "assistant",
      kind: "conflict_card",
      content: "conflit",
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
    });

    // 3. Override
    const r = await overrideWithAiPatch({
      userId: USER,
      visitId: visit.id,
      path: "heating.fuel_value",
      patch: {
        path: "heating.fuel_value",
        value: "gaz",
        confidence: "medium",
        evidence_refs: [],
      },
      sourceMessageId: msg.id,
    });
    expect(r.status).toBe("ok");

    const after = await getLatestLocalJsonState(visit.id);
    const f = readFieldAtPath(after!.state, "heating.fuel_value")!;
    expect(f.value).toBe("gaz");
    expect(f.source).toBe("ai_infer");
    expect(f.validation_status).toBe("validated");

    // Metadata du message updatée
    const updated = await getDb().messages.get(msg.id);
    const meta = updated!.metadata as Record<string, unknown>;
    const res = meta.conflict_resolutions as Record<string, string>;
    expect(res["heating.fuel_value"]).toBe("took_ai");
  });

  it("keepHuman valide la valeur humaine + marque kept_human", async () => {
    const { visit, initialState } = await createLocalVisit({
      userId: USER,
      title: "VT keep",
      thermicienName: "Test",
    });
    const next = JSON.parse(JSON.stringify(initialState));
    (next.heating as Record<string, unknown>).fuel_value = {
      value: "fioul",
      source: "user",
      confidence: "high",
      updated_at: new Date().toISOString(),
      source_message_id: null,
      source_extraction_id: null,
      evidence_refs: [],
      validation_status: "unvalidated",
      validated_at: null,
      validated_by: null,
    };
    await appendJsonStateVersion({
      userId: USER,
      visitId: visit.id,
      state: next,
    });
    const msg = await appendLocalMessage({
      userId: USER,
      visitId: visit.id,
      role: "assistant",
      kind: "conflict_card",
      content: "conflit",
      metadata: {
        proposed_patches: [
          { path: "heating.fuel_value", value: "gaz", confidence: "medium", evidence_refs: [] },
        ],
        ignored_paths: [
          { path: "heating.fuel_value", reason: "human_source_prime" },
        ],
      },
    });

    const r = await keepHumanValue({
      userId: USER,
      visitId: visit.id,
      path: "heating.fuel_value",
      sourceMessageId: msg.id,
    });
    expect(r.status).toBe("ok");

    const after = await getLatestLocalJsonState(visit.id);
    const f = readFieldAtPath(after!.state, "heating.fuel_value")!;
    expect(f.value).toBe("fioul"); // valeur humaine préservée
    expect(f.validation_status).toBe("validated");

    const updated = await getDb().messages.get(msg.id);
    const meta = updated!.metadata as Record<string, unknown>;
    const res = meta.conflict_resolutions as Record<string, string>;
    expect(res["heating.fuel_value"]).toBe("kept_human");
  });
});
