CREATE TABLE public.user_llm_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openrouter')),
  encrypted_key text NOT NULL,
  model_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.user_llm_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_llm_keys_select_own" ON public.user_llm_keys
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "user_llm_keys_insert_own" ON public.user_llm_keys
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_llm_keys_update_own" ON public.user_llm_keys
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_llm_keys_delete_own" ON public.user_llm_keys
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER user_llm_keys_touch_updated_at
  BEFORE UPDATE ON public.user_llm_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();