-- Itération 9 : pipeline médias
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS compressed_path TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
  ADD COLUMN IF NOT EXISTS width_px INTEGER,
  ADD COLUMN IF NOT EXISTS height_px INTEGER,
  ADD COLUMN IF NOT EXISTS sha256 TEXT,
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS media_profile TEXT
    CHECK (media_profile IN ('photo','plan','pdf')),
  ADD COLUMN IF NOT EXISTS linked_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_attachments_user_sha256
  ON public.attachments (user_id, sha256) WHERE sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_visit_profile
  ON public.attachments (visit_id, media_profile);

-- Bucket attachments (privé, scoped par user_id en première sous-arbre)
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Storage : path préfixé user_id ({user_id}/{visit_id}/...)
CREATE POLICY "attachments_storage_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "attachments_storage_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "attachments_storage_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "attachments_storage_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);