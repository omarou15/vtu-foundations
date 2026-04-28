/**
 * VTU — Helpers prompt building.
 *
 * Refonte avril 2026 — bundle minimal { visit, state, recent_messages }.
 * L'anti-hallucination attachments est maintenant une règle dans le
 * prompt système (le LLM lit les `photo_caption` dans recent_messages).
 * Plus de `buildPendingAttachmentsGuard`.
 */

export type BundleAny = Record<string, unknown>;

export function buildUserPromptExtract(
  messageText: string,
  bundle: BundleAny,
): string {
  return [
    "## CONTEXT BUNDLE",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "## MESSAGE UTILISATEUR",
    messageText,
    "",
    "Produis le JSON tool-call.",
  ].join("\n");
}

export function buildUserPromptConversational(
  messageText: string,
  bundle: BundleAny,
): string {
  return [
    "## CONTEXT BUNDLE",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "## QUESTION DU THERMICIEN",
    messageText,
    "",
    "Produis le JSON tool-call.",
  ].join("\n");
}
