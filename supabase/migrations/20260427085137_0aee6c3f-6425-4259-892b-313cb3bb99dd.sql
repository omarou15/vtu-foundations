-- 1. Enum des rôles applicatifs
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 2. Table user_roles (jamais sur profiles → évite escalade)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- 3. RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Lecture : un user voit ses propres rôles
CREATE POLICY "user_roles_select_own"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE : aucun policy → bloqué pour authenticated.
-- Gestion via SQL direct (admin) ou service_role uniquement.

-- 4. Fonction has_role — SECURITY DEFINER pour bypass RLS et éviter récursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

COMMENT ON FUNCTION public.has_role IS
  'Vérifie si un utilisateur a un rôle donné. SECURITY DEFINER pour éviter récursion RLS.';