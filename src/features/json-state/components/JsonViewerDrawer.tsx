/**
 * VTU — JsonViewerDrawer.
 *
 * Depuis l'It. 13, ce composant est un wrapper de compatibilité autour
 * de `JsonStatePanel` (le contenu réel a été extrait pour être réutilisé
 * dans `UnifiedVisitDrawer`). Il enveloppe le panel dans un Sheet
 * indépendant — utilisé uniquement par les tests d'intégration legacy.
 *
 * En production, l'interface utilisateur passe par `UnifiedVisitDrawer`.
 */

import { X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { JsonStatePanel } from "./JsonStatePanel";

interface JsonViewerDrawerProps {
  visitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "tree" | "todo";
}

export function JsonViewerDrawer({
  visitId,
  open,
  onOpenChange,
  initialMode = "tree",
}: JsonViewerDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideCloseButton
        className="safe-top safe-bottom safe-x flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border p-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="font-heading text-base">
                État JSON
              </SheetTitle>
              <SheetDescription className="font-body text-xs text-muted-foreground">
                Source de vérité — versionné, append-only.
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fermer le panneau JSON"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </SheetHeader>
        <JsonStatePanel visitId={visitId} initialMode={initialMode} />
      </SheetContent>
    </Sheet>
  );
}
