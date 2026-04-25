/**
 * Tests resolveOrCreateRegistryEntry — flux online + offline.
 *
 * On utilise un mock structurel `SchemaRegistrySupabaseLike`. Le mirror
 * Dexie est testé via fake-indexeddb (setup global vitest).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDbForTests,
  findLocalRegistryByUrn,
  getDb,
  resolveOrCreateRegistryEntry,
} from "@/shared/db";
import type { SchemaRegistryEntry } from "@/shared/types";

const USER = "00000000-0000-0000-0000-00000000000a";

beforeEach(async () => {
  __resetDbForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("vtu");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  // Online par défaut
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

afterEach(async () => {
  const db = getDb();
  if (db.isOpen()) db.close();
  __resetDbForTests();
});

// ---------------------------------------------------------------------------
// Helpers : mock Supabase structurel
// ---------------------------------------------------------------------------

interface MockOpts {
  /** Réponse au SELECT match exact serveur. */
  remoteExact?: SchemaRegistryEntry | null;
  /** Réponse de l'INSERT (data ou error). */
  insert?:
    | { data: SchemaRegistryEntry; error: null }
    | { data: null; error: { code?: string; message: string } };
  /** Re-fetch après conflict 23505. */
  refetchOnConflict?: SchemaRegistryEntry | null;
  /** Throw au fromExact (simule réseau down). */
  throwOnExactSelect?: boolean;
}

function makeMockSupabase(opts: MockOpts = {}) {
  const calls = {
    rpc: [] as Array<{ fn: string; params: Record<string, unknown> }>,
    inserts: 0,
  };
  let selectCount = 0;
  const supabase = {
    from(_table: string) {
      const builder = {
        _isInsert: false,
        _payload: null as Record<string, unknown> | null,
        select(_cols: string) {
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          calls.inserts++;
          builder._isInsert = true;
          builder._payload = payload;
          return builder;
        },
        eq(_c: string, _v: string) {
          return builder;
        },
        async maybeSingle() {
          if (opts.throwOnExactSelect) throw new Error("network down");
          return { data: opts.remoteExact ?? null, error: null };
        },
        async single() {
          // Si on est en train d'insert → renvoie la réponse insert
          if (builder._isInsert) {
            return opts.insert ?? { data: null, error: null };
          }
          // sinon, c'est le re-fetch après conflict
          selectCount++;
          return { data: opts.refetchOnConflict ?? null, error: null };
        },
      };
      return builder;
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      calls.rpc.push({ fn, params });
      if (fn === "find_similar_schema_fields")
        return { data: [], error: null };
      if (fn === "increment_registry_usage")
        return { data: null, error: null };
      return { data: null, error: null };
    },
    _calls: calls,
    _selectCount: () => selectCount,
  };
  return supabase;
}

