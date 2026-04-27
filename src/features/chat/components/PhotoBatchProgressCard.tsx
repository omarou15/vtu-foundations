/**
 * VTU — It. 14 : carte de progression batch photo.
 *
 * Affichée à la place du `ThinkingSkeletonCard` quand le dernier message
 * user est un `photo`/`document` avec ≥ 2 attachments. Mise à jour
 * réactive : compte les `attachment_ai_descriptions` reçues vs total.
 *
 * Quand `done === total`, le composant disparaît et on retombe sur le
 * skeleton standard pour la phase finale `extract` (synthèse globale).
 */

import { useLiveQuery } from "dexie-react-hooks";
import { Sparkles } from "lucide-react";
import { getDb } from "@/shared/db";

interface PhotoBatchProgressCardProps {
  messageId: string;
}

export function PhotoBatchProgressCard({
  messageId,
}: PhotoBatchProgressCardProps) {
  const total = useLiveQuery(
    async () => {
      const list = await getDb()
        .attachments.where("message_id")
        .equals(messageId)
        .toArray();
      return list.length;
    },
    [messageId],
    0,
  );

  const done = useLiveQuery(
    async () => {
      const list = await getDb()
        .attachments.where("message_id")
        .equals(messageId)
        .toArray();
      let count = 0;
      for (const a of list) {
        const desc = await getDb()
          .attachment_ai_descriptions.where("attachment_id")
          .equals(a.id)
          .first();
        if (desc) count++;
      }
      return count;
    },
    [messageId],
    0,
  );

  if (total < 2) return null;
  if (done >= total) return null;

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <li
      className="flex justify-start"
      role="status"
      aria-label={`Analyse photos en cours : ${done} sur ${total}`}
      data-testid="photo-batch-progress"
    >
      <div className="bg-card text-card-foreground border-border max-w-[92%] rounded-2xl rounded-bl-sm border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span className="bg-primary/10 text-primary inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
            <Sparkles
              className="h-3.5 w-3.5 animate-pulse"
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-body text-foreground text-sm">
              <span className="tabular-nums font-semibold">
                {done}/{total}
              </span>{" "}
              photo{total > 1 ? "s" : ""} analysée{done > 1 ? "s" : ""}
            </p>
            <p className="font-ui text-muted-foreground mt-0.5 text-[11px]">
              Chaque photo apparaît dès qu'elle est prête.
            </p>
          </div>
        </div>
        <div className="bg-muted h-1 w-full">
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </li>
  );
}
