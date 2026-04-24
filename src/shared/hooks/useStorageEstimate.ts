/**
 * VTU — Hook + helper pour navigator.storage.estimate()
 *
 * Phase 1 : remonte usage / quota / pourcentage. Si > 80%, on affiche
 * un badge d'alerte + un toast persistant (une seule fois, géré côté UI).
 */

import { useEffect, useState } from "react";

export interface StorageEstimateState {
  supported: boolean;
  usage: number | null;
  quota: number | null;
  /** 0..1 — pourcentage d'utilisation. */
  ratio: number | null;
  /** ratio > 0.8. */
  warning: boolean;
  refresh: () => Promise<void>;
}

const REFRESH_MS = 60_000;

export function useStorageEstimate(): StorageEstimateState {
  const [state, setState] = useState<Omit<StorageEstimateState, "refresh">>({
    supported:
      typeof navigator !== "undefined" &&
      typeof navigator.storage?.estimate === "function",
    usage: null,
    quota: null,
    ratio: null,
    warning: false,
  });

  async function refresh(): Promise<void> {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.storage?.estimate !== "function"
    ) {
      return;
    }
    try {
      const e = await navigator.storage.estimate();
      const usage = e.usage ?? null;
      const quota = e.quota ?? null;
      const ratio =
        usage !== null && quota && quota > 0 ? usage / quota : null;
      setState({
        supported: true,
        usage,
        quota,
        ratio,
        warning: ratio !== null && ratio > 0.8,
      });
    } catch {
      // ignore — pas critique
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return { ...state, refresh };
}
