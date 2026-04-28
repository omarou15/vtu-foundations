/**
 * VTU — Tests PR1 : orchestrateur visit-snapshot.
 *
 * Vérifie :
 *   - L'ordre strict messages → attachments → descriptions → json_state.
 *   - Le verrou par visitId : 2 appels concurrents = 1 seule exécution.
 *   - Le curseur sync_state est mis à jour avec le `lastCreatedAt`
 *     retourné par le serveur, pas via tri Dexie postérieur.
 *   - Les erreurs par stage n'empêchent pas les autres stages de tourner.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  getDb,
  getLastPulledAt,
  SyncStateKey,
} from "@/shared/db";
import {
  __resetVisitSnapshotInflightForTests,
  syncVisitAssetsSnapshot,
} from "../visit-snapshot";

const USER = "00000000-0000-0000-0000-00000000000a";
const VISIT = "00000000-0000-0000-0000-0000000000a1";

interface QueryRecord {
  table: string;
  startedAt: number;
  finishedAt?: number;
}

function makeMockSupabase(
  responses: Record<string, Array<Record<string, unknown>>>,
  failingTables: Set<string> = new Set(),
) {
  const queries: QueryRecord[] = [];
  let counter = 0;

  function builder(table: string, record: QueryRecord) {
    return {
      select(_c: string) { return this; },
      eq(_c: string, _v: string) { return this; },
      gt(_c: string, _v: string | number) { return this; },
      order(_c: string, _o?: { ascending?: boolean }) { return this; },
      limit(_n: number) { return this; },
      then(onfulfilled: (v: { data: unknown; error: unknown }) => unknown) {
        return new Promise((resolve) => {
          // simule une latence réseau
          setTimeout(() => {
            record.finishedAt = ++counter;
            if (failingTables.has(table)) {
              resolve({ data: null, error: { message: `boom ${table}` } });
            } else {
              resolve({ data: responses[table] ?? [], error: null });
            }
          }, 5);
        }).then(onfulfilled as (v: unknown) => unknown);
      },
    };
  }

  return {
    queries,
    supabase: {
      from(table: string) {
        const record: QueryRecord = { table, startedAt: ++counter };
        queries.push(record);
        return builder(table, record);
      },
    },
  };
}

beforeEach(async () => {
  __resetVisitSnapshotInflightForTests();
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

describe("syncVisitAssetsSnapshot", () => {
  it("respecte l'ordre messages → attachments → descriptions → json_state", async () => {
    const { supabase, queries } = makeMockSupabase({
      messages: [],
      attachments: [],
      attachment_ai_descriptions: [],
      visit_json_state: [],
    });

    await syncVisitAssetsSnapshot(VISIT, supabase as never);

    const order = queries.map((q) => q.table);
    expect(order).toEqual([
      "messages",
      "attachments",
      "attachment_ai_descriptions",
      "visit_json_state",
    ]);
  });

  it("verrou : deux appels concurrents pour le même visitId partagent la même promise", async () => {
    const { supabase, queries } = makeMockSupabase({
      messages: [],
      attachments: [],
      attachment_ai_descriptions: [],
      visit_json_state: [],
    });

    const [r1, r2] = await Promise.all([
      syncVisitAssetsSnapshot(VISIT, supabase as never),
      syncVisitAssetsSnapshot(VISIT, supabase as never),
    ]);

    expect(r1).toBe(r2); // même objet retourné
    // 4 tables interrogées une seule fois
    expect(queries.length).toBe(4);
  });

  it("avance le curseur attachments à partir du lastCreatedAt serveur", async () => {
    const { supabase } = makeMockSupabase({
      messages: [],
      attachments: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: USER,
          visit_id: VISIT,
          message_id: "22222222-2222-2222-2222-222222222222",
          bucket: "attachments",
          storage_path: "x.png",
          mime_type: "image/png",
          size_bytes: 100,
          metadata: {},
          linked_sections: [],
          created_at: "2026-04-26T10:00:00.000Z",
        },
        {
          id: "33333333-3333-3333-3333-333333333333",
          user_id: USER,
          visit_id: VISIT,
          message_id: "22222222-2222-2222-2222-222222222222",
          bucket: "attachments",
          storage_path: "y.png",
          mime_type: "image/png",
          size_bytes: 200,
          metadata: {},
          linked_sections: [],
          created_at: "2026-04-26T10:05:00.000Z",
        },
      ],
      attachment_ai_descriptions: [],
      visit_json_state: [],
    });

    const r = await syncVisitAssetsSnapshot(VISIT, supabase as never);
    expect(r.pulled.attachments).toBe(2);
    expect(r.errors).toEqual([]);

    const cursor = await getLastPulledAt(SyncStateKey.attachments(VISIT));
    expect(cursor).toBe("2026-04-26T10:05:00.000Z");
  });

  it("une erreur sur attachments ne bloque ni descriptions ni json_state", async () => {
    const { supabase } = makeMockSupabase(
      {
        messages: [],
        attachment_ai_descriptions: [],
        visit_json_state: [],
      },
      new Set(["attachments"]),
    );

    const r = await syncVisitAssetsSnapshot(VISIT, supabase as never);
    expect(r.errors.some((e) => e.stage === "attachments")).toBe(true);
    expect(r.pulled.descriptions).toBe(0);
    expect(r.pulled.json_state).toBe(0);
  });
});
