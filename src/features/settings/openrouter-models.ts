/**
 * Catalogue curé des modèles OpenRouter recommandés pour l'extraction
 * structurée VTU. Liste volontairement courte — l'utilisateur peut taper
 * un model_id custom s'il veut autre chose.
 *
 * Format attendu par OpenRouter : "<provider>/<model>".
 */

export interface OpenRouterModel {
  id: string;
  label: string;
  description: string;
}

export const OPENROUTER_MODELS: readonly OpenRouterModel[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    description:
      "Excellent en extraction structurée, équilibré coût/qualité. Recommandé.",
  },
  {
    id: "anthropic/claude-opus-4.1",
    label: "Claude Opus 4.1",
    description: "Meilleur Claude pour raisonnement complexe. Plus cher.",
  },
  {
    id: "openai/gpt-5",
    label: "GPT-5",
    description: "Modèle phare OpenAI, très précis sur tool calls.",
  },
  {
    id: "openai/gpt-5.2",
    label: "GPT-5.2",
    description: "Dernière itération OpenAI avec raisonnement étendu.",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Long contexte, multimodal, bon sur extraction.",
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek V3",
    description: "Très bon rapport qualité/prix, open weights.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    description: "Open source, bon généraliste, peu coûteux.",
  },
] as const;

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";
