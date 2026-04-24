/**
 * VTU — Sections du JSON state (Phase 2 It. 7)
 *
 * Schémas Zod par section, tous avec `.default(makeEmpty*())` au niveau
 * section pour la rétrocompat (un raw Phase 1 sans la section parse OK).
 *
 * RÈGLE *_other (UI-only, pas Zod) :
 *   Si {parent}.value === "autre", alors {parent}_other.value DOIT être
 *   non-null. Validation côté UI uniquement (pour ne pas bloquer le pull
 *   cross-device de VTs en cours d'édition). L'Edge Function
 *   update-json-state (It. 10) DOIT respecter cette règle côté serveur.
 *
 * RÈGLE bornes physiques (KNOWLEDGE §12) :
 *   Bornes uniquement contre les hallucinations IA. Jamais contre un
 *   bâtiment français réel (tour 60 niveaux, campus 150k m², chaufferie MW).
 */

import { z } from "zod";
import { CustomFieldSchema } from "./json-state.custom-field";
import {
  emptyField,
  type Field,
  fieldSchema,
} from "./json-state.field";
import {
  EFFICIENCY_PCT_BOUND,
  makeYearBound,
  NON_NEGATIVE_INT,
  POSITIVE_NUMBER,
} from "./json-state.bounds";

// ---------------------------------------------------------------------------
// Helpers communs
// ---------------------------------------------------------------------------

const customFieldsArray = z.array(CustomFieldSchema).default([]);

// ---------------------------------------------------------------------------
// META — bloc identité de la VT
// ---------------------------------------------------------------------------

/**
 * `meta.building_typology` est la SOURCE DE VÉRITÉ pour la typologie.
 * Tout champ sectionnel décrivant le bâti (`building.*`) raffine cette
 * info physique mais ne la remplace pas.
 */
export const MetaSchemaV2 = z.object({
  visit_id: fieldSchema(z.string().uuid()),
  client_id: fieldSchema(z.string()),
  title: fieldSchema(z.string()),
  address: fieldSchema(z.string()),
  visit_date: fieldSchema(z.string()),
  thermicien_id: fieldSchema(z.string().uuid()),
  thermicien_name: fieldSchema(z.string()),
  client_name: fieldSchema(z.string()),
  client_phone: fieldSchema(z.string()),
  client_email: fieldSchema(z.string()),

  // CONVENTION : si building_typology.value === "autre",
  // alors building_typology_other.value DOIT être non-null. Validation UI-only.
  building_typology: fieldSchema(z.string()), // libre, validé UI vs nomenclature
  building_typology_other: fieldSchema(z.string()),

  // CONVENTION : si calculation_method.value === "autre",
  // alors calculation_method_other.value DOIT être non-null. Validation UI-only.
  calculation_method: fieldSchema(z.string()),
  calculation_method_other: fieldSchema(z.string()),

  external_source: fieldSchema(z.enum(["manual", "import"])),
  reference_id: fieldSchema(z.string()),
  imported_at: fieldSchema(z.string()),

  /**
   * Drapeau (boolean nu, PAS Field) : true si une VT issue d'une migration
   * Phase 1 → Phase 2 a un building_typology ou calculation_method à null.
   * L'UI It. 11 affichera un dialog de reclassification à la réouverture.
   */
  needs_reclassification: z.boolean().default(false),
});
export type VisitMetaV2 = z.infer<typeof MetaSchemaV2>;

export function makeEmptyMeta(): VisitMetaV2 {
  return {
    visit_id: emptyField<string>(),
    client_id: emptyField<string>(),
    title: emptyField<string>(),
    address: emptyField<string>(),
    visit_date: emptyField<string>(),
    thermicien_id: emptyField<string>(),
    thermicien_name: emptyField<string>(),
    client_name: emptyField<string>(),
    client_phone: emptyField<string>(),
    client_email: emptyField<string>(),
    building_typology: emptyField<string>(),
    building_typology_other: emptyField<string>(),
    calculation_method: emptyField<string>(),
    calculation_method_other: emptyField<string>(),
    external_source: emptyField<"manual" | "import">(),
    reference_id: emptyField<string>(),
    imported_at: emptyField<string>(),
    needs_reclassification: false,
  };
}

