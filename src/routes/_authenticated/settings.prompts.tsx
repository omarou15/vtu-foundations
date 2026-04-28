import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { ComingSoonPanel } from "@/features/visits/components/ComingSoonPanel";

export const Route = createFileRoute("/_authenticated/settings/prompts")({
  component: PromptsSettingsPage,
});

function PromptsSettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background md:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <Link to="/" className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent" aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-heading text-base font-semibold tracking-tight">Prompts</h1>
        </div>
      </header>
      <div className="flex-1">
        <ComingSoonPanel
          Icon={MessageSquareText}
          title="Prompts personnalisés"
          description="Personnalisez les instructions données à l'IA pour chaque type de mission."
          bullets={["Prompts par type de mission (DPE, DTG, audit)", "Instructions personnalisées par utilisateur", "Bibliothèque de prompts partagés"]}
        />
      </div>
    </div>
  );
}
