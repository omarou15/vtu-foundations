/**
 * VTU — Store de chat per-visit (Zustand).
 *
 * Phase 2.6 : le toggle IA n'est PLUS inerte. Sa valeur est lue par
 * `appendLocalMessage` via `metadata.ai_enabled` pour décider d'enqueue
 * (ou pas) un job `llm_route_and_dispatch`.
 *
 * Persistance localStorage pour que le choix utilisateur survive au refresh
 * par visite. On évite Dexie ici car ce sont des préférences UI pures
 * (pas de domaine métier syncable cross-device).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ChatState {
  /** Map visit_id → IA activée/désactivée. Défaut implicite : false. */
  aiEnabled: Record<string, boolean>;
  isAiEnabled: (visitId: string) => boolean;
  setAiEnabled: (visitId: string, enabled: boolean) => void;
  toggleAi: (visitId: string) => void;
  /** Reset complet — utile pour les tests. */
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      aiEnabled: {},

      isAiEnabled: (visitId) => Boolean(get().aiEnabled[visitId]),

      setAiEnabled: (visitId, enabled) =>
        set((s) => ({ aiEnabled: { ...s.aiEnabled, [visitId]: enabled } })),

      toggleAi: (visitId) =>
        set((s) => ({
          aiEnabled: { ...s.aiEnabled, [visitId]: !s.aiEnabled[visitId] },
        })),

      reset: () => set({ aiEnabled: {} }),
    }),
    {
      name: "vtu-chat-prefs",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as never),
      ),
      partialize: (s) => ({ aiEnabled: s.aiEnabled }),
    },
  ),
);
