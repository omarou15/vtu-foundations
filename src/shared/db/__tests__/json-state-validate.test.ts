/**
 * Tests validateFieldPatch / rejectFieldPatch (It. 10.5).
 *
 * Couvre :
 *  - validate : passe validation_status à "validated", crée nouvelle version.
 *  - reject sur source ai_infer : value reset à null + status "rejected".
 *  - reject sur source humaine : value préservée + status "rejected".
 *  - idempotence : appel 2x ne crée pas une 2e version.
 *  - path inconnu / state absent : noop avec reason explicite.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  appendJsonStateVersion,
  createLocalVisit,
  getDb,
  getLatestLocalJsonState,
} from "@/shared/db";
import {
  rejectFieldPatch,
  validateFieldPatch,
  readFieldAtPath,
} from "@/shared/db/json-state.validate.repo";
import { aiInferField } from "@/shared/types/json-state.field";
import type { Field } from "@/shared/types/json-state.field";

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

async function setupVisitWithAiField() {
  const { visit, initialState } = await createLocalVisit({
    userId: USER,
    title: "VT validation",
    thermicienName: "Test",
  });
  // Pose un Field IA dans heating.fuel_value
  const next = JSON.parse(JSON.stringify(initialState));
  (next.heating as Record<string, unknown>).fuel_value = aiInferField({
    value: "gaz",
    confidence: "medium",
    sourceMessageId: null,
    sourceExtractionId: "ext-1",
    evidenceRefs: ["msg-1"],
  });
  await appendJsonStateVersion({
    userId: USER,
    visitId: visit.id,
    state: next,
  });
  return visit;
}

describe("validateFieldPatch", () => {
  it("marque le Field comme validated et crée une nouvelle version", async () => {
    const visit = await setupVisitWithAiField();
    const before = await getLatestLocalJsonState(visit.id);
    expect(before?.version).toBe(2); // initial(1) + ai patch(2)

    const r = await validateFieldPatch({
      userId: USER,
      visitId: visit.id,
      path: "heating.fuel_value",
    });
    expect(r.status).toBe("ok");

    const after = await getLatestLocalJsonState(visit.id);
    expect(after?.version).toBe(3);
    const f = readFieldAtPath(after!.state, "heating.fuel_value")!;
    expect(f.validation_status).toBe("validated");
    expect(f.value).toBe("gaz");
    expect(f.validated_by).toBe(USER);
  });

  it("noop si déjà validated (pas de nouvelle version)", async () => {
    const visit = await setupVisitWithAiField();
    await validateFieldPatch({
      userId: USER,
      visitId: visit.id,
      path: "heating.fuel_value",
    });
    const v3 = (await getLatestLocalJsonState(visit.id))!.version;

    const r = await validateFieldPatch({
      userId: USER,
      visitId: visit.id,
      path: "heating.fuel_value",
    });
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.reason).toBe("already_validated");
    const v3After = (await getLatestLocalJsonState(visit.id))!.version;
    expect(v3After).toBe(v3);
  });

  it("noop si path inconnu", async () => {
    const visit = await setupVisitWithAiField();
    const r = await validateFieldPatch({
      userId: USER,
      visitId: visit.id,
      path: "heating.does_not_exist",
    });
    expect(r.status).toBe("noop");
  });
});

describe("rejectFieldPatch", () => {
  it("reset le Field à null si source ai_infer + marque rejected", async () => {
    const visit = await setupVisitWithAiField();
    const r = await rejectFieldPatch({
      userId: USER,
      visitId: visit.id,
      path: "heating.fuel_value",
    });
    expect(r.status).toBe("ok");

    const after = await getLatestLocalJsonState(visit.id);
    const f = readFieldAtPath(after!.state, "heating.fuel_value")!;
    expect(f.value).toBeNull();
    expect(f.source).toBe("init");
    expect(f.validation_status).toBe("rejected");
  });

  it("préserve la value si source humaine, marque seulement rejected", async () => {
    const { visit, initialState } = await createLocalVisit({
      userId: USER,
      title: "VT humain",
      thermicienName: "Test",
    });
    // Pose une valeur saisie humainement (source=user, status=validated d'origine)
    const next = JSON.parse(JSON.stringify(initialState));
    const userField: Field<string> = {
      value: "fioul",
      source: "user",
      confidence: "high",
      updated_at: new Date().toISOString(),
      source_message_id: "msg-user",
      validation_status: "unvalidated",
      validated_at: null,
      validated_by: null,
      source_extraction_id: null,
      evidence_refs: [],
    };
    (next.heating as Record<string, unknown>).fuel_value = userField;
    await appendJsonStateVersion({ userId: USER, visitId: visit.id, state: next });

    const r = await rejectFieldPatch({
      userId: USER,
      visitId: visit.id,
      path: "heating.fuel_value",
    });
    expect(r.status).toBe("ok");

    const after = await getLatestLocalJsonState(visit.id);
    const f = readFieldAtPath(after!.state, "heating.fuel_value")!;
    expect(f.value).toBe("fioul"); // préservé
    expect(f.source).toBe("user");
    expect(f.validation_status).toBe("rejected");
  });

  it("noop si state absent", async () => {
    const r = await rejectFieldPatch({
      userId: USER,
      visitId: "00000000-0000-0000-0000-00000000ffff",
      path: "heating.fuel_value",
    });
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.reason).toBe("no_state");
  });
});
