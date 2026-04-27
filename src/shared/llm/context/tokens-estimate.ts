/**
 * Estimation grossière du nombre de tokens d'un payload texte/JSON.
 *
 * Heuristique : ~4 caractères par token (Gemini/GPT moyenne FR/EN).
 * Suffisant pour décider si on doit compresser. Pas un comptage précis.
 */

import { stableSerialize } from "./serialize-stable";

export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : stableSerialize(value);
  // Approximation 1 token ≈ 4 chars (entre les ratios FR/EN/code).
  return Math.ceil(text.length / 4);
}
