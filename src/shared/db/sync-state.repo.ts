/**
 * VTU — Repository sync_state (Itération 6.5)
 *
 * Stocke les curseurs de pull cross-device dans IndexedDB sous forme
 * key/value. Permet de ne récupérer que les nouveautés depuis le
 * dernier tick (`updated_at > last_pulled_at`).
 *
 * Conventions de clés :
 *  - "visits:last_pulled_at"
 *  - "visit_json_state:last_pulled_at"
 *  - "messages:last_pulled_at:{visitId}"
 */

import { getDb } from "./schema";

/** Renvoie le curseur ISO (ou null si jamais set → premier login sur ce device). */
export async function getLastPulledAt(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.sync_state.get(key);
  return row?.value ?? null;
}

/** Persist le curseur. `iso` doit être un timestamp ISO valide. */
export async function setLastPulledAt(
  key: string,
  iso: string,
): Promise<void> {
  const db = getDb();
  await db.sync_state.put({ key, value: iso });
}

/** Helpers convenience pour les tables principales. */
export const SyncStateKey = {
  visits: () => "visits:last_pulled_at",
  visitJsonState: () => "visit_json_state:last_pulled_at",
  messages: (visitId: string) => `messages:last_pulled_at:${visitId}`,
  attachments: (visitId: string) => `attachments:last_pulled_at:${visitId}`,
  attachmentAiDescriptions: (visitId: string) =>
    `attachment_ai_descriptions:last_pulled_at:${visitId}`,
} as const;
