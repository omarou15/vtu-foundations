/**
 * VTU — Catalogue des modèles IA proposés à l'utilisateur (It. 11.7).
 *
 * 4 tiers (économique / moyen / supérieur / premium). Chaque entrée porte le
 * nom de modèle Lovable AI Gateway, des prix indicatifs $/M tokens, un recall
 * estimé (issu des benchmarks internes — pas un SLA) et une description courte.
 *
 * Le tier sélectionné est persisté dans `useChatStore.selectedModel` et
 * propagé à l'Edge Function `vtu-llm-agent` via le client SDK.
 */

export type ModelTier = "economic" | "standard" | "advanced" | "premium";

export interface ModelCatalogEntry {
  tier: ModelTier;
  /** Label UI court affiché dans la card (FR). */
  label: string;
  /** Identifiant exact transmis au gateway Lovable AI. */
  modelId: string;
  /** Description courte (1–2 phrases) FR. */
  description: string;
  /** Prix indicatif input en USD pour 1M tokens. */
  pricePerMTokensInput: number;
  /** Prix indicatif output en USD pour 1M tokens. */
  pricePerMTokensOutput: number;
  /** Recall estimé (0–1) sur extraction terrain (cf. KNOWLEDGE §dette It.10). */
  estimatedRecall: number;
}

export const MODELS_CATALOG: readonly ModelCatalogEntry[] = [
  {
    tier: "economic",
    label: "Économique",
    modelId: "google/gemini-2.5-flash-lite",
    description:
      "Rapide, peu coûteux. Idéal pour des saisies courtes et claires (un équipement à la fois).",
    pricePerMTokensInput: 0.1,
    pricePerMTokensOutput: 0.4,
    estimatedRecall: 0.5,
  },
  {
    tier: "standard",
    label: "Moyen",
    modelId: "google/gemini-3-flash-preview",
    description:
      "Équilibré. Recommandé pour l'usage terrain quotidien : bon rapport vitesse / qualité.",
    pricePerMTokensInput: 0.3,
    pricePerMTokensOutput: 2.5,
    estimatedRecall: 0.7,
  },
  {
    tier: "advanced",
    label: "Supérieur",
    modelId: "google/gemini-2.5-pro",
    description:
      "Raisonnement profond, longs contextes. Pour les visites complexes (multi-équipements, plans).",
    pricePerMTokensInput: 1.25,
    pricePerMTokensOutput: 10,
    estimatedRecall: 0.85,
  },
  {
    tier: "premium",
    label: "Premium",
    modelId: "openai/gpt-5",
    description:
      "Précision maximale. Pour les rapports critiques où chaque détail compte.",
    pricePerMTokensInput: 2.5,
    pricePerMTokensOutput: 20,
    estimatedRecall: 0.92,
  },
] as const;

/** Tier sélectionné par défaut si rien dans le store. */
export const DEFAULT_MODEL_TIER: ModelTier = "standard";

/** Allowlist des modelId acceptés côté Edge (sécurité). */
export const ALLOWED_MODEL_IDS: readonly string[] = MODELS_CATALOG.map(
  (m) => m.modelId,
);

export function getModelByTier(tier: ModelTier): ModelCatalogEntry {
  const found = MODELS_CATALOG.find((m) => m.tier === tier);
  if (!found) {
    // Fallback safe : ne devrait jamais arriver si store contraint.
    return MODELS_CATALOG.find((m) => m.tier === DEFAULT_MODEL_TIER)!;
  }
  return found;
}

export function getModelIdByTier(tier: ModelTier): string {
  return getModelByTier(tier).modelId;
}
