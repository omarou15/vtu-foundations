/**
 * VTU — Pipeline de compression médias (It. 9).
 *
 * Trois profils, un seul point d'entrée `compressMedia(file, profile)`.
 * Le profil est choisi par l'UTILISATEUR via AttachmentSheet (intention-first)
 * et prime toujours sur la détection automatique (`detectDefaultProfile`).
 *
 *   ─────────────┬─────────────┬─────────────────┬─────────────────
 *   Profil       │ Photo       │ Plan / document │ PDF
 *   ─────────────┼─────────────┼─────────────────┼─────────────────
 *   maxWidth     │ 1600 px     │ 3000 px         │ — (brut)
 *   quality      │ 0.80        │ 0.95            │ —
 *   format       │ WebP/JPEG   │ WebP/PNG        │ application/pdf
 *   EXIF         │ strip+GPS   │ preserved       │ N/A
 *   thumbnail    │ 256@0.60    │ 512@0.85        │ NULL (icône SVG)
 *   ─────────────┴─────────────┴─────────────────┴─────────────────
 *
 * Toutes les compressions tournent dans le worker interne de
 * `browser-image-compression` (pas de blocage main thread).
 */

import imageCompression from "browser-image-compression";
import type { MediaProfile } from "@/shared/types/db";
import { sha256OfBlob } from "./sha256";
import { extractGps, type GpsCoords } from "./exif";

export interface CompressedMedia {
  /**
   * Version compressée à uploader (Blob/File). Pour les PDF, c'est le
   * fichier brut (pas de re-encode).
   */
  compressed: Blob;
  /**
   * Thumbnail à uploader. NULL pour les PDF — la UI utilise un composant
   * `<PdfThumbIcon />` (SVG inline) à la place.
   */
  thumbnail: Blob | null;
  metadata: {
    media_profile: MediaProfile;
    /** Dimensions de la version compressée (null pour PDF). */
    width_px: number | null;
    height_px: number | null;
    /** Taille du fichier compressé. */
    size_bytes: number;
    /** MIME type final (image/webp, image/jpeg, application/pdf, ...). */
    format: string;
    /** Format du thumbnail (null si pas de thumbnail = PDF). */
    thumbnail_format: string | null;
    /** GPS extrait avant strip EXIF (photos uniquement). */
    gps: GpsCoords | null;
    /** SHA-256 de la version compressée (= dedup informatif côté client). */
    sha256: string;
  };
}

// ---------------------------------------------------------------------------
// Détection automatique du profil par défaut (utilisée par "Importer fichier")
// ---------------------------------------------------------------------------

/**
 * Heuristique simple basée sur le MIME type + extension :
 *  - PDF                    → "pdf"
 *  - PNG (souvent un scan)  → "plan"
 *  - JPEG / HEIC / WebP     → "photo"  (l'utilisateur peut toggler en UI)
 *  - autre                  → "photo"  (fallback prudent)
 *
 * Le profil retourné peut TOUJOURS être surchargé par l'utilisateur dans
 * le PhotoPreviewPanel (toggle 📷/📄).
 */
export function detectDefaultProfile(file: File): MediaProfile {
  const mime = (file.type || "").toLowerCase();
  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (mime === "image/png" || file.name.toLowerCase().endsWith(".png")) {
    return "plan";
  }
  return "photo";
}

// ---------------------------------------------------------------------------
// Profils
// ---------------------------------------------------------------------------

interface ProfileConfig {
  maxWidthOrHeight: number;
  initialQuality: number;
  /**
   * Cible de taille en Mo. Si défini, browser-image-compression itère
   * la qualité à la baisse jusqu'à descendre sous cette cible.
   * Non défini = pas d'itération (utile pour les plans haute fidélité).
   */
  maxSizeMB?: number;
  fileType: string; // image/webp, image/jpeg, image/png
  preserveExif: boolean;
  thumbnail: { maxWidthOrHeight: number; initialQuality: number };
}

/**
 * Seuil "photo lourde" — au-delà, on tag visuellement le draft (cas rare
 * où même quality basse ne descend pas sous la cible : scène très détaillée).
 * Exporté pour partage avec le helper `isHeavyPhoto`.
 */
export const HEAVY_PHOTO_BYTES = 500 * 1024;

const PROFILE_CONFIGS: Record<"photo" | "plan", ProfileConfig> = {
  photo: {
    maxWidthOrHeight: 1600,
    initialQuality: 0.8,
    maxSizeMB: 0.5, // ≤ 500 Ko cible terrain (data mobile, batches de 5-15)
    fileType: "image/webp",
    preserveExif: false, // GPS extrait à part avant strip
    thumbnail: { maxWidthOrHeight: 256, initialQuality: 0.6 },
  },
  plan: {
    // Pas de maxSizeMB : on garde la lisibilité des plans détaillés.
    maxWidthOrHeight: 3000,
    initialQuality: 0.95,
    fileType: "image/webp",
    preserveExif: true,
    thumbnail: { maxWidthOrHeight: 512, initialQuality: 0.85 },
  },
};

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export async function compressMedia(
  file: File,
  profile: MediaProfile,
): Promise<CompressedMedia> {
  if (profile === "pdf") return compressPdfPassthrough(file);
  return compressImage(file, profile);
}

// ---------------------------------------------------------------------------
// Implémentations
// ---------------------------------------------------------------------------

async function compressPdfPassthrough(file: File): Promise<CompressedMedia> {
  const sha256 = await sha256OfBlob(file);
  return {
    compressed: file,
    thumbnail: null,
    metadata: {
      media_profile: "pdf",
      width_px: null,
      height_px: null,
      size_bytes: file.size,
      format: "application/pdf",
      thumbnail_format: null,
      gps: null,
      sha256,
    },
  };
}

async function compressImage(
  file: File,
  profile: "photo" | "plan",
): Promise<CompressedMedia> {
  const cfg = PROFILE_CONFIGS[profile];

  // 1. GPS AVANT compression (le strip EXIF du compresseur les jetterait).
  const gps = profile === "photo" ? await extractGps(file) : null;

  // 2. Compression principale
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: cfg.maxWidthOrHeight,
    initialQuality: cfg.initialQuality,
    ...(cfg.maxSizeMB !== undefined ? { maxSizeMB: cfg.maxSizeMB } : {}),
    fileType: cfg.fileType,
    preserveExif: cfg.preserveExif,
    useWebWorker: true,
  });

  // 3. Thumbnail (à partir de la version compressée pour gagner du temps)
  const thumbnail = await imageCompression(compressed, {
    maxWidthOrHeight: cfg.thumbnail.maxWidthOrHeight,
    initialQuality: cfg.thumbnail.initialQuality,
    fileType: cfg.fileType,
    preserveExif: false,
    useWebWorker: true,
  });

  // 4. Dimensions
  const dims = await readImageDimensions(compressed).catch(() => null);

  // 5. Hash de la version compressée
  const sha256 = await sha256OfBlob(compressed);

  return {
    compressed,
    thumbnail,
    metadata: {
      media_profile: profile,
      width_px: dims?.width ?? null,
      height_px: dims?.height ?? null,
      size_bytes: compressed.size,
      format: compressed.type || cfg.fileType,
      thumbnail_format: thumbnail.type || cfg.fileType,
      gps,
      sha256,
    },
  };
}

async function readImageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  // createImageBitmap est plus rapide qu'Image()/onload, dispo partout.
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dims;
  }
  // Fallback (jamais en prod, utile en JSDOM)
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}
