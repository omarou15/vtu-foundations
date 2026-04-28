import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Palette } from "lucide-react";
import { ComingSoonPanel } from "@/features/visits/components/ComingSoonPanel";

export const Route = createFileRoute("/_authenticated/settings/appearance")({
  component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background md:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <Link to="/" className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent" aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-heading text-base font-semibold tracking-tight">Apparence</h1>
        </div>
      </header>
      <div className="flex-1">
        <ComingSoonPanel
          Icon={Palette}
          title="Apparence"
          description="Thème clair / sombre, taille du texte, densité de l'interface."
          bullets={["Mode sombre", "Taille du texte ajustable", "Densité compacte / confortable"]}
        />
      </div>
    </div>
  );
}
