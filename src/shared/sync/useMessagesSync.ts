/**
 * VTU — Hook React pour la synchro d'une VT active (Itération 6.5)
 *
 * Combine deux mécanismes :
 *
 *   1. PULL LAZY au mount :
 *      - On lit le `created_at` du dernier message local pour la VT.
 *      - On fetch tous les messages serveur dont `created_at` est
 *        postérieur (LIMIT 200, ASC).
 *      - On fetch aussi les `visit_json_state` plus récents que la
 *        version locale max (au cas où l'IA aurait répondu sur un
 *        autre device).
 *
 *   2. REALTIME pendant que la VT est ouverte :
 *      - Channel `visit-{visitId}` qui écoute `INSERT` sur `messages`
 *        et `visit_json_state` filtrés par `visit_id=eq.{visitId}`.
 *      - À l'unmount, on cleanup le channel.
 *
 * Aucun realtime global sur la sidebar : le pull 30s suffit (et évite
 * de consommer des connexions WS inutilement).
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDb } from "@/shared/db/schema";
import {
  getLastPulledAt,
  getLatestLocalJsonState,
  setLastPulledAt,
  SyncStateKey,
  upsertAttachmentAiDescriptionFromRemote,
  upsertAttachmentFromRemote,
  upsertJsonStateFromRemote,
  upsertMessageFromRemote,
} from "@/shared/db";
import type {
  AttachmentAiDescriptionRow,
  AttachmentRow,
  MessageRow,
  VisitJsonStateRow,
} from "@/shared/types";
import {
  pullAttachmentAiDescriptionsForVisit,
  pullAttachmentsForVisit,
  pullMessagesForVisit,
  type PullSupabaseLike,
} from "./pull";

export function useMessagesSync(visitId: string | undefined): void {
  useEffect(() => {
    if (!visitId) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function initialPull() {
      // 1. Dernier message local pour cette VT (created_at ASC, on
      //    prend le dernier).
      const db = getDb();
      const lastLocal = await db.messages
        .where("[visit_id+created_at]")
        .between([visitId!, ""], [visitId!, "\uffff"])
        .reverse()
        .first();
      const sinceMessages = lastLocal?.created_at ?? null;

      try {
        await pullMessagesForVisit(
          supabase as unknown as PullSupabaseLike,
          visitId!,
          { sinceIso: sinceMessages },
        );
      } catch {
        // best-effort : un échec réseau n'empêche pas l'utilisateur
        // de continuer sur les données locales.
      }
      if (cancelled) return;

      // 1bis. Pull pièces jointes + descriptions IA de la VT active.
      // C'est indispensable cross-device : un message photo peut être visible
      // sans que ses attachments locaux existent encore sur l'autre appareil.
      try {
        const attachmentsCursorKey = SyncStateKey.attachments(visitId!);
        const before = await getLastPulledAt(attachmentsCursorKey);
        await pullAttachmentsForVisit(
          supabase as unknown as PullSupabaseLike,
          visitId!,
          { sinceIso: before },
        );
        const latest = await db.attachments
          .where("visit_id")
          .equals(visitId!)
          .toArray();
        latest.sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (latest[0]?.created_at) {
          await setLastPulledAt(attachmentsCursorKey, latest[0].created_at);
        }
      } catch {
        // best-effort.
      }

      try {
        const descriptionsCursorKey = SyncStateKey.attachmentAiDescriptions(visitId!);
        const before = await getLastPulledAt(descriptionsCursorKey);
        await pullAttachmentAiDescriptionsForVisit(
          supabase as unknown as PullSupabaseLike,
          visitId!,
          { sinceIso: before },
        );
        const latest = await db.attachment_ai_descriptions
          .where("visit_id")
          .equals(visitId!)
          .toArray();
        latest.sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (latest[0]?.created_at) {
          await setLastPulledAt(descriptionsCursorKey, latest[0].created_at);
        }
      } catch {
        // best-effort.
      }

      // 2. Pull les visit_json_state plus récents que la version locale max.
      const latestLocalJson = await getLatestLocalJsonState(visitId!);
      const sinceVersion = latestLocalJson?.version ?? 0;

      try {
        const { data, error } = await supabase
          .from("visit_json_state")
          .select("*")
          .eq("visit_id", visitId!)
          .gt("version", sinceVersion)
          .order("version", { ascending: true })
          .limit(50);
        if (error) throw error;
        if (data) {
          for (const raw of data) {
            await upsertJsonStateFromRemote(raw as unknown as VisitJsonStateRow);
          }
        }
      } catch {
        // idem : best-effort.
      }
    }

    void initialPull();

    // 3. Realtime : channel scoping strict à la VT active.
    const channel = supabase
      .channel(`visit-${visitId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `visit_id=eq.${visitId}`,
        },
        (payload: { new: MessageRow }) => {
          // Idempotent : si on a déjà la ligne (push optimiste local
          // + sync), upsertMessageFromRemote no-op.
          void upsertMessageFromRemote(payload.new).catch(() => undefined);
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "visit_json_state",
          filter: `visit_id=eq.${visitId}`,
        },
        (payload: { new: VisitJsonStateRow }) => {
          void upsertJsonStateFromRemote(payload.new).catch(() => undefined);
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "attachments",
          filter: `visit_id=eq.${visitId}`,
        },
        (payload: { new: AttachmentRow }) => {
          void upsertAttachmentFromRemote(payload.new).catch(() => undefined);
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "attachment_ai_descriptions",
          filter: `visit_id=eq.${visitId}`,
        },
        (payload: { new: AttachmentAiDescriptionRow }) => {
          void upsertAttachmentAiDescriptionFromRemote(payload.new).catch(
            () => undefined,
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [visitId]);
}
