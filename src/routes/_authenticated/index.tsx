import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/features/auth";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

/**
 * Home authentifié — placeholder Phase 1.
 * Sera remplacé par la liste des VT (sidebar) en Itération 4.
 */
function HomePage() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);

  return (
    <div className="flex min-h-screen flex-col bg-background safe-x">
      <header className="safe-top border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--vtu-primary)" }}
              aria-hidden="true"
            >
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
              VTU
            </span>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="font-ui rounded-md border border-input px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
            style={{ minHeight: 44 }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Connecté ✅
          </h1>
          <p className="font-body mt-3 text-sm leading-relaxed text-muted-foreground">
            Bienvenue <strong>{user?.email}</strong>. La sidebar des visites
            techniques arrive en Itération 4.
          </p>
        </div>
      </main>

      <footer className="safe-bottom border-t border-border bg-card">
        <div className="mx-auto w-full max-w-md px-4 py-3 text-center text-xs text-muted-foreground font-ui">
          Itération 2 — Auth OK
        </div>
      </footer>
    </div>
  );
}
