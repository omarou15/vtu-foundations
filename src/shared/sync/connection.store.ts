/**
 * VTU — Connection store (Itération 6)
 *
 * Détecte si le device est en ligne ET si Supabase répond.
 * Ping HEAD léger toutes les 30 s + écoute online/offline navigateur.
 *
 * Exposé : `isOnline` (combiné), `lastPingAt`, `lastPingOk`.
 */

import { create } from "zustand";

interface ConnectionState {
  /** navigator.onLine && dernier ping Supabase OK. */
  isOnline: boolean;
  /** Dernier état du ping (séparé du flag navigateur). */
  lastPingOk: boolean;
  lastPingAt: string | null;
  setNavigatorOnline: (online: boolean) => void;
  setPingResult: (ok: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  lastPingOk: true,
  lastPingAt: null,
  setNavigatorOnline: (online) => {
    const { lastPingOk } = get();
    set({ isOnline: online && lastPingOk });
  },
  setPingResult: (ok) => {
    const navOnline =
      typeof navigator !== "undefined" ? navigator.onLine : true;
    set({
      lastPingOk: ok,
      lastPingAt: new Date().toISOString(),
      isOnline: navOnline && ok,
    });
  },
}));
