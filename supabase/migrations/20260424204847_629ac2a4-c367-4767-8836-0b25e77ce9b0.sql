-- =============================================================
-- VTU — Itération 3 : Schéma + RLS + Storage
-- =============================================================
-- Paradigme :
--   - messages : append-only (pas d'UPDATE policy)
--   - visits + visit_json_state : versionnés (optimistic concurrency)
--   - client_id côté client pour idempotence (ON CONFLICT DO NOTHING)
--   - RLS user-scoped sur toutes les tables
-- =============================================================


-- =============================================================
-- 1. TABLES
-- =============================================================

-- ---- visits ----
CREATE TABLE public.visits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT 'Nouvelle visite',
  status       TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'in_progress', 'done', 'archived')),
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visits_user_client_unique UNIQUE (user_id, client_id)
);

CREATE INDEX idx_visits_user_updated     ON public.visits (user_id, updated_at DESC);
CREATE INDEX idx_visits_user_status      ON public.visits (user_id, status);


-- ---- messages (append-only) ----
CREATE TABLE public.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_id     UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL,
  role         TEXT NOT NULL
                CHECK (role IN ('user', 'assistant', 'system')),
  kind         TEXT NOT NULL DEFAULT 'text'
                CHECK (kind IN ('text', 'audio', 'photo', 'system_event')),
  content      TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_user_client_unique UNIQUE (user_id, client_id)
);

CREATE INDEX idx_messages_visit_created  ON public.messages (visit_id, created_at ASC);
CREATE INDEX idx_messages_user_created   ON public.messages (user_id, created_at DESC);


-- ---- attachments (liés aux messages — audio, photos) ----
CREATE TABLE public.attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_id     UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  bucket       TEXT NOT NULL CHECK (bucket IN ('visit-audio', 'visit-photos')),
  storage_path TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_message  ON public.attachments (message_id);
CREATE INDEX idx_attachments_visit    ON public.attachments (visit_id);
CREATE INDEX idx_attachments_user     ON public.attachments (user_id);


-- ---- visit_json_state (versionné, immuable par version) ----
CREATE TABLE public.visit_json_state (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  state        JSONB NOT NULL,
  created_by_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visit_json_state_visit_version_unique UNIQUE (visit_id, version)
);

CREATE INDEX idx_visit_json_state_visit_version ON public.visit_json_state (visit_id, version DESC);


-- =============================================================
-- 2. TRIGGER updated_at sur visits
-- =============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_visits_touch_updated_at
BEFORE UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- =============================================================
-- 3. RLS — Enable
-- =============================================================
ALTER TABLE public.visits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_json_state   ENABLE ROW LEVEL SECURITY;


-- ---- visits : SELECT/INSERT/UPDATE/DELETE user-scoped ----
CREATE POLICY "visits_select_own" ON public.visits
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "visits_insert_own" ON public.visits
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "visits_update_own" ON public.visits
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "visits_delete_own" ON public.visits
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ---- messages : SELECT + INSERT uniquement (append-only) ----
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  );

-- VOLONTAIREMENT pas de UPDATE ni DELETE policy
-- → append-only enforcé au niveau DB (audit trail légal)


-- ---- attachments : via jointure messages ----
CREATE POLICY "attachments_select_own" ON public.attachments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "attachments_insert_own" ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "attachments_delete_own" ON public.attachments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ---- visit_json_state : SELECT + INSERT (pas UPDATE = versioning) ----
CREATE POLICY "visit_json_state_select_own" ON public.visit_json_state
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "visit_json_state_insert_own" ON public.visit_json_state
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  );


-- =============================================================
-- 4. STORAGE — Buckets + Policies (path-based : {user_id}/{visit_id}/*)
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-audio', 'visit-audio', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-photos', 'visit-photos', false)
ON CONFLICT (id) DO NOTHING;


-- ---- visit-audio : user_id = (storage.foldername(name))[1] ----
CREATE POLICY "visit_audio_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'visit-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visit_audio_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visit-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visit_audio_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'visit-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visit_audio_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'visit-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ---- visit-photos : même policy path-based ----
CREATE POLICY "visit_photos_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'visit-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visit_photos_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visit-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visit_photos_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'visit-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visit_photos_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'visit-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
