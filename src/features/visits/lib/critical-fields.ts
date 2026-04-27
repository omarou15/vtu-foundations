/**
 * VTU — Itération 12 : Champs "critiques" pour la vue Synthèse.
 *
 * Un champ critique vide doit être visuellement marqué (badge ⚠) dans
 * la vue Synthèse, avec un lien rapide pour aller le compléter au chat.
 *
 * La liste est volontairement courte : on ne flag QUE ce qui empêche
 * un rapport d'être généré ou compris (adresse, typologie, surface
 * habitable, présence d'au moins 1 installation chauffage/ECS pour les
 * typologies résidentielles).
 *
 * Pur, sans I/O.
 */

import type { VisitJsonState } from "@/shared/types";
import type { Field } from "@/shared/types/json-state.field";

export interface CriticalCheck {
  /** Path JSON state (ex: "meta.address" ou pseudo "heating.installations[*]"). */
  path: string;
  /** Libellé court humain. */
  label: string;
  /** True si actuellement vide / manquant. */
  isEmpty: (state: VisitJsonState) => boolean;
}

function isFieldEmpty(f: Field<unknown> | null | undefined): boolean {
  if (!f) return true;
  return f.value === null || f.value === undefined || f.value === "";
}

const META_FIELDS: CriticalCheck[] = [
  {
    path: "meta.address",
    label: "Adresse",
    isEmpty: (s) => isFieldEmpty(s.meta?.address),
  },
  {
    path: "meta.building_typology",
    label: "Typologie du bâtiment",
    isEmpty: (s) => isFieldEmpty(s.meta?.building_typology),
  },
  {
    path: "meta.calculation_method",
    label: "Méthode de calcul",
    isEmpty: (s) => isFieldEmpty(s.meta?.calculation_method),
  },
];

const BUILDING_FIELDS: CriticalCheck[] = [
  {
    path: "building.construction_year",
    label: "Année de construction",
    isEmpty: (s) => isFieldEmpty(s.building?.construction_year),
  },
  {
    path: "building.surface_habitable_m2",
    label: "Surface habitable",
    isEmpty: (s) => isFieldEmpty(s.building?.surface_habitable_m2),
  },
  {
    path: "building.nb_niveaux",
    label: "Nombre de niveaux",
    isEmpty: (s) => isFieldEmpty(s.building?.nb_niveaux),
  },
];

const HEATING_PRESENCE: CriticalCheck = {
  path: "heating.installations",
  label: "Au moins 1 installation de chauffage",
  isEmpty: (s) => (s.heating?.installations?.length ?? 0) === 0,
};

const ECS_PRESENCE: CriticalCheck = {
  path: "ecs.installations",
  label: "Au moins 1 installation ECS",
  isEmpty: (s) => (s.ecs?.installations?.length ?? 0) === 0,
};

/**
 * Liste les checks critiques applicables à la VT, en fonction de la
 * typologie. Pour le tertiaire pur, l'ECS n'est pas critique.
 */
export function listCriticalChecks(state: VisitJsonState): CriticalCheck[] {
  const typology =
    typeof state.meta?.building_typology?.value === "string"
      ? state.meta.building_typology.value
      : null;

  const checks: CriticalCheck[] = [
    ...META_FIELDS,
    ...BUILDING_FIELDS,
    HEATING_PRESENCE,
  ];
  if (typology !== "tertiaire") {
    checks.push(ECS_PRESENCE);
  }
  return checks;
}

/**
 * Retourne la liste des paths critiques actuellement vides.
 */
export function listEmptyCriticalPaths(state: VisitJsonState): string[] {
  return listCriticalChecks(state)
    .filter((c) => c.isEmpty(state))
    .map((c) => c.path);
}

export function countEmptyCriticalFields(state: VisitJsonState): number {
  return listEmptyCriticalPaths(state).length;
}
