/**
 * Section "IA & Modèles" — Paramètres (It. 11.7).
 *
 * Contient :
 *  - Toggle global IA (kill-switch synchronisé avec le toggle per-visit du chat)
 *  - Sélecteur de modèle (4 tiers : économique / moyen / supérieur / premium)
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useChatStore } from "@/features/chat";
import {
  AiToggleCard,
  ModelPickerGrid,
  getModelByTier,
  type ModelTier,
} from "@/features/settings";
import { SettingsSidebar } from "@/features/settings/components/SettingsSidebar";

export const Route = createFileRoute("/_authenticated/settings/ai")({
  component: AiSettingsPage,
});

function AiSettingsPage() {
  const aiGlobalEnabled = useChatStore((s) => s.aiGlobalEnabled);
  const setAiGlobalEnabled = useChatStore((s) => s.setAiGlobalEnabled);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);

  function handleToggle(value: boolean) {
    setAiGlobalEnabled(value);
    toast.success(
      value ? "IA activée globalement" : "IA désactivée globalement",
      {
        description: value
          ? "Les visites qui ont activé l'IA reprennent leur fonctionnement normal."
          : "Aucun message ne sera envoyé au modèle, même sur les visites avec IA activée.",
      },
    );
  }

  function handleModelSelect(tier: ModelTier) {
    if (tier === selectedModel) return;
    setSelectedModel(tier);
    const model = getModelByTier(tier);
    toast.success(`Modèle changé : ${model.label}`, {
      description: model.modelId,
    });
  }

  return (
    <>
      {/* Mobile-only sidebar shown when this is the entry route */}
      <div className="md:hidden">
        <MobileSettingsSidebarToggle />
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10 safe-bottom">
        {/* Header */}
        <header className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            IA &amp; Modèles
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            Contrôlez l'utilisation de l'IA et choisissez le modèle qui
            convient le mieux à votre usage terrain.
          </p>
        </header>

        {/* Toggle global */}
        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Activation
          </h3>
          <AiToggleCard enabled={aiGlobalEnabled} onChange={handleToggle} />
        </section>

        {/* Sélecteur de modèle */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Modèle
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Le modèle sélectionné est utilisé pour toutes les nouvelles
              extractions et conversations IA.
            </p>
          </div>
          <ModelPickerGrid
            selected={selectedModel}
            disabled={!aiGlobalEnabled}
            onSelect={handleModelSelect}
          />
          <p className="font-body mt-2 text-[11px] text-muted-foreground">
            Tarifs indicatifs Lovable AI (USD pour 1 million de tokens). Le
            recall est une estimation interne sur des saisies terrain
            représentatives — ce n'est pas une garantie.
          </p>
        </section>
      </div>
    </>
  );
}

/** Mobile : header avec retour vers la home + accès au reste des sections. */
function MobileSettingsSidebarToggle() {
  return (
    <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background">
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
      <div className="border-t border-border bg-muted/40">
        {/* Mini-nav horizontale des sections sur mobile */}
        <MobileSectionsNav />
      </div>
    </header>
  );
}

function MobileSectionsNav() {
  // On réutilise SETTINGS_SECTIONS mais en barre horizontale scrollable.
  // Garde la nav accessible sans router complexe sur mobile.
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max">
        <SettingsSidebar />
      </div>
    </div>
  );
}
