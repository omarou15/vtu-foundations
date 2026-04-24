/**
 * VTU — Hook qui ping Supabase toutes les 30 s pour alimenter
 * `useConnectionStore`. À monter au niveau du layout protégé.
 */

import { useEffect } from "react";
import { useConnectionStore } from "./connection.store";

const PING_MS = 30_000;
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "";

export function useConnectionPing(): void {
  const setPingResult = useConnectionStore((s) => s.setPingResult);
  const setNavigatorOnline = useConnectionStore((s) => s.setNavigatorOnline);

  useEffect(() => {
    if (typeof window === "undefined" || !SUPABASE_URL) return;

    let cancelled = false;
    const controller = new AbortController();

    async function ping() {
      if (cancelled) return;
      try {
        // HEAD sur le endpoint REST racine — pas d'auth nécessaire,
        // renvoie 200/401, mais une réponse HTTP suffit à dire "joignable".
        const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
          method: "HEAD",
          signal: controller.signal,
          // Headers minimaux : on ne met pas l'apikey pour éviter 401
          // bruyant — on veut juste tester la joignabilité réseau.
        });
        // Tout HTTP < 500 = serveur joignable.
        setPingResult(res.status < 500);
      } catch {
        if (!cancelled) setPingResult(false);
      }
    }

    void ping();
    const interval = setInterval(() => void ping(), PING_MS);

    function onOnline() {
      setNavigatorOnline(true);
      void ping();
    }
    function onOffline() {
      setNavigatorOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [setPingResult, setNavigatorOnline]);
}
