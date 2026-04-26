/**
 * VTU — Extraction GPS depuis les EXIF d'une image (read-only).
 *
 * On utilise `exifr` UNIQUEMENT pour lire les coordonnées GPS avant
 * que `browser-image-compression` ne strip la totalité des EXIF (profil
 * "photo" = on garde les coords mais on jette tout le reste pour la
 * vie privée — orientation, modèle de téléphone, timestamps caméra).
 *
 * Pour le profil "plan", on skip cette extraction : EXIF intégralement
 * conservé via `preserveExif: true` dans browser-image-compression.
 */

import exifr from "exifr";

export interface GpsCoords {
  lat: number;
  lng: number;
}

/**
 * Retourne les coordonnées GPS du fichier, ou null si absentes ou
 * invalides. Robuste : ne jette JAMAIS — un échec de lecture EXIF ne
 * doit pas bloquer la pipeline médias.
 */
export async function extractGps(file: File | Blob): Promise<GpsCoords | null> {
  try {
    const gps = await exifr.gps(file);
    if (!gps) return null;
    const lat = typeof gps.latitude === "number" ? gps.latitude : null;
    const lng = typeof gps.longitude === "number" ? gps.longitude : null;
    if (lat === null || lng === null) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
