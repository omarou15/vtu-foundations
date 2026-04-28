ALTER TABLE public.attachments REPLICA IDENTITY FULL;
ALTER TABLE public.attachment_ai_descriptions REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attachment_ai_descriptions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;