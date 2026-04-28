-- Itération 12 — Métadonnées de visite étendues
-- - élargit les sets enum de mission_type et building_type
-- - ajoute les champs libres _other (mission, building, tertiaire subtype)
-- - ajoute le sous-type tertiaire
-- - ajoute timestamp visit_started_at + coordonnées GPS
-- Idempotent : safe à rejouer.

-- 1) Nouvelles colonnes -----------------------------------------------------
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS mission_type_other TEXT,
  ADD COLUMN IF NOT EXISTS building_type_other TEXT,
  ADD COLUMN IF NOT EXISTS tertiaire_subtype TEXT,
  ADD COLUMN IF NOT EXISTS tertiaire_subtype_other TEXT,
  ADD COLUMN IF NOT EXISTS visit_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_accuracy_m DOUBLE PRECISION;

-- 2) Backfill visit_started_at pour les visites existantes ------------------
UPDATE public.visits
   SET visit_started_at = created_at
 WHERE visit_started_at IS NULL;

-- 3) Recréation des CHECK constraints avec les nouveaux sets ----------------
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_mission_type_check;
ALTER TABLE public.visits
  ADD CONSTRAINT visits_mission_type_check
  CHECK (mission_type IS NULL OR mission_type IN (
    'audit_energetique',
    'dpe',
    'ppt',
    'dtg',
    'note_dimensionnement',
    'conseil',         -- conservé pour rétrocompat des données existantes
    'autre'
  ));

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_building_type_check;
ALTER TABLE public.visits
  ADD CONSTRAINT visits_building_type_check
  CHECK (building_type IS NULL OR building_type IN (
    'maison_individuelle',
    'appartement',
    'copropriete',
    'monopropriete',
    'industrie',
    'tertiaire',
    'immeuble',        -- conservé pour rétrocompat des données existantes
    'autre'
  ));

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_tertiaire_subtype_check;
ALTER TABLE public.visits
  ADD CONSTRAINT visits_tertiaire_subtype_check
  CHECK (tertiaire_subtype IS NULL OR tertiaire_subtype IN (
    'bureau',
    'hotellerie',
    'sante',
    'enseignement',
    'commerce',
    'restauration',
    'autre'
  ));

-- 4) Cohérence : tertiaire_subtype non-null seulement si building_type='tertiaire'
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_tertiaire_subtype_consistency;
ALTER TABLE public.visits
  ADD CONSTRAINT visits_tertiaire_subtype_consistency
  CHECK (
    tertiaire_subtype IS NULL
    OR building_type = 'tertiaire'
  );
