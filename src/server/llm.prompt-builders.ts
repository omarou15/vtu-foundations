/**
 * VTU — Helpers prompt building (It. 14.1).
 *
 * Extraits de `llm.functions.ts` pour être testables sans importer
 * `@tanstack/react-start` (qui pose problème en environnement Vitest).
 *
 * Garde anti-hallucination : si le ContextBundle contient des
 * `pending_attachments` (pièces jointes mentionnées mais non encore
 * analysées par l'IA), on injecte un bloc explicite qui interdit au
 * LLM de prétendre les avoir vues.
 */

export interface PendingAttachmentRef {
  id: string;
  media_profile: string | null;
  reason: "no_description_yet" | "ai_disabled_when_sent";
}

export interface BundleWithPending {
  pending_attachments?: PendingAttachmentRef[];
}

export function buildPendingAttachmentsGuard(
  bundle: BundleWithPending,
  intent: "extract" | "conversational",
): string {
  const pending = bundle.pending_attachments ?? [];
  if (pending.length === 0) return "";
  const lines = [
    "",
    "## ATTACHMENTS NON ENCORE ANALYSÉS",
    "Les pièces jointes suivantes ont été reçues mais leur analyse",
    "visuelle n'est PAS disponible dans ce contexte :",
    ...pending.map(
      (p) => `  - ${p.id} (${p.media_profile ?? "?"}) — ${p.reason}`,
    ),
    "RÈGLE STRICTE : tu NE DOIS PAS prétendre avoir vu, lu ou analysé",
    "ces fichiers. Confirme leur réception (nombre, type), jamais leur",
    "contenu.",
  ];
  if (intent === "extract") {
    lines.push(
      "[extract] N'émets AUCUN patch ni custom_field appuyé sur ces",
      "attachments. N'inscris JAMAIS leurs ids dans evidence_refs.",
    );
  } else {
    lines.push(
      "[conversational] Si l'utilisateur te demande ce que tu vois sur",
      "ces fichiers, dis explicitement que l'analyse est en cours",
      "(ou que l'IA était désactivée à l'envoi). JAMAIS \"j'ai bien reçu et analysé\".",
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function buildUserPromptExtract(
  messageText: string,
  bundle: BundleWithPending & Record<string, unknown>,
): string {
  return [
    "## CONTEXT BUNDLE",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    buildPendingAttachmentsGuard(bundle, "extract"),
    "## MESSAGE UTILISATEUR",
    messageText,
    "",
    "Produis le JSON tool-call.",
  ].join("\n");
}

export function buildUserPromptConversational(
  messageText: string,
  bundle: BundleWithPending & Record<string, unknown>,
): string {
  return [
    "## CONTEXT BUNDLE",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    buildPendingAttachmentsGuard(bundle, "conversational"),
    "## QUESTION DU THERMICIEN",
    messageText,
    "",
    "Produis le JSON tool-call.",
  ].join("\n");
}
