import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { supabase } from "@/integrations/supabase/client";

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
  ssr: false,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const status = useAuth((s) => s.status);
  const signInWithMagicLink = useAuth((s) => s.signInWithMagicLink);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si déjà authentifié, on redirige immédiatement.
  useEffect(() => {
    if (status === "authenticated") {
      navigate({ to: search.redirect ?? "/", replace: true });
    }
  }, [status, search.redirect, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signInWithMagicLink(email.trim(), search.redirect);
    setSubmitting(false);
    if (error) {
      setError(error);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background safe-x">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--vtu-primary)" }}
              aria-hidden="true"
            >
              <span className="text-lg font-bold text-white">V</span>
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              Connexion VTU
            </h1>
            <p className="font-body mt-2 text-sm text-muted-foreground">
              Recevez un lien magique par email pour vous connecter.
            </p>
          </div>

          {sent ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <p className="font-ui text-sm font-medium text-foreground">
                Email envoyé ✉️
              </p>
              <p className="font-body mt-2 text-sm text-muted-foreground">
                Cliquez sur le lien reçu à <strong>{email}</strong> pour vous
                connecter. Vous pouvez fermer cet onglet.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="font-ui mt-4 text-xs font-medium text-primary underline"
              >
                Utiliser une autre adresse
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="font-ui block text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="font-ui mt-1 block w-full rounded-md border border-input bg-background px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="thermicien@energyco.fr"
                  disabled={submitting}
                />
              </div>

              {error && (
                <p className="font-ui text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="font-ui inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ minHeight: 44 }}
              >
                {submitting ? "Envoi..." : "Recevoir le lien magique"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
