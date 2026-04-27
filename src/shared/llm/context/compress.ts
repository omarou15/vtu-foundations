/**
 * Compression du ContextBundle en 5 passes cascadées (Correction B v2.1).
 *
 * Cible : faire passer le bundle sous le budget tokens (par défaut 12k).
 * À chaque passe on réduit + on re-mesure. Si après la passe 5 on est
 * toujours hors budget, on retourne `{ bundle, status: "failed" }`.
 *
 * Ordre (du moins destructif au plus) :
 *   1. soft trim ocr_text > 500c (sur attachments_context)
 *   2. réduire recent_messages à 8 derniers
 *   3. drop structured_observations détaillées
 *   4. strip detailed_description (garder short_caption)
 *   5. failed
 */

import type { ContextBundle } from "../types";
import { estimateTokens } from "./tokens-estimate";

export interface CompressResult {
  bundle: ContextBundle;
  status: "ok" | "failed";
  passes_applied: number;
  estimated_tokens: number;
}

export const DEFAULT_TOKEN_BUDGET = 12_000;
const OCR_SOFT_LIMIT_CHARS = 500;
const RECENT_MESSAGES_HARD_LIMIT = 8;

export function compressContextBundle(
  bundle: ContextBundle,
  budget: number = DEFAULT_TOKEN_BUDGET,
): CompressResult {
  let cur = clone(bundle);
  let estimated = estimateTokens(cur);
  if (estimated <= budget) {
    return { bundle: cur, status: "ok", passes_applied: 0, estimated_tokens: estimated };
  }

  // Pass 1 : soft trim ocr_text
  cur = passTrimOcr(cur);
  estimated = estimateTokens(cur);
  if (estimated <= budget) {
    return { bundle: cur, status: "ok", passes_applied: 1, estimated_tokens: estimated };
  }

  // Pass 2 : recent_messages → 8 derniers
  cur = passLimitMessages(cur);
  estimated = estimateTokens(cur);
  if (estimated <= budget) {
    return { bundle: cur, status: "ok", passes_applied: 2, estimated_tokens: estimated };
  }

  // Pass 3 : drop structured_observations
  cur = passDropObservations(cur);
  estimated = estimateTokens(cur);
  if (estimated <= budget) {
    return { bundle: cur, status: "ok", passes_applied: 3, estimated_tokens: estimated };
  }

  // Pass 4 : strip detailed_description
  cur = passStripDetails(cur);
  estimated = estimateTokens(cur);
  if (estimated <= budget) {
    return { bundle: cur, status: "ok", passes_applied: 4, estimated_tokens: estimated };
  }

  // Pass 5 : failed (renvoie bundle minimal)
  return { bundle: cur, status: "failed", passes_applied: 5, estimated_tokens: estimated };
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

function passTrimOcr(b: ContextBundle): ContextBundle {
  return {
    ...b,
    attachments_context: b.attachments_context.map((a) => ({
      ...a,
      ocr_text:
        a.ocr_text && a.ocr_text.length > OCR_SOFT_LIMIT_CHARS
          ? a.ocr_text.slice(0, OCR_SOFT_LIMIT_CHARS) + "…"
          : a.ocr_text,
    })),
  };
}

function passLimitMessages(b: ContextBundle): ContextBundle {
  return {
    ...b,
    recent_messages: b.recent_messages.slice(-RECENT_MESSAGES_HARD_LIMIT),
  };
}

function passDropObservations(b: ContextBundle): ContextBundle {
  // Note : structured_observations vit au niveau de la description IA
  // d'un attachment (pas dans le bundle directement). On les retire en
  // simplifiant attachments_context (déjà projeté en short/detailed/ocr).
  // Donc cette passe = no-op métier MAIS on supprime ocr_text pour
  // gagner encore — pertinent si pass 1 n'a pas suffi.
  return {
    ...b,
    attachments_context: b.attachments_context.map((a) => ({
      ...a,
      ocr_text: null,
    })),
  };
}

function passStripDetails(b: ContextBundle): ContextBundle {
  return {
    ...b,
    attachments_context: b.attachments_context.map((a) => ({
      ...a,
      detailed_description: null,
    })),
    state_summary: stripStateNonEssential(b.state_summary),
  };
}

function stripStateNonEssential(state: Record<string, unknown>): Record<string, unknown> {
  // Garde uniquement meta + entêtes des sections (drop custom_observations,
  // notes, preconisations).
  const { meta, building, ...rest } = state as Record<string, unknown>;
  void rest;
  return { meta, building };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
