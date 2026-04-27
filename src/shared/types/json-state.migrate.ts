/**
 * VTU — Migration JSON state Phase 1 (v1) → Phase 2 (v2)
 *
 * Stratégie (Approche C) :
 *  - Hydrate les sections manquantes via `makeEmpty*()`
 *  - Mappe `meta.building_type` v1 → `meta.building_typology` v2
 *  - Bump explicite `schema_version: 1 → 2`
 *  - Idempotent : si raw.schema_version === 2, parse direct (no-op logique)
 *
 * It. 10 — Back-fill Field<T> validation_status :
 *  - Tous les Field<T> rencontrés (deep walk) reçoivent les nouveaux
 *    champs validation_status/validated_at/validated_by/source_extraction_id/evidence_refs
 *    si absents.
 *  - Source != "ai_infer" → status "validated" + validated_at = updated_at.
 *  - Source == "ai_infer" → status "unvalidated".
 *  - Idempotent : si déjà présents, no-op.
 *
 * Mapping building_type → building_typology :
 *   maison_individuelle → "maison"
 *   appartement         → "appartement"
 *   immeuble            → null + needs_reclassification: true
 *   tertiaire           → "tertiaire"
 *   autre               → "autre"
 */

import {
  backfillFieldIfMissing,
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
  immeuble: null,
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

const FIELD_KEYS = ["value", "source", "confidence", "updated_at"];

function isFieldShape(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return FIELD_KEYS.every((k) => k in obj);
}

/**
 * Back-fille en place les champs It. 10 sur tout Field<T> du tree.
 * Idempotent. Mute l'objet en place pour rester O(1) en mémoire.
 * Exporté pour les tests (field-migration.test.ts).
 */
export function backfillFieldValidation(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) backfillFieldValidation(item);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (isFieldShape(node)) {
    backfillFieldIfMissing(node as Record<string, unknown>);
    return; // ne pas descendre dans .value
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    backfillFieldValidation(v);
  }
}

/**
 * Migre un raw v1 vers v2. Idempotent.
 * Throw si schema_version inconnue (ni 1 ni 2).
 */
export function migrateVisitJsonState(raw: unknown): VisitJsonState {
  if (isAlreadyMigrated(raw)) {
    // Déjà v2 : back-fill It. 10 in-place puis parse.
    backfillFieldValidation(raw);
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
  };

  const v1meta = v1.meta as Record<string, Field<unknown> | undefined>;
  const meta = makeEmptyMeta();

  function copyField<T>(
    target: Field<T>,
    src: Field<unknown> | undefined,
  ): Field<T> {
    if (!src) return target;
    backfillFieldIfMissing(src as unknown as Record<string, unknown>);
    return src as unknown as Field<T>;
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

  let needsReclassification = false;
  const v1bt = v1meta.building_type as Field<string> | undefined;
  if (v1bt && typeof v1bt.value === "string") {
    const mapped = BUILDING_TYPE_MAP[v1bt.value];
    if (mapped === null) {
      meta.building_typology = emptyField<string>();
      needsReclassification = true;
    } else if (mapped !== undefined) {
      meta.building_typology = initField<string>(mapped);
    } else {
      meta.building_typology = emptyField<string>();
      needsReclassification = true;
    }
  } else {
    meta.building_typology = emptyField<string>();
    needsReclassification = true;
  }

  meta.calculation_method = emptyField<string>();
  needsReclassification = true;

  meta.external_source = initField<"manual" | "import">("manual");
  meta.needs_reclassification = needsReclassification;

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

  return VisitJsonStateSchema.parse(migrated);
}
