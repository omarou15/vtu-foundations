import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/shared/db";
import { VisitSummaryView } from "@/features/visits/components/VisitSummaryView";

/**
 * Itération 12 — Vue Synthèse (lecture humaine de la VT).
 *
 * Route plate (pas de layout chat partagé) : page autonome plein écran
 * avec son propre header et un bouton retour vers le chat de la VT.
 *
 * SSR off : on dépend du store Zustand d'auth + Dexie côté client.
 */
export const Route = createFileRoute("/_authenticated/visits/$visitId/summary")({
  component: VisitSummaryRoute,
  ssr: false,
});

function VisitSummaryRoute() {
  const { visitId } = Route.useParams();
  const navigate = useNavigate();

  const visit = useLiveQuery(() => getDb().visits.get(visitId), [visitId]);

  if (visit === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Visite introuvable
        </h1>
        <p className="font-body mt-2 text-sm text-muted-foreground">
          Cette visite n'existe pas (ou plus) sur cet appareil.
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="font-ui mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  return <VisitSummaryView visitId={visit.id} visitTitle={visit.title} />;
}
