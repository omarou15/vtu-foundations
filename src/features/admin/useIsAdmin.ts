/**
 * Hook : vérifie si l'utilisateur courant a le rôle admin.
 *
 * Utilise la fonction RPC `has_role(_user_id, _role)` (SECURITY DEFINER)
 * pour bypass la RLS sur user_roles.
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
      const { data, error: rpcErr } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (cancelled) return;
      if (rpcErr) {
        setError(new Error(rpcErr.message));
        setIsAdmin(false);
      } else {
        setIsAdmin(Boolean(data));
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAdmin, isLoading, error };
}
