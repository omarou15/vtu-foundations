-- Itération 6.5 — Activer Realtime sur messages + visit_json_state
-- (pas visits/attachments : pull 30s suffit pour la sidebar)

-- REPLICA IDENTITY FULL pour avoir les anciennes valeurs dans les payloads
-- (utile pour les UPDATE/DELETE futurs ; en append-only c'est inerte mais propre)
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.visit_json_state REPLICA IDENTITY FULL;

-- Ajout à la publication realtime, idempotent
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_json_state;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;