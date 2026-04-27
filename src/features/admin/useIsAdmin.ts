/**
 * Hook : vérifie si l'utilisateur courant a le rôle admin.
 *
 * Utilise la fonction RPC `has_role(_user_id, _role)` (SECURITY DEFINER)
 * pour bypass la RLS sur user_roles. Cache 5 min via TanStack Query.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin(): {
  isAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
} {
  const userId = useAuth((s) => s.user?.id);

  const q = useQuery({
    queryKey: ["is-admin", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });

  return {
    isAdmin: q.data === true,
    isLoading: q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}
