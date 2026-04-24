import { createFileRoute } from "@tanstack/react-router";
import { VisitsSidebar } from "@/features/visits";

/**
 * Home authentifié — Itération 4.
 *
 * Mobile (<md) : la sidebar prend 100% de l'écran (= écran 1 maquette).
 * Desktop (md+) : sidebar à gauche fixe + zone vide d'invitation à droite.
 *
 * À la sélection d'une VT, on navigue vers /visits/$visitId.
 */
export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-dvh flex-row bg-background safe-x">
      {/* Mobile : la sidebar IS l'écran */}
      <div className="flex w-full md:w-[360px] md:border-r md:border-border">
        <VisitsSidebar />
      </div>

      {/* Desktop : zone droite vide pour inviter à choisir une VT */}
      <main className="hidden flex-1 items-center justify-center md:flex">
        <div className="max-w-md text-center">
          <h2 className="font-heading text-xl font-semibold text-foreground">
            Sélectionnez une visite
          </h2>
          <p className="font-body mt-2 text-sm text-muted-foreground">
            Choisissez une visite dans la liste, ou créez-en une nouvelle pour
            commencer.
          </p>
        </div>
      </main>
    </div>
  );
}
