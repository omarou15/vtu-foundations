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

  it("enqueue insert + llm_route_and_dispatch (table=messages, op=insert/llm)", async () => {
    const m = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "Test",
    });

    const queue = await getDb().sync_queue.toArray();
    expect(queue.length).toBe(2);
    const insert = queue.find((q) => q.op === "insert");
    const llm = queue.find((q) => q.op === "llm_route_and_dispatch");
    expect(insert).toBeDefined();
    expect(llm).toBeDefined();
    expect(insert!.table).toBe("messages");
    expect(insert!.row_id).toBe(m.id);
    expect(insert!.attempts).toBe(0);
    expect(llm!.row_id).toBe(m.id);
  });

  it("dispatch LLM même pour message court ('ok', 'Bonjour') — refonte avril 2026", async () => {
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "ok",
    });
    const queueA = await getDb().sync_queue.toArray();
    expect(queueA.some((q) => q.op === "llm_route_and_dispatch")).toBe(true);

    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "Bonjour",
    });
    const queueB = await getDb().sync_queue.toArray();
    expect(
      queueB.filter((q) => q.op === "llm_route_and_dispatch").length,
    ).toBe(2);
  });

  it("PAS de dispatch LLM si toggle ai_enabled=false ou message vide sans attachment", async () => {
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "ok",
      metadata: { ai_enabled: false },
    });
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "   ",
    });
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "assistant",
      content: "Réponse longue de l'assistant",
    });
    const queue = await getDb().sync_queue.toArray();
    expect(queue.some((q) => q.op === "llm_route_and_dispatch")).toBe(false);
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
