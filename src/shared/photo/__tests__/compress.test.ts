import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  compressMedia,
  detectDefaultProfile,
} from "@/shared/photo/compress";

// browser-image-compression : on stub pour ne pas dépendre d'un canvas réel
vi.mock("browser-image-compression", () => ({
  default: vi.fn(async (file: File, opts: { fileType?: string }) => {
    const type = opts.fileType ?? file.type ?? "image/webp";
    // Simule une compression : crée un blob plus petit (50% du size).
    return new File(
      [new Uint8Array(Math.max(1, Math.floor(file.size / 2)))],
      file.name,
      { type },
    );
  }),
}));

vi.mock("@/shared/photo/exif", () => ({
  extractGps: vi.fn(async () => ({ lat: 48.8566, lng: 2.3522 })),
}));

beforeEach(() => {
  // Stub createImageBitmap (happy-dom n'en a pas)
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
    vi.fn(async () => ({
      width: 1600,
      height: 1200,
      close: vi.fn(),
    }));
});

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("detectDefaultProfile", () => {
  it("PDF → pdf", () => {
    expect(detectDefaultProfile(makeFile("plan.pdf", "application/pdf"))).toBe(
      "pdf",
    );
  });

  it("PNG → plan", () => {
    expect(detectDefaultProfile(makeFile("scan.png", "image/png"))).toBe("plan");
  });

  it("JPEG → photo", () => {
    expect(detectDefaultProfile(makeFile("img.jpg", "image/jpeg"))).toBe("photo");
  });

  it("HEIC → photo (fallback prudent)", () => {
    expect(detectDefaultProfile(makeFile("img.heic", "image/heic"))).toBe(
      "photo",
    );
  });
});

describe("compressMedia — profil photo", () => {
  it("retourne un thumbnail non-null + GPS extrait + sha256", async () => {
    const file = makeFile("photo.jpg", "image/jpeg", 4096);
    const result = await compressMedia(file, "photo");

    expect(result.thumbnail).not.toBeNull();
    expect(result.metadata.media_profile).toBe("photo");
    expect(result.metadata.gps).toEqual({ lat: 48.8566, lng: 2.3522 });
    expect(result.metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.metadata.width_px).toBe(1600);
    expect(result.metadata.height_px).toBe(1200);
  });
});

describe("compressMedia — profil plan", () => {
  it("retourne un thumbnail + n'extrait PAS le GPS", async () => {
    const file = makeFile("plan.png", "image/png", 8192);
    const result = await compressMedia(file, "plan");

    expect(result.thumbnail).not.toBeNull();
    expect(result.metadata.media_profile).toBe("plan");
    // exif.extractGps n'est PAS appelé pour les plans
    expect(result.metadata.gps).toBeNull();
  });
});

describe("compressMedia — profil pdf", () => {
  it("passe le fichier en brut sans compression et sans thumbnail", async () => {
    const file = makeFile("doc.pdf", "application/pdf", 10000);
    const result = await compressMedia(file, "pdf");

    // PDF passthrough : same size, same type
    expect(result.compressed).toBe(file);
    expect(result.thumbnail).toBeNull();
    expect(result.metadata.media_profile).toBe("pdf");
    expect(result.metadata.format).toBe("application/pdf");
    expect(result.metadata.thumbnail_format).toBeNull();
    expect(result.metadata.width_px).toBeNull();
    expect(result.metadata.height_px).toBeNull();
    expect(result.metadata.gps).toBeNull();
    expect(result.metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.metadata.size_bytes).toBe(10000);
  });
});
