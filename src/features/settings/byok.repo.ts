/**
 * Repository BYOK (Bring Your Own Key) — gestion de la clé OpenRouter
 * utilisateur dans la table public.user_llm_keys.
 *
 * Sécurité :
 *  - RLS impose user_id = auth.uid() sur toutes les opérations.
 *  - La clé n'est JAMAIS relue côté client après écriture (on ne renvoie
 *    que has_key, enabled, model_id).
 *  - L'edge function vtu-llm-agent fait son propre lookup côté serveur
 *    pour récupérer la clé en clair quand le toggle est ON.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ByokState {
  has_key: boolean;
  enabled: boolean;
  model_id: string | null;
}

const PROVIDER = "openrouter" as const;

export async function getByokState(): Promise<ByokState> {
  const { data, error } = await supabase
    .from("user_llm_keys")
    .select("encrypted_key, enabled, model_id")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { has_key: false, enabled: false, model_id: null };
  return {
    has_key: typeof data.encrypted_key === "string" && data.encrypted_key.length > 0,
    enabled: !!data.enabled,
    model_id: data.model_id ?? null,
  };
}

export interface SaveByokInput {
  apiKey: string;
  modelId: string;
  enabled: boolean;
}

export async function saveByokKey(input: SaveByokInput): Promise<void> {
  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const trimmed = input.apiKey.trim();
  if (trimmed.length < 20) {
    throw new Error("Clé OpenRouter trop courte — vérifie qu'elle commence par 'sk-or-v1-'.");
  }

  const { error } = await supabase
    .from("user_llm_keys")
    .upsert(
      {
        user_id: userId,
        provider: PROVIDER,
        encrypted_key: trimmed,
        model_id: input.modelId,
        enabled: input.enabled,
      },
      { onConflict: "user_id,provider" },
    );
  if (error) throw error;
}

export async function updateByokToggle(input: {
  enabled: boolean;
  modelId?: string;
}): Promise<void> {
  const patch: Record<string, unknown> = { enabled: input.enabled };
  if (input.modelId) patch.model_id = input.modelId;
  const { error } = await supabase
    .from("user_llm_keys")
    .update(patch)
    .eq("provider", PROVIDER);
  if (error) throw error;
}

export async function deleteByokKey(): Promise<void> {
  const { error } = await supabase
    .from("user_llm_keys")
    .delete()
    .eq("provider", PROVIDER);
  if (error) throw error;
}
