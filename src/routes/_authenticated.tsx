import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/features/auth";

/**
 * Layout pathless protégé.
 *
 * Le guard est côté composant (pas dans `beforeLoad`) car notre source
 * de vérité d'auth est un store Zustand côté client (Supabase persiste
 * la session dans localStorage). `beforeLoad` côté SSR n'a pas accès à
 * cet état sans cookies dédiés — ce sera revu en It.6 si on bascule
 * sur des server functions authentifiées.
 *
 * En attendant : tant que le store est `loading`, on affiche un splash
 * minimaliste (pas de flash de contenu protégé). Si `unauthenticated`,
 * on redirige vers /login en préservant la route demandée.
 */

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
  ssr: false,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuth((s) => s.status);

  useEffect(() => {
    if (status === "unauthenticated") {
      navigate({
        to: "/login",
        search: { redirect: location.href },
        replace: true,
      });
    }
  }, [status, location.href, navigate]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
          aria-hidden="true"
        />
      </div>
    );
  }

  return <Outlet />;
}
