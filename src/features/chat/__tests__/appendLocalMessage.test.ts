/**
 * Tests Itération 5 — appendLocalMessage atomique.
 *
 * Vérifie que l'ajout d'un message :
 *  - Insère dans `messages` avec sync_status "pending"
 *  - Enqueue exactement 1 entry sync_queue (table: "messages", op: "insert")
 *  - Le payload sérialisé NE contient PAS les champs sync_*
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  appendLocalMessage,
  getDb,
  listLocalMessagesByVisit,
} from "@/shared/db";

const USER = "00000000-0000-0000-0000-00000000000a";
const VISIT = "00000000-0000-0000-0000-0000000000aa";

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

describe("appendLocalMessage — append-only + sync_queue (Itération 5)", () => {
  it("insère le message en pending", async () => {
    const m = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      kind: "text",
      content: "Bonjour",
    });

    expect(m.role).toBe("user");
    expect(m.kind).toBe("text");
    expect(m.content).toBe("Bonjour");
    expect(m.sync_status).toBe("pending");
    expect(m.client_id).toBeTruthy();
    expect(m.id).toBeTruthy();
    expect(m.id).not.toBe(m.client_id);
  });

  it("enqueue 1 sync_queue entry (table=messages, op=insert)", async () => {
    const m = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "Test",
    });

    const queue = await getDb().sync_queue.toArray();
    expect(queue.length).toBe(1);
    expect(queue[0]!.table).toBe("messages");
    expect(queue[0]!.op).toBe("insert");
    expect(queue[0]!.row_id).toBe(m.id);
    expect(queue[0]!.attempts).toBe(0);
  });

  it("le payload sync_queue n'expose PAS les champs sync_*", async () => {
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "X",
    });

    const queue = await getDb().sync_queue.toArray();
    const payload = queue[0]!.payload;

    expect(payload).not.toHaveProperty("sync_status");
    expect(payload).not.toHaveProperty("sync_attempts");
    expect(payload).not.toHaveProperty("sync_last_error");
    expect(payload).not.toHaveProperty("local_updated_at");

    // Champs DB attendus
    expect(payload).toHaveProperty("id");
    expect(payload).toHaveProperty("user_id");
    expect(payload).toHaveProperty("visit_id");
    expect(payload).toHaveProperty("client_id");
    expect(payload).toHaveProperty("role");
    expect(payload).toHaveProperty("kind");
    expect(payload).toHaveProperty("content");
    expect(payload).toHaveProperty("created_at");
  });

  it("listLocalMessagesByVisit retourne dans l'ordre chronologique", async () => {
    const a = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "A",
    });
    // Petit décalage pour garantir un created_at différent
    await new Promise((r) => setTimeout(r, 5));
    const b = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "assistant",
      content: "B",
    });

    const list = await listLocalMessagesByVisit(VISIT);
    expect(list.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it("ne retourne pas les messages d'une autre visite", async () => {
    const OTHER = "00000000-0000-0000-0000-0000000000bb";
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "ici",
    });
    await appendLocalMessage({
      userId: USER,
      visitId: OTHER,
      role: "user",
      content: "ailleurs",
    });

    const list = await listLocalMessagesByVisit(VISIT);
    expect(list.length).toBe(1);
    expect(list[0]!.content).toBe("ici");
  });
});
