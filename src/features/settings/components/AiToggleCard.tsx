/**
 * Toggle global IA (It. 11.7) — kill-switch côté Paramètres.
 *
 * Si OFF → toutes les visites se comportent comme si IA off (le toggle
 * per-visit est désactivé visuellement avec un tooltip dans le chat).
 */

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

interface AiToggleCardProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function AiToggleCard({ enabled, onChange }: AiToggleCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <Label
              htmlFor="ai-global-toggle"
              className="font-heading text-sm font-semibold text-foreground"
            >
              Activer l'IA
            </Label>
            <p className="font-body mt-0.5 text-xs text-muted-foreground">
              Quand l'IA est désactivée, aucun message n'est envoyé au modèle.
              Les saisies texte et photos restent enregistrées normalement.
            </p>
          </div>
        </div>
        <Switch
          id="ai-global-toggle"
          checked={enabled}
          onCheckedChange={onChange}
          aria-label="Activer ou désactiver l'IA globalement"
        />
      </div>
    </div>
  );
}