function fakeRegistryEntry(
  overrides: Partial<SchemaRegistryEntry> = {},
): SchemaRegistryEntry {
  const now = new Date().toISOString();
  return {
    id: "aaaa1111-1111-1111-1111-111111111111",
    user_id: USER,
    organization_id: null,
    registry_urn: "urn:vtu:schema:building.heat_loss_kw:v1",
    field_key: "heat_loss_kw",
    section_path: "building",
    label_fr: "Déperdition (kW)",
    value_type: "number",
    unit: "kW",
    enum_values: [],
    synonyms: [],
    usage_count: 1,
    first_seen_at: now,
    promoted_at: null,
    ai_suggested: false,
    description: null,
    parent_concept: null,
    semantic_embedding: null,
    status: "candidate",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ONLINE
// ---------------------------------------------------------------------------

describe("resolveOrCreateRegistryEntry — online flow", () => {
  it("crée une nouvelle entrée si rien ne match (INSERT + mirror)", async () => {
    const remote = fakeRegistryEntry();
    const supabase = makeMockSupabase({
      remoteExact: null,
      insert: { data: remote, error: null },
    });

    const res = await resolveOrCreateRegistryEntry(supabase, {
      sectionPath: "building",
      fieldKey: "heat_loss_kw",
      labelFr: "Déperdition (kW)",
      valueType: "number",
      unit: "kW",
      aiSuggested: false,
      userId: USER,
    });

    expect(res.registry_urn).toBe("urn:vtu:schema:building.heat_loss_kw:v1");
    expect(res.registry_id).toBe(remote.id);
    expect(res.is_new).toBe(true);
    expect(res.offline_pending).toBe(false);
    expect(supabase._calls.inserts).toBe(1);

    // Mirror Dexie
    const local = await findLocalRegistryByUrn(res.registry_urn);
    expect(local?.sync_status).toBe("synced");
  });

  it("match exact serveur : pas d'INSERT, RPC increment appelé", async () => {
    const remote = fakeRegistryEntry({ usage_count: 5 });
    const supabase = makeMockSupabase({ remoteExact: remote });

    const res = await resolveOrCreateRegistryEntry(supabase, {
      sectionPath: "building",
      fieldKey: "heat_loss_kw",
      labelFr: "Déperdition (kW)",
      valueType: "number",
      aiSuggested: false,
      userId: USER,
    });

    expect(res.is_new).toBe(false);
    expect(res.registry_id).toBe(remote.id);
    expect(supabase._calls.inserts).toBe(0);
    expect(supabase._calls.rpc.some((c) => c.fn === "increment_registry_usage")).toBe(
      true,
    );
  });

  it("match exact local synced : court-circuite le SELECT serveur", async () => {
    // Pré-remplit le mirror Dexie en synced
    const remote = fakeRegistryEntry();
    const db = getDb();
    await db.schema_registry.put({
      ...remote,
      sync_status: "synced",
      sync_attempts: 0,
      sync_last_error: null,
      local_updated_at: new Date().toISOString(),
    });

    const supabase = makeMockSupabase({});
    const res = await resolveOrCreateRegistryEntry(supabase, {
      sectionPath: "building",
      fieldKey: "heat_loss_kw",
      labelFr: "Déperdition (kW)",
      valueType: "number",
      aiSuggested: false,
      userId: USER,
    });

    expect(res.is_new).toBe(false);
    expect(res.registry_id).toBe(remote.id);
    // Pas d'INSERT
    expect(supabase._calls.inserts).toBe(0);
    // RPC increment uniquement
    expect(
      supabase._calls.rpc.filter((c) => c.fn === "increment_registry_usage").length,
    ).toBe(1);
  });

  it("conflict 23505 → re-fetch et retourne l'existant", async () => {
    const conflicting = fakeRegistryEntry({ id: "bbbb2222-2222-2222-2222-222222222222" });
    const supabase = makeMockSupabase({
      remoteExact: null,
      insert: { data: null, error: { code: "23505", message: "duplicate" } },
      refetchOnConflict: conflicting,
    });

    const res = await resolveOrCreateRegistryEntry(supabase, {
      sectionPath: "building",
      fieldKey: "heat_loss_kw",
      labelFr: "Déperdition (kW)",
      valueType: "number",
      aiSuggested: false,
      userId: USER,
    });

    expect(res.is_new).toBe(false);
    expect(res.registry_id).toBe(conflicting.id);
    expect(res.offline_pending).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OFFLINE
// ---------------------------------------------------------------------------

describe("resolveOrCreateRegistryEntry — offline-first", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
  });

  it("offline → URN déterministe + mirror local pending + enqueue", async () => {
    const supabase = makeMockSupabase({});
    const res = await resolveOrCreateRegistryEntry(supabase, {
      sectionPath: "ecs[0]",
      fieldKey: "calorifuge_material",
      labelFr: "Calorifuge",
      valueType: "string",
      aiSuggested: false,
      userId: USER,
    });

    // URN canonisé déterministe
    expect(res.registry_urn).toBe(
      "urn:vtu:schema:ecs[].calorifuge_material:v1",
    );
    expect(res.registry_id).toBeNull();
    expect(res.offline_pending).toBe(true);

    // Mirror local pending
    const local = await findLocalRegistryByUrn(res.registry_urn);
    expect(local?.sync_status).toBe("pending");

    // Enqueue dans sync_queue
    const db = getDb();
    const queue = await db.sync_queue.toArray();
    expect(queue.length).toBe(1);
    expect(queue[0]!.table).toBe("schema_registry");
    expect(queue[0]!.op).toBe("insert");

    // Pas d'appel réseau
    expect(supabase._calls.inserts).toBe(0);
  });

  it("erreur réseau → fallback offline (enqueue, pas de throw)", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    const supabase = makeMockSupabase({ throwOnExactSelect: true });

    const res = await resolveOrCreateRegistryEntry(supabase, {
      sectionPath: "building",
      fieldKey: "heat_loss_kw",
      labelFr: "Déperdition",
      valueType: "number",
      aiSuggested: false,
      userId: USER,
    });

    expect(res.offline_pending).toBe(true);
    expect(res.registry_id).toBeNull();
    expect(res.registry_urn).toBe("urn:vtu:schema:building.heat_loss_kw:v1");
  });

  it("offline + même URN appelé 2 fois → 1 seule entry locale (dédup)", async () => {
    const supabase = makeMockSupabase({});
    const params = {
      sectionPath: "building",
      fieldKey: "heat_loss_kw",
      labelFr: "Déperdition",
      valueType: "number" as const,
      aiSuggested: false,
      userId: USER,
    };
    await resolveOrCreateRegistryEntry(supabase, params);
    await resolveOrCreateRegistryEntry(supabase, params);

    const db = getDb();
    const all = await db.schema_registry.toArray();
    expect(all.length).toBe(1);
  });
});
