/**
 * Tests Dexie v1 — smoke + idempotence + factory JSON state.
 *
 * NB sur les tests RLS cross-user :
 * Les RLS Supabase ne sont PAS testées ici (Vitest tourne en JSDOM
 * sans vrai serveur PostgREST authentifié). Elles sont validées :
 *   1. par la migration elle-même (policies créées)
 *   2. par audit manuel via 2 sessions Supabase distinctes
 *   3. à l'Itération 6 via tests E2E contre Supabase staging
 *
 * Idem pour ON CONFLICT DO NOTHING côté Postgres : ici on teste
 * l'équivalent côté Dexie (upsert*FromRemote no-op si client_id
 * dupliqué). Le comportement DB est garanti par les contraintes
 * UNIQUE (user_id, client_id) de la migration 001.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  appendLocalMessage,
  createLocalVisit,
  getDb,
  getLatestLocalJsonState,
  insertLocalJsonState,
  listLocalMessagesByVisit,
  upsertMessageFromRemote,
  upsertVisitFromRemote,
} from "@/shared/db";
import {
  createInitialVisitJsonState,
  VisitJsonStateSchema,
  type MessageRow,
  type VisitRow,
} from "@/shared/types";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

beforeEach(async () => {
  // Repart d'une DB Dexie propre à chaque test.
  __resetDbForTests();
  // Supprime la DB IndexedDB sous-jacente.
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

describe("Dexie schema — smoke", () => {
  it("ouvre la DB en v4 et expose les 8 tables (incl. attachment_blobs)", async () => {
    const db = getDb();
    await db.open();
    expect(db.verno).toBe(4);
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual([
      "attachment_blobs",
      "attachments",
      "messages",
      "schema_registry",
      "sync_queue",
      "sync_state",
      "visit_json_state",
      "visits",
    ]);
  });
});

describe("createLocalVisit — squelette JSON initial", () => {
  it("crée une visite locale avec sync_status=pending et JSON meta.* pré-rempli", async () => {
    const { visit, initialState } = await createLocalVisit({
      userId: USER_A,
      title: "Maison Dupont",
      thermicienName: "Omar",
    });

    // Visite locale
    expect(visit.user_id).toBe(USER_A);
    expect(visit.title).toBe("Maison Dupont");
    expect(visit.status).toBe("draft");
    expect(visit.version).toBe(1);
    expect(visit.sync_status).toBe("pending");
    expect(visit.client_id).toMatch(/^[0-9a-f-]{36}$/);

    // JSON state initial
    expect(initialState.schema_version).toBe(2);
    expect(initialState.meta.visit_id.value).toBe(visit.id);
    expect(initialState.meta.client_id.value).toBe(visit.client_id);
    expect(initialState.meta.title.value).toBe("Maison Dupont");
    expect(initialState.meta.thermicien_id.value).toBe(USER_A);
    expect(initialState.meta.thermicien_name.value).toBe("Omar");

    // Champs non renseignés → value: null avec source "init"
    expect(initialState.meta.address.value).toBeNull();
    expect(initialState.meta.address.source).toBe("init");
    expect(initialState.meta.client_email.value).toBeNull();

    // Le squelette doit valider son propre schéma zod.
    expect(() => VisitJsonStateSchema.parse(initialState)).not.toThrow();
  });

  it("persiste la visite dans Dexie (lookup par PK fonctionne)", async () => {
    const { visit } = await createLocalVisit({ userId: USER_A });
    const db = getDb();
    const fetched = await db.visits.get(visit.id);
    expect(fetched?.id).toBe(visit.id);
  });
});

describe("Idempotence client_id (équivalent ON CONFLICT DO NOTHING)", () => {
  it("upsertVisitFromRemote avec même (user_id, client_id) ne dédouble pas", async () => {
    const row: VisitRow = {
      id: "11111111-1111-1111-1111-111111111111",
      user_id: USER_A,
      client_id: "client-abc",
      title: "Visite remote",
      status: "in_progress",
      version: 1,
      address: null,
      mission_type: null,
      building_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    await upsertVisitFromRemote(row);
    await upsertVisitFromRemote(row); // dupliqué : doit no-op

    const db = getDb();
    const all = await db.visits
      .where("[user_id+client_id]")
      .equals([USER_A, "client-abc"])
      .toArray();
    expect(all.length).toBe(1);
  });

  it("upsertVisitFromRemote met à jour si version supérieure", async () => {
    const v1: VisitRow = {
      id: "22222222-2222-2222-2222-222222222222",
      user_id: USER_A,
      client_id: "client-xyz",
      title: "v1",
      status: "draft",
      version: 1,
      address: null,
      mission_type: null,
      building_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const v2: VisitRow = { ...v1, title: "v2", version: 2 };

    await upsertVisitFromRemote(v1);
    await upsertVisitFromRemote(v2);

    const db = getDb();
    const fetched = await db.visits.get(v1.id);
    expect(fetched?.version).toBe(2);
    expect(fetched?.title).toBe("v2");
  });

  it("upsertMessageFromRemote append-only : dupliqué ignoré", async () => {
    const msg: MessageRow = {
      id: "33333333-3333-3333-3333-333333333333",
      user_id: USER_A,
      visit_id: "44444444-4444-4444-4444-444444444444",
      client_id: "msg-client-1",
      role: "user",
      kind: "text",
      content: "Bonjour",
      metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    };

    await upsertMessageFromRemote(msg);
    await upsertMessageFromRemote({ ...msg, content: "Tentative d'update" });

    const db = getDb();
    const all = await db.messages
      .where("[user_id+client_id]")
      .equals([USER_A, "msg-client-1"])
      .toArray();
    expect(all.length).toBe(1);
    // Append-only : le contenu original est préservé.
    expect(all[0]!.content).toBe("Bonjour");
  });

  it("client_id généré localement est unique entre 2 createLocalVisit", async () => {
    const a = await createLocalVisit({ userId: USER_A });
    const b = await createLocalVisit({ userId: USER_A });
    expect(a.visit.client_id).not.toBe(b.visit.client_id);
    expect(a.visit.id).not.toBe(b.visit.id);
  });
});

describe("Isolation user (côté Dexie : index user_id)", () => {
  it("listLocalMessagesByVisit ne mélange pas les données de 2 users", async () => {
    // Note : Dexie est local au navigateur d'un user, donc l'isolation
    // "cross-user" en JSDOM n'a pas de sens (un seul navigateur = un user).
    // On vérifie juste que les index user_id discriminent correctement.
    const { visit: vA } = await createLocalVisit({ userId: USER_A });
    const { visit: vB } = await createLocalVisit({ userId: USER_B });

    await appendLocalMessage({
      userId: USER_A,
      visitId: vA.id,
      role: "user",
      content: "secret A",
    });
    await appendLocalMessage({
      userId: USER_B,
      visitId: vB.id,
      role: "user",
      content: "secret B",
    });

    const msgsA = await listLocalMessagesByVisit(vA.id);
    const msgsB = await listLocalMessagesByVisit(vB.id);

    expect(msgsA.length).toBe(1);
    expect(msgsA[0]!.content).toBe("secret A");
    expect(msgsB.length).toBe(1);
    expect(msgsB[0]!.content).toBe("secret B");
  });
});

describe("visit_json_state — versioning local", () => {
  it("getLatestLocalJsonState retourne la version la plus haute", async () => {
    const { visit, initialState } = await createLocalVisit({ userId: USER_A });

    await insertLocalJsonState({
      userId: USER_A,
      visitId: visit.id,
      version: 1,
      state: initialState,
    });
    await insertLocalJsonState({
      userId: USER_A,
      visitId: visit.id,
      version: 2,
      state: initialState,
    });
    await insertLocalJsonState({
      userId: USER_A,
      visitId: visit.id,
      version: 3,
      state: initialState,
    });

    const latest = await getLatestLocalJsonState(visit.id);
    expect(latest?.version).toBe(3);
  });
});

describe("Factory createInitialVisitJsonState — pur (hors Dexie)", () => {
  it("est conforme au schéma zod et expose des Field<T> traçables", () => {
    const visitId = "55555555-5555-5555-5555-555555555555";
    const state = createInitialVisitJsonState({
      visitId,
      clientId: "c-1",
      title: "T",
      thermicienId: USER_A,
    });
    const parsed = VisitJsonStateSchema.parse(state);
    expect(parsed.meta.visit_id.value).toBe(visitId);
    expect(parsed.meta.visit_id.source).toBe("init");
    expect(parsed.meta.address.value).toBeNull();
    expect(parsed.meta.address.source).toBe("init");
    expect(parsed.meta.address.confidence).toBeNull();
  });
});
