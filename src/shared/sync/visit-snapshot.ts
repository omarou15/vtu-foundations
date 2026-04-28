/**
 * VTU — Orchestrateur de pull pour la visite active (PR1).
 *
 * Avant : `useMessagesSync` lançait 4 pulls en parallèle/séquentiel
 * fragile, mettait à jour les curseurs en relisant Dexie après coup,
 * et avalait toutes les erreurs avec `catch {}`. En Strict Mode (dev)
 * deux instances pouvaient écrire en même temps → snapshots partiels
 * qui faisaient régresser le compteur "5/5 → 1/5".
 *
 * Maintenant :
 *   - Une seule fonction `syncVisitAssetsSnapshot(visitId)`.
 *   - Ordre strict : messages → attachments → descriptions → json_state.
 *   - Verrou mémoire par `visitId` : un appel concurrent attend le
 *     premier au lieu de doubler les écritures.
 *   - Curseur avancé uniquement à partir du `lastCreatedAt` retourné
 *     par le serveur (jamais via tri Dexie).
 *   - Erreurs collectées dans `lastErrors` mais ne bloquent pas
 *     l'utilisateur (best-effort par famille).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  getLastPulledAt,
  getLatestLocalJsonState,
  setLastPulledAt,
  SyncStateKey,
  upsertJsonStateFromRemote,
} from "@/shared/db";
import type { VisitJsonStateRow } from "@/shared/types";
import {
  pullAttachmentAiDescriptionsForVisit,
  pullAttachmentsForVisit,
  pullMessagesForVisit,
  type PullSupabaseLike,
} from "./pull";

/** Diagnostic d'une exécution de l'orchestrateur. */
export interface VisitSnapshotResult {
  visitId: string;
  durationMs: number;
  pulled: {
    messages: number;
    attachments: number;
    descriptions: number;
    json_state: number;
  };
  errors: Array<{ stage: string; message: string }>;
}

const inflight = new Map<string, Promise<VisitSnapshotResult>>();

/** Diagnostic dev-only — dernier résultat par visite (succès ou échec). */
const lastResults = new Map<
  string,
  { ok: boolean; at: number; error: string | null }
>();

export function isVisitSnapshotInflight(visitId: string): boolean {
  return inflight.has(visitId);
}

export function getLastVisitSnapshotResult(
  visitId: string,
): { ok: boolean; at: number; error: string | null } | null {
  return lastResults.get(visitId) ?? null;
}

/** Pull séquentiel et atomique-par-famille pour une visite donnée.
 *  Si un appel est déjà en cours pour le même `visitId`, retourne sa Promise. */
export function syncVisitAssetsSnapshot(
  visitId: string,
  supabaseClient: PullSupabaseLike = supabase as unknown as PullSupabaseLike,
): Promise<VisitSnapshotResult> {
  const existing = inflight.get(visitId);
  if (existing) return existing;

  const promise = runSnapshot(visitId, supabaseClient)
    .then((r) => {
      lastResults.set(visitId, {
        ok: r.errors.length === 0,
        at: Date.now(),
        error: r.errors[0]?.message ?? null,
      });
      return r;
    })
    .catch((err) => {
      lastResults.set(visitId, {
        ok: false,
        at: Date.now(),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    })
    .finally(() => {
      inflight.delete(visitId);
    });
  inflight.set(visitId, promise);
  return promise;
}

async function runSnapshot(
  visitId: string,
  supabaseClient: PullSupabaseLike,
): Promise<VisitSnapshotResult> {
  const startedAt = Date.now();
  const errors: VisitSnapshotResult["errors"] = [];
  const pulled = { messages: 0, attachments: 0, descriptions: 0, json_state: 0 };

  // 1. Messages
  try {
    const cursorKey = SyncStateKey.messages(visitId);
    const since = await getLastPulledAt(cursorKey);
    const r = await pullMessagesForVisit(supabaseClient, visitId, {
      sinceIso: since,
    });
    pulled.messages = r.count;
    if (r.lastCreatedAt) {
      await setLastPulledAt(cursorKey, r.lastCreatedAt);
    }
  } catch (err) {
    errors.push({ stage: "messages", message: errorMessage(err) });
  }

  // 2. Attachments
  try {
    const cursorKey = SyncStateKey.attachments(visitId);
    const since = await getLastPulledAt(cursorKey);
    const r = await pullAttachmentsForVisit(supabaseClient, visitId, {
      sinceIso: since,
    });
    pulled.attachments = r.count;
    if (r.lastCreatedAt) {
      await setLastPulledAt(cursorKey, r.lastCreatedAt);
    }
  } catch (err) {
    errors.push({ stage: "attachments", message: errorMessage(err) });
  }

  // 3. Descriptions IA
  try {
    const cursorKey = SyncStateKey.attachmentAiDescriptions(visitId);
    const since = await getLastPulledAt(cursorKey);
    const r = await pullAttachmentAiDescriptionsForVisit(
      supabaseClient,
      visitId,
      { sinceIso: since },
    );
    pulled.descriptions = r.count;
    if (r.lastCreatedAt) {
      await setLastPulledAt(cursorKey, r.lastCreatedAt);
    }
  } catch (err) {
    errors.push({ stage: "attachment_ai_descriptions", message: errorMessage(err) });
  }

  // 4. visit_json_state (versionné, pas de curseur sync_state — on
  //    s'appuie sur la version locale max comme avant).
  try {
    const latest = await getLatestLocalJsonState(visitId);
    const sinceVersion = latest?.version ?? 0;
    const { data, error } = await (supabaseClient as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            gt: (c: string, v: number) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{
                  data: Array<Record<string, unknown>> | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    })
      .from("visit_json_state")
      .select("*")
      .eq("visit_id", visitId)
      .gt("version", sinceVersion)
      .order("version", { ascending: true })
      .limit(50);

    if (error) throw new Error(error.message);
    if (data) {
      for (const raw of data) {
        await upsertJsonStateFromRemote(raw as unknown as VisitJsonStateRow);
      }
      pulled.json_state = data.length;
    }
  } catch (err) {
    errors.push({ stage: "visit_json_state", message: errorMessage(err) });
  }

  return {
    visitId,
    durationMs: Date.now() - startedAt,
    pulled,
    errors,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Réservé aux tests : vide le registry des promises in-flight. */
export function __resetVisitSnapshotInflightForTests(): void {
  inflight.clear();
}
