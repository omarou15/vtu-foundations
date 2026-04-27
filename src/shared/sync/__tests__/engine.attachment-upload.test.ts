/**
 * VTU — Tests Itération 9 : handler attachment_upload.
 *
 * Mocks SyncSupabaseLike + Storage. On vérifie le workflow :
 *  1. Happy path
 *  2. Message pas encore synced → backoff sans incrément attempts
 *  3. PDF (thumbnail null) : 1 seul upload Storage
 *  4. Conflict 23505 sur INSERT → traité succès
 *  5. Row déjà serveur (SELECT id) → skip INSERT
 *  6. Storage upload échoue → mark failed/retry standard (attempts++)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDbForTests,
  getDb,
} from "@/shared/db";
import {
  addMediaToVisit,
  attachPendingMediaToMessage,
} from "@/shared/photo/repo";
import { runSyncOnce } from "@/shared/sync";
import type { SyncSupabaseLike } from "@/shared/sync/engine";

vi.mock("@/shared/photo/compress", async () => {
  const actual =
    await vi.importActual<typeof import("@/shared/photo/compress")>(
      "@/shared/photo/compress",
    );
  return {
    ...actual,
    compressMedia: vi.fn(
      async (file: File, profile: "photo" | "plan" | "pdf") => {
        const isPdf = profile === "pdf";
        return {
          compressed: isPdf
            ? file
            : new Blob([new Uint8Array(64)], { type: "image/webp" }),
          thumbnail: isPdf
            ? null
            : new Blob([new Uint8Array(16)], { type: "image/webp" }),
          metadata: {
            media_profile: profile,
            width_px: isPdf ? null : 1600,
            height_px: isPdf ? null : 1200,
            size_bytes: isPdf ? file.size : 64,
            format: isPdf ? "application/pdf" : "image/webp",
            thumbnail_format: isPdf ? null : "image/webp",
            gps: profile === "photo" ? { lat: 1, lng: 2 } : null,
            sha256: `${"a".repeat(63)}${file.name.length % 16}`.slice(0, 64),
          },
        };
      },
    ),
  };
});

const USER = "00000000-0000-0000-0000-00000000000a";
const VISIT = "00000000-0000-0000-0000-000000000001";
const MESSAGE = "00000000-0000-0000-0000-0000000000ff";

interface MockState {
  /** id présents côté serveur dans la table messages (résolution maybeSingle). */
  serverMessageIds: Set<string>;
  /** id présents côté serveur dans la table attachments. */
  serverAttachmentIds: Set<string>;
  /** Force une erreur upload (1ère occurrence). */
  uploadError?: { message: string } | null;
  /** Force une erreur insert (1ère occurrence). */
  insertError?: { code?: string; message: string } | null;
  uploads: Array<{ bucket: string; path: string }>;
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  selects: Array<{ table: string; column: string; value: string }>;
}

