/**
 * Compression progressive du ContextBundle.
 *
 * Cible : faire passer le bundle sous le budget tokens (par défaut 12k).
 * À chaque passe on réduit + on re-mesure. Sortie immédiate dès qu'on
 * passe sous le budget. Si après la dernière passe on est toujours
 * hors budget, on retourne `{ status: "failed" }`.
 *
 * Ordre (du moins destructif au plus) :
 *   1   soft trim ocr_text > 500c (sur attachments_context)
 *   2a  tronquer messages assistant > 800 chars (… + suffixe)
 *   2b  tronquer messages user > 1500 chars (… + suffixe)
 *   2c  garder les 50 derniers messages
 *   2d  garder les 20 derniers messages
 *   2e  garder les 8 derniers messages (filet final messages)
 *   3   drop ocr_text complet sur attachments_context
 *   4   strip detailed_description + state non essentiel
 *   5   failed
 */

import type { ContextBundle } from "../types";
import { estimateTokens } from "./tokens-estimate";

export interface CompressResult {
  bundle: ContextBundle;
  status: "ok" | "failed";
  /** Nombre cumulatif de passes appliquées (0 à 9). */
  passes_applied: number;
  estimated_tokens: number;
}

export const DEFAULT_TOKEN_BUDGET = 12_000;
const OCR_SOFT_LIMIT_CHARS = 500;
const ASSISTANT_SOFT_LIMIT_CHARS = 800;
const USER_SOFT_LIMIT_CHARS = 1500;
const MESSAGES_SOFT_LIMIT_LARGE = 50;
const MESSAGES_SOFT_LIMIT_MEDIUM = 20;
const MESSAGES_HARD_LIMIT = 8;
const TRUNCATION_SUFFIX = "…";

type Pass = (b: ContextBundle) => ContextBundle;

const PASSES: Pass[] = [
  passTrimOcr,            // 1
  passTrimAssistant,      // 2a
  passTrimUser,           // 2b
  passLimitMessages50,    // 2c
  passLimitMessages20,    // 2d
  passLimitMessages8,     // 2e
  passDropOcr,            // 3
  passStripDetails,       // 4
];

export function compressContextBundle(
  bundle: ContextBundle,
  budget: number = DEFAULT_TOKEN_BUDGET,
): CompressResult {
  let cur = clone(bundle);
  let estimated = estimateTokens(cur);
  if (estimated <= budget) {
    return { bundle: cur, status: "ok", passes_applied: 0, estimated_tokens: estimated };
  }

  for (let i = 0; i < PASSES.length; i += 1) {
    cur = PASSES[i]!(cur);
    estimated = estimateTokens(cur);
    if (estimated <= budget) {
      return {
        bundle: cur,
        status: "ok",
        passes_applied: i + 1,
        estimated_tokens: estimated,
      };
    }
  }

  // Dernière passe : failed (renvoie le bundle le plus compressé).
  return {
    bundle: cur,
    status: "failed",
    passes_applied: PASSES.length + 1,
    estimated_tokens: estimated,
  };
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
          ? a.ocr_text.slice(0, OCR_SOFT_LIMIT_CHARS) + TRUNCATION_SUFFIX
          : a.ocr_text,
    })),
  };
}

function passTrimAssistant(b: ContextBundle): ContextBundle {
  return {
    ...b,
    recent_messages: b.recent_messages.map((m) =>
      m.role === "assistant" &&
      m.content &&
      m.content.length > ASSISTANT_SOFT_LIMIT_CHARS
        ? { ...m, content: m.content.slice(0, ASSISTANT_SOFT_LIMIT_CHARS) + TRUNCATION_SUFFIX }
        : m,
    ),
  };
}

function passTrimUser(b: ContextBundle): ContextBundle {
  return {
    ...b,
    recent_messages: b.recent_messages.map((m) =>
      m.role === "user" &&
      m.content &&
      m.content.length > USER_SOFT_LIMIT_CHARS
        ? { ...m, content: m.content.slice(0, USER_SOFT_LIMIT_CHARS) + TRUNCATION_SUFFIX }
        : m,
    ),
  };
}

function passLimitMessages50(b: ContextBundle): ContextBundle {
  return {
    ...b,
    recent_messages: b.recent_messages.slice(-MESSAGES_SOFT_LIMIT_LARGE),
  };
}

function passLimitMessages20(b: ContextBundle): ContextBundle {
  return {
    ...b,
    recent_messages: b.recent_messages.slice(-MESSAGES_SOFT_LIMIT_MEDIUM),
  };
}

function passLimitMessages8(b: ContextBundle): ContextBundle {
  return {
    ...b,
    recent_messages: b.recent_messages.slice(-MESSAGES_HARD_LIMIT),
  };
}

function passDropOcr(b: ContextBundle): ContextBundle {
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
