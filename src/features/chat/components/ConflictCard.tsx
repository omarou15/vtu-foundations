/**
 * VTU — ConflictCard (It. 11)
 *
 * Carte inline affichée dans le fil chat à la place d'une bulle texte
 * pour un message assistant `kind="conflict_card"`. Liste les conflits
 * actifs (humain ↔ IA) que CE message a soulevés et permet à
 * l'utilisateur de trancher en 1 clic :
 *  - "Garder ma valeur" → keepHumanValue (validate human, mark resolved).
 *  - "Prendre l'IA"     → overrideWithAiPatch (replace + validate).
 *
 * Source de vérité du statut : findActiveConflicts() croise le state
 * courant + metadata.conflict_resolutions du message porteur. Quand le
 * user tranche, la carte se vide automatiquement via useLiveQuery.
 */

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Check, User, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getDb, type LocalMessage } from "@/shared/db";
import { getLatestLocalJsonState } from "@/shared/db/json-state.repo";
import {
  keepHumanValue,
  overrideWithAiPatch,
} from "@/shared/db/json-state.validate.repo";
import {
  findActiveConflicts,
  filterConflictsByAssistantMessage,
  type Conflict,
} from "@/features/json-state/lib/conflicts";

interface ConflictCardProps {
  message: LocalMessage;
  userId: string;
  visitId: string;
}

export function ConflictCard({ message, userId, visitId }: ConflictCardProps) {
  // State JSON courant + tous les messages — recalcule les conflits actifs.
  const latestState = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
    undefined,
  );
  const allMessages = useLiveQuery(
    () =>
      getDb()
        .messages
        .where("visit_id")
        .equals(visitId)
        .toArray(),
    [visitId],
    [] as LocalMessage[],
  );

  const conflicts = (() => {
    if (!latestState) return [] as Conflict[];
    const all = findActiveConflicts(latestState.state, allMessages);
    return filterConflictsByAssistantMessage(all, message.id);
  })();

  // Si tous les conflits sont arbitrés, on collapse la carte en récap discret.
  if (conflicts.length === 0) {
    return (
      <li className="flex justify-start">
        <div className="bg-card text-card-foreground border border-border max-w-[92%] rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <span className="bg-primary/10 text-primary inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <p className="font-body text-muted-foreground text-sm">
              Conflit{message.metadata && (message.metadata as Record<string, unknown>).proposed_patches && Array.isArray((message.metadata as Record<string, unknown>).proposed_patches) && ((message.metadata as Record<string, unknown>).proposed_patches as unknown[]).length > 1 ? "s" : ""} arbitré{message.metadata && (message.metadata as Record<string, unknown>).proposed_patches && Array.isArray((message.metadata as Record<string, unknown>).proposed_patches) && ((message.metadata as Record<string, unknown>).proposed_patches as unknown[]).length > 1 ? "s" : ""}.
            </p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex justify-start" data-testid="conflict-card">
      <div className="bg-card text-card-foreground border border-warning/40 max-w-[92%] rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
        {/* Header — message naturel de l'IA */}
        <div className="px-3.5 py-2.5">
          <div className="flex items-start gap-2">
            <span className="bg-warning/15 text-warning mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <p className="font-body whitespace-pre-wrap break-words text-sm">
              {message.content || "J'ai relevé une valeur différente — laquelle garder ?"}
            </p>
          </div>
        </div>

        {/* Liste des conflits */}
        <ul className="divide-border divide-y border-border border-t">
          {conflicts.map((c) => (
            <ConflictRow
              key={c.path}
              conflict={c}
              userId={userId}
              visitId={visitId}
              messageId={message.id}
            />
          ))}
        </ul>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function ConflictRow({
  conflict,
  userId,
  visitId,
  messageId,
}: {
  conflict: Conflict;
  userId: string;
  visitId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState<"none" | "human" | "ai">("none");

  const onKeepHuman = async () => {
    if (busy !== "none") return;
    setBusy("human");
    try {
      const r = await keepHumanValue({
        userId,
        visitId,
        path: conflict.path,
        sourceMessageId: messageId,
      });
      if (r.status === "noop" && r.reason !== "already_validated") {
        toast.error("Action impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Action échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy("none");
    }
  };

  const onTakeAi = async () => {
    if (busy !== "none") return;
    setBusy("ai");
    try {
      const r = await overrideWithAiPatch({
        userId,
        visitId,
        path: conflict.path,
        patch: conflict.aiPatch,
        sourceMessageId: messageId,
      });
      if (r.status === "noop") {
        toast.error("Action impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Action échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy("none");
    }
  };

  return (
    <li className="px-3 py-2.5" data-testid="conflict-row">
      <p className="font-ui text-foreground text-[12px] font-medium">
        {conflict.label}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onKeepHuman}
          disabled={busy !== "none"}
          aria-label={`Garder ma valeur : ${conflict.humanValue}`}
          className="border-border hover:border-primary hover:bg-primary/5 active:bg-primary/10 group flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition disabled:opacity-50"
        >
          <span className="font-ui text-muted-foreground inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
            <User className="h-3 w-3" aria-hidden="true" />
            La mienne
          </span>
          <span className="font-body text-foreground line-clamp-2 break-words text-[13px]">
            {conflict.humanValue}
          </span>
          {busy === "human" ? (
            <span className="font-ui text-muted-foreground text-[10px]">…</span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onTakeAi}
          disabled={busy !== "none"}
          aria-label={`Prendre la valeur IA : ${conflict.aiValue}`}
          className="border-border hover:border-primary hover:bg-primary/5 active:bg-primary/10 group flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition disabled:opacity-50"
        >
          <span className="font-ui text-muted-foreground inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            IA
            <ConfidenceDots confidence={conflict.aiConfidence} />
          </span>
          <span className="font-body text-foreground line-clamp-2 break-words text-[13px]">
            {conflict.aiValue}
          </span>
          {busy === "ai" ? (
            <span className="font-ui text-muted-foreground text-[10px]">…</span>
          ) : null}
        </button>
      </div>
    </li>
  );
}

function ConfidenceDots({
  confidence,
}: {
  confidence: "low" | "medium" | "high";
}) {
  const labels = { low: "·", medium: "··", high: "···" } as const;
  return (
    <span
      className="text-muted-foreground ml-0.5 tracking-wider"
      aria-label={`Confiance ${confidence}`}
      title={`Confiance ${confidence}`}
    >
      {labels[confidence]}
    </span>
  );
}
