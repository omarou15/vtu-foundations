/**
 * VTU — It. 14.1 : statut persistant de sync/analyse des pièces jointes
 * de la visite courante.
 *
 * S'affiche entre la liste des messages et l'input bar. Coexiste avec
 * `PhotoBatchProgressCard` (qui est par-message, transitoire) — celui-ci
 * est par-VT et persistant. Donne à l'utilisateur un retour visuel sur
 * l'état réel de chaque pièce jointe (uploadée ? analysée ?).
 *
 * Lecture pure Dexie via `useLiveQuery` (réactif, offline-first).
 */

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { getDb } from "@/shared/db";

interface VisitAttachmentSyncStatusProps {
  visitId: string;
}

interface Counts {
  total: number;
  uploaded: number;
  inFlight: number;
  failed: number;
  analyzed: number;
  aiDisabled: number;
}

const EMPTY: Counts = {
  total: 0,
  uploaded: 0,
  inFlight: 0,
  failed: 0,
  analyzed: 0,
  aiDisabled: 0,
};

export function VisitAttachmentSyncStatus({
  visitId,
}: VisitAttachmentSyncStatusProps) {
  const counts = useLiveQuery(
    async (): Promise<Counts> => {
      const db = getDb();
      const attachments = await db.attachments
        .where("visit_id")
        .equals(visitId)
        .toArray();

      // On ignore les `draft` (jamais soumis : invisibles côté chat)
      const submitted = attachments.filter((a) => a.sync_status !== "draft");
      const total = submitted.length;
      if (total === 0) return EMPTY;

      const uploaded = submitted.filter((a) => a.sync_status === "synced").length;
      const inFlight = submitted.filter(
        (a) => a.sync_status === "pending" || a.sync_status === "syncing",
      ).length;
      const failed = submitted.filter((a) => a.sync_status === "failed").length;

      const descriptions = await db.attachment_ai_descriptions
        .where("visit_id")
        .equals(visitId)
        .toArray();
      const analyzedIds = new Set(descriptions.map((d) => d.attachment_id));
      const analyzed = submitted.filter((a) => analyzedIds.has(a.id)).length;

      // Détection « envoyée IA off » : attachment sans description ET dont
      // le message porteur a metadata.ai_enabled === false.
      let aiDisabled = 0;
      const messageIds = Array.from(
        new Set(submitted.map((a) => a.message_id).filter(Boolean) as string[]),
      );
      const messages = messageIds.length
        ? await db.messages.where("id").anyOf(messageIds).toArray()
        : [];
      const aiOffMsgIds = new Set(
        messages
          .filter(
            (m) =>
              (m.metadata as Record<string, unknown> | undefined)
                ?.ai_enabled === false,
          )
          .map((m) => m.id),
      );
      for (const a of submitted) {
        if (
          !analyzedIds.has(a.id) &&
          a.message_id &&
          aiOffMsgIds.has(a.message_id)
        ) {
          aiDisabled++;
        }
      }

      return { total, uploaded, inFlight, failed, analyzed, aiDisabled };
    },
    [visitId],
    EMPTY,
  );

  if (counts.total === 0) return null;

  const allSynced =
    counts.uploaded === counts.total &&
    counts.analyzed === counts.total &&
    counts.failed === 0 &&
    counts.inFlight === 0;

  return (
    <div
      className="border-border bg-card/60 font-ui flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[11px]"
      role="status"
      aria-live="polite"
      data-testid="visit-attachment-sync-status"
    >
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">
          {counts.analyzed}/{counts.total}
        </span>{" "}
        analysée{counts.total > 1 ? "s" : ""}
        <span className="text-muted-foreground/50 mx-1">·</span>
        <span className="tabular-nums">
          {counts.uploaded}/{counts.total}
        </span>{" "}
        uploadée{counts.total > 1 ? "s" : ""}
      </span>

      {counts.inFlight > 0 ? (
        <span className="text-primary inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          en cours…
        </span>
      ) : null}

      {counts.failed > 0 ? (
        <span className="text-destructive inline-flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {counts.failed} échec{counts.failed > 1 ? "s" : ""}
        </span>
      ) : null}

      {counts.aiDisabled > 0 ? (
        <span className="text-muted-foreground/80 inline-flex items-center gap-1">
          {counts.aiDisabled} envoyée{counts.aiDisabled > 1 ? "s" : ""} avec IA
          désactivée — réactive l'IA pour les analyser
        </span>
      ) : null}

      {allSynced ? (
        <span className="inline-flex items-center gap-1 text-[var(--color-green,_#788c5d)]">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          tout est synchronisé
        </span>
      ) : null}
    </div>
  );
}
