/**
 * VTU — Hook React qui pilote le sync engine au niveau du layout protégé.
 *
 * - Tick périodique (30 s)
 * - Sur `online`
 * - Sur `window.focus`
 * - Au montage (immédiat)
 *
 * Sérialisé : un flag `running` empêche les ticks concurrents dans la
 * même fenêtre. Les ticks demandés pendant un run en cours sont coalescés
 * (un seul re-run sera lancé à la fin).
 *
 * Aussi : appelle `update-json-state` (fire-and-forget) après chaque
 * message synced — Phase 1 c'est un scaffold qui retourne 200.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDb } from "@/shared/db/schema";
import { runSyncOnce } from "./engine";
import { useAuth } from "@/features/auth";

const TICK_MS = 30_000;

export function useSyncEngine(): void {
  const userId = useAuth((s) => s.user?.id);
  const status = useAuth((s) => s.status);
  const runningRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (runningRef.current) {
        pendingRef.current = true;
        return;
      }
      runningRef.current = true;
      try {
        // 1. On note quels messages étaient pending AVANT la sync
        //    pour pouvoir cibler le fire-and-forget après.
        const db = getDb();
        const messagesBefore = await db.messages
          .where("sync_status")
          .anyOf("pending", "syncing")
          .primaryKeys();

        // 2. On vide la queue (sérialisé).
        // Cast structurel : SupabaseClient est trop profond pour TS,
        // mais respecte SyncSupabaseLike (vérifié à l'usage côté tests).
        const result = await runSyncOnce(
          supabase as unknown as Parameters<typeof runSyncOnce>[0],
        );

        // 3. Fire-and-forget update-json-state pour les messages
        //    devenus "synced" pendant ce tick.
        if (result.processed > 0) {
          const newlySynced = await db.messages
            .where("id")
            .anyOf(messagesBefore as string[])
            .filter((m) => m.sync_status === "synced")
            .toArray();

          for (const m of newlySynced) {
            // Appel non bloquant — Phase 1 c'est un scaffold 200 OK.
            void supabase.functions
              .invoke("update-json-state", {
                body: { visit_id: m.visit_id, message_id: m.id },
              })
              .catch(() => {
                // On ne bloque rien : l'IA viendra en Phase 2.
              });
          }
        }
      } finally {
        runningRef.current = false;
        if (pendingRef.current && !cancelled) {
          pendingRef.current = false;
          void tick();
        }
      }
    }

    // Trigger immédiat
    void tick();

    const interval = setInterval(() => void tick(), TICK_MS);

    function onOnline() {
      void tick();
    }
    function onFocus() {
      void tick();
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, [status, userId]);
}
