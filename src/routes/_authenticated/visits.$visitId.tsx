import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Menu } from "lucide-react";
import { getDb, type LocalVisit } from "@/shared/db";
import { VisitsSidebar } from "@/features/visits";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  BUILDING_ICON,
  BUILDING_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/features/visits/lib/icons";

/**
 * Stub Itération 4 — page d'une visite.
 * L'écran chat (composé header VT + zone messages + input bar) sera
 * construit à l'Itération 5. Ici on affiche juste un en-tête contextuel
 * pour permettre le redirect post-création et la navigation depuis la sidebar.
 */
export const Route = createFileRoute("/_authenticated/visits/$visitId")({
  component: VisitPage,
});

function VisitPage() {
  const { visitId } = Route.useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visit = useLiveQuery(
    () => getDb().visits.get(visitId),
    [visitId],
  ) as LocalVisit | undefined;

  if (visit === undefined) {
    // Loading initial Dexie
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
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

  const Icon = visit.building_type ? BUILDING_ICON[visit.building_type] : BUILDING_ICON.autre;
  const buildingLabel = visit.building_type
    ? BUILDING_LABEL[visit.building_type]
    : "Type non précisé";

  return (
    <div className="flex h-dvh flex-row bg-background safe-x">
      {/* Sidebar desktop persistante */}
      <div className="hidden border-r border-border md:flex md:w-[360px]">
        <VisitsSidebar activeVisitId={visit.id} />
      </div>

      {/* Sidebar mobile en drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-[360px] p-0 md:hidden">
          <VisitsSidebar
            activeVisitId={visit.id}
            onClose={() => setSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Contenu principal */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top safe-x border-b border-border bg-card">
          <div className="flex h-14 items-center gap-2 px-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"
              aria-label="Ouvrir la liste des visites"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="touch-target hidden items-center justify-center rounded-md text-foreground hover:bg-accent md:inline-flex"
              aria-label="Retour"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div
              className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary"
              aria-hidden="true"
            >
              <Icon className="h-4 w-4 text-secondary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading truncate text-sm font-semibold text-foreground">
                {visit.title}
              </h1>
              <p className="font-ui truncate text-xs text-muted-foreground">
                {visit.address ?? "Adresse non renseignée"}
              </p>
            </div>
            <span
              className={`font-ui shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[visit.status]}`}
            >
              {STATUS_LABEL[visit.status]}
            </span>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="max-w-md">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Visite prête
            </h2>
            <p className="font-body mt-2 text-sm text-muted-foreground">
              Cette visite est créée localement et en attente de synchronisation.
              L'écran de conversation (chat + JSON viewer) arrive en Itération 5.
            </p>
            <dl className="font-ui mt-6 grid grid-cols-2 gap-3 text-left text-xs">
              <div>
                <dt className="text-muted-foreground">Typologie</dt>
                <dd className="text-foreground">{buildingLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mission</dt>
                <dd className="text-foreground">{visit.mission_type ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">ID local</dt>
                <dd className="truncate font-mono text-foreground">{visit.id}</dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
    </div>
  );
}
