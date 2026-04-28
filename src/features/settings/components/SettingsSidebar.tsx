/**
 * Sidebar du panneau Paramètres (It. 11.7).
 *
 * Mobile : pleine largeur, header avec bouton retour vers la home.
 * Desktop : colonne fixe 280px à gauche du contenu.
 *
 * La nav utilise <Link to="..."> TanStack — chaque section a sa propre route
 * (settings.{section}.tsx).
 */

import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Brain,
  Database,
  Info,
  MessageSquareText,
  Palette,
  User,
  type LucideIcon,
} from "lucide-react";

export interface SettingsSection {
  id: string;
  /** Path absolu de la route (ex: "/settings/ai"). */
  path: string;
  label: string;
  Icon: LucideIcon;
  /** Si vrai, la section est juste scaffoldée (placeholder). */
  comingSoon: boolean;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "account",
    path: "/settings/account",
    label: "Compte",
    Icon: User,
    comingSoon: true,
  },
  {
    id: "ai",
    path: "/settings/ai",
    label: "IA & Modèles",
    Icon: Brain,
    comingSoon: false,
  },
  {
    id: "prompts",
    path: "/settings/prompts",
    label: "Prompts",
    Icon: MessageSquareText,
    comingSoon: true,
  },
  {
    id: "data",
    path: "/settings/data",
    label: "Données & Sync",
    Icon: Database,
    comingSoon: true,
  },
  {
    id: "appearance",
    path: "/settings/appearance",
    label: "Apparence",
    Icon: Palette,
    comingSoon: true,
  },
  {
    id: "about",
    path: "/settings/about",
    label: "À propos",
    Icon: Info,
    comingSoon: true,
  },
] as const;

interface SettingsSidebarProps {
  onNavigate?: () => void;
}

export function SettingsSidebar({ onNavigate }: SettingsSidebarProps) {
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <aside
      className="flex h-dvh w-full flex-col border-r border-border bg-sidebar text-sidebar-foreground md:w-[280px]"
      aria-label="Navigation Paramètres"
    >
      {/* Header */}
      <header className="safe-top safe-x border-b border-sidebar-border">
        <div className="flex h-14 items-center gap-2 px-3">
          <Link
            to="/"
            className="touch-target inline-flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Retour à la liste des visites"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-heading text-base font-semibold tracking-tight">
            Paramètres
          </h1>
        </div>
      </header>

      {/* Sections */}
      <nav className="safe-x flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {SETTINGS_SECTIONS.map((section) => {
            const isActive = currentPath === section.path;
            return (
              <li key={section.id}>
                <Link
                  to={section.path}
                  onClick={onNavigate}
                  className={[
                    "font-ui group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                    "min-h-11", // touch target
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  ].join(" ")}
                >
                  <section.Icon
                    className={[
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    ].join(" ")}
                  />
                  <span className="flex-1 text-left">{section.label}</span>
                  {section.comingSoon ? (
                    <span className="font-ui rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Bientôt
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
