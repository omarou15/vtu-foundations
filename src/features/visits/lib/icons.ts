import { Home, Building, Building2, Briefcase, Box } from "lucide-react";
import type { BuildingType, VisitStatus } from "@/shared/types";
import type { LucideIcon } from "lucide-react";

export const BUILDING_ICON: Record<BuildingType, LucideIcon> = {
  maison_individuelle: Home,
  appartement: Building,
  immeuble: Building2,
  tertiaire: Briefcase,
  autre: Box,
};

export const BUILDING_LABEL: Record<BuildingType, string> = {
  maison_individuelle: "Maison",
  appartement: "Appartement",
  immeuble: "Immeuble",
  tertiaire: "Tertiaire",
  autre: "Autre",
};

export const STATUS_LABEL: Record<VisitStatus, string> = {
  draft: "Brouillon",
  in_progress: "En cours",
  done: "Terminée",
  archived: "Archivée",
};

/**
 * Couleurs des badges de statut — sémantiques (pas hardcodé).
 * On utilise les classes Tailwind mappées sur les variables CSS.
 */
export const STATUS_BADGE_CLASS: Record<VisitStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  in_progress: "bg-primary/15 text-primary",
  done: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};
