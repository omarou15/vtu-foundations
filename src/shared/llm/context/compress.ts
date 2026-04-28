/**
 * Compression progressive du ContextBundle.
 *
 * Cible : faire passer le bundle sous le budget tokens (par défaut 12k).
 * À chaque passe on réduit + on re-mesure. Sortie immédiate dès qu'on
 * passe sous le budget. Si après la dernière passe on est toujours
 * hors budget, on retourne `{ status: "failed" }`.
 *
 * Refonte avril 2026 — le bundle ne contient plus d'`attachments_context`
 * ni de `schema_map`. Les passes OCR ont disparu. Restent :
 *   1   tronquer messages assistant > 800 chars
 *   2   tronquer messages user > 1500 chars
 *   3   garder les 50 derniers messages
 *   4   garder les 20 derniers messages
 *   5   garder les 8 derniers messages (filet final)
 *   6   strip détails du state (drop notes/preconisations volumineux)
 *   7   failed
 */

import type { ContextBundle } from "../types";
import { estimateTokens } from "./tokens-estimate";

export interface CompressResult {
  bundle: ContextBundle;
  status: "ok" | "failed";
  /** Nombre cumulatif de passes appliquées (0 à 6). */
  passes_applied: number;
  estimated_tokens: number;
}

export const DEFAULT_TOKEN_BUDGET = 12_000;
const ASSISTANT_SOFT_LIMIT_CHARS = 800;
const USER_SOFT_LIMIT_CHARS = 1500;
const MESSAGES_SOFT_LIMIT_LARGE = 50;
const MESSAGES_SOFT_LIMIT_MEDIUM = 20;
const MESSAGES_HARD_LIMIT = 8;
const TRUNCATION_SUFFIX = "…";

type Pass = (b: ContextBundle) => ContextBundle;

const PASSES: Pass[] = [
  passTrimAssistant,      // 1
  passTrimUser,           // 2
  passLimitMessages50,    // 3
  passLimitMessages20,    // 4
  passLimitMessages8,     // 5
  passStripStateDetails,  // 6
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

/**
 * Strip best-effort des sections les plus volumineuses du state. Garde
 * les sections "structurelles" (meta, building, envelope, heating, ecs,
 * ventilation) ; vide les contenus libres (notes, preconisations,
 * pathologies descriptions, custom_observations) en cas d'overshoot.
 *
 * Note : c'est un mode dégradé pour éviter le `failed`. La structure
 * du state reste cohérente (sections présentes mais items vidés).
 */
function passStripStateDetails(b: ContextBundle): ContextBundle {
  const stripped = clone(b.state) as unknown as Record<string, unknown>;
  const sectionsToEmpty = [
    "notes",
    "preconisations",
    "pathologies",
    "custom_observations",
  ];
  for (const sec of sectionsToEmpty) {
    const s = stripped[sec] as Record<string, unknown> | undefined;
    if (s && typeof s === "object" && Array.isArray(s.items)) {
      s.items = [];
    }
  }
  return { ...b, state: stripped as unknown as ContextBundle["state"] };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
