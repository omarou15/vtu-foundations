import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SettingsSidebar } from "@/features/settings";

/**
 * Layout du panneau Paramètres (It. 11.7).
 *
 * Mobile (<md) : sidebar PRENDS l'écran ; quand l'utilisateur navigue vers une
 * section, l'Outlet remplace la sidebar (pattern stack).
 * Desktop (md+) : sidebar 280px gauche + contenu droit (Outlet) flex-1.
 *
 * Note : pour avoir le pattern "stack" mobile, on rend la sidebar uniquement
 * sur md+. Sur mobile, le contenu de chaque sous-route se rend en plein écran
 * et possède son propre header avec retour vers /settings/ai.
 */
export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="flex h-dvh flex-row bg-background safe-x">
      {/* Mobile : sidebar visible si on est sur l'index (redirige vers /ai) — sinon on cache. */}
      <div className="hidden md:flex">
        <SettingsSidebar />
      </div>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
