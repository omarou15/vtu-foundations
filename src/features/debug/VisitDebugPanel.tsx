/**
 * VTU — PR4 §6 : panneau debug visite (dev-only).
 *
 * Compteurs Dexie live + état orchestrator + sync_queue + erreurs IA.
 * Visible :
 *   - en dev (`import.meta.env.DEV === true`)
 *   - ou si l'URL contient `?debug=1` (toggle manuel en prod)
 *
 * Aucune nouvelle table, aucune nouvelle requête réseau : 100% lecture
 * depuis Dexie via `useLiveQuery` + état orchestrator en mémoire.
 */

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bug, ChevronDown, ChevronUp, X } from "lucide-react";
import { getDb } from "@/shared/db";
import {
  isVisitSnapshotInflight,
  getLastVisitSnapshotResult,
} from "@/shared/sync/visit-snapshot";

interface VisitDebugPanelProps {
  visitId: string;
}

interface DebugSnapshot {
  visit: { exists: boolean; status: string | null; version: number | null };
  messages: number;
  attachments: { total: number; synced: number; pending: number; failed: number };
  descriptions: number;
  jsonStateLatestVersion: number | null;
  syncQueue: {
    total: number;
    byOp: Record<string, number>;
    nextErrors: Array<{ op: string; row_id: string; error: string }>;
  };
  llmFailures: Array<{
    attachmentId: string | null;
    status: string;
    error: string | null;
    createdAt: string;
  }>;
}

const EMPTY_SNAPSHOT: DebugSnapshot = {
  visit: { exists: false, status: null, version: null },
  messages: 0,
  attachments: { total: 0, synced: 0, pending: 0, failed: 0 },
  descriptions: 0,
  jsonStateLatestVersion: null,
  syncQueue: { total: 0, byOp: {}, nextErrors: [] },
  llmFailures: [],
};

