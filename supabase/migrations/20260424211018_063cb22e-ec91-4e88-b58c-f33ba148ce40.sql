-- Itération 4 (002) — Métadonnées de visite : address, mission_type, building_type
-- Idempotent : safe à rejouer.

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS mission_type TEXT,
  ADD COLUMN IF NOT EXISTS building_type TEXT;

-- Contraintes de domaine (validation triggers-friendly : on utilise CHECK
-- sur des sets statiques, donc immuable, pas de problème).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visits_mission_type_check'
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_mission_type_check
      CHECK (mission_type IS NULL OR mission_type IN (
        'audit_energetique', 'dpe', 'conseil', 'autre'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visits_building_type_check'
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_building_type_check
      CHECK (building_type IS NULL OR building_type IN (
        'maison_individuelle', 'appartement', 'immeuble', 'tertiaire', 'autre'
      ));
  END IF;
END $$;

-- Index utile pour les requêtes futures (filtrage / tri sidebar).
CREATE INDEX IF NOT EXISTS idx_visits_user_updated
  ON public.visits (user_id, updated_at DESC);
