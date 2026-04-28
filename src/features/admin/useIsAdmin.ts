/**
 * Hook : vérifie si l'utilisateur courant a le rôle admin.
 *
 * Lit `user_roles` pour l'utilisateur courant. La RLS limite cette lecture
 * aux rôles du user connecté, sans RPC SECURITY DEFINER exposée au client.
 *
 * Implé en useState/useEffect (pas TanStack Query) pour éviter de devoir
 * monter un QueryClientProvider global juste pour ce hook.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin(): {
  isAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
} {
  const userId = useAuth((s) => s.user?.id);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(userId));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setIsAdmin(false);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    void (async () => {
      const { data, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (cancelled) return;
      if (roleErr) {
        setError(new Error(roleErr.message));
        setIsAdmin(false);
      } else {
        setIsAdmin(data?.role === "admin");
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAdmin, isLoading, error };
}