// ---------------------------------------------------------------------------
// BUILDING — description physique du bâti
// ---------------------------------------------------------------------------

/**
 * `meta.building_typology` est la source de vérité pour la classification
 * (maison/appartement/copropriete/tertiaire/...). Ici, on décrit le BÂTI
 * physique : année, surfaces, niveaux, matériaux. Les deux se complètent.
 */
export const BuildingSchema = z.object({
  // Année > -500 = monuments antiques OK. RUNTIME : maxYear = currentYear + 2.
  construction_year: fieldSchema(makeYearBound(-500)),
  surface_habitable_m2: fieldSchema(POSITIVE_NUMBER),
  surface_terrain_m2: fieldSchema(POSITIVE_NUMBER),
  nb_niveaux: fieldSchema(NON_NEGATIVE_INT),
  nb_logements: fieldSchema(NON_NEGATIVE_INT),
  // CONVENTION : si wall_material_value === "autre", wall_material_other obligatoire (UI).
  wall_material_value: fieldSchema(z.string()),
  wall_material_other: fieldSchema(z.string()),
  custom_fields: customFieldsArray,
});
export type BuildingSection = z.infer<typeof BuildingSchema>;

export function makeEmptyBuilding(): BuildingSection {
  return {
    construction_year: emptyField<number>(),
    surface_habitable_m2: emptyField<number>(),
    surface_terrain_m2: emptyField<number>(),
    nb_niveaux: emptyField<number>(),
    nb_logements: emptyField<number>(),
    wall_material_value: emptyField<string>(),
    wall_material_other: emptyField<string>(),
    custom_fields: [],
  };
}

// ---------------------------------------------------------------------------
// ENVELOPE — enveloppe thermique du bâti
// ---------------------------------------------------------------------------

const envelopePartSchema = z.object({
  // CONVENTION *_other (UI-only) sur tous les *_value ci-dessous.
  material_value: fieldSchema(z.string()),
  material_other: fieldSchema(z.string()),
  insulation_value: fieldSchema(z.string()),
  insulation_other: fieldSchema(z.string()),
  insulation_thickness_cm: fieldSchema(POSITIVE_NUMBER),
  custom_fields: customFieldsArray,
});

function makeEmptyEnvelopePart(): z.infer<typeof envelopePartSchema> {
  return {
    material_value: emptyField<string>(),
    material_other: emptyField<string>(),
    insulation_value: emptyField<string>(),
    insulation_other: emptyField<string>(),
    insulation_thickness_cm: emptyField<number>(),
    custom_fields: [],
  };
}

export const EnvelopeSchema = z.object({
  murs: envelopePartSchema.default(makeEmptyEnvelopePart()),
  toiture: envelopePartSchema.default(makeEmptyEnvelopePart()),
  plancher_bas: envelopePartSchema.default(makeEmptyEnvelopePart()),
  ouvertures: envelopePartSchema.default(makeEmptyEnvelopePart()),
  custom_fields: customFieldsArray,
});
export type EnvelopeSection = z.infer<typeof EnvelopeSchema>;

export function makeEmptyEnvelope(): EnvelopeSection {
  return {
    murs: makeEmptyEnvelopePart(),
    toiture: makeEmptyEnvelopePart(),
    plancher_bas: makeEmptyEnvelopePart(),
    ouvertures: makeEmptyEnvelopePart(),
    custom_fields: [],
  };
}

// ---------------------------------------------------------------------------
// HEATING — installations de chauffage
// ---------------------------------------------------------------------------

