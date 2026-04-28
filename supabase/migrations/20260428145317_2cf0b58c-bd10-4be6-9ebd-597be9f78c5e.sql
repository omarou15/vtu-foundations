-- 1. Ajout colonne kind avec backfill implicite via DEFAULT
ALTER TABLE public.llm_system_prompts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'unified';

-- 2. Contrainte CHECK sur les valeurs autorisées
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'llm_system_prompts_kind_check'
  ) THEN
    ALTER TABLE public.llm_system_prompts
      ADD CONSTRAINT llm_system_prompts_kind_check
      CHECK (kind IN ('unified', 'describe_media'));
  END IF;
END $$;

-- 3. Index pour lookups (user_id, kind, is_active)
CREATE INDEX IF NOT EXISTS idx_llm_system_prompts_user_kind_active
  ON public.llm_system_prompts (user_id, kind, is_active);

-- 4. Réécriture du trigger d'unicité : scope par (user_id, kind)
CREATE OR REPLACE FUNCTION public.llm_system_prompts_enforce_single_active()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.llm_system_prompts
       SET is_active = false
     WHERE user_id = NEW.user_id
       AND kind = NEW.kind
       AND id <> NEW.id
       AND is_active = true;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. Trigger attaché si pas déjà présent
DROP TRIGGER IF EXISTS trg_llm_system_prompts_single_active ON public.llm_system_prompts;
CREATE TRIGGER trg_llm_system_prompts_single_active
  BEFORE INSERT OR UPDATE ON public.llm_system_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.llm_system_prompts_enforce_single_active();