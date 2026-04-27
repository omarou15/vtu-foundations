/**
 * Router hybride (Q7 + Correction B v2.2) : déterministe d'abord,
 * fallback Flash-Lite pour les ambigus courts.
 *
 * Doctrine (KNOWLEDGE §15) :
 *  - Toute photo/audio/document → "extract" (pas de question via média).
 *  - Texte avec marqueur conversationnel ("?", "comment", "résume", …) →
 *    "conversational" (PRIME sur terrain_pattern : un thermicien qui
 *    écrit "résume cette VT, surface 145 m²" attend une réponse texte
 *    incluant le 145 m², pas une saisie automatique).
 *  - Texte avec pattern terrain (chiffres+unités, codes RT/RE/R+n/HSP,
 *    acronymes métier) → "extract" via terrain_pattern.
 *  - Texte court bruit ("ok", "merci", emojis) → "ignore".
 *  - Texte court ambigu (≤4 mots, sans marqueur) → "extract" via
 *    short_capture (capture > conversation).
 *  - Tout le reste → "extract" via default_extract.
 *
 * `routeMessage` retourne `needsLlm` à true uniquement quand on souhaite
 * déférer la décision à Flash-Lite. Aucun cas actuel ne le fait, mais le
 * type est conservé pour permettre une réintroduction Phase 2.5.
 */

import type { RouterDecision } from "./types";

export interface DeterministicRouterInput {
  role: "user" | "assistant" | "system";
  kind: "text" | "audio" | "photo" | "document" | "system_event" | "actions_card" | "conflict_card";
  content: string | null;
}

export type DeterministicResult =
  | { decision: RouterDecision; needsLlm: false }
  | { decision: null; needsLlm: true; reason: string };

const NOISE_PATTERNS = [
  /^ok+!?\.?$/i,
  /^merci\.?$/i,
  /^bien\.?$/i,
  /^vu\.?$/i,
  /^reçu\.?$/i,
  /^👍+$/u,
  /^[\p{Extended_Pictographic}\s]+$/u,
];

const CONVERSATIONAL_HINTS = [
  /\?$/, // se termine par "?"
  /^(résume|résumer|résumes)\b/i,
  /^(explique|explique-moi|peux-tu)\b/i,
  /^(comment|pourquoi|quelle?s?|où|quand|combien)\b/i,
  /^(donne|donne-moi|liste|listes)\b/i,
];

/**
 * Patterns terrain métier (Correction B v2.2).
 *  - Chiffres + unités physiques fréquentes (m², kW, kWh, kVA, cm, mm,
 *    °C, hPa, m).
 *  - Codes réglementaires (RT/RE 4 chiffres, R+n, HSP n).
 *  - Acronymes métier thermique/bâtiment.
 *
 * Application : appliqué APRÈS CONVERSATIONAL_HINTS et AVANT
 * `short_capture (≤4 mots)`. Doctrine arbitrée : un hint conversationnel
 * prime sur un terrain_pattern (cf. dette §10).
 */
const TERRAIN_PATTERNS = [
  /\d+\s*(m²|m2|kw|kwh|kva|cm|mm|°c|hpa|°|m\b)/i,
  /R\+\d|HSP\s*\d|RE\s*\d{4}|RT\s*\d{4}/i,
  /\b(VMC|ECS|ITI|ITE|PAC|AEP|EU|EP|EVRT|GTB|CTA|UTA|FCU|BAES)\b/i,
];

export function routeMessage(input: DeterministicRouterInput): DeterministicResult {
  // Médias (photo/audio/document) → toujours extract.
  if (input.kind === "photo" || input.kind === "audio" || input.kind === "document") {
    return {
      decision: { route: "extract", reason: `media_${input.kind}` },
      needsLlm: false,
    };
  }

  if (input.role !== "user") {
    return {
      decision: { route: "ignore", reason: "non_user_role" },
      needsLlm: false,
    };
  }

  const text = (input.content ?? "").trim();
  if (text.length === 0) {
    return { decision: { route: "ignore", reason: "empty" }, needsLlm: false };
  }

  if (NOISE_PATTERNS.some((re) => re.test(text))) {
    return { decision: { route: "ignore", reason: "noise" }, needsLlm: false };
  }

  if (CONVERSATIONAL_HINTS.some((re) => re.test(text))) {
    // Doctrine arbitrée : conversational_hint PRIME sur terrain_pattern.
    return {
      decision: { route: "conversational", reason: "conversational_hint" },
      needsLlm: false,
    };
  }

  if (TERRAIN_PATTERNS.some((re) => re.test(text))) {
    return {
      decision: { route: "extract", reason: "terrain_pattern" },
      needsLlm: false,
    };
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 4) {
    return {
      decision: { route: "extract", reason: "short_capture" },
      needsLlm: false,
    };
  }

  return {
    decision: { route: "extract", reason: "default_extract" },
    needsLlm: false,
  };
}
