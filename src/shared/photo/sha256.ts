/**
 * VTU — SHA-256 d'un Blob (déduplication informative).
 *
 * Utilise Web Crypto API (crypto.subtle.digest) — disponible nativement
 * dans tous les navigateurs modernes, dans les workers, et dans Node 19+.
 *
 * Le hash sert UNIQUEMENT à détecter les doublons côté client (même photo
 * importée 2x). Aucune contrainte UNIQUE serveur — un même hash peut
 * légitimement exister dans plusieurs visites du même user.
 */

export async function sha256OfBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return bufferToHex(hash);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
