-- =========================================================================
-- 1. Bucket check : autoriser 'attachments' (déjà utilisé par It. 9)
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'attachments'
      AND constraint_name = 'attachments_bucket_check'
  ) THEN
    ALTER TABLE public.attachments DROP CONSTRAINT attachments_bucket_check;
  END IF;
END$$;

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_bucket_check
  CHECK (bucket IN ('visit-audio', 'visit-photos', 'attachments'));

-- =========================================================================
-- 2. visit_json_state.source_extraction_id (lien optionnel vers llm_extractions)
-- =========================================================================
ALTER TABLE public.visit_json_state
  ADD COLUMN IF NOT EXISTS source_extraction_id UUID DEFAULT NULL;

-- =========================================================================
-- 3. llm_extractions — table d'audit (append-only)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.llm_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NULL,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  message_id UUID NULL,
  attachment_id UUID NULL,
  mode TEXT NOT NULL CHECK (mode IN
    ('router','describe_media','extract_from_message','conversational_query')),
  provider TEXT NOT NULL DEFAULT 'lovable_gemini',
  model_version TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_input_tokens INTEGER NULL,
  cost_usd NUMERIC(10,6),
  latency_ms INTEGER,
  confidence_overall NUMERIC(3,2),
  context_bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_request_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  stable_prompt_hash TEXT NULL,
  provider_request_id TEXT NULL,
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  patches_count INTEGER NOT NULL DEFAULT 0,
  custom_fields_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN
    ('success','partial','failed','rate_limited','malformed')),
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.llm_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "llm_extractions_select_own" ON public.llm_extractions;
CREATE POLICY "llm_extractions_select_own"
  ON public.llm_extractions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "llm_extractions_insert_own" ON public.llm_extractions;
CREATE POLICY "llm_extractions_insert_own"
  ON public.llm_extractions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_llm_extractions_visit
  ON public.llm_extractions(visit_id);
CREATE INDEX IF NOT EXISTS idx_llm_extractions_user
  ON public.llm_extractions(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_extractions_message
  ON public.llm_extractions(message_id);
CREATE INDEX IF NOT EXISTS idx_llm_extractions_attachment
  ON public.llm_extractions(attachment_id);

-- =========================================================================
-- 4. attachment_ai_descriptions — append-only, 1 row par (user, attachment, mode)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.attachment_ai_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NULL,
  visit_id UUID NOT NULL,
  attachment_id UUID NOT NULL REFERENCES public.attachments(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'describe_media',
  provider TEXT NOT NULL,
  model_version TEXT NOT NULL,
  description JSONB NOT NULL,
  confidence_overall NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT aad_unique_user_attachment_mode UNIQUE (user_id, attachment_id, mode)
);

ALTER TABLE public.attachment_ai_descriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aad_select_own" ON public.attachment_ai_descriptions;
CREATE POLICY "aad_select_own"
  ON public.attachment_ai_descriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "aad_insert_own" ON public.attachment_ai_descriptions;
CREATE POLICY "aad_insert_own"
  ON public.attachment_ai_descriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_aad_attachment
  ON public.attachment_ai_descriptions(attachment_id);
CREATE INDEX IF NOT EXISTS idx_aad_visit
  ON public.attachment_ai_descriptions(visit_id);