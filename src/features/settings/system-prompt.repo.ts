/**
 * VTU — Repo prompt système éditable.
 *
 * CRUD côté client (RLS-protected) sur la table `llm_system_prompts`.
 * Le prompt actif est lu côté edge function `vtu-llm-agent` à chaque appel.
 * Si aucun prompt actif n'existe pour l'utilisateur, l'edge function retombe
 * sur la constante par défaut (`SYSTEM_UNIFIED` Energyco).
 */

import { supabase } from "@/integrations/supabase/client";

export interface SystemPromptRow {
  id: string;
  user_id: string;
  content: string;
  is_active: boolean;
  label: string | null;
  created_at: string;
}

export const SYSTEM_PROMPT_MIN_LENGTH = 100;
export const SYSTEM_PROMPT_MAX_LENGTH = 50_000;

/**
 * Récupère le prompt actif courant de l'utilisateur connecté.
 * Renvoie `null` si aucun prompt n'est sauvegardé (l'edge function utilisera
 * alors la constante par défaut).
 */
export async function getActiveSystemPrompt(): Promise<SystemPromptRow | null> {
  const { data, error } = await supabase
    .from("llm_system_prompts")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`getActiveSystemPrompt failed: ${error.message}`);
  return (data as SystemPromptRow | null) ?? null;
}

/**
 * Liste l'historique complet des prompts de l'utilisateur, plus récents en tête.
 */
export async function listSystemPrompts(): Promise<SystemPromptRow[]> {
  const { data, error } = await supabase
    .from("llm_system_prompts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`listSystemPrompts failed: ${error.message}`);
  return (data as SystemPromptRow[] | null) ?? [];
}

/**
 * Crée une nouvelle version du prompt et la marque active.
 * Le trigger DB désactive automatiquement les autres versions actives.
 */
export async function saveSystemPrompt(
  content: string,
  label?: string | null,
): Promise<SystemPromptRow> {
  const trimmed = content.trim();
  if (trimmed.length < SYSTEM_PROMPT_MIN_LENGTH) {
    throw new Error(
      `Prompt trop court (min ${SYSTEM_PROMPT_MIN_LENGTH} caractères).`,
    );
  }
  if (trimmed.length > SYSTEM_PROMPT_MAX_LENGTH) {
    throw new Error(
      `Prompt trop long (max ${SYSTEM_PROMPT_MAX_LENGTH} caractères).`,
    );
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error("Utilisateur non authentifié.");
  }

  const { data, error } = await supabase
    .from("llm_system_prompts")
    .insert({
      user_id: userData.user.id,
      content: trimmed,
      is_active: true,
      label: label && label.trim().length > 0 ? label.trim() : null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`saveSystemPrompt failed: ${error.message}`);
  return data as SystemPromptRow;
}

/**
 * Active une version existante de l'historique.
 */
export async function activateSystemPrompt(id: string): Promise<void> {
  const { error } = await supabase
    .from("llm_system_prompts")
    .update({ is_active: true })
    .eq("id", id);
  if (error) throw new Error(`activateSystemPrompt failed: ${error.message}`);
}
