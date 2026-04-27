/**
 * Hash SHA-256 d'un payload — stable_prompt_hash pour audit trail.
 *
 * Implémentation isomorphe : Web Crypto si dispo (Worker + browser),
 * sinon fallback Node `crypto`. Les tests Vitest tournent en jsdom où
 * crypto.subtle est disponible.
 */

import { stableSerialize } from "./serialize-stable";

export async function hashContext(value: unknown): Promise<string> {
  const text = stableSerialize(value);
  const bytes = new TextEncoder().encode(text);

  // Web Crypto path (Worker, browser, jsdom récent)
  const subtle =
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined"
      ? (globalThis.crypto as Crypto).subtle
      : undefined;

  if (subtle && typeof subtle.digest === "function") {
    const buf = await subtle.digest("SHA-256", bytes);
    return bufToHex(new Uint8Array(buf));
  }

  // Fallback Node (devrait pas être atteint en runtime cible)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("crypto") as typeof import("crypto");
  return nodeCrypto.createHash("sha256").update(text).digest("hex");
}

function bufToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
