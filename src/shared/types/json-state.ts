/**
 * VTU — JSON State racine (Phase 2 v2)
 *
 * Orchestrateur : réexpose Field, sections, custom-field, et assemble
 * le `VisitJsonStateSchema` racine en `schema_version: 2`.
 *
 * Doctrine (KNOWLEDGE §2 + §13) :
 *  - Versionné : chaque mutation = nouvelle ligne version+1 dans
 *    visit_json_state. Pas de mutation sur place.
 *  - schema_version = 2 (Phase 2). La migration v1→v2 est faite par
 *    `migrateVisitJsonState` (json-state.migrate.ts).
 */

import { z } from "zod";
import {
  emptyField,
  initField,
  type Field,
  type FieldConfidence,
  FieldConfidenceSchema,
  type FieldSource,
  FieldSourceSchema,
  fieldSchema,
} from "./json-state.field";
import {
  AttachmentsLogSchema,
  BuildingSchema,
  CustomObservationsSchema,
  EcsSchema,
  EnergyProductionSchema,
  EnvelopeSchema,
  HeatingSchema,
  IndustrielProcessesSchema,
  makeEmptyAttachmentsLog,
  makeEmptyBuilding,
  makeEmptyCustomObservations,
  makeEmptyEcs,
  makeEmptyEnergyProduction,
  makeEmptyEnvelope,
  makeEmptyHeating,
  makeEmptyIndustrielProcesses,
  makeEmptyMeta,
  makeEmptyNotes,
  makeEmptyPathologies,
  makeEmptyPreconisations,
  makeEmptyTertiaireHorsCvc,
  makeEmptyVentilation,
  MetaSchemaV2,
  NotesSchema,
  PathologiesSchema,
  PreconisationsSchema,
  TertiaireHorsCvcSchema,
  VentilationSchema,
} from "./json-state.sections";

// ---------------------------------------------------------------------------
// Re-exports (compat call sites Phase 1)
// ---------------------------------------------------------------------------

export {
  Field,
  FieldConfidence,
  FieldConfidenceSchema,
  FieldSource,
  FieldSourceSchema,
  fieldSchema,
  emptyField,
  initField,
};

export type VisitMeta = z.infer<typeof MetaSchemaV2>;
export const VisitMetaSchema = MetaSchemaV2;

// ---------------------------------------------------------------------------
// Racine du JSON state v2
// ---------------------------------------------------------------------------

export const VisitJsonStateSchema = z.object({
  schema_version: z.literal(2),
  meta: MetaSchemaV2,
  building: BuildingSchema.default(makeEmptyBuilding()),
  envelope: EnvelopeSchema.default(makeEmptyEnvelope()),
  heating: HeatingSchema.default(makeEmptyHeating()),
  ecs: EcsSchema.default(makeEmptyEcs()),
  ventilation: VentilationSchema.default(makeEmptyVentilation()),
  energy_production: EnergyProductionSchema.default(makeEmptyEnergyProduction()),
  industriel_processes: IndustrielProcessesSchema.default(
    makeEmptyIndustrielProcesses(),
  ),
  tertiaire_hors_cvc: TertiaireHorsCvcSchema.default(
    makeEmptyTertiaireHorsCvc(),
  ),
  pathologies: PathologiesSchema.default(makeEmptyPathologies()),
  preconisations: PreconisationsSchema.default(makeEmptyPreconisations()),
  notes: NotesSchema.default(makeEmptyNotes()),
  custom_observations: CustomObservationsSchema.default(
    makeEmptyCustomObservations(),
  ),
  // Doctrine "JSON = Cerveau" — voir AttachmentsLogSchema pour le rationale.
  // .default() => rétrocompat automatique des states v2 sans cette section.
  attachments_log: AttachmentsLogSchema.default(makeEmptyAttachmentsLog()),
});
export type VisitJsonState = z.infer<typeof VisitJsonStateSchema>;

// ---------------------------------------------------------------------------
// Factory — squelette initial à la création d'une VT
// ---------------------------------------------------------------------------

const BUILDING_TYPE_TO_TYPOLOGY: Record<string, string | null> = {
  maison_individuelle: "maison",
  appartement: "appartement",
  copropriete: "copropriete",
  monopropriete: "monopropriete",
  industrie: "industrie",
  immeuble: null, // legacy → needs_reclassification
  tertiaire: "tertiaire",
  autre: "autre",
};

interface CreateInitialVisitJsonStateInput {
  visitId: string;
  clientId: string;
  title: string;
  thermicienId: string;
  thermicienName?: string | null;
  /** Itération 4 — pré-rempli depuis la modal de création. */
  address?: string | null;
  /**
   * Phase 1 building_type (du dialog). Mappé en interne vers building_typology.
   * Si "immeuble" → typology null + needs_reclassification = true.
   * Accepte aussi les nouvelles valeurs étendues (copropriete, monopropriete, industrie).
   */
  buildingType?: string | null;
}

/**
 * Crée le JSON state initial v2 d'une nouvelle visite.
 * meta.* connus pré-remplis ; toutes les autres sections via makeEmpty*().
 */
export function createInitialVisitJsonState(
  input: CreateInitialVisitJsonStateInput,
): VisitJsonState {
  const meta = makeEmptyMeta();
  meta.visit_id = initField(input.visitId);
  meta.client_id = initField(input.clientId);
  meta.title = initField(input.title);
  meta.thermicien_id = initField(input.thermicienId);
  if (input.thermicienName) {
    meta.thermicien_name = initField(input.thermicienName);
  }
  if (input.address) {
    meta.address = initField(input.address);
  }

  let needsReclassification = false;
  if (input.buildingType) {
    const mapped = BUILDING_TYPE_TO_TYPOLOGY[input.buildingType];
    if (mapped === null) {
      needsReclassification = true;
    } else if (mapped !== undefined) {
      meta.building_typology = initField(mapped);
    }
  } else {
    needsReclassification = true;
  }
  // calculation_method laissée vide → reclassification requise
  needsReclassification = true;
  meta.needs_reclassification = needsReclassification;

  meta.external_source = initField<"manual" | "import">("manual");

  return {
    schema_version: 2,
    meta,
    building: makeEmptyBuilding(),
    envelope: makeEmptyEnvelope(),
    heating: makeEmptyHeating(),
    ecs: makeEmptyEcs(),
    ventilation: makeEmptyVentilation(),
    energy_production: makeEmptyEnergyProduction(),
    industriel_processes: makeEmptyIndustrielProcesses(),
    tertiaire_hors_cvc: makeEmptyTertiaireHorsCvc(),
    pathologies: makeEmptyPathologies(),
    preconisations: makeEmptyPreconisations(),
    notes: makeEmptyNotes(),
    custom_observations: makeEmptyCustomObservations(),
    attachments_log: makeEmptyAttachmentsLog(),
  };
}