function makeMockSupabase(state: MockState): SyncSupabaseLike {
  return {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          state.inserts.push({ table, payload });
          if (table === "attachments" && state.insertError) {
            const err = state.insertError;
            state.insertError = null;
            return Promise.resolve({ error: err });
          }
          if (table === "attachments") {
            state.serverAttachmentIds.add(payload.id as string);
          }
          return Promise.resolve({ error: null });
        },
        update(_payload: Record<string, unknown>) {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              state.selects.push({ table, column, value });
              return {
                maybeSingle() {
                  if (table === "messages") {
                    return Promise.resolve({
                      data: state.serverMessageIds.has(value)
                        ? { id: value }
                        : null,
                      error: null,
                    });
                  }
                  if (table === "attachments") {
                    return Promise.resolve({
                      data: state.serverAttachmentIds.has(value)
                        ? { id: value }
                        : null,
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, _file: Blob) {
            state.uploads.push({ bucket, path });
            if (state.uploadError) {
              const err = state.uploadError;
              state.uploadError = null;
              return Promise.resolve({ error: err });
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

function makeFile(name: string, type = "image/jpeg", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
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

async function setupOneMedia(profile: "photo" | "pdf" = "photo") {
  const file = makeFile(
    profile === "pdf" ? "doc.pdf" : "p.jpg",
    profile === "pdf" ? "application/pdf" : "image/jpeg",
  );
  const { attachment } = await addMediaToVisit({
    visitId: VISIT,
    userId: USER,
    file,
    profile,
  });
  await attachPendingMediaToMessage(VISIT, MESSAGE);
  return attachment;
}

describe("engine — processAttachmentUpload", () => {
  it("happy path : upload compressed + thumbnail + INSERT → synced + queue cleared", async () => {
    const att = await setupOneMedia("photo");
    const state: MockState = {
      serverMessageIds: new Set([MESSAGE]),
      serverAttachmentIds: new Set(),
      uploads: [],
      inserts: [],
      selects: [],
    };
    const supabase = makeMockSupabase(state);

    const result = await runSyncOnce(supabase);

    // attachment_upload processed (au moins 1). describe_media est aussi
    // enqueué (It. 10) puis traité (échec attendu sans createSignedUrl mocké).
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(state.uploads).toHaveLength(2); // compressed + thumbnail
    const attachInserts = state.inserts.filter((i) => i.table === "attachments");
    expect(attachInserts).toHaveLength(1);

    // Queue ne contient plus l'attachment_upload (peut contenir un
    // describe_media en retry à cause du mock incomplet — c'est OK).
    const queue = await getDb().sync_queue.toArray();
    expect(queue.filter((q) => q.op === "attachment_upload")).toHaveLength(0);

    const reloaded = await getDb().attachments.get(att.id);
    expect(reloaded?.sync_status).toBe("synced");
  });

  it("message pas encore synced → backoff SANS incrément attempts", async () => {
    await setupOneMedia("photo");
    const state: MockState = {
      serverMessageIds: new Set(), // message absent côté serveur
      serverAttachmentIds: new Set(),
      uploads: [],
      inserts: [],
      selects: [],
    };
    const supabase = makeMockSupabase(state);

    const result = await runSyncOnce(supabase);

    // Pas d'upload, pas d'insert (on attend la dépendance)
    expect(state.uploads).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
    expect(result.processed).toBe(0);

    const queue = await getDb().sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.attempts).toBe(0); // attempts INCHANGÉ
    expect(queue[0]!.last_error).toBe("message_not_synced");
    expect(Date.parse(queue[0]!.next_attempt_at)).toBeGreaterThan(Date.now());
  });

  it("PDF (thumbnail null) : 1 seul upload Storage, succès", async () => {
    await setupOneMedia("pdf");
    const state: MockState = {
      serverMessageIds: new Set([MESSAGE]),
      serverAttachmentIds: new Set(),
      uploads: [],
      inserts: [],
      selects: [],
    };
    const supabase = makeMockSupabase(state);

    const result = await runSyncOnce(supabase);

    // PDF : attachment_upload + describe_media (PDF skip qui écrit
    // attachment_ai_descriptions) + insert ai_description = 3 ops processed.
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(state.uploads).toHaveLength(1); // SEULEMENT compressed
    const attachInserts = state.inserts.filter((i) => i.table === "attachments");
    expect(attachInserts).toHaveLength(1);
  });

  it("conflict 23505 sur INSERT → traité comme succès, mark synced", async () => {
    const att = await setupOneMedia("photo");
    const state: MockState = {
      serverMessageIds: new Set([MESSAGE]),
      serverAttachmentIds: new Set(),
      insertError: { code: "23505", message: "duplicate key" },
      uploads: [],
      inserts: [],
      selects: [],
    };
    const supabase = makeMockSupabase(state);

    const result = await runSyncOnce(supabase);

    expect(result.processed).toBe(1);
    expect((await getDb().sync_queue.toArray())).toHaveLength(0);
    expect((await getDb().attachments.get(att.id))?.sync_status).toBe(
      "synced",
    );
  });

  it("row déjà présente serveur (SELECT renvoie id) : skip INSERT, mark synced", async () => {
    const att = await setupOneMedia("photo");
    const state: MockState = {
      serverMessageIds: new Set([MESSAGE]),
      serverAttachmentIds: new Set([att.id]), // déjà côté serveur
      uploads: [],
      inserts: [],
      selects: [],
    };
    const supabase = makeMockSupabase(state);

    const result = await runSyncOnce(supabase);

    expect(result.processed).toBe(1);
    // Uploads tournent (idempotents), mais PAS d'INSERT
    expect(state.inserts).toHaveLength(0);
    expect((await getDb().attachments.get(att.id))?.sync_status).toBe(
      "synced",
    );
  });

  it("storage upload échoue → retry-later + incrément attempts", async () => {
    await setupOneMedia("photo");
    const state: MockState = {
      serverMessageIds: new Set([MESSAGE]),
      serverAttachmentIds: new Set(),
      uploadError: { message: "network error" },
      uploads: [],
      inserts: [],
      selects: [],
    };
    const supabase = makeMockSupabase(state);

    const result = await runSyncOnce(supabase);

    expect(result.processed).toBe(0);
    expect(state.inserts).toHaveLength(0);

    const queue = await getDb().sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.attempts).toBe(1); // ← incrément standard
    expect(queue[0]!.last_error).toContain("network error");
  });
});
