/**
 * VTU — It. 13 : panneau "Coming soon" générique.
 *
 * Utilisé par tous les onglets non encore implémentés du UnifiedVisitDrawer
 * (Mapbox, Input docs, Output docs, Monday.com, Email).
 */

import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

interface ComingSoonPanelProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  /** Pied de page optionnel : exemples concrets de ce que la feature fera. */
  bullets?: string[];
}

export function ComingSoonPanel({
  Icon,
  title,
  description,
  bullets,
}: ComingSoonPanelProps) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      data-testid="coming-soon-panel"
    >
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
        <span className="absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full bg-background p-0.5">
          <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
        </span>
      </span>
      <div className="flex flex-col items-center gap-1">
        <h3 className="font-heading text-base font-semibold text-foreground">
          {title}
        </h3>
        <span className="font-ui inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming soon
        </span>
      </div>
      <p className="font-body max-w-xs text-sm text-muted-foreground">
        {description}
      </p>
      {bullets && bullets.length > 0 ? (
        <ul className="font-body mt-2 max-w-xs space-y-1 text-left text-xs text-muted-foreground/90">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span
                className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
                aria-hidden="true"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
