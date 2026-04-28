-- It. 11.6 — 3 verbes pour les opérations IA :
--   patches[] (set_field) + insert_entries[] (insert_entry) + custom_fields[] (custom_field)
--
-- On ajoute un compteur dénormalisé `insert_entries_count` à `llm_extractions`
-- (audit trail des invocations LLM) pour pouvoir filtrer/agréger côté
-- monitoring sans avoir à parser raw_response JSONB.
--
-- Default 0 pour rétrocompat : les anciennes lignes restent valides sans
-- backfill (la colonne sera juste 0 pour tout ce qui précède It. 11.6).
ALTER TABLE public.llm_extractions
  ADD COLUMN IF NOT EXISTS insert_entries_count INTEGER NOT NULL DEFAULT 0;
