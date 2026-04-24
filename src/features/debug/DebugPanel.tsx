/**
 * VTU — Panel debug (Itération 6)
 *
 * Affiche :
 *  - État connectivité (ping Supabase + navigator.onLine)
 *  - Storage : usage / quota / pourcentage
 *  - Compteur d'entries en sync_queue
 *
 * Accessible via le bouton ⚙️ de la sidebar.
 */

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { getDb } from "@/shared/db";
import { useStorageEstimate } from "@/shared/hooks";
import { useConnectionStore } from "@/shared/sync";

interface DebugPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function DebugPanel({ open, onOpenChange }: DebugPanelProps) {
  const storage = useStorageEstimate();
  const isOnline = useConnectionStore((s) => s.isOnline);
  const lastPingAt = useConnectionStore((s) => s.lastPingAt);
  const lastPingOk = useConnectionStore((s) => s.lastPingOk);

  const queueCount = useLiveQuery(() => getDb().sync_queue.count(), [], 0);
  const failedCount = useLiveQuery(
    () =>
      Promise.all([
        getDb().visits.where("sync_status").equals("failed").count(),
        getDb().messages.where("sync_status").equals("failed").count(),
      ]).then(([a, b]) => a + b),
    [],
    0,
  );

  // Refresh storage estimate à l'ouverture.
  useEffect(() => {
    if (open) void storage.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="safe-top safe-bottom safe-x flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="font-heading text-base">
            Paramètres — debug
          </SheetTitle>
          <SheetDescription className="font-body text-xs text-muted-foreground">
            Diagnostic Phase 1. La page complète arrive plus tard.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <dl className="grid grid-cols-1 gap-4 text-sm">
            <Row label="Connexion">
              <span
                className={`font-ui inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  isOnline
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
                }`}
                data-testid="debug-connection"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOnline ? "bg-success" : "bg-destructive"
                  }`}
                />
                {isOnline ? "En ligne" : "Hors ligne"}
              </span>
            </Row>
            <Row label="Dernier ping">
              <span className="font-ui text-xs text-muted-foreground">
                {lastPingAt
                  ? `${new Date(lastPingAt).toLocaleTimeString("fr-FR")} — ${
                      lastPingOk ? "OK" : "KO"
                    }`
                  : "—"}
              </span>
            </Row>
            <Row label="Sync queue">
              <span
                className="font-ui text-sm font-semibold text-foreground"
                data-testid="debug-queue-count"
              >
                {queueCount} entrée{queueCount > 1 ? "s" : ""}
              </span>
            </Row>
            <Row label="Échecs sync">
              <span
                className={`font-ui text-sm font-semibold ${
                  failedCount > 0 ? "text-destructive" : "text-muted-foreground"
                }`}
                data-testid="debug-failed-count"
              >
                {failedCount}
              </span>
            </Row>

            <div className="mt-2 border-t border-border pt-3">
              <h3 className="font-heading mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stockage local
              </h3>
              {!storage.supported ? (
                <p className="font-body text-xs text-muted-foreground">
                  navigator.storage.estimate() indisponible.
                </p>
              ) : (
                <>
                  <Row label="Utilisé">
                    <span className="font-ui text-sm">
                      {formatBytes(storage.usage)}
                    </span>
                  </Row>
                  <Row label="Quota">
                    <span className="font-ui text-sm">
                      {formatBytes(storage.quota)}
                    </span>
                  </Row>
                  <Row label="Ratio">
                    <span
                      className={`font-ui text-sm font-semibold ${
                        storage.warning ? "text-warning" : "text-foreground"
                      }`}
                      data-testid="debug-storage-ratio"
                    >
                      {storage.ratio !== null
                        ? `${(storage.ratio * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                  </Row>
                  {storage.warning ? (
                    <p
                      className="font-body mt-2 rounded-md bg-warning/15 p-2 text-xs text-warning"
                      role="alert"
                    >
                      ⚠️ Stockage local au-dessus de 80 % du quota.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </dl>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-ui text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Badge consommé par le bouton ⚙️ pour signaler un état "warning" ou
 * "online status" dégradé sans ouvrir le panel.
 */
export function useDebugBadge(): "warning" | "offline" | null {
  const isOnline = useConnectionStore((s) => s.isOnline);
  const storage = useStorageEstimate();
  if (!isOnline) return "offline";
  if (storage.warning) return "warning";
  return null;
}
