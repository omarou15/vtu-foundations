/**
 * VTU — Migration JSON state Phase 1 (v1) → Phase 2 (v2)
 *
 * Stratégie (Approche C, validée Omar) :
 *  - Hydrate les sections manquantes via `makeEmpty*()`
 *  - Mappe `meta.building_type` v1 → `meta.building_typology` v2
 *  - Bump explicite `schema_version: 1 → 2`
 *  - Idempotent : si raw.schema_version === 2, parse direct (no-op logique)
 *
 * Mapping building_type → building_typology (Q1 Omar) :
 *   maison_individuelle → "maison"
 *   appartement         → "appartement"
 *   immeuble            → null + needs_reclassification: true
 *   tertiaire           → "tertiaire"
 *   autre               → "autre"
 *
 * Q2 : external_source v1 → "manual" (init/high), reference_id et imported_at
 *      restent emptyField.
 * Q3 : calculation_method reste null (init/null) → flag needs_reclassification.
 * Q4 : toutes les nouvelles collections initialisées à [].
 */

import {
  emptyField,
  initField,
  type Field,
} from "./json-state.field";
import {
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
} from "./json-state.sections";
import {
  type VisitJsonState,
  VisitJsonStateSchema,
} from "./json-state";

const BUILDING_TYPE_MAP: Record<string, string | null> = {
  maison_individuelle: "maison",
  appartement: "appartement",
  immeuble: null, // → needs_reclassification = true
  tertiaire: "tertiaire",
  autre: "autre",
};

export function isAlreadyMigrated(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === "object" &&
    (raw as { schema_version?: unknown }).schema_version === 2
  );
}

/**
 * Migre un raw v1 vers v2. Idempotent.
 * Throw si schema_version inconnue (ni 1 ni 2).
 */
export function migrateVisitJsonState(raw: unknown): VisitJsonState {
  if (isAlreadyMigrated(raw)) {
    // Déjà v2 : on parse direct pour garantir la conformité au schéma actuel
    // (les `.default()` sur sections absentes seront comblés).
    return VisitJsonStateSchema.parse(raw);
  }

  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as { schema_version?: unknown }).schema_version !== 1
  ) {
    throw new Error(
      `[migrateVisitJsonState] schema_version inconnue : ${
        (raw as { schema_version?: unknown })?.schema_version ?? "absent"
      }. Attendu 1 ou 2.`,
    );
  }

  const v1 = raw as {
    schema_version: 1;
    meta: Record<string, unknown>;
    envelope?: unknown;
    heating?: unknown;
    hot_water?: unknown;
    ventilation?: unknown;
    notes?: unknown;
  };

  // ---------- META ----------
  const v1meta = v1.meta as Record<string, Field<unknown> | undefined>;
  const meta = makeEmptyMeta();

  // Préserve les champs v1 existants (visit_id, client_id, title, address, etc.)
  function copyField<T>(
    target: Field<T>,
    src: Field<unknown> | undefined,
  ): Field<T> {
    return src ? (src as unknown as Field<T>) : target;
  }
  meta.visit_id = copyField(meta.visit_id, v1meta.visit_id);
  meta.client_id = copyField(meta.client_id, v1meta.client_id);
  meta.title = copyField(meta.title, v1meta.title);
  meta.address = copyField(meta.address, v1meta.address);
  meta.visit_date = copyField(meta.visit_date, v1meta.visit_date);
  meta.thermicien_id = copyField(meta.thermicien_id, v1meta.thermicien_id);
  meta.thermicien_name = copyField(meta.thermicien_name, v1meta.thermicien_name);
  meta.client_name = copyField(meta.client_name, v1meta.client_name);
  meta.client_phone = copyField(meta.client_phone, v1meta.client_phone);
  meta.client_email = copyField(meta.client_email, v1meta.client_email);

  // Mapping building_type → building_typology
  let needsReclassification = false;
  const v1bt = v1meta.building_type as Field<string> | undefined;
  if (v1bt && typeof v1bt.value === "string") {
    const mapped = BUILDING_TYPE_MAP[v1bt.value];
    if (mapped === null) {
      // immeuble → null + flag
      meta.building_typology = emptyField<string>();
      needsReclassification = true;
    } else if (mapped !== undefined) {
      meta.building_typology = initField<string>(mapped);
    } else {
      // Valeur v1 inconnue (improbable) : reste vide + flag.
      meta.building_typology = emptyField<string>();
      needsReclassification = true;
    }
  } else {
    meta.building_typology = emptyField<string>();
    needsReclassification = true;
  }

  // calculation_method : null par défaut (Q3) → flag
  meta.calculation_method = emptyField<string>();
  needsReclassification = true;

  // external_source = "manual" (Q2)
  meta.external_source = initField<"manual" | "import">("manual");
  // reference_id et imported_at restent emptyField (déjà fait par makeEmptyMeta)

  meta.needs_reclassification = needsReclassification;

  // ---------- Le reste : sections vides, collections [] (Q4) ----------
  const migrated: VisitJsonState = {
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
  };

  // Validation finale : garantit l'intégrité du résultat.
  return VisitJsonStateSchema.parse(migrated);
}
