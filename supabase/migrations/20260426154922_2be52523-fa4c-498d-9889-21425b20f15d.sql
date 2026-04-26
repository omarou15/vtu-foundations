ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_kind_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_check
  CHECK (kind = ANY (ARRAY['text'::text, 'audio'::text, 'photo'::text, 'document'::text, 'system_event'::text]));