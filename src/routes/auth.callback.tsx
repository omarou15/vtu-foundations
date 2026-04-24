import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth";

interface CallbackSearch {
  redirect?: string;
}

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AuthCallbackPage,
  ssr: false,
});

/**
 * Le SDK Supabase intercepte automatiquement le hash `#access_token=...`
 * (detectSessionInUrl: true par défaut) et déclenche `SIGNED_IN` sur
 * `onAuthStateChange`. Notre store le capte et passe à `authenticated`.
 *
 * Cette page attend simplement que le statut bascule, puis redirige
 * vers la cible (paramètre `redirect`) ou vers `/`.
 */
function AuthCallbackPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const status = useAuth((s) => s.status);
  const [tooLong, setTooLong] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      navigate({ to: search.redirect ?? "/", replace: true });
    } else if (status === "unauthenticated") {
      // Le hash n'a pas produit de session : lien expiré ou invalide.
      const t = setTimeout(() => setTooLong(true), 500);
      return () => clearTimeout(t);
    }
  }, [status, search.redirect, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        {tooLong ? (
          <>
            <h1 className="font-heading text-lg font-semibold text-foreground">
              Lien invalide ou expiré
            </h1>
            <p className="font-body mt-2 text-sm text-muted-foreground">
              Ce lien magique n'a pas fonctionné. Veuillez en demander un nouveau.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/login", replace: true })}
              className="font-ui mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              style={{ minHeight: 44 }}
            >
              Retour à la connexion
            </button>
          </>
        ) : (
          <>
            <div
              className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
              aria-hidden="true"
            />
            <p className="font-ui text-sm text-muted-foreground">Connexion en cours…</p>
          </>
        )}
      </div>
    </div>
  );
}
