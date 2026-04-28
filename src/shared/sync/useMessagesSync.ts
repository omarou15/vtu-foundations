/**
 * VTU — Hook React pour la synchro d'une VT active (PR1).
 *
 * Refactor : le pull séquentiel fragile + curseurs relus depuis Dexie
 * sont remplacés par `syncVisitAssetsSnapshot()` (un seul orchestrateur,
 * verrou par visitId, curseurs basés sur la réponse serveur).
 *
 * Realtime inchangé : channel `visit-{visitId}` qui upserte les INSERT
 * idempotents pour messages / attachments / descriptions / json_state.
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
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
import { syncVisitAssetsSnapshot } from "./visit-snapshot";

export function useMessagesSync(visitId: string | undefined): void {
  useEffect(() => {
    if (!visitId) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    void syncVisitAssetsSnapshot(visitId).catch(() => {
      // L'orchestrateur capture déjà les erreurs par stage ; ce catch
      // protège uniquement contre une erreur inattendue de plomberie.
    });

    void cancelled; // évite l'erreur "unused var" si on réintroduit du code

    // Realtime : channel scoping strict à la VT active. Un suffixe
    // de timestamp évite les collisions multi-instances en Strict Mode dev.
    const channelName = `visit-${visitId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `visit_id=eq.${visitId}`,
        },
        (payload: { new: MessageRow }) => {
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
