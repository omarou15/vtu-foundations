/**
 * Section "Dev — Prompts système" — Paramètres.
 *
 * Cette page contient désormais uniquement l'éditeur des prompts système
 * (chat unifié + analyse photo). Toute l'inspection du dernier appel IA et
 * les variables/options modèle ont été déplacées vers `IA & modèles`.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SystemPromptEditor } from "@/features/settings/SystemPromptEditor";

export const Route = createFileRoute("/_authenticated/settings/dev")({
  component: DevPromptsPage,
});

function DevPromptsPage() {
  return (
    <div className="flex flex-col">
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background md:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <Link
            to="/"
            className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent"
            aria-label="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-heading text-base font-semibold tracking-tight">
            Prompts système
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10 safe-bottom">
        <header className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Prompts système (éditables)
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            Éditez les prompts système qui s'appliquent à{" "}
            <strong>toutes les conversations</strong> et à toutes les analyses
            photo. Les modifications prennent effet immédiatement.
          </p>
        </header>

        <SystemPromptEditor />
      </div>
    </div>
  );
}