function shouldShowPanel(): boolean {
  // Affiché en dev OU si ?debug=1 dans l'URL.
  // (Pas d'AsyncLocalStorage côté client — on lit window.location.)
  // import.meta.env.DEV est inliné par Vite.
  const isDev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  if (isDev) return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export function VisitDebugPanel({ visitId }: VisitDebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    setShow(shouldShowPanel());
  }, []);

  // Re-render léger toutes les 2s pour rafraîchir l'état orchestrator
  // (qui n'est pas dans Dexie → pas de useLiveQuery dispo).
  useEffect(() => {
    if (!show || !open) return;
    const id = setInterval(() => force((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, [show, open]);

  const snapshot =
    useLiveQuery<DebugSnapshot>(
      async () => {
        const db = getDb();
        const visit = await db.visits.get(visitId);
        const messages = await db.messages
          .where("visit_id")
          .equals(visitId)
          .toArray();
        const attachments = await db.attachments
          .where("visit_id")
          .equals(visitId)
          .toArray();
        const descs = await db.attachment_ai_descriptions
          .where("visit_id")
          .equals(visitId)
          .toArray();
        const jsonStates = await db.visit_json_state
          .where("visit_id")
          .equals(visitId)
          .toArray();
        jsonStates.sort((a, b) => b.version - a.version);

        const allQueue = await db.sync_queue.toArray();
        const byOp: Record<string, number> = {};
        for (const q of allQueue) {
          byOp[q.op] = (byOp[q.op] ?? 0) + 1;
        }
        const nextErrors = allQueue
          .filter((q) => q.last_error)
          .slice(0, 5)
          .map((q) => ({
            op: q.op,
            row_id: q.row_id,
            error: String(q.last_error).slice(0, 100),
          }));

        const visitAttIds = new Set(attachments.map((a) => a.id));
        const llmFails = (
          await db.llm_extractions
            .where("visit_id")
            .equals(visitId)
            .toArray()
        )
          .filter(
            (e) =>
              e.status === "failed" ||
              e.status === "rate_limited" ||
              e.status === "malformed",
          )
          .filter(
            (e) => !e.attachment_id || visitAttIds.has(e.attachment_id),
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5)
          .map((e) => ({
            attachmentId: e.attachment_id,
            status: e.status,
            error: e.error_message,
            createdAt: e.created_at,
          }));

        return {
          visit: {
            exists: Boolean(visit),
            status: visit?.status ?? null,
            version: visit?.version ?? null,
          },
          messages: messages.length,
          attachments: {
            total: attachments.length,
            synced: attachments.filter((a) => a.sync_status === "synced").length,
            pending: attachments.filter(
              (a) =>
                a.sync_status === "pending" || a.sync_status === "syncing",
            ).length,
            failed: attachments.filter((a) => a.sync_status === "failed").length,
          },
          descriptions: descs.length,
          jsonStateLatestVersion: jsonStates[0]?.version ?? null,
          syncQueue: { total: allQueue.length, byOp, nextErrors },
          llmFailures: llmFails,
        };
      },
      [visitId],
    ) ?? EMPTY_SNAPSHOT;

  if (!show) return null;

  const inflight = isVisitSnapshotInflight(visitId);
  const lastResult = getLastVisitSnapshotResult(visitId);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-ui fixed bottom-24 right-3 z-40 inline-flex items-center gap-1 rounded-full border border-border bg-card/95 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow backdrop-blur hover:bg-card"
        aria-label="Ouvrir le panneau debug"
        data-testid="visit-debug-toggle"
      >
        <Bug className="h-3 w-3" />
        debug
      </button>
    );
  }

  return (
    <div
      className="font-ui fixed bottom-24 right-3 z-40 max-h-[60vh] w-[320px] overflow-auto rounded-lg border border-border bg-card/95 p-3 text-[11px] shadow-lg backdrop-blur"
      data-testid="visit-debug-panel"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
          <Bug className="h-3 w-3" />
          Debug · {visitId.slice(0, 8)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => force((n) => n + 1)}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            aria-label="Rafraîchir"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            aria-label="Fermer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <Section title="Dexie">
        <Row k="visit" v={snapshot.visit.exists ? `${snapshot.visit.status} v${snapshot.visit.version}` : "absent"} />
        <Row k="messages" v={String(snapshot.messages)} />
        <Row
          k="attachments"
          v={`${snapshot.attachments.total} (✓${snapshot.attachments.synced} ⏳${snapshot.attachments.pending} ✗${snapshot.attachments.failed})`}
        />
        <Row k="ai descriptions" v={String(snapshot.descriptions)} />
        <Row
          k="json_state"
          v={
            snapshot.jsonStateLatestVersion === null
              ? "absent"
              : `v${snapshot.jsonStateLatestVersion}`
          }
        />
      </Section>

      <Section title="Sync orchestrator">
        <Row k="inflight" v={inflight ? "oui" : "non"} />
        <Row
          k="last result"
          v={
            lastResult
              ? `${lastResult.ok ? "ok" : "fail"} · ${new Date(lastResult.at).toLocaleTimeString()}`
              : "—"
          }
        />
        {lastResult && !lastResult.ok ? (
          <Row k="last error" v={lastResult.error ?? "?"} />
        ) : null}
      </Section>

      <Section title={`Sync queue (${snapshot.syncQueue.total})`}>
        {Object.entries(snapshot.syncQueue.byOp).length === 0 ? (
          <div className="text-muted-foreground">vide</div>
        ) : (
          Object.entries(snapshot.syncQueue.byOp).map(([op, n]) => (
            <Row key={op} k={op} v={String(n)} />
          ))
        )}
        {snapshot.syncQueue.nextErrors.length > 0 ? (
          <div className="mt-1.5 border-t border-border/50 pt-1.5">
            <div className="mb-1 text-[10px] font-medium text-destructive">
              Erreurs queue récentes
            </div>
            {snapshot.syncQueue.nextErrors.map((e, i) => (
              <div key={i} className="text-[10px] text-muted-foreground">
                <span className="text-destructive">{e.op}</span> · {e.row_id.slice(0, 8)} ·{" "}
                {e.error}
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {snapshot.llmFailures.length > 0 ? (
        <Section title="IA — derniers échecs">
          {snapshot.llmFailures.map((f, i) => (
            <div key={i} className="mb-1 text-[10px]">
              <span className="text-destructive">{f.status}</span>{" "}
              {f.attachmentId ? `att ${f.attachmentId.slice(0, 8)}` : "—"}
              <div className="text-muted-foreground">{f.error ?? "?"}</div>
              <div className="text-muted-foreground/70">
                {new Date(f.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2 rounded border border-border/60 bg-background/60 p-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-1 flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <span>{title}</span>
        {open ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>
      {open ? <div className="space-y-0.5">{children}</div> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums text-foreground">{v}</span>
    </div>
  );
}
