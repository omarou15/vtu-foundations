DROP INDEX IF EXISTS public.llm_system_prompts_one_active_per_user;

CREATE UNIQUE INDEX llm_system_prompts_one_active_per_user_kind
  ON public.llm_system_prompts (user_id, kind)
  WHERE (is_active = true);