import {
  Home,
  Building,
  Building2,
  Briefcase,
  Box,
  Factory,
  Hotel,
  GraduationCap,
  Stethoscope,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import type {
  BuildingType,
  MissionType,
  TertiaireSubtype,
  VisitStatus,
} from "@/shared/types";
import type { LucideIcon } from "lucide-react";

export const BUILDING_ICON: Record<BuildingType, LucideIcon> = {
  maison_individuelle: Home,
  appartement: Building,
  copropriete: Building2,
  monopropriete: Building2,
  industrie: Factory,
  tertiaire: Briefcase,
  immeuble: Building2, // legacy
  autre: Box,
};

export const BUILDING_LABEL: Record<BuildingType, string> = {
  maison_individuelle: "Maison individuelle",
  appartement: "Appartement",
  copropriete: "Copropriété",
  monopropriete: "Monopropriété",
  industrie: "Industrie",
  tertiaire: "Tertiaire",
  immeuble: "Immeuble",
  autre: "Autre",
};

export const MISSION_LABEL: Record<MissionType, string> = {
  audit_energetique: "Audit énergétique",
  dpe: "DPE",
  ppt: "PPT",
  dtg: "DTG",
  note_dimensionnement: "Note de dimensionnement",
  conseil: "Conseil",
  autre: "Autre",
};

export const TERTIAIRE_SUBTYPE_LABEL: Record<TertiaireSubtype, string> = {
  bureau: "Bureau",
  hotellerie: "Hôtellerie",
  sante: "Santé",
  enseignement: "Enseignement",
  commerce: "Commerce",
  restauration: "Restauration",
  autre: "Autres secteurs",
};

export const TERTIAIRE_SUBTYPE_ICON: Record<TertiaireSubtype, LucideIcon> = {
  bureau: Briefcase,
  hotellerie: Hotel,
  sante: Stethoscope,
  enseignement: GraduationCap,
  commerce: ShoppingBag,
  restauration: UtensilsCrossed,
  autre: Box,
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
