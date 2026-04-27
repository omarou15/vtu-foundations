/**
 * It. 10.6 — Tests rafale & multi-import.
 *
 * Vérifie que le pipeline existant (addMediaToVisit ×N + appendLocalMessage
 * + attachPendingMediaToMessage) supporte bien :
 *  - rafale 5 photos → 1 message avec 5 attachments
 *  - multi-import mix images + PDFs → 1 message avec N attachments
 *  - retrait d'un draft avant envoi
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/photo/compress", async () => {
  const actual = await vi.importActual<typeof import("@/shared/photo/compress")>(
    "@/shared/photo/compress",
  );
  return {
    ...actual,
    compressMedia: vi.fn(async (file: File, profile: "photo" | "plan" | "pdf") => {
      const isPdf = profile === "pdf";
      return {
        compressed: isPdf
          ? file
          : new Blob([new Uint8Array(64)], { type: "image/webp" }),
        thumbnail: isPdf ? null : new Blob([new Uint8Array(16)], { type: "image/webp" }),
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
    }),
  };
});

import {
  __resetDbForTests,
  appendLocalMessage,
  getDb,
} from "@/shared/db";
import {
  addMediaToVisit,
  attachPendingMediaToMessage,
  discardDraftMedia,
  listDraftMedia,
  listVisitMedia,
} from "@/shared/photo";
import { createLocalVisit } from "@/shared/db/visits.repo";

const USER = "00000000-0000-0000-0000-00000000000a";

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

function makeFile(name: string, type = "image/jpeg", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("It. 10.6 — Rafale & multi-import flow", () => {
  it("rafale 5 photos → 1 message avec 5 attachments rattachés", async () => {
    const visit = await createLocalVisit({ userId: USER, title: "Test" });

    // 5 photos prises en rafale
    for (let i = 0; i < 5; i++) {
      await addMediaToVisit({
        visitId: visit.visit.id,
        userId: USER,
        file: makeFile(`photo-${"x".repeat(i)}.jpg`),
        profile: "photo",
      });
    }

    expect(await listDraftMedia(visit.visit.id)).toHaveLength(5);

    // Envoi : crée le message + rattache TOUS les drafts
    const msg = await appendLocalMessage({
      userId: USER,
      visitId: visit.visit.id,
      role: "user",
      kind: "photo",
      content: null,
    });
    const result = await attachPendingMediaToMessage(visit.visit.id, msg.id);

    expect(result.attached_count).toBe(5);
    expect(await listDraftMedia(visit.visit.id)).toHaveLength(0);

    const allMedia = await listVisitMedia(visit.visit.id);
    expect(allMedia).toHaveLength(5);
    expect(allMedia.every((a) => a.message_id === msg.id)).toBe(true);
    expect(allMedia.every((a) => a.sync_status === "pending")).toBe(true);
  });

  it("multi-import 3 PDFs + 2 images → 1 message avec 5 attachments", async () => {
    const visit = await createLocalVisit({ userId: USER, title: "Test" });

    await addMediaToVisit({
      visitId: visit.visit.id,
      userId: USER,
      file: makeFile("plan-1.png", "image/png"),
      profile: "plan",
    });
    await addMediaToVisit({
      visitId: visit.visit.id,
      userId: USER,
      file: makeFile("plan-22.png", "image/png"),
      profile: "plan",
    });
    for (const name of ["a.pdf", "bb.pdf", "ccc.pdf"]) {
      await addMediaToVisit({
        visitId: visit.visit.id,
        userId: USER,
        file: makeFile(name, "application/pdf"),
        profile: "pdf",
      });
    }

    const msg = await appendLocalMessage({
      userId: USER,
      visitId: visit.visit.id,
      role: "user",
      kind: "document",
      content: null,
    });
    const result = await attachPendingMediaToMessage(visit.visit.id, msg.id);

    expect(result.attached_count).toBe(5);
    const all = await listVisitMedia(visit.visit.id);
    expect(all.filter((a) => a.media_profile === "pdf")).toHaveLength(3);
    expect(all.filter((a) => a.media_profile === "plan")).toHaveLength(2);
  });

  it("retrait d'un draft avant envoi : N-1 attachments rattachés", async () => {
    const visit = await createLocalVisit({ userId: USER, title: "Test" });

    const drafts = [];
    for (let i = 0; i < 3; i++) {
      const r = await addMediaToVisit({
        visitId: visit.visit.id,
        userId: USER,
        file: makeFile(`p-${"y".repeat(i)}.jpg`),
        profile: "photo",
      });
      drafts.push(r.attachment);
    }

    // L'utilisateur retire la 2e photo
    await discardDraftMedia(drafts[1]!.id);
    expect(await listDraftMedia(visit.visit.id)).toHaveLength(2);

    const msg = await appendLocalMessage({
      userId: USER,
      visitId: visit.visit.id,
      role: "user",
      kind: "photo",
      content: null,
    });
    const result = await attachPendingMediaToMessage(visit.visit.id, msg.id);
    expect(result.attached_count).toBe(2);
  });

  it("photo-only avec ai_enabled=true → enqueue llm_route_and_dispatch", async () => {
    const visit = await createLocalVisit({ userId: USER, title: "Test" });
    await addMediaToVisit({
      visitId: visit.visit.id,
      userId: USER,
      file: makeFile("p.jpg"),
      profile: "photo",
    });

    const msg = await appendLocalMessage({
      userId: USER,
      visitId: visit.visit.id,
      role: "user",
      kind: "photo",
      content: null,
      metadata: { attachment_count: 1, ai_enabled: true },
    });

    const jobs = await getDb()
      .sync_queue.where("[op+row_id]")
      .equals(["llm_route_and_dispatch", msg.id])
      .toArray();
    expect(jobs).toHaveLength(1);
  });

  it("photo-only avec ai_enabled=false → AUCUN dispatch enqueué", async () => {
    const visit = await createLocalVisit({ userId: USER, title: "Test" });
    await addMediaToVisit({
      visitId: visit.visit.id,
      userId: USER,
      file: makeFile("p.jpg"),
      profile: "photo",
    });

    const msg = await appendLocalMessage({
      userId: USER,
      visitId: visit.visit.id,
      role: "user",
      kind: "photo",
      content: null,
      metadata: { attachment_count: 1, ai_enabled: false },
    });

    const jobs = await getDb()
      .sync_queue.where("[op+row_id]")
      .equals(["llm_route_and_dispatch", msg.id])
      .toArray();
    expect(jobs).toHaveLength(0);
  });
});
