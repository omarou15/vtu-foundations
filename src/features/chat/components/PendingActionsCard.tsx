/**
 * VTU — PendingActionsCard (It. 10.5)
 *
 * Card inline affichée dans le chat à la place d'une bulle texte
 * classique quand l'IA propose des patches/custom fields à valider.
 *
 * UX :
 *  - Une ligne par patch : libellé humain + valeur + Apply / Ignore.
 *  - Bouton "Tout valider" en haut quand >1 patch unvalidated.
 *  - Optimistic UI : on marque la ligne comme "applied"/"ignored" dès le
 *    clic, le live query Dexie fera le reste si la mutation passe.
 *  - Source de vérité du statut : le Field<T> dans le state JSON courant.
 *    Si une autre version est posée entre temps, la card se met à jour
 *    automatiquement via useLiveQuery.
 */

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getDb, type LocalMessage } from "@/shared/db";
import {
  rejectFieldPatch,
  validateFieldPatch,
} from "@/shared/db/json-state.validate.repo";
import { getLatestLocalJsonState } from "@/shared/db/json-state.repo";
import { formatPatchValue, labelForPath } from "@/shared/llm/path-labels";
import type { AiFieldPatch, AiCustomField } from "@/shared/llm";
import type { Field } from "@/shared/types/json-state.field";

interface PendingActionsCardProps {
  message: LocalMessage;
  userId: string;
  visitId: string;
}

interface PatchRow {
  path: string;
  label: string;
  value: string;
  confidence: "low" | "medium" | "high";
  status: "unvalidated" | "validated" | "rejected" | "missing";
}

