import { useEffect } from "react";

/**
 * Détecte les échecs de chargement dynamique de modules (chunk-load errors)
 * et déclenche un rechargement automatique unique de la page.
 *
 * Cas typique : après un redeploy / HMR, le navigateur garde en cache une
 * référence vers un chunk qui n'existe plus côté serveur.
 *
 * Stratégie :
 *  - On écoute window.error + unhandledrejection.
 *  - Si le message correspond à un échec d'import dynamique, on recharge
 *    la page une seule fois (flag en sessionStorage) pour éviter une boucle.
 */
const RELOAD_FLAG = "__vtu_chunk_reload__";

function isChunkLoadError(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    /Loading chunk \d+ failed/.test(message)
  );
}

function tryReload() {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
      // Déjà tenté, on ne reboucle pas.
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage indisponible (mode privé) : on tente quand même.
  }
  window.location.reload();
}

export function ChunkReloadGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Si la page s'est chargée correctement, on reset le flag après 5s
    // (signale qu'on a bien remonté un build cohérent).
    const resetTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* noop */
      }
    }, 5000);

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.message)) {
        event.preventDefault();
        tryReload();
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason && typeof reason === "object" && "message" in reason
            ? String((reason as { message: unknown }).message)
            : "";
      if (isChunkLoadError(message)) {
        event.preventDefault();
        tryReload();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

export { isChunkLoadError };
