/**
 * Router hybride (Q7) : déterministe d'abord, fallback Flash-Lite pour
 * les ambigus courts.
 *
 * Doctrine (KNOWLEDGE §15) :
 *  - Toute photo/audio/document → "extract" (pas de question via média).
 *  - Texte avec marqueur conversationnel ("?", "comment", "résume") →
 *    "conversational".
 *  - Texte court bruit ("ok", "merci", emojis seuls) → "ignore".
 *  - Texte court ambigu (≤ 4 mots, sans marqueur explicite) → "needs_llm".
 *  - Tout le reste → "extract".
 *
 * La décision LLM-fallback est déclenchée uniquement quand
 * `routeMessage` renvoie `needs_llm`. Le call site appelle alors la
 * server function (qui invoque Flash-Lite avec `RouterOutputSchema`).
 */

import type { RouterDecision } from "./types";

export interface DeterministicRouterInput {
  role: "user" | "assistant" | "system";
  kind: "text" | "audio" | "photo" | "document" | "system_event";
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
    // Si le texte se termine par "?" mais contient une donnée chiffrée,
    // on le route quand même conversational (le doute des thermicien
    // commence souvent par "X est-il OK ?" — voir dette §10).
    return {
      decision: { route: "conversational", reason: "conversational_hint" },
      needsLlm: false,
    };
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 4) {
    // Ambigu court ("VMC ok ?" déjà capturé par "?", mais "R+2", "HSP 2.7",
    // "VMC ok" sans "?" tombent ici). Plan v2.1 : capture > conversation,
    // donc on route extract direct sans LLM.
    // Dette §10 router : "VMC ok ?" sera traité par fallback LLM dans une
    // future itération si on observe trop de faux positifs.
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
