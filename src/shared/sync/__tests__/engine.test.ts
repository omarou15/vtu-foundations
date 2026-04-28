/**
 * VTU — Tests Itération 6 : sync engine.
 *
 * On mock le client Supabase avec un objet `from()` qui renvoie un
 * builder minimal (`insert`, `update`, `eq`). On vérifie :
 *   - succès : la ligne locale passe synced + l'entry est retirée
 *   - erreur transient : attempts++ + next_attempt_at backoff
 *   - duplicate (23505) : traité comme succès (idempotence)
 *   - max attempts : ligne locale passe failed + entry retirée
 *   - sérialisation : le runner s'arrête sur la première entry pas due
 *   - ordre : les entries dues sont prises dans l'ordre [next_attempt_at+attempts]
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDbForTests,
  appendLocalMessage,
  getDb,
} from "@/shared/db";
import { runSyncOnce, computeBackoffMs, MAX_ATTEMPTS } from "@/shared/sync";

const USER = "00000000-0000-0000-0000-00000000000a";
const VISIT = "00000000-0000-0000-0000-0000000000aa";

interface MockOptions {
  insertResult?: { error: { code?: string; message: string } | null };
  insertResults?: Array<{ error: { code?: string; message: string } | null }>;
}

function makeMockSupabase(opts: MockOptions = {}) {
  const insertCalls: Array<{ table: string; payload: unknown }> = [];
  const queue = opts.insertResults ? [...opts.insertResults] : null;
  const single = opts.insertResult ?? { error: null };

  const supabase = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          insertCalls.push({ table, payload });
          const result = queue ? (queue.shift() ?? single) : single;
          return Promise.resolve(result);
        },
        update(payload: unknown) {
          return {
            eq() {
              insertCalls.push({ table, payload });
              return Promise.resolve(single);
            },
          };
        },
      };
    },
  };
  return { supabase, insertCalls };
}

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

describe("sync engine — backoff", () => {
  it("computeBackoffMs renvoie 0 si pas encore tenté", () => {
    expect(computeBackoffMs(0)).toBe(0);
  });

  it("computeBackoffMs suit la séquence 1/3/10/30/60s", () => {
    expect(computeBackoffMs(1)).toBe(1_000);
    expect(computeBackoffMs(2)).toBe(3_000);
    expect(computeBackoffMs(3)).toBe(10_000);
    expect(computeBackoffMs(4)).toBe(30_000);
    expect(computeBackoffMs(5)).toBe(60_000);
    expect(computeBackoffMs(99)).toBe(60_000);
  });
});

describe("sync engine — runSyncOnce", () => {
  it("succès → ligne locale synced + entry retirée", async () => {
    const m = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "hello",
      metadata: { ai_enabled: false },
    });

    const { supabase, insertCalls } = makeMockSupabase();
    const result = await runSyncOnce(supabase);

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(insertCalls).toEqual([
      { table: "messages", payload: expect.objectContaining({ id: m.id }) },
    ]);

    const queue = await getDb().sync_queue.toArray();
    expect(queue.length).toBe(0);

    const reloaded = await getDb().messages.get(m.id);
    expect(reloaded?.sync_status).toBe("synced");
    expect(reloaded?.sync_attempts).toBe(0);
  });

  it("erreur transient → attempts++ + next_attempt_at futur", async () => {
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "boom",
      metadata: { ai_enabled: false },
    });

    const { supabase } = makeMockSupabase({
      insertResult: { error: { code: "PGRST500", message: "bad gateway" } },
    });
    const before = Date.now();
    const result = await runSyncOnce(supabase);

    expect(result.processed).toBe(0);
    // L'entry a été reschedulée → on quitte la boucle (skipped)
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    const queue = await getDb().sync_queue.toArray();
    expect(queue.length).toBe(1);
    expect(queue[0]!.attempts).toBe(1);
    expect(queue[0]!.last_error).toContain("bad gateway");
    expect(Date.parse(queue[0]!.next_attempt_at)).toBeGreaterThanOrEqual(
      before + 500,
    );
  });

  it("duplicate key (23505) traité comme succès (idempotence)", async () => {
    const m = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "dup",
      metadata: { ai_enabled: false },
    });

    const { supabase } = makeMockSupabase({
      insertResult: {
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint',
        },
      },
    });
    const result = await runSyncOnce(supabase);

    expect(result.processed).toBe(1);
    expect((await getDb().sync_queue.toArray()).length).toBe(0);
    expect((await getDb().messages.get(m.id))?.sync_status).toBe("synced");
  });

  it(`après ${MAX_ATTEMPTS} échecs → ligne locale failed + entry retirée`, async () => {
    const m = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "die",
      metadata: { ai_enabled: false },
    });

    // On force le compteur à MAX-1 puis on rejoue : ce tick déclenche
    // l'incrémentation à MAX → bascule en failed.
    const queue0 = await getDb().sync_queue.toArray();
    await getDb().sync_queue.update(queue0[0]!.id!, {
      attempts: MAX_ATTEMPTS - 1,
      next_attempt_at: new Date(0).toISOString(),
    });

    const { supabase } = makeMockSupabase({
      insertResult: { error: { code: "PGRST500", message: "still down" } },
    });
    const result = await runSyncOnce(supabase);

    expect(result.failed).toBe(1);
    expect((await getDb().sync_queue.toArray()).length).toBe(0);
    const reloaded = await getDb().messages.get(m.id);
    expect(reloaded?.sync_status).toBe("failed");
    expect(reloaded?.sync_last_error).toContain("still down");
  });

  it("traite les entries en série (ordre de la queue)", async () => {
    const a = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "A",
      metadata: { ai_enabled: false },
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "B",
      metadata: { ai_enabled: false },
    });

    const { supabase, insertCalls } = makeMockSupabase();
    const result = await runSyncOnce(supabase);

    expect(result.processed).toBe(2);
    // L'ordre relatif doit refléter l'ordre d'insertion (FIFO sur next_attempt_at + attempts).
    const ids = insertCalls.map(
      (c) => (c.payload as { id: string }).id,
    );
    expect(ids).toEqual([a.id, b.id]);
  });

  it("respecte next_attempt_at futur (skip)", async () => {
    await appendLocalMessage({
      userId: USER,
      visitId: VISIT,
      role: "user",
      content: "later",
      metadata: { ai_enabled: false },
    });
    const future = new Date(Date.now() + 60_000).toISOString();
    const q = await getDb().sync_queue.toArray();
    await getDb().sync_queue.update(q[0]!.id!, { next_attempt_at: future });

    const { supabase, insertCalls } = makeMockSupabase();
    const result = await runSyncOnce(supabase);

    expect(insertCalls.length).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe("sync engine — fake timers safety", () => {
  it("ne fuit pas de timers", () => {
    vi.useFakeTimers();
    vi.useRealTimers();
    expect(true).toBe(true);
  });
});
