/**
 * Section "IA & Modèles" — Paramètres.
 *
 * Deux blocs uniquement :
 *  1. Modèle (sélecteur)
 *  2. Prompts système (éditables) — chat unifié + analyse photo
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useChatStore } from "@/features/chat";
import {
  ByokCard,
  ModelPickerGrid,
  getModelByTier,
  type ModelTier,
} from "@/features/settings";
import { SystemPromptEditor } from "@/features/settings/SystemPromptEditor";

export const Route = createFileRoute("/_authenticated/settings/ai")({
  component: AiSettingsPage,
});

function AiSettingsPage() {
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);

  function handleModelSelect(tier: ModelTier) {
    if (tier === selectedModel) return;
    setSelectedModel(tier);
    const model = getModelByTier(tier);
    toast.success(`Modèle changé : ${model.label}`, {
      description: model.modelId,
    });
  }

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
            Paramètres
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10 safe-bottom">
        <header className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            IA &amp; Modèles
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            Choisissez le modèle utilisé pour toutes les conversations et
            éditez les prompts système qui s'appliquent globalement.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Modèle Lovable AI
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Le modèle sélectionné est utilisé pour toutes les nouvelles
              extractions et conversations IA — sauf si tu actives ta propre
              clé OpenRouter ci-dessous.
            </p>
          </div>
          <ModelPickerGrid
            selected={selectedModel}
            onSelect={handleModelSelect}
          />
          <p className="font-body mt-2 text-[11px] text-muted-foreground">
            Tarifs indicatifs Lovable AI (USD pour 1&nbsp;million de tokens).
            Le recall est une estimation interne sur des saisies terrain
            représentatives — ce n'est pas une garantie.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Bring Your Own Key (OpenRouter)
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Active ta propre clé pour accéder à Claude Sonnet 4.5, GPT-5,
              Opus 4 et 200+ autres modèles. Quand activée, elle remplace le
              modèle Lovable AI pour toutes tes extractions.
            </p>
          </div>
          <ByokCard />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Prompts système (éditables)
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Ces prompts s'appliquent à <strong>toutes les conversations</strong>{" "}
              et à toutes les analyses photo. Les modifications prennent effet
              immédiatement.
            </p>
          </div>
          <SystemPromptEditor />
        </section>
      </div>
    </div>
  );
}
