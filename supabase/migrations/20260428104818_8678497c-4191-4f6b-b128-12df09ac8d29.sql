-- Fix 1 : ajouter insert_entries_count + actions_card_count à llm_extractions
ALTER TABLE public.llm_extractions
  ADD COLUMN IF NOT EXISTS insert_entries_count integer NOT NULL DEFAULT 0;

-- Fix 2 : étendre le check constraint messages_kind_check pour autoriser
-- les nouveaux kinds 'actions_card' et 'conflict_card' utilisés depuis It. 10.5/11
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_check
  CHECK (kind = ANY (ARRAY[
    'text'::text,
    'audio'::text,
    'photo'::text,
    'document'::text,
    'system_event'::text,
    'actions_card'::text,
    'conflict_card'::text
  ]));