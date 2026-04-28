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
import {
  DEFAULT_MODEL_TIER,
  type ModelTier,
} from "@/features/settings/models-catalog";

interface ChatState {
  /** Kill-switch global IA — gouverne TOUTES les visites. Défaut: true. */
  aiGlobalEnabled: boolean;
  /** Tier de modèle IA sélectionné dans Paramètres. */
  selectedModel: ModelTier;
  /** Map visit_id → IA activée/désactivée pour cette visite. Défaut: false. */
  aiEnabled: Record<string, boolean>;
  /**
   * IA effective pour cette visite = global ON ET visite ON.
   * Si le kill-switch global est OFF, toutes les visites sont OFF.
   */
  isAiEnabled: (visitId: string) => boolean;
  setAiGlobalEnabled: (enabled: boolean) => void;
  setSelectedModel: (tier: ModelTier) => void;
  setAiEnabled: (visitId: string, enabled: boolean) => void;
  toggleAi: (visitId: string) => void;
  /** Reset complet — utile pour les tests. */
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      aiGlobalEnabled: true,
      selectedModel: DEFAULT_MODEL_TIER,
      aiEnabled: {},

      isAiEnabled: (visitId) =>
        get().aiGlobalEnabled && Boolean(get().aiEnabled[visitId]),

      setAiGlobalEnabled: (enabled) => set({ aiGlobalEnabled: enabled }),

      setSelectedModel: (tier) => set({ selectedModel: tier }),

      setAiEnabled: (visitId, enabled) =>
        set((s) => ({ aiEnabled: { ...s.aiEnabled, [visitId]: enabled } })),

      toggleAi: (visitId) =>
        set((s) => ({
          aiEnabled: { ...s.aiEnabled, [visitId]: !s.aiEnabled[visitId] },
        })),

      reset: () =>
        set({
          aiGlobalEnabled: true,
          selectedModel: DEFAULT_MODEL_TIER,
          aiEnabled: {},
        }),
    }),
    {
      name: "vtu-chat-prefs",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as never),
      ),
      partialize: (s) => ({
        aiEnabled: s.aiEnabled,
        aiGlobalEnabled: s.aiGlobalEnabled,
        selectedModel: s.selectedModel,
      }),
    },
  ),
);
