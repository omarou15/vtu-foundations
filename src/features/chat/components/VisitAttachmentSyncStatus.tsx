/**
 * VTU — PR3 : statut persistant de sync/analyse des pièces jointes.
 *
 * Améliorations :
 *  - Modèle métier explicite par attachment (`uploaded`, `visible`, `ai`).
 *  - Ratchet sur `total` : la valeur ne descend jamais pendant la durée de
 *    vie du composant pour la même visite. Évite l'effet visuel "5/5 → 1/5"
 *    pendant qu'un pull réécrit progressivement les rows.
 *  - Compteurs séparés : analysées / visibles / uploadées.
 *  - Indicateur "sync en cours" sans masquer le ratchet : on n'inverse pas
 *    le total, on dit juste qu'on synchronise.
 */

import { useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { getDb } from "@/shared/db";

interface VisitAttachmentSyncStatusProps {
  visitId: string;
}

interface AttachmentBusinessStatus {
  id: string;
  uploaded: boolean;
  visible: boolean;
  ai:
    | "not_requested"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "disabled_when_sent";
}

interface Counts {
  total: number;
  uploaded: number;
  visible: number;
  analyzed: number;
  inFlight: number;
  failed: number;
  aiDisabled: number;
}

const EMPTY: Counts = {
  total: 0,
  uploaded: 0,
  visible: 0,
  analyzed: 0,
  inFlight: 0,
  failed: 0,
  aiDisabled: 0,
};

export function VisitAttachmentSyncStatus({
  visitId,
}: VisitAttachmentSyncStatusProps) {
  // High-water mark : `total` ne redescend jamais pour une même visite.
  // Reset si on change de visitId.
  const ratchetRef = useRef<{ visitId: string; total: number }>({
    visitId,
    total: 0,
  });
  if (ratchetRef.current.visitId !== visitId) {
    ratchetRef.current = { visitId, total: 0 };
  }

  const counts = useLiveQuery(
    async (): Promise<Counts> => {
      const db = getDb();
      const attachments = await db.attachments
        .where("visit_id")
        .equals(visitId)
        .toArray();

      // On ignore les `draft` (jamais soumis : invisibles côté chat).
      const submitted = attachments.filter((a) => a.sync_status !== "draft");
      if (submitted.length === 0) return EMPTY;

      // Restreint aux attachments liés à un message qui existe localement
      // (sinon ils n'apparaissent pas dans le chat → ne pas les compter).
      const messageIds = Array.from(
        new Set(submitted.map((a) => a.message_id).filter(Boolean) as string[]),
      );
      const messages = messageIds.length
        ? await db.messages.where("id").anyOf(messageIds).toArray()
        : [];
      const messageById = new Map(messages.map((m) => [m.id, m]));
      const visibleAttachments = submitted.filter(
        (a) => a.message_id && messageById.has(a.message_id),
      );

      const descriptions = await db.attachment_ai_descriptions
        .where("visit_id")
        .equals(visitId)
        .toArray();
      const analyzedIds = new Set(descriptions.map((d) => d.attachment_id));

      // PR4 §5 — IA en échec terminal (rate_limited / payment_required / malformed / failed)
      const visibleIds = visibleAttachments.map((a) => a.id);
      const extractions = visibleIds.length
        ? await db.llm_extractions
            .where("attachment_id")
            .anyOf(visibleIds)
            .toArray()
        : [];
      const failedAiIds = new Set<string>();
      for (const att of visibleAttachments) {
        if (analyzedIds.has(att.id)) continue;
        const last = extractions
          .filter((e) => e.attachment_id === att.id && e.mode === "describe_media")
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (
          last &&
          (last.status === "failed" ||
            last.status === "rate_limited" ||
            last.status === "malformed")
        ) {
          failedAiIds.add(att.id);
        }
      }

      const aiOffMsgIds = new Set(
        messages
          .filter(
            (m) =>
              (m.metadata as Record<string, unknown> | undefined)
                ?.ai_enabled === false,
          )
          .map((m) => m.id),
      );

      // Modèle métier par attachment.
      const businessStatuses: AttachmentBusinessStatus[] = visibleAttachments.map(
        (a) => {
          const uploaded = a.sync_status === "synced";
          const visible = uploaded; // même condition pour l'instant
          let ai: AttachmentBusinessStatus["ai"];
          if (analyzedIds.has(a.id)) {
            ai = "done";
          } else if (failedAiIds.has(a.id)) {
            ai = "failed";
          } else if (a.message_id && aiOffMsgIds.has(a.message_id)) {
            ai = "disabled_when_sent";
          } else if (a.sync_status === "synced") {
            ai = "queued"; // synced sans description ⇒ analyse en attente / en cours
          } else {
            ai = "not_requested";
          }
          return { id: a.id, uploaded, visible, ai };
        },
      );

      const total = businessStatuses.length;
      const uploaded = businessStatuses.filter((s) => s.uploaded).length;
      const visible = businessStatuses.filter((s) => s.visible).length;
      const analyzed = businessStatuses.filter((s) => s.ai === "done").length;
      const aiDisabled = businessStatuses.filter(
        (s) => s.ai === "disabled_when_sent",
      ).length;
      const aiFailed = businessStatuses.filter((s) => s.ai === "failed").length;
      const inFlight = visibleAttachments.filter(
        (a) => a.sync_status === "pending" || a.sync_status === "syncing",
      ).length + submitted.filter(
        (a) =>
          (a.sync_status === "pending" || a.sync_status === "syncing") &&
          (!a.message_id || !messageById.has(a.message_id)),
      ).length;
      const failed = visibleAttachments.filter((a) => a.sync_status === "failed").length;

      return {
        total,
        uploaded,
        visible,
        analyzed,
        inFlight,
        failed,
        aiDisabled,
        aiFailed,
      };
    },
    [visitId],
    EMPTY,
  );

  // Applique le ratchet : on garde le max historique de `total`.
  const observedTotal = counts.total;
  if (observedTotal > ratchetRef.current.total) {
    ratchetRef.current.total = observedTotal;
  }
  const stableTotal = ratchetRef.current.total;
  const isSyncCatchingUp = stableTotal > observedTotal;

  if (stableTotal === 0) return null;

  const allSynced =
    !isSyncCatchingUp &&
    counts.uploaded === stableTotal &&
    counts.analyzed === stableTotal &&
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
          {counts.analyzed}/{stableTotal}
        </span>{" "}
        analysée{stableTotal > 1 ? "s" : ""}
        <span className="text-muted-foreground/50 mx-1">·</span>
        <span className="tabular-nums">
          {counts.visible}/{stableTotal}
        </span>{" "}
        visible{stableTotal > 1 ? "s" : ""}
        <span className="text-muted-foreground/50 mx-1">·</span>
        <span className="tabular-nums">
          {counts.uploaded}/{stableTotal}
        </span>{" "}
        uploadée{stableTotal > 1 ? "s" : ""}
      </span>

      {(counts.inFlight > 0 || isSyncCatchingUp) ? (
        <span className="text-primary inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          {isSyncCatchingUp ? "sync en cours…" : "en cours…"}
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
