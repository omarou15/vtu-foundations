import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sparkles } from "lucide-react";
import { getDb, listLocalMessagesByVisit, type LocalMessage } from "@/shared/db";
import { formatRelative } from "../lib/relativeTime";
import { PendingActionsCard } from "./PendingActionsCard";
import { ConflictCard } from "./ConflictCard";
import { MessageAttachments } from "./MessageAttachments";

interface MessageListProps {
  visitId: string;
  userId: string;
}

/**
 * Liste de messages — feed réactif depuis Dexie via useLiveQuery.
 *
 * Doctrine append-only (KNOWLEDGE §2) : aucun tri manuel, aucune édition.
 *
 * It. 10.5 — affiche `text` (bulle classique) et `actions_card`
 * (PendingActionsCard inline) ; pendant qu'un job LLM est en attente,
 * affiche un loader card-shaped (skeleton premium plutôt que 3 dots).
 */
export function MessageList({ visitId, userId }: MessageListProps) {
  const messages = useLiveQuery(
    () => listLocalMessagesByVisit(visitId),
    [visitId],
    [] as LocalMessage[],
  );

  // It. 10 — détection job LLM en attente sur le dernier message user de la VT.
  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user") ?? null;
  const lastUserId = lastUserMessage?.id ?? null;
  const llmPending = useLiveQuery(
    async () => {
      if (!lastUserId) return false;
      try {
        const entries = await getDb()
          .sync_queue.where("[op+row_id]")
          .equals(["llm_route_and_dispatch", lastUserId])
          .toArray();
        return entries.length > 0;
      } catch {
        return false;
      }
    },
    [lastUserId],
    false,
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll bottom quand de nouveaux messages arrivent.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, llmPending]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="font-body text-sm text-muted-foreground">
            Démarrez la conversation : décrivez la visite, dictez vos
            observations ou demandez une vérification.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-4" role="log" aria-label="Conversation de la visite">
      <ul className="flex flex-col gap-3">
        {messages
          .filter((m) =>
            m.kind === "text" ||
            m.kind === "actions_card" ||
            m.kind === "conflict_card" ||
            m.kind === "photo" ||
            m.kind === "document",
          )
          .map((m) => {
            if (m.kind === "actions_card" && m.role === "assistant") {
              return (
                <PendingActionsCard
                  key={m.id}
                  message={m}
                  userId={userId}
                  visitId={visitId}
                />
              );
            }
            if (m.kind === "conflict_card" && m.role === "assistant") {
              return (
                <ConflictCard
                  key={m.id}
                  message={m}
                  userId={userId}
                  visitId={visitId}
                />
              );
            }
            return <MessageBubble key={m.id} message={m} />;
          })}
        {llmPending ? <ThinkingSkeletonCard /> : null}
      </ul>
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}

/**
 * Skeleton card-shaped : préfigure visuellement la PendingActionsCard à
 * venir. Réduit la latence perçue : l'utilisateur voit immédiatement
 * "il se passe quelque chose" et la forme finale.
 */
function ThinkingSkeletonCard() {
  return (
    <li
      className="flex justify-start"
      role="status"
      aria-label="Assistant en train d'analyser"
      data-testid="llm-thinking-skeleton"
    >
      <div className="bg-card text-card-foreground border-border max-w-[92%] rounded-2xl rounded-bl-sm border shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span className="bg-primary/10 text-primary inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
            <Sparkles
              className="h-3.5 w-3.5 animate-pulse"
              aria-hidden="true"
            />
          </span>
          <span className="font-body text-muted-foreground text-sm">
            J'analyse vos observations
            <AnimatedDots />
          </span>
        </div>
        <div className="border-border space-y-2 border-t px-3 py-2.5">
          <div className="bg-muted h-3 w-3/4 animate-pulse rounded" />
          <div className="bg-muted h-3 w-1/2 animate-pulse rounded [animation-delay:120ms]" />
        </div>
      </div>
    </li>
  );
}

function AnimatedDots() {
  return (
    <span aria-hidden="true">
      <span className="inline-block animate-pulse">.</span>
      <span className="inline-block animate-pulse [animation-delay:150ms]">
        .
      </span>
      <span className="inline-block animate-pulse [animation-delay:300ms]">
        .
      </span>
    </span>
  );
}

function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const meta = (message.metadata as Record<string, unknown> | undefined) ?? {};
  const isPhotoCaption =
    !isUser && !isSystem && meta.kind_origin === "photo_caption";

  if (isSystem) {
    return (
      <li className="flex justify-center">
        <span className="font-ui rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          {message.content}
        </span>
      </li>
    );
  }

  if (isPhotoCaption) {
    const idx = typeof meta.batch_index === "number" ? meta.batch_index : null;
    const total = typeof meta.batch_total === "number" ? meta.batch_total : null;
    return (
      <li className="flex justify-start">
        <div className="bg-card/60 text-foreground border-border/60 max-w-[85%] rounded-2xl rounded-bl-sm border border-dashed px-3 py-1.5 text-xs shadow-sm">
          <div className="flex items-center gap-1.5">
            <Sparkles className="text-primary h-3 w-3 shrink-0" aria-hidden="true" />
            {idx && total ? (
              <span className="font-ui text-muted-foreground tabular-nums text-[10px] font-medium">
                Photo {idx}/{total}
              </span>
            ) : null}
          </div>
          <p className="font-body text-foreground mt-0.5 break-words">
            {message.content}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card text-card-foreground border border-border rounded-bl-sm",
        ].join(" ")}
      >
        {(message.kind === "photo" || message.kind === "document") ? (
          <MessageAttachments messageId={message.id} isUser={isUser} />
        ) : null}
        {message.content ? (
          <p className="font-body whitespace-pre-wrap break-words">
            {message.content}
          </p>
        ) : null}
        <p
          className={[
            "font-ui mt-1 text-[10px]",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground",
          ].join(" ")}
        >
          {formatRelative(message.created_at)}
        </p>
      </div>
    </li>
  );
}
