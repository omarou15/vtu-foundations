/**
 * VTU — PR4 §5 : état IA explicite par attachment.
 *
 * Dérive un état métier stable à partir de :
 *  - `attachment_ai_descriptions` (succès → "done", incl. PDF "skipped")
 *  - `llm_extractions` du même attachment en mode `describe_media` avec
 *    status ∈ {failed, rate_limited, malformed, partial}
 *  - métadonnée `ai_enabled=false` du message porteur
 *  - statut sync de l'attachment (pas encore uploadé)
 *
 * Aucun nouvel index Dexie : on lit les rows existantes et on trie en JS.
 * Append-only friendly : la dernière ligne par created_at fait foi.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/shared/db";
import type { LocalAttachment } from "@/shared/db";

export type AttachmentAiState =
  | { state: "not_requested"; reason: "not_uploaded" }
  | { state: "disabled_when_sent" }
  | { state: "queued" }
  | { state: "done"; skipped?: boolean }
  | {
      state: "failed";
      errorCode: "rate_limited" | "payment_required" | "malformed" | "unknown";
      errorMessage: string | null;
    };

export function useAttachmentAiState(attachment: LocalAttachment): AttachmentAiState {
  return (
    useLiveQuery<AttachmentAiState>(
      async () => {
        const db = getDb();

        // 1. Description la plus récente
        const descs = await db.attachment_ai_descriptions
          .where("attachment_id")
          .equals(attachment.id)
          .toArray();
        descs.sort((a, b) => b.created_at.localeCompare(a.created_at));
        const lastDesc = descs[0];

        // 2. Tentatives LLM (succès ou échec) en describe_media
        const extractions = await db.llm_extractions
          .where("attachment_id")
          .equals(attachment.id)
          .toArray();
        const describeOnly = extractions
          .filter((e) => e.mode === "describe_media")
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        const lastExtraction = describeOnly[0];

        // 3. Message porteur — IA désactivée à l'envoi ?
        let aiDisabled = false;
        if (attachment.message_id) {
          const msg = await db.messages.get(attachment.message_id);
          const meta = msg?.metadata as Record<string, unknown> | undefined;
          aiDisabled = meta?.ai_enabled === false;
        }

        // Priorité 1 : succès persistant
        if (lastDesc) {
          const desc = lastDesc.description as { skipped?: boolean };
          return { state: "done", skipped: desc.skipped === true };
        }

        // Priorité 2 : dernière tentative en échec terminal
        if (
          lastExtraction &&
          (lastExtraction.status === "failed" ||
            lastExtraction.status === "rate_limited" ||
            lastExtraction.status === "malformed")
        ) {
          let code: "rate_limited" | "payment_required" | "malformed" | "unknown" =
            "unknown";
          if (lastExtraction.status === "rate_limited") code = "rate_limited";
          else if (lastExtraction.status === "malformed") code = "malformed";
          else if (
            (lastExtraction.error_message ?? "")
              .toLowerCase()
              .includes("payment")
          ) {
            code = "payment_required";
          }
          return {
            state: "failed",
            errorCode: code,
            errorMessage: lastExtraction.error_message ?? null,
          };
        }

        // Priorité 3 : IA désactivée à l'envoi
        if (aiDisabled) return { state: "disabled_when_sent" };

        // Priorité 4 : pas encore uploadé
        if (attachment.sync_status !== "synced") {
          return { state: "not_requested", reason: "not_uploaded" };
        }

        // Sinon : en file d'attente (uploadé, pas de description, pas d'erreur)
        return { state: "queued" };
      },
      [attachment.id, attachment.sync_status, attachment.message_id],
    );
  return value ?? { state: "queued" };
}

/**
 * Format human-readable d'un état IA (FR), pour tooltips/badges.
 */
export function describeAiState(s: AttachmentAiState): string {
  switch (s.state) {
    case "done":
      return s.skipped ? "Analyse différée (PDF)" : "Analysé par l'IA";
    case "queued":
      return "Analyse IA en cours…";
    case "not_requested":
      return "En attente d'upload avant analyse";
    case "disabled_when_sent":
      return "IA désactivée lors de l'envoi";
    case "failed":
      switch (s.errorCode) {
        case "rate_limited":
          return "Trop de requêtes IA — réessaie dans un instant";
        case "payment_required":
          return "Crédits IA épuisés — recharge pour relancer l'analyse";
        case "malformed":
          return "Réponse IA invalide — relance l'analyse";
        default:
          return s.errorMessage ?? "Échec de l'analyse IA";
      }
  }
}
