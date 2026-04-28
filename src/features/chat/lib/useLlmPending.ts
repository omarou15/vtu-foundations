import { useLiveQuery } from "dexie-react-hooks";
import { getDb, listLocalMessagesByVisit, type LocalMessage } from "@/shared/db";

/**
 * Détecte si un job LLM (`llm_route_and_dispatch`) est en attente/en cours
 * pour le dernier message `user` de la visite.
 *
 * Source de vérité : Dexie `sync_queue`. L'IA est considérée "en cours"
 * tant qu'une entry existe (qu'elle soit en backoff, en retry, ou en
 * exécution) — c'est exactement le signal que la réponse IA n'est pas
 * encore arrivée. Quand l'engine consomme le job avec succès, l'entry
 * est supprimée → l'UI revient à l'état "envoyer".
 *
 * Retourne aussi `lastUserMessageId` pour pouvoir interrompre le job
 * (cf. `cancelLlmForMessage`).
 */
export function useLlmPending(visitId: string): {
  pending: boolean;
  lastUserMessageId: string | null;
} {
  const lastUserMessageId = useLiveQuery(
    async () => {
      const messages = (await listLocalMessagesByVisit(visitId)) as LocalMessage[];
      const last = [...messages].reverse().find((m) => m.role === "user");
      return last?.id ?? null;
    },
    [visitId],
    null as string | null,
  );

  const pending = useLiveQuery(
    async () => {
      if (!lastUserMessageId) return false;
      try {
        const entries = await getDb()
          .sync_queue.where("[op+row_id]")
          .equals(["llm_route_and_dispatch", lastUserMessageId])
          .toArray();
        return entries.length > 0;
      } catch {
        return false;
      }
    },
    [lastUserMessageId],
    false,
  );

  return { pending, lastUserMessageId };
}

/**
 * Interrompt le job LLM pour un message donné en supprimant les entries
 * `llm_route_and_dispatch` correspondantes dans `sync_queue`.
 *
 * NB : cela n'annule PAS un fetch HTTP déjà en vol côté Edge Function ;
 * cela empêche simplement les tentatives suivantes (retry/backoff) et
 * libère l'UI immédiatement. La réponse éventuelle qui arrive après
 * sera ignorée si l'idempotence côté serveur est respectée.
 */
export async function cancelLlmForMessage(messageId: string): Promise<number> {
  try {
    const removed = await getDb()
      .sync_queue.where("[op+row_id]")
      .equals(["llm_route_and_dispatch", messageId])
      .delete();
    return removed;
  } catch {
    return 0;
  }
}
