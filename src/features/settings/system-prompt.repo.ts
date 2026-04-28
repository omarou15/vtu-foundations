/**
 * VTU — Repo prompt système éditable.
 *
 * CRUD côté client (RLS-protected) sur la table `llm_system_prompts`.
 * Deux catégories de prompts indépendantes (un seul actif par kind / user) :
 *  - `unified` : prompt du chat (edge function `vtu-llm-agent`)
 *  - `describe_media` : prompt d'analyse d'une photo / d'un plan
 *    (server function `describeMedia` côté Worker)
 *
 * Chaque pipeline retombe sur sa constante par défaut si aucun prompt
 * actif n'existe en DB pour l'utilisateur.
 */

import { supabase } from "@/integrations/supabase/client";

export type SystemPromptKind = "unified" | "describe_media";

export interface SystemPromptRow {
  id: string;
  user_id: string;
  kind: SystemPromptKind;
  content: string;
  is_active: boolean;
  label: string | null;
  created_at: string;
}

export const SYSTEM_PROMPT_MIN_LENGTH = 100;
export const SYSTEM_PROMPT_MAX_LENGTH = 50_000;

/**
 * Récupère le prompt actif courant de l'utilisateur connecté pour un `kind`
 * donné. Renvoie `null` si aucun prompt n'est sauvegardé (la pipeline
 * correspondante utilisera alors sa constante par défaut).
 */
export async function getActiveSystemPrompt(
  kind: SystemPromptKind = "unified",
): Promise<SystemPromptRow | null> {
  const { data, error } = await supabase
    .from("llm_system_prompts")
    .select("*")
    .eq("kind", kind)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`getActiveSystemPrompt failed: ${error.message}`);
  return (data as SystemPromptRow | null) ?? null;
}

/**
 * Liste l'historique des prompts pour un `kind` donné, plus récents en tête.
 */
export async function listSystemPrompts(
  kind: SystemPromptKind = "unified",
): Promise<SystemPromptRow[]> {
  const { data, error } = await supabase
    .from("llm_system_prompts")
    .select("*")
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`listSystemPrompts failed: ${error.message}`);
  return (data as SystemPromptRow[] | null) ?? [];
}

/**
 * Crée une nouvelle version du prompt et la marque active.
 * Le trigger DB désactive automatiquement les autres versions actives
 * du même `kind` pour cet utilisateur.
 */
export async function saveSystemPrompt(
  content: string,
  label: string | null,
  kind: SystemPromptKind = "unified",
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
      kind,
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
