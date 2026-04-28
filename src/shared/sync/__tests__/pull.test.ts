/**
 * VTU — Tests Itération 6.5 : pull cross-device.
 *
 * On mock un sous-ensemble de l'API Supabase qui supporte :
 *   from(table).select("*").eq().gt().order().limit() → { data, error }
 *
 * On vérifie :
 *   - Hydration initiale (cursor null) → pas de filtre `gt`, LIMIT 500
 *   - Pull incrémental → filtre `gt(updated_at, cursor)`, LIMIT 200
 *   - Idempotence : 2 runPullOnce consécutifs sans nouvelles données → pulled: 0
 *   - Curseur correctement mis à jour (= updated_at du dernier row)
 *   - upsert*FromRemote appelé pour chaque row
 *   - pullMessagesForVisit fonctionne en mode lazy
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  getDb,
  getLastPulledAt,
  setLastPulledAt,
  SyncStateKey,
} from "@/shared/db";
import { runPullOnce, pullMessagesForVisit } from "@/shared/sync";

const USER = "00000000-0000-0000-0000-00000000000a";
const VISIT_1 = "00000000-0000-0000-0000-0000000000a1";
const VISIT_2 = "00000000-0000-0000-0000-0000000000a2";

interface QueryRecord {
  table: string;
  filters: Array<{ op: string; column?: string; value?: string | number }>;
  limit?: number;
}

function makeMockSupabase(
  responses: Record<string, Array<Record<string, unknown>>>,
) {
  const queries: QueryRecord[] = [];

  function builder(table: string, record: QueryRecord) {
    const promise = {
      select(_columns: string) {
        record.filters.push({ op: "select" });
        return this;
      },
      eq(column: string, value: string) {
        record.filters.push({ op: "eq", column, value });
        return this;
      },
      gt(column: string, value: string) {
        record.filters.push({ op: "gt", column, value });
        return this;
      },
      order(column: string, options?: { ascending?: boolean }) {
        record.filters.push({
          op: "order",
          column,
          value: options?.ascending ? "asc" : "desc",
        });
        return this;
      },
      limit(n: number) {
        record.limit = n;
        return this;
      },
      then(onfulfilled: (v: { data: unknown; error: null }) => unknown) {
        const data = responses[table] ?? [];
        return Promise.resolve({ data, error: null }).then(onfulfilled);
      },
    };
    return promise;
  }

  return {
    queries,
    supabase: {
      from(table: string) {
        const record: QueryRecord = { table, filters: [] };
        queries.push(record);
        return builder(table, record);
      },
    },
  };
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

describe("runPullOnce — hydration initiale", () => {
  it("sans curseur, fetch sans `gt` et avec LIMIT 500", async () => {
    const { supabase, queries } = makeMockSupabase({
      visits: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: USER,
          client_id: "c1",
          title: "VT remote",
          status: "draft",
          version: 1,
          address: null,
          mission_type: null,
          building_type: null,
          created_at: "2026-04-24T10:00:00.000Z",
          updated_at: "2026-04-24T10:00:00.000Z",
        },
      ],
      visit_json_state: [],
    });

    const result = await runPullOnce(supabase as unknown as Parameters<typeof runPullOnce>[0], USER);

    expect(result.pulled).toBe(1);
    expect(result.tables.visits).toBe(1);
    expect(result.tables.visit_json_state).toBe(0);

    // La query visits ne doit PAS contenir de filter `gt` et doit
    // utiliser la LIMIT d'hydration.
    const visitsQuery = queries.find((q) => q.table === "visits")!;
    expect(visitsQuery.filters.find((f) => f.op === "gt")).toBeUndefined();
    expect(visitsQuery.limit).toBe(500);

    // La visite a été insérée localement.
    const local = await getDb().visits.toArray();
    expect(local.length).toBe(1);
    expect(local[0]!.title).toBe("VT remote");
    expect(local[0]!.sync_status).toBe("synced");

    // Curseur posé.
    const cursor = await getLastPulledAt(SyncStateKey.visits());
    expect(cursor).toBe("2026-04-24T10:00:00.000Z");
  });

  it("sans curseur ET sans données, pose tout de même un curseur (now())", async () => {
    const { supabase } = makeMockSupabase({ visits: [], visit_json_state: [] });
    const before = Date.now();
    const result = await runPullOnce(supabase as unknown as Parameters<typeof runPullOnce>[0], USER);
    expect(result.pulled).toBe(0);
    const cursor = await getLastPulledAt(SyncStateKey.visits());
    expect(cursor).not.toBeNull();
    expect(Date.parse(cursor!)).toBeGreaterThanOrEqual(before);
  });
});

describe("runPullOnce — incrémental", () => {
  it("avec curseur, ajoute filter `gt(updated_at, cursor)` + LIMIT 200", async () => {
    await setLastPulledAt(
      SyncStateKey.visits(),
      "2026-04-20T00:00:00.000Z",
    );
    await setLastPulledAt(
      SyncStateKey.visitJsonState(),
      "2026-04-20T00:00:00.000Z",
    );

    const { supabase, queries } = makeMockSupabase({
      visits: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          user_id: USER,
          client_id: "c2",
          title: "Nouveau",
          status: "draft",
          version: 1,
          address: null,
          mission_type: null,
          building_type: null,
          created_at: "2026-04-24T11:00:00.000Z",
          updated_at: "2026-04-24T11:00:00.000Z",
        },
      ],
      visit_json_state: [],
    });

    const result = await runPullOnce(supabase as unknown as Parameters<typeof runPullOnce>[0], USER);
    expect(result.pulled).toBe(1);

    const visitsQuery = queries.find((q) => q.table === "visits")!;
    const gtFilter = visitsQuery.filters.find((f) => f.op === "gt");
    expect(gtFilter).toBeDefined();
    expect(gtFilter!.column).toBe("updated_at");
    expect(gtFilter!.value).toBe("2026-04-20T00:00:00.000Z");
    expect(visitsQuery.limit).toBe(200);

    // Curseur avancé au updated_at du dernier row.
    const cursor = await getLastPulledAt(SyncStateKey.visits());
    expect(cursor).toBe("2026-04-24T11:00:00.000Z");
  });

  it("idempotence : 2 pulls consécutifs sans nouvelles données → pulled: 0", async () => {
    const { supabase: s1 } = makeMockSupabase({
      visits: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          user_id: USER,
          client_id: "c3",
          title: "Une fois",
          status: "draft",
          version: 1,
          address: null,
          mission_type: null,
          building_type: null,
          created_at: "2026-04-24T12:00:00.000Z",
          updated_at: "2026-04-24T12:00:00.000Z",
        },
      ],
      visit_json_state: [],
    });

    const r1 = await runPullOnce(s1 as unknown as Parameters<typeof runPullOnce>[0], USER);
    expect(r1.pulled).toBe(1);

    // Second pull : le mock renvoie [] cette fois.
    const { supabase: s2 } = makeMockSupabase({
      visits: [],
      visit_json_state: [],
    });
    const r2 = await runPullOnce(s2 as unknown as Parameters<typeof runPullOnce>[0], USER);
    expect(r2.pulled).toBe(0);

    // Pas de doublon en local.
    const all = await getDb().visits.toArray();
    expect(all.length).toBe(1);
  });
});

describe("pullMessagesForVisit — lazy par VT", () => {
  it("sinceIso null → fetch sans gt, LIMIT 500", async () => {
    const { supabase, queries } = makeMockSupabase({
      messages: [
        {
          id: "44444444-4444-4444-4444-444444444444",
          user_id: USER,
          visit_id: VISIT_1,
          client_id: "m1",
          role: "user",
          kind: "text",
          content: "Bonjour",
          metadata: {},
          created_at: "2026-04-24T13:00:00.000Z",
        },
      ],
    });

    const r = await pullMessagesForVisit(supabase as unknown as Parameters<typeof pullMessagesForVisit>[0], VISIT_1, {
      sinceIso: null,
    });
    expect(r.count).toBe(1);

    const q = queries.find((qq) => qq.table === "messages")!;
    expect(q.filters.find((f) => f.op === "gt")).toBeUndefined();
    expect(q.filters.find(
      (f) => f.op === "eq" && f.column === "visit_id",
    )?.value).toBe(VISIT_1);
    expect(q.limit).toBe(500);

    const local = await getDb().messages.toArray();
    expect(local.length).toBe(1);
    expect(local[0]!.content).toBe("Bonjour");
    expect(local[0]!.sync_status).toBe("synced");
  });

  it("sinceIso fourni → ajoute gt(created_at, since), LIMIT 200", async () => {
    const { supabase, queries } = makeMockSupabase({ messages: [] });
    await pullMessagesForVisit(supabase as unknown as Parameters<typeof pullMessagesForVisit>[0], VISIT_2, {
      sinceIso: "2026-04-23T00:00:00.000Z",
    });
    const q = queries.find((qq) => qq.table === "messages")!;
    const gt = q.filters.find((f) => f.op === "gt");
    expect(gt?.column).toBe("created_at");
    expect(gt?.value).toBe("2026-04-23T00:00:00.000Z");
    expect(q.limit).toBe(200);
  });

  it("idempotent : un message déjà local n'est pas dupliqué", async () => {
    const row = {
      id: "55555555-5555-5555-5555-555555555555",
      user_id: USER,
      visit_id: VISIT_1,
      client_id: "m-dup",
      role: "user" as const,
      kind: "text" as const,
      content: "déjà là",
      metadata: {},
      created_at: "2026-04-24T14:00:00.000Z",
    };
    const { supabase: s1 } = makeMockSupabase({ messages: [row] });
    const { supabase: s2 } = makeMockSupabase({ messages: [row] });

    await pullMessagesForVisit(s1 as unknown as Parameters<typeof pullMessagesForVisit>[0], VISIT_1, { sinceIso: null });
    await pullMessagesForVisit(s2 as unknown as Parameters<typeof pullMessagesForVisit>[0], VISIT_1, { sinceIso: null });

    const all = await getDb().messages.toArray();
    expect(all.length).toBe(1);
  });
});

describe("Dexie v2 — sync_state", () => {
  it("getLastPulledAt retourne null si jamais set", async () => {
    const v = await getLastPulledAt("never:set");
    expect(v).toBeNull();
  });

  it("setLastPulledAt + getLastPulledAt round-trip", async () => {
    await setLastPulledAt("foo", "2026-04-24T15:00:00.000Z");
    const v = await getLastPulledAt("foo");
    expect(v).toBe("2026-04-24T15:00:00.000Z");
  });

  it("la DB s'ouvre en v5 avec sync_state + schema_registry + attachment_blobs + llm tables", async () => {
    const db = getDb();
    await db.open();
    expect(db.verno).toBe(5);
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toContain("sync_state");
    expect(names).toContain("schema_registry");
    expect(names).toContain("attachment_blobs");
    expect(names).toContain("llm_extractions");
    expect(names).toContain("attachment_ai_descriptions");
  });
});
