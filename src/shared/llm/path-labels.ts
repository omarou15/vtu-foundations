/**
 * VTU — Mapping JSON path → libellé humain (FR).
 *
 * It. 10.5 — Utilisé par PendingActionsCard pour afficher des libellés
 * lisibles (ex: "Type de chauffage") plutôt que des paths techniques
 * (ex: "heating.fuel_value").
 *
 * Volontairement plat & pragmatique : un fichier de constantes, pas de
 * registre dynamique. Pour les paths inconnus, fallback humanisation
 * via `humanizePath`.
 */

const SECTION_LABELS: Record<string, string> = {
  meta: "Identité de la visite",
  building: "Bâtiment",
  envelope: "Enveloppe",
  walls: "Murs",
  roof: "Toiture",
  windows: "Menuiseries",
  floor: "Plancher bas",
  heating: "Chauffage",
  hot_water: "Eau chaude sanitaire",
  ventilation: "Ventilation",
  cooling: "Climatisation",
  process: "Procédés",
  appliances: "Équipements",
  lighting: "Éclairage",
  observations: "Observations",
  recommendations: "Recommandations",
  notes: "Notes",
};

// Map sur la dernière "key" du path. Couvre les patterns fréquents.
const FIELD_LABELS: Record<string, string> = {
  // Meta
  title: "Titre",
  address: "Adresse",
  visit_date: "Date de visite",
  client_name: "Nom du client",
  client_phone: "Téléphone du client",
  client_email: "Email du client",
  thermicien_name: "Thermicien",
  building_typology: "Typologie du bâtiment",
  building_typology_other: "Typologie (précision)",
  calculation_method: "Méthode de calcul",
  // Bâti
  construction_year: "Année de construction",
  surface_habitable_m2: "Surface habitable (m²)",
  surface_terrain_m2: "Surface terrain (m²)",
  nb_niveaux: "Nombre de niveaux",
  nb_logements: "Nombre de logements",
  wall_material_value: "Matériau des murs",
  wall_material_other: "Matériau (précision)",
  material_value: "Matériau",
  material_other: "Matériau (précision)",
  insulation_value: "Type d'isolation",
  insulation_other: "Isolation (précision)",
  insulation_thickness_cm: "Épaisseur d'isolation (cm)",
  // Équipements
  type_value: "Type",
  type_other: "Type (précision)",
  fuel_value: "Énergie / combustible",
  fuel_other: "Énergie (précision)",
  power_kw: "Puissance (kW)",
  capacity_l: "Capacité (L)",
  installation_year: "Année d'installation",
  efficiency_pct: "Rendement (%)",
  flow_rate_m3_h: "Débit (m³/h)",
  process_value: "Procédé",
  category_value: "Catégorie",
  category_other: "Catégorie (précision)",
  severity_value: "Gravité",
  priority_value: "Priorité",
  estimated_cost_eur: "Coût estimé (€)",
  description: "Description",
  content: "Contenu",
  topic: "Sujet",
};

/**
 * Retourne un libellé humain pour un path JSON state.
 * Ex: "heating.fuel_value" → "Chauffage · Énergie / combustible"
 */
export function labelForPath(path: string): string {
  const segments = path.split(".");
  if (segments.length < 2) return humanizePath(path);
  const sectionKey = segments[0]!;
  const leafKey = segments[segments.length - 1]!;

  const section = SECTION_LABELS[sectionKey] ?? humanizeSegment(sectionKey);
  const field = FIELD_LABELS[leafKey] ?? humanizeSegment(leafKey);

  // Path à 3+ segments (ex: appliances.items.0.power_kw) : on insère
  // un séparateur pour rester lisible.
  if (segments.length > 2) {
    return `${section} · ${field}`;
  }
  return `${section} · ${field}`;
}

/** Libellé court d'une section uniquement (ex: "Chauffage"). */
export function labelForSection(sectionPath: string): string {
  const head = sectionPath.split(".")[0]!;
  return SECTION_LABELS[head] ?? humanizeSegment(head);
}

/**
 * Format pour affichage d'une valeur de patch (avec unité si on la connaît).
 * Best-effort : on ne corrige pas le typage IA.
 */
export function formatPatchValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------

function humanizeSegment(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizePath(path: string): string {
  return path.split(".").map(humanizeSegment).join(" · ");
}
