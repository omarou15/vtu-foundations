/**
 * VTU — Store de chat per-visit (Zustand).
 *
 * Phase 1 : porte uniquement le toggle "IA active / désactivée" par
 * visit_id. Le toggle est INERTE côté backend (KNOWLEDGE §8) : il sera
 * lu par l'Edge Function `update-json-state` à l'Itération 6+ pour
 * décider de muter (ou non) le JSON state à chaque message.
 *
 * Persistance : volontairement en mémoire seulement pour cette itération.
 * On évite localStorage pour ne pas créer de divergence avec Dexie.
 * Si Omar valide en review, on persistera dans une table Dexie dédiée
 * `visit_settings` à l'Itération 6.
 */

import { create } from "zustand";

interface ChatState {
  /** Map visit_id → IA activée/désactivée. Défaut implicite : false. */
  aiEnabled: Record<string, boolean>;
  isAiEnabled: (visitId: string) => boolean;
  setAiEnabled: (visitId: string, enabled: boolean) => void;
  toggleAi: (visitId: string) => void;
  /** Reset complet — utile pour les tests. */
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  aiEnabled: {},

  isAiEnabled: (visitId) => Boolean(get().aiEnabled[visitId]),

  setAiEnabled: (visitId, enabled) =>
    set((s) => ({ aiEnabled: { ...s.aiEnabled, [visitId]: enabled } })),

  toggleAi: (visitId) =>
    set((s) => ({
      aiEnabled: { ...s.aiEnabled, [visitId]: !s.aiEnabled[visitId] },
    })),

  reset: () => set({ aiEnabled: {} }),
}));
