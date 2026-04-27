import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, listLocalMessagesByVisit, type LocalMessage } from "@/shared/db";
import { formatRelative } from "../lib/relativeTime";

interface MessageListProps {
  visitId: string;
}

/**
 * Liste de messages — feed réactif depuis Dexie via useLiveQuery.
 *
 * Doctrine append-only (KNOWLEDGE §2) : aucun tri manuel, aucune édition.
 * Affiche uniquement `kind === "text"` à ce stade. Audio/photo arrivent
 * en Phase 2.
 */
export function MessageList({ visitId }: MessageListProps) {
  const messages = useLiveQuery(
    () => listLocalMessagesByVisit(visitId),
    [visitId],
    [] as LocalMessage[],
  );

  // It. 10 — détection job LLM en attente sur le dernier message user de la VT.
  // Affiche 3 dots animés sous le dernier message user pendant que le cerveau
  // route/extract/répond.
  const lastUserId =
    [...messages].reverse().find((m) => m.role === "user")?.id ?? null;
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
          .filter((m) => m.kind === "text")
          .map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        {llmPending ? <ThinkingDots /> : null}
      </ul>
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}

function ThinkingDots() {
  return (
    <li
      className="flex justify-start"
      role="status"
      aria-label="Assistant en train d'analyser"
      data-testid="llm-thinking-dots"
    >
      <div className="bg-card text-card-foreground border border-border max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-sm">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
        </span>
      </div>
    </li>
  );
}

function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <li className="flex justify-center">
        <span className="font-ui rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          {message.content}
        </span>
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
        <p className="font-body whitespace-pre-wrap break-words">
          {message.content}
        </p>
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
