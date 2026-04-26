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
          // Hash déterministe basé sur le nom — différents fichiers → hash différents
          sha256: `${"a".repeat(63)}${file.name.length % 16}`.slice(0, 64),
        },
      };
    }),
  };
});

import {
  __resetDbForTests,
  getDb,
} from "@/shared/db";
import {
  addMediaToVisit,
  attachPendingMediaToMessage,
  discardDraftMedia,
  listDraftMedia,
  listVisitMedia,
} from "@/shared/photo/repo";

const USER = "00000000-0000-0000-0000-00000000000a";
const VISIT = "00000000-0000-0000-0000-000000000001";
const MESSAGE = "00000000-0000-0000-0000-0000000000ff";

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

describe("addMediaToVisit", () => {
  it("crée la row en sync_status='draft' avec message_id=null", async () => {
    const { attachment } = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("photo1.jpg"),
      profile: "photo",
    });
    expect(attachment.sync_status).toBe("draft");
    expect(attachment.message_id).toBeNull();
    expect(attachment.media_profile).toBe("photo");
    expect(attachment.compressed_path).toMatch(
      new RegExp(`^${USER}/${VISIT}/photos/.+\\.webp$`),
    );
    expect(attachment.thumbnail_path).toMatch(/\.thumb\.webp$/);
    expect(attachment.gps_lat).toBe(1);
    expect(attachment.gps_lng).toBe(2);
  });

  it("ne crée AUCUNE entry sync_queue", async () => {
    const db = getDb();
    await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("photo2.jpg"),
      profile: "photo",
    });
    const queueCount = await db.sync_queue.count();
    expect(queueCount).toBe(0);
  });

  it("crée bien la row attachment_blobs (compressed + thumbnail)", async () => {
    const db = getDb();
    const { attachment } = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("photo3.jpg"),
      profile: "photo",
    });
    const blob = await db.attachment_blobs.get(attachment.id);
    expect(blob).toBeDefined();
    expect(blob!.compressed).toBeDefined();
    expect(blob!.thumbnail).not.toBeNull();
  });

  it("PDF → thumbnail null en DB", async () => {
    const db = getDb();
    const { attachment } = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("doc.pdf", "application/pdf"),
      profile: "pdf",
    });
    expect(attachment.thumbnail_path).toBeNull();
    expect(attachment.media_profile).toBe("pdf");
    const blob = await db.attachment_blobs.get(attachment.id);
    expect(blob!.thumbnail).toBeNull();
  });

  it("dedup informatif : retourne is_duplicate=true si même sha256 existe déjà", async () => {
    const file = makeFile("samename.jpg");
    const first = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file,
      profile: "photo",
    });
    expect(first.is_duplicate).toBe(false);

    const second = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file,
      profile: "photo",
    });
    expect(second.is_duplicate).toBe(true);
    expect(second.duplicate_of).toBe(first.attachment.id);
    // Mais l'insert n'est PAS bloqué
    expect(second.attachment.id).not.toBe(first.attachment.id);
  });

  it("canonise les linkedSections fournis", async () => {
    const { attachment } = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("photo.jpg"),
      profile: "photo",
      linkedSections: ["heating.installations[2]", "envelope.murs"],
    });
    expect(attachment.linked_sections).toEqual([
      "heating.installations[]",
      "envelope.murs",
    ]);
  });
});

describe("attachPendingMediaToMessage", () => {
  it("transitionne tous les drafts d'une visite en pending + crée N entries sync_queue", async () => {
    const db = getDb();
    await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("a.jpg"),
      profile: "photo",
    });
    await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("bb.jpg"),
      profile: "photo",
    });
    await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("ccc.jpg"),
      profile: "plan",
    });

    expect(await db.sync_queue.count()).toBe(0);

    const { attached_count } = await attachPendingMediaToMessage(
      VISIT,
      MESSAGE,
    );
    expect(attached_count).toBe(3);

    const drafts = await listDraftMedia(VISIT);
    expect(drafts).toHaveLength(0);

    const all = await listVisitMedia(VISIT);
    expect(all.every((a) => a.sync_status === "pending")).toBe(true);
    expect(all.every((a) => a.message_id === MESSAGE)).toBe(true);

    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(3);
    expect(queue.every((q) => q.op === "attachment_upload")).toBe(true);
    expect(queue.every((q) => q.table === "attachments")).toBe(true);
  });

  it("ne touche PAS les attachments d'une autre visite", async () => {
    const OTHER = "00000000-0000-0000-0000-0000000000bb";
    await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("a.jpg"),
      profile: "photo",
    });
    await addMediaToVisit({
      visitId: OTHER,
      userId: USER,
      file: makeFile("b.jpg"),
      profile: "photo",
    });

    const { attached_count } = await attachPendingMediaToMessage(
      VISIT,
      MESSAGE,
    );
    expect(attached_count).toBe(1);

    const otherDrafts = await listDraftMedia(OTHER);
    expect(otherDrafts).toHaveLength(1);
    expect(otherDrafts[0]!.message_id).toBeNull();
  });
});

describe("discardDraftMedia", () => {
  it("supprime row + blob d'un draft", async () => {
    const db = getDb();
    const { attachment } = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("photo.jpg"),
      profile: "photo",
    });
    await discardDraftMedia(attachment.id);
    expect(await db.attachments.get(attachment.id)).toBeUndefined();
    expect(await db.attachment_blobs.get(attachment.id)).toBeUndefined();
  });

  it("ne supprime PAS un attachment déjà passé en pending", async () => {
    const db = getDb();
    const { attachment } = await addMediaToVisit({
      visitId: VISIT,
      userId: USER,
      file: makeFile("photo.jpg"),
      profile: "photo",
    });
    await attachPendingMediaToMessage(VISIT, MESSAGE);
    await discardDraftMedia(attachment.id);
    expect(await db.attachments.get(attachment.id)).toBeDefined();
    expect(await db.attachment_blobs.get(attachment.id)).toBeDefined();
  });
});
