import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

/**
 * Page d'accueil temporaire — sera remplacée en Itération 2
 * par un redirect /login ou /visits selon l'état d'auth.
 *
 * Sert à valider visuellement les fondations de l'Itération 1 :
 * - Inter chargée
 * - Tokens couleur (orange #FF6B35) appliqués
 * - Layout mobile-first (safe areas, viewport-fit cover)
 */
function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background safe-x">
      <header className="safe-top border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-md items-center justify-center px-4 py-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--vtu-primary)" }}
              aria-hidden="true"
            >
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              VTU
            </span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Fondations en place
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Itération 1 — Stack, design tokens, structure et manifest installable
            sont opérationnels. Les itérations suivantes (auth, sidebar VTs, chat,
            sync offline-first) viennent se greffer sur cette base.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-2">
            <ChecklistItem label="Inter" />
            <ChecklistItem label="Tokens" />
            <ChecklistItem label="Manifest" />
            <ChecklistItem label="Safe area" />
            <ChecklistItem label="Vitest" />
            <ChecklistItem label="Cloud" />
          </div>
        </div>
      </main>

      <footer className="safe-bottom border-t border-border bg-card">
        <div className="mx-auto w-full max-w-md px-4 py-3 text-center text-xs text-muted-foreground">
          Phase 1 — Prompt 1 / N
        </div>
      </footer>
    </div>
  );
}

function ChecklistItem({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/50 px-2 py-2 text-xs font-medium text-secondary-foreground">
      ✓ {label}
    </div>
  );
}
