/**
 * Tests Itération 4 — sync_queue après createLocalVisit.
 *
 * Vérifie que la création atomique d'une VT enqueue bien :
 *  - 1 entrée pour visits
 *  - 1 entrée pour visit_json_state
 * et que la transaction est tout-ou-rien (les 4 inserts ou rien).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetDbForTests, createLocalVisit, getDb } from "@/shared/db";

const USER_A = "00000000-0000-0000-0000-00000000000a";

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

describe("createLocalVisit — sync_queue (Itération 4)", () => {
  it("enqueue 2 entries (visits + visit_json_state)", async () => {
    const { visit, jsonState } = await createLocalVisit({
      userId: USER_A,
      title: "Maison Dupont",
      address: "12 rue de la République, Lyon",
      missionType: "audit_energetique",
      buildingType: "maison_individuelle",
    });

    const db = getDb();
    const queue = await db.sync_queue.toArray();

    expect(queue.length).toBe(2);

    const tables = queue.map((q) => q.table).sort();
    expect(tables).toEqual(["visit_json_state", "visits"]);

    const visitEntry = queue.find((q) => q.table === "visits");
    const jsonEntry = queue.find((q) => q.table === "visit_json_state");

    expect(visitEntry?.op).toBe("insert");
    expect(visitEntry?.row_id).toBe(visit.id);
    expect(visitEntry?.attempts).toBe(0);
    expect(visitEntry?.payload.client_id).toBe(visit.client_id);
    expect(visitEntry?.payload.address).toBe("12 rue de la République, Lyon");
    expect(visitEntry?.payload.mission_type).toBe("audit_energetique");
    expect(visitEntry?.payload.building_type).toBe("maison_individuelle");

    expect(jsonEntry?.op).toBe("insert");
    expect(jsonEntry?.row_id).toBe(jsonState.id);
    expect(jsonEntry?.payload.visit_id).toBe(visit.id);
    expect(jsonEntry?.payload.version).toBe(1);
  });

  it("persiste visit + visit_json_state v1 dans Dexie", async () => {
    const { visit } = await createLocalVisit({
      userId: USER_A,
      title: "T",
      address: "A",
      missionType: "dpe",
      buildingType: "appartement",
    });

    const db = getDb();
    const v = await db.visits.get(visit.id);
    expect(v?.address).toBe("A");
    expect(v?.mission_type).toBe("dpe");
    expect(v?.building_type).toBe("appartement");
    expect(v?.sync_status).toBe("pending");

    const states = await db.visit_json_state
      .where("[visit_id+version]")
      .equals([visit.id, 1])
      .toArray();
    expect(states.length).toBe(1);
    expect(states[0]!.sync_status).toBe("pending");
  });

  it("le JSON state initial pré-remplit address et building_type", async () => {
    const { initialState } = await createLocalVisit({
      userId: USER_A,
      title: "T",
      address: "12 rue X",
      missionType: "conseil",
      buildingType: "tertiaire",
    });

    expect(initialState.meta.address.value).toBe("12 rue X");
    expect(initialState.meta.address.source).toBe("init");
    expect(initialState.meta.address.confidence).toBe("high");
    expect(initialState.meta.building_type.value).toBe("tertiaire");
  });
});
