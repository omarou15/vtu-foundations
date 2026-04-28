import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";

import appCss from "../styles.css?url";
import { useAuth, setOnSessionExpired } from "@/features/auth";
import { ChunkReloadGuard } from "@/shared/ui/ChunkReloadGuard";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-7xl font-bold text-foreground">404</h1>
        <h2 className="font-heading mt-4 text-xl font-semibold text-foreground">
          Page introuvable
        </h2>
        <p className="font-body mt-2 text-sm text-muted-foreground">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="font-ui inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        // viewport-fit=cover : essentiel pour env(safe-area-inset-*) iOS
        // Pas de maximum-scale : a11y, on doit laisser l'utilisateur zoomer
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#d97757" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "VTU" },
      { title: "VTU — Visite Technique" },
      {
        name: "description",
        content:
          "Application de visite technique pour thermiciens. Mobile-first, offline-first.",
      },
      { name: "author", content: "Energyco" },
      { property: "og:title", content: "VTU — Visite Technique" },
      {
        property: "og:description",
        content:
          "Application de visite technique pour thermiciens. Mobile-first, offline-first.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", sizes: "192x192", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    const cleanup = init();
    setOnSessionExpired(() => {
      toast.warning("Session expirée", {
        description: "Veuillez vous reconnecter pour continuer.",
      });
    });
    return () => {
      setOnSessionExpired(null);
      cleanup();
    };
  }, [init]);

  return (
    <>
      <ChunkReloadGuard />
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
