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

/**
 * Mode de routage IA manuel — remplace le router automatique.
 *
 * - "conv" : message texte → handleConversational (réponse texte, aucune
 *   modification du JSON state).
 * - "json" : message texte → handleExtract (peut proposer patches /
 *   insert_entries / custom_fields validables via PendingActionsCard).
 *
 * Les médias (photo/audio/document) ignorent ce mode : ils suivent
 * toujours la Phase 1 (describeMedia + extract). Cf. doctrine §15.
 */
export type AiRouteMode = "conv" | "json";

/** Défaut intentionnel = "json" (comportement extract historique). */
export const DEFAULT_AI_ROUTE_MODE: AiRouteMode = "json";

interface ChatState {
  /** Kill-switch global IA — gouverne TOUTES les visites. Défaut: true. */
  aiGlobalEnabled: boolean;
  /** Tier de modèle IA sélectionné dans Paramètres. */
  selectedModel: ModelTier;
  /** Map visit_id → IA activée/désactivée pour cette visite. Défaut: false. */
  aiEnabled: Record<string, boolean>;
  /** Map visit_id → mode de routage IA manuel ("conv"|"json"). */
  aiRouteMode: Record<string, AiRouteMode>;
  /**
   * IA effective pour cette visite = global ON ET visite ON.
   * Si le kill-switch global est OFF, toutes les visites sont OFF.
   */
  isAiEnabled: (visitId: string) => boolean;
  /** Mode courant pour la visite (défaut DEFAULT_AI_ROUTE_MODE). */
  getRouteMode: (visitId: string) => AiRouteMode;
  setAiGlobalEnabled: (enabled: boolean) => void;
  setSelectedModel: (tier: ModelTier) => void;
  setAiEnabled: (visitId: string, enabled: boolean) => void;
  toggleAi: (visitId: string) => void;
  setRouteMode: (visitId: string, mode: AiRouteMode) => void;
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
