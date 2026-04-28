CREATE TABLE public.llm_system_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX llm_system_prompts_one_active_per_user
  ON public.llm_system_prompts (user_id)
  WHERE is_active = true;

CREATE INDEX llm_system_prompts_user_created_idx
  ON public.llm_system_prompts (user_id, created_at DESC);

ALTER TABLE public.llm_system_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llm_system_prompts_select_own"
  ON public.llm_system_prompts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "llm_system_prompts_insert_own"
  ON public.llm_system_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "llm_system_prompts_update_own"
  ON public.llm_system_prompts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger : avant insert/update si is_active = true, désactive les autres
CREATE OR REPLACE FUNCTION public.llm_system_prompts_enforce_single_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.llm_system_prompts
       SET is_active = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER llm_system_prompts_enforce_single_active_trg
  BEFORE INSERT OR UPDATE ON public.llm_system_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.llm_system_prompts_enforce_single_active();