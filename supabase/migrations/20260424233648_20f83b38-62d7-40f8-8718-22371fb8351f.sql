-- =============================================================================
-- Migration 003 — schema_registry (Phase 2 It. 7)
-- Table sociale du vocabulaire métier user-scoped (Phase 4 : org-scoped).
-- section_path TOUJOURS canonisé côté code (collections : ecs[] pas ecs[0]).
-- registry_urn = ancre stable à vie. Voir KNOWLEDGE.md §13.
-- =============================================================================

CREATE TABLE public.schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- Pas de FK vers auth.users (schéma Supabase réservé). RLS isole.
  organization_id UUID NULL,
  -- Phase 4 : multi-tenant. Phase 2 : toujours null.
  registry_urn TEXT NOT NULL,
  -- Pattern : urn:vtu:schema:{canonical_section_path}.{field_key}:v1
  field_key TEXT NOT NULL,
  section_path TEXT NOT NULL,
  label_fr TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string','number','boolean','enum','multi_enum')),
  unit TEXT,
  enum_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  synonyms JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at TIMESTAMPTZ,
  ai_suggested BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  parent_concept TEXT,
  semantic_embedding JSONB,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','active','deprecated','promoted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Deux contraintes user-scoped (sémantiquement équivalentes, lookups différents)
  CONSTRAINT schema_registry_user_urn_key UNIQUE (user_id, registry_urn),
  CONSTRAINT schema_registry_user_section_field_key UNIQUE (user_id, section_path, field_key)
);

CREATE INDEX idx_schema_registry_user_section
  ON public.schema_registry (user_id, section_path);

CREATE INDEX idx_schema_registry_usage
  ON public.schema_registry (usage_count DESC);

CREATE INDEX idx_schema_registry_status
  ON public.schema_registry (status) WHERE status != 'deprecated';

ALTER TABLE public.schema_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schema_registry_select_own"
  ON public.schema_registry
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "schema_registry_insert_own"
  ON public.schema_registry
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "schema_registry_update_own"
  ON public.schema_registry
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger updated_at (réutilise touch_updated_at existant)
CREATE TRIGGER schema_registry_touch_updated_at
  BEFORE UPDATE ON public.schema_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.schema_registry IS
  'Table sociale du vocabulaire métier user-scoped (Phase 4 : org-scoped). '
  'section_path TOUJOURS canonisé (collections : ecs[] pas ecs[0]). '
  'registry_urn = ancre stable à vie. Voir KNOWLEDGE.md §13.';

-- =============================================================================
-- RPC 1 : fuzzy search (SECURITY INVOKER → respecte RLS de l'appelant)
-- Seuil minimal 2 caractères pour éviter de retourner tout le registry.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.find_similar_schema_fields(
  p_user_id UUID,
  p_section_path TEXT,
  p_query TEXT
)
RETURNS SETOF public.schema_registry
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.schema_registry
  WHERE user_id = p_user_id
    AND section_path = p_section_path
    AND LENGTH(p_query) >= 2
    AND (
      label_fr ILIKE '%' || p_query || '%'
      OR field_key ILIKE '%' || p_query || '%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(synonyms) syn
        WHERE syn ILIKE '%' || p_query || '%'
      )
    )
  ORDER BY usage_count DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.find_similar_schema_fields(UUID, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- RPC 2 : increment atomique (anti race-condition)
-- Vérifie auth.uid() = user_id (défense en profondeur en plus de RLS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.increment_registry_usage(
  p_registry_id UUID
)
RETURNS public.schema_registry
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.schema_registry
  SET usage_count = usage_count + 1
  WHERE id = p_registry_id
    AND user_id = auth.uid()
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION public.increment_registry_usage(UUID) TO authenticated;