/**
 * VTU — Heuristiques d'affichage médias (It. 10.6.2).
 *
 * Helpers purs, sans I/O. Partagés entre PhotoPreviewPanel et AttachmentSheet
 * pour garder UNE SEULE règle "qu'est-ce qu'une photo lourde".
 */

import { HEAVY_PHOTO_BYTES } from "./compress";
import type { LocalAttachment } from "@/shared/db/schema";

/**
 * True si l'attachment est une photo (profil "photo") dont la taille
 * APRÈS compression dépasse encore le seuil HEAVY_PHOTO_BYTES.
 *
 * Cas d'usage : afficher un badge "lourde" discret pour prévenir
 * le thermicien que cette photo va peser sur sa data mobile / sync.
 *
 * Plans et PDFs sont volontairement exclus : un plan lourd c'est normal,
 * un PDF on n'a pas la main dessus.
 */
export function isHeavyPhoto(
  draft: Pick<LocalAttachment, "media_profile" | "size_bytes">,
): boolean {
  if (draft.media_profile !== "photo") return false;
  return (draft.size_bytes ?? 0) > HEAVY_PHOTO_BYTES;
}

export { HEAVY_PHOTO_BYTES };
