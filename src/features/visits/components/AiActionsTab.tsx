/**
 * VTU — It. 13 : Onglet "Actions IA" du UnifiedVisitDrawer.
 *
 * Historique chronologique de toutes les propositions IA (cards
 * `actions_card` + `conflict_card`) avec leur statut actuel résolu en
 * vrai contre le JSON state courant :
 *
 *  - validated : champ posé avec validation_status === "validated"
 *  - rejected  : champ rejeté (status validation_status === "rejected")
 *  - pending   : champ unvalidated, ou conflit non arbitré
 *  - missing   : path absent du state (race conditions)
 *
 * Filtres : "Tout" / "En attente" / "Validées" / "Ignorées".
 *
 * Lecture seule — pour agir, l'user retourne au chat (lien deep).
 */

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Check,
  Sparkles,
  X,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getDb, getLatestLocalJsonState, type LocalMessage } from "@/shared/db";
import type { Field } from "@/shared/types/json-state.field";
import type { VisitJsonState } from "@/shared/types";
import type { AiFieldPatch } from "@/shared/llm";
import { findActiveConflicts } from "@/features/json-state/lib/conflicts";
import { labelForPath, formatPatchValue } from "@/shared/llm/path-labels";

interface AiActionsTabProps {
  visitId: string;
  /** Permet au parent de fermer le drawer quand l'user clique "Aller". */
  onCloseDrawer?: () => void;
}

type ActionStatus = "validated" | "rejected" | "pending" | "missing";

interface ActionRow {
  key: string;
  messageId: string;
  createdAt: string;
  kind: "patch" | "conflict";
  path: string;
  label: string;
  proposedValue: string;
  status: ActionStatus;
}

type Filter = "all" | "pending" | "validated" | "rejected";