export function PendingActionsCard({
  message,
  userId,
  visitId,
}: PendingActionsCardProps) {
  const meta = (message.metadata ?? {}) as {
    proposed_patches?: AiFieldPatch[];
    proposed_custom_fields?: AiCustomField[];
  };
  const proposedPatches = meta.proposed_patches ?? [];
  const proposedCustom = meta.proposed_custom_fields ?? [];

  // Suit le state JSON courant pour refléter le statut réel des fields.
  const latestState = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
    undefined,
  );

  const rows: PatchRow[] = useMemo(() => {
    if (!latestState) {
      return proposedPatches.map((p) => ({
        path: p.path,
        label: labelForPath(p.path),
        value: formatPatchValue(p.value),
        confidence: p.confidence,
        status: "unvalidated" as const,
      }));
    }
    return proposedPatches.map((p) => {
      const cur = readField(latestState.state, p.path);
      const status: PatchRow["status"] = !cur
        ? "missing"
        : cur.validation_status;
      return {
        path: p.path,
        label: labelForPath(p.path),
        value: formatPatchValue(cur?.value ?? p.value),
        confidence: p.confidence,
        status,
      };
    });
  }, [latestState, proposedPatches]);

  const pendingCount = rows.filter((r) => r.status === "unvalidated").length;

  return (
    <li className="flex justify-start">
      <div className="bg-card text-card-foreground border border-border max-w-[92%] rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
        {/* Header : message naturel de l'IA */}
        <div className="px-3.5 py-2.5">
          <div className="flex items-start gap-2">
            <span className="bg-primary/10 text-primary mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <p className="font-body whitespace-pre-wrap break-words text-sm">
              {message.content || "Voici ce que je propose :"}
            </p>
          </div>
        </div>

        {/* Liste des patches */}
        {rows.length > 0 ? (
          <div className="border-border border-t">
            {pendingCount > 1 ? (
              <div className="border-border flex items-center justify-between border-b px-3 py-1.5">
                <span className="font-ui text-muted-foreground text-[11px]">
                  {pendingCount} proposition{pendingCount > 1 ? "s" : ""} en attente
                </span>
                <ApplyAllButton
                  rows={rows}
                  userId={userId}
                  visitId={visitId}
                  messageId={message.id}
                />
              </div>
            ) : null}
            <ul className="divide-border divide-y">
              {rows.map((row) => (
                <PatchRowItem
                  key={row.path}
                  row={row}
                  userId={userId}
                  visitId={visitId}
                  messageId={message.id}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {/* Custom fields proposés (lecture seule pour It. 10.5) */}
        {proposedCustom.length > 0 ? (
          <div className="border-border border-t px-3 py-2">
            <p className="font-ui text-muted-foreground text-[11px]">
              + {proposedCustom.length} champ{proposedCustom.length > 1 ? "s" : ""}{" "}
              personnalisé{proposedCustom.length > 1 ? "s" : ""} ajouté
              {proposedCustom.length > 1 ? "s" : ""}
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function PatchRowItem({
  row,
  userId,
  visitId,
  messageId,
}: {
  row: PatchRow;
  userId: string;
  visitId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false);

  const isValidated = row.status === "validated";
  const isRejected = row.status === "rejected";
  const isPending = row.status === "unvalidated";

  const onApply = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    try {
      const r = await validateFieldPatch({
        userId,
        visitId,
        path: row.path,
        sourceMessageId: messageId,
      });
      if (r.status === "noop" && r.reason !== "already_validated") {
        toast.error("Validation impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Validation échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const onIgnore = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    try {
      const r = await rejectFieldPatch({
        userId,
        visitId,
        path: row.path,
        sourceMessageId: messageId,
      });
      if (r.status === "noop" && r.reason !== "already_rejected") {
        toast.error("Rejet impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Rejet échoué", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-ui text-foreground truncate text-[12px] font-medium">
          {row.label}
        </p>
        <p
          className={[
            "font-body truncate text-[13px]",
            isRejected ? "text-muted-foreground line-through" : "text-foreground",
          ].join(" ")}
        >
          {row.value}
          <ConfidenceBadge confidence={row.confidence} />
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isValidated ? (
          <span
            className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium"
            aria-label="Validé"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            Validé
          </span>
        ) : isRejected ? (
          <span
            className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium"
            aria-label="Ignoré"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Ignoré
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={onIgnore}
              disabled={busy}
              aria-label={`Ignorer ${row.label}`}
              className="border-border text-muted-foreground hover:bg-muted active:bg-muted inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-[11px] font-medium transition disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={busy}
              aria-label={`Valider ${row.label}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[11px] font-medium shadow-sm transition disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: "low" | "medium" | "high";
}) {
  const labels = { low: "·", medium: "··", high: "···" } as const;
  return (
    <span
      className="text-muted-foreground ml-1.5 text-[10px] tracking-wider"
      aria-label={`Confiance ${confidence}`}
      title={`Confiance ${confidence}`}
    >
      {labels[confidence]}
    </span>
  );
}

function ApplyAllButton({
  rows,
  userId,
  visitId,
  messageId,
}: {
  rows: PatchRow[];
  userId: string;
  visitId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Séquentiel pour éviter les races sur appendJsonStateVersion
      // (chaque validate crée une nouvelle version basée sur la précédente).
      for (const row of rows) {
        if (row.status !== "unvalidated") continue;
        await validateFieldPatch({
          userId,
          visitId,
          path: row.path,
          sourceMessageId: messageId,
        });
      }
    } catch (err) {
      toast.error("Validation groupée échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-primary hover:bg-primary/10 active:bg-primary/15 font-ui inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-50"
    >
      <Check className="h-3 w-3" aria-hidden="true" />
      Tout valider
    </button>
  );
}

// ---------------------------------------------------------------------------

function readField(
  state: unknown,
  path: string,
): Field<unknown> | null {
  if (!state || typeof state !== "object") return null;
  const segments = path.split(".");
  let cur: unknown = state;
  for (let i = 0; i < segments.length - 1; i++) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[segments[i]!];
  }
  if (!cur || typeof cur !== "object") return null;
  const leaf = (cur as Record<string, unknown>)[segments[segments.length - 1]!];
  if (!leaf || typeof leaf !== "object" || !("value" in (leaf as object))) {
    return null;
  }
  return leaf as Field<unknown>;
}