export const HeatingInstallationSchema = z.object({
  id: z.string().uuid(),
  // CONVENTION *_other (UI-only) sur type_value et fuel_value.
  type_value: fieldSchema(z.string()),
  type_other: fieldSchema(z.string()),
  fuel_value: fieldSchema(z.string()),
  fuel_other: fieldSchema(z.string()),
  power_kw: fieldSchema(POSITIVE_NUMBER),
  installation_year: fieldSchema(makeYearBound(1800)),
  efficiency_pct: fieldSchema(EFFICIENCY_PCT_BOUND),
  custom_fields: customFieldsArray,
});
export type HeatingInstallation = z.infer<typeof HeatingInstallationSchema>;

export const HeatingSchema = z.object({
  installations: z.array(HeatingInstallationSchema).default([]),
  custom_fields: customFieldsArray,
});
export type HeatingSection = z.infer<typeof HeatingSchema>;

export function makeEmptyHeating(): HeatingSection {
  return { installations: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// ECS — eau chaude sanitaire
// ---------------------------------------------------------------------------

export const EcsInstallationSchema = z.object({
  id: z.string().uuid(),
  type_value: fieldSchema(z.string()),
  type_other: fieldSchema(z.string()),
  fuel_value: fieldSchema(z.string()),
  fuel_other: fieldSchema(z.string()),
  capacity_l: fieldSchema(POSITIVE_NUMBER), // ballons tertiaires 200-500 m³ → en litres : pas de borne max
  installation_year: fieldSchema(makeYearBound(1800)),
  custom_fields: customFieldsArray,
});
export type EcsInstallation = z.infer<typeof EcsInstallationSchema>;

export const EcsSchema = z.object({
  installations: z.array(EcsInstallationSchema).default([]),
  custom_fields: customFieldsArray,
});
export type EcsSection = z.infer<typeof EcsSchema>;

export function makeEmptyEcs(): EcsSection {
  return { installations: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// VENTILATION
// ---------------------------------------------------------------------------

export const VentilationInstallationSchema = z.object({
  id: z.string().uuid(),
  type_value: fieldSchema(z.string()),
  type_other: fieldSchema(z.string()),
  installation_year: fieldSchema(makeYearBound(1800)),
  flow_rate_m3_h: fieldSchema(POSITIVE_NUMBER),
  custom_fields: customFieldsArray,
});

export const VentilationSchema = z.object({
  installations: z.array(VentilationInstallationSchema).default([]),
  custom_fields: customFieldsArray,
});
export type VentilationSection = z.infer<typeof VentilationSchema>;

export function makeEmptyVentilation(): VentilationSection {
  return { installations: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// ENERGY PRODUCTION (PV, solaire thermique, etc.)
// ---------------------------------------------------------------------------

export const EnergyProductionItemSchema = z.object({
  id: z.string().uuid(),
  type_value: fieldSchema(z.string()),
  type_other: fieldSchema(z.string()),
  power_kw: fieldSchema(POSITIVE_NUMBER),
  installation_year: fieldSchema(makeYearBound(1800)),
  custom_fields: customFieldsArray,
});

export const EnergyProductionSchema = z.object({
  installations: z.array(EnergyProductionItemSchema).default([]),
  custom_fields: customFieldsArray,
});
export type EnergyProductionSection = z.infer<typeof EnergyProductionSchema>;

export function makeEmptyEnergyProduction(): EnergyProductionSection {
  return { installations: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// INDUSTRIEL PROCESSES (procédés industriels)
// ---------------------------------------------------------------------------

export const IndustrielProcessItemSchema = z.object({
  id: z.string().uuid(),
  process_value: fieldSchema(z.string()),
  process_other: fieldSchema(z.string()),
  power_kw: fieldSchema(POSITIVE_NUMBER),
  custom_fields: customFieldsArray,
});

export const IndustrielProcessesSchema = z.object({
  installations: z.array(IndustrielProcessItemSchema).default([]),
  custom_fields: customFieldsArray,
});
export type IndustrielProcessesSection = z.infer<
  typeof IndustrielProcessesSchema
>;

export function makeEmptyIndustrielProcesses(): IndustrielProcessesSection {
  return { installations: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// TERTIAIRE HORS CVC (éclairage, bureautique, etc.)
// ---------------------------------------------------------------------------

export const TertiaireHorsCvcItemSchema = z.object({
  id: z.string().uuid(),
  category_value: fieldSchema(z.string()),
  category_other: fieldSchema(z.string()),
  power_kw: fieldSchema(POSITIVE_NUMBER),
  custom_fields: customFieldsArray,
});

export const TertiaireHorsCvcSchema = z.object({
  installations: z.array(TertiaireHorsCvcItemSchema).default([]),
  custom_fields: customFieldsArray,
});
export type TertiaireHorsCvcSection = z.infer<typeof TertiaireHorsCvcSchema>;

export function makeEmptyTertiaireHorsCvc(): TertiaireHorsCvcSection {
  return { installations: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// PATHOLOGIES — désordres constatés
// ---------------------------------------------------------------------------

export const PathologyEntrySchema = z.object({
  id: z.string().uuid(),
  category_value: fieldSchema(z.string()),
  category_other: fieldSchema(z.string()),
  description: fieldSchema(z.string()),
  severity_value: fieldSchema(z.string()),
  severity_other: fieldSchema(z.string()),
  custom_fields: customFieldsArray,
});

export const PathologiesSchema = z.object({
  items: z.array(PathologyEntrySchema).default([]),
  custom_fields: customFieldsArray,
});
export type PathologiesSection = z.infer<typeof PathologiesSchema>;

export function makeEmptyPathologies(): PathologiesSection {
  return { items: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// PRECONISATIONS — préconisations issues de la visite
// ---------------------------------------------------------------------------

export const PreconisationEntrySchema = z.object({
  id: z.string().uuid(),
  category_value: fieldSchema(z.string()),
  category_other: fieldSchema(z.string()),
  description: fieldSchema(z.string()),
  priority_value: fieldSchema(z.string()),
  priority_other: fieldSchema(z.string()),
  estimated_cost_eur: fieldSchema(POSITIVE_NUMBER),
  custom_fields: customFieldsArray,
});

export const PreconisationsSchema = z.object({
  items: z.array(PreconisationEntrySchema).default([]),
  custom_fields: customFieldsArray,
});
export type PreconisationsSection = z.infer<typeof PreconisationsSchema>;

export function makeEmptyPreconisations(): PreconisationsSection {
  return { items: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// NOTES — notes libres prises pendant la VT
// ---------------------------------------------------------------------------

export const NoteEntrySchema = z.object({
  id: z.string().uuid(),
  content: fieldSchema(z.string()),
  created_at: z.string(),
  related_message_id: z.string().uuid().nullable(),
});
export type NoteEntry = z.infer<typeof NoteEntrySchema>;

export const NotesSchema = z.object({
  items: z.array(NoteEntrySchema).default([]),
  custom_fields: customFieldsArray,
});
export type NotesSection = z.infer<typeof NotesSchema>;

export function makeEmptyNotes(): NotesSection {
  return { items: [], custom_fields: [] };
}

// ---------------------------------------------------------------------------
// CUSTOM OBSERVATIONS — observations libres orphelines de section
// ---------------------------------------------------------------------------

export const CustomObservationEntrySchema = z.object({
  id: z.string().uuid(),
  topic: fieldSchema(z.string()),
  content: fieldSchema(z.string()),
  created_at: z.string(),
  related_message_id: z.string().uuid().nullable(),
  custom_fields: customFieldsArray,
});

export const CustomObservationsSchema = z.object({
  items: z.array(CustomObservationEntrySchema).default([]),
  custom_fields: customFieldsArray,
});
export type CustomObservationsSection = z.infer<
  typeof CustomObservationsSchema
>;

export function makeEmptyCustomObservations(): CustomObservationsSection {
  return { items: [], custom_fields: [] };
}

// Re-export helper pour les modules consommateurs.
export type { Field };