export function AiActionsTab({ visitId, onCloseDrawer }: AiActionsTabProps) {
  const messages = useLiveQuery(
    () =>
      getDb()
        .messages.where("visit_id")
        .equals(visitId)
        .sortBy("created_at"),
    [visitId],
    [] as LocalMessage[],
  );
  const latest = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
    undefined,
  );

  const activeConflictPaths = useMemo(() => {
    if (!latest) return new Set<string>();
    return new Set(
      findActiveConflicts(latest.state, messages).map((c) => c.path),
    );
  }, [latest, messages]);

  const rows: ActionRow[] = useMemo(() => {
    if (!latest) return [];
    const out: ActionRow[] = [];

    for (const m of messages) {
      const meta = (m.metadata ?? {}) as {
        proposed_patches?: AiFieldPatch[];
        conflict?: { path: string; ai_value?: unknown };
      };

      // Cards "actions_card" : 1 ligne par patch proposé
      if (m.kind === "actions_card" && meta.proposed_patches?.length) {
        for (const p of meta.proposed_patches) {
          const cur = readField(latest.state, p.path);
          out.push({
            key: `${m.id}:${p.path}`,
            messageId: m.id,
            createdAt: m.created_at,
            kind: "patch",
            path: p.path,
            label: labelForPath(p.path),
            proposedValue: formatPatchValue(p.value),
            status: !cur ? "missing" : statusFromField(cur),
          });
        }
      }

      // Cards "conflict_card" : 1 ligne par conflit
      if (m.kind === "conflict_card" && meta.conflict?.path) {
        const path = meta.conflict.path;
        const cur = readField(latest.state, path);
        const stillActive = activeConflictPaths.has(path);
        out.push({
          key: `${m.id}:${path}`,
          messageId: m.id,
          createdAt: m.created_at,
          kind: "conflict",
          path,
          label: labelForPath(path),
          proposedValue: formatPatchValue(meta.conflict.ai_value),
          status: stillActive ? "pending" : !cur ? "missing" : statusFromField(cur),
        });
      }
    }

    // Plus récent en haut
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [latest, messages, activeConflictPaths]);

  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, validated: 0, rejected: 0 };
    for (const r of rows) {
      if (r.status === "pending") c.pending++;
      else if (r.status === "validated") c.validated++;
      else if (r.status === "rejected") c.rejected++;
    }
    return c;
  }, [rows]);

  const [filter, setFilter] = useState<Filter>("all");

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "pending")
      return rows.filter((r) => r.status === "pending");
    if (filter === "validated")
      return rows.filter((r) => r.status === "validated");
    return rows.filter((r) => r.status === "rejected");
  }, [filter, rows]);

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="font-body text-sm text-foreground">
          Aucune proposition IA pour le moment.
        </p>
        <p className="font-ui text-xs text-muted-foreground">
          Les suggestions de patches et arbitrages apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="ai-actions-tab"
    >
      {/* Filtres */}
      <div className="border-b border-border/60 bg-card/40 px-3 py-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtre actions IA">
          <FilterPill
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="Tout"
            count={counts.all}
            tone="muted"
          />
          <FilterPill
            active={filter === "pending"}
            onClick={() => setFilter("pending")}
            label="En attente"
            count={counts.pending}
            tone="primary"
          />
          <FilterPill
            active={filter === "validated"}
            onClick={() => setFilter("validated")}
            label="Validées"
            count={counts.validated}
            tone="success"
          />
          <FilterPill
            active={filter === "rejected"}
            onClick={() => setFilter("rejected")}
            label="Ignorées"
            count={counts.rejected}
            tone="muted"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleRows.length === 0 ? (
          <p className="font-body p-6 text-center text-sm text-muted-foreground">
            Rien à afficher dans ce filtre.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visibleRows.map((r) => (
              <ActionRowItem
                key={r.key}
                row={r}
                visitId={visitId}
                onCloseDrawer={onCloseDrawer}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: "muted" | "primary" | "success";
}) {
  const activeBg =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : tone === "success"
        ? "bg-foreground text-background"
        : "bg-foreground text-background";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "font-ui inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition",
        active
          ? activeBg
          : "bg-muted text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
      <span
        className={[
          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
          active ? "bg-background/20" : "bg-background/60",
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}

function ActionRowItem({
  row,
  visitId,
  onCloseDrawer,
}: {
  row: ActionRow;
  visitId: string;
  onCloseDrawer?: () => void;
}) {
  const isConflict = row.kind === "conflict";
  return (
    <li
      className="flex items-start gap-2 px-3 py-2.5"
      data-testid={`ai-action-row-${row.path}`}
      data-status={row.status}
    >
      <span
        className={[
          "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          isConflict
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/10 text-primary",
        ].join(" ")}
        aria-hidden="true"
      >
        {isConflict ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-ui truncate text-[12px] font-medium text-foreground">
          {row.label}
        </p>
        <p className="font-body truncate text-[12px] text-muted-foreground">
          {row.proposedValue}
        </p>
        <p className="font-ui mt-0.5 text-[10px] text-muted-foreground/80">
          {formatRelative(row.createdAt)}
        </p>
      </div>

      <StatusBadge status={row.status} />

      {row.status === "pending" ? (
        <Link
          to="/visits/$visitId"
          params={{ visitId }}
          onClick={onCloseDrawer}
          className="font-ui ml-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline"
          aria-label="Aller au chat pour traiter"
        >
          Aller
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}

function StatusBadge({ status }: { status: ActionStatus }) {
  if (status === "validated") {
    return (
      <span className="font-ui inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
        <Check className="h-3 w-3" aria-hidden="true" /> Validée
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="font-ui inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <X className="h-3 w-3" aria-hidden="true" /> Ignorée
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="font-ui inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
        En attente
      </span>
    );
  }
  return (
    <span className="font-ui inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      —
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers

function statusFromField(f: Field<unknown>): ActionStatus {
  if (f.validation_status === "validated") return "validated";
  if (f.validation_status === "rejected") return "rejected";
  return "pending";
}

function readField(
  state: VisitJsonState,
  path: string,
): Field<unknown> | null {
  const parts = path.split(".");
  let cur: unknown = state;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (!cur || typeof cur !== "object") return null;
  const obj = cur as Record<string, unknown>;
  if (
    "value" in obj &&
    "source" in obj &&
    "confidence" in obj &&
    "updated_at" in obj
  ) {
    return obj as unknown as Field<unknown>;
  }
  return null;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
