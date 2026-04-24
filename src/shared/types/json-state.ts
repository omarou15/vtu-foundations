/**
 * VTU — JSON State Schema
 *
 * Source de vérité de l'état d'une visite technique.
 *
 * Doctrine (cf. KNOWLEDGE.md §2) :
 * - Versionné : chaque mutation = nouvelle ligne version+1 dans
 *   visit_json_state. Pas de mutation sur place.
 * - `Field<T>` enveloppe chaque valeur métier avec sa traçabilité :
 *   d'où elle vient (source), quand, à quel niveau de confiance, et
 *   sur quel message d'origine.
 * - `meta.*` est pré-rempli au squelette dès la création d'une VT
 *   (avec `Field<T>` à `value: null, source: "init"`).
 *
 * Phase 1 : structure prête mais inerte (pas d'IA qui mute encore).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Field<T> — enveloppe traçable d'une valeur métier
// ---------------------------------------------------------------------------

export const FieldSourceSchema = z.enum([
  "init",       // squelette initial (jamais touché)
  "user",       // saisie utilisateur (texte, formulaire)
  "voice",      // dictée vocale transcrite
  "photo_ocr",  // OCR sur photo
  "ai_infer",   // déduction IA (LLM)
  "import",     // import depuis source externe
]);
export type FieldSource = z.infer<typeof FieldSourceSchema>;

/**
 * NOTE — Substitution design vs plan initial (KNOWLEDGE §10) :
 * Le brief initial parlait d'un booléen `confirmed_by_user`. On utilise ici
 * une énumération de niveaux de confiance plus expressive :
 *   - "low"    : valeur incertaine (ex: OCR avec faible score, déduction IA fragile)
 *   - "medium" : valeur plausible (ex: déduction IA standard, voice avec bruit)
 *   - "high"   : valeur fiable (saisie utilisateur explicite, init connu)
 * `null` = non applicable (champ vide).
 *
 * Ce mapping reste compatible avec l'intention initiale : on peut toujours
 * dériver "confirmed" comme `confidence === "high" && source === "user"`.
 * Le supplément de granularité sert l'UX du JSON viewer (badge couleur)
 * et la stratégie de mutation IA (ne JAMAIS écraser un Field "high").
 */
export const FieldConfidenceSchema = z.enum(["low", "medium", "high"]);
export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;

/**
 * Field<T> — wrapper générique pour toute valeur du JSON state.
 * value: null = champ pas encore renseigné.
 */
export interface Field<T> {
  value: T | null;
  source: FieldSource;
  confidence: FieldConfidence | null;
  updated_at: string; // ISO datetime
  source_message_id: string | null; // UUID du message à l'origine
}

const fieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    source: FieldSourceSchema,
    confidence: FieldConfidenceSchema.nullable(),
    updated_at: z.string(),
    source_message_id: z.string().uuid().nullable(),
  });

// ---------------------------------------------------------------------------
// Sections du JSON state (Phase 1 : meta + structure vide pour le reste)
// ---------------------------------------------------------------------------

export const VisitMetaSchema = z.object({
  visit_id: fieldSchema(z.string().uuid()),
  client_id: fieldSchema(z.string()),
  title: fieldSchema(z.string()),
  address: fieldSchema(z.string()),
  building_type: fieldSchema(
    z.enum(["maison_individuelle", "appartement", "immeuble", "tertiaire", "autre"]),
  ),
  visit_date: fieldSchema(z.string()), // ISO date
  thermicien_id: fieldSchema(z.string().uuid()),
  thermicien_name: fieldSchema(z.string()),
  client_name: fieldSchema(z.string()),
  client_phone: fieldSchema(z.string()),
  client_email: fieldSchema(z.string()),
});
export type VisitMeta = z.infer<typeof VisitMetaSchema>;

/**
 * Squelette complet du JSON state d'une visite.
 * Phase 1 : seul `meta` est structuré. Le reste est ouvert pour les
 * itérations suivantes (enveloppe, chauffage, ECS, ventilation, etc.).
 */
export const VisitJsonStateSchema = z.object({
  schema_version: z.literal(1),
  meta: VisitMetaSchema,
  // Sections futures (laissées ouvertes pour Phase 2+) :
  envelope: z.record(z.string(), z.unknown()).default({}),
  heating: z.record(z.string(), z.unknown()).default({}),
  hot_water: z.record(z.string(), z.unknown()).default({}),
  ventilation: z.record(z.string(), z.unknown()).default({}),
  notes: z.array(z.unknown()).default([]),
});
export type VisitJsonState = z.infer<typeof VisitJsonStateSchema>;

// ---------------------------------------------------------------------------
// Factory — squelette initial à la création d'une VT
// ---------------------------------------------------------------------------

interface CreateInitialVisitJsonStateInput {
  visitId: string;
  clientId: string;
  title: string;
  thermicienId: string;
  thermicienName?: string | null;
  /** Itération 4 — pré-remplis depuis la modal de création. */
  address?: string | null;
  buildingType?:
    | "maison_individuelle"
    | "appartement"
    | "immeuble"
    | "tertiaire"
    | "autre"
    | null;
}

function emptyField<T>(): Field<T> {
  return {
    value: null,
    source: "init",
    confidence: null,
    updated_at: new Date().toISOString(),
    source_message_id: null,
  };
}

function initField<T>(value: T): Field<T> {
  return {
    value,
    source: "init",
    confidence: "high",
    updated_at: new Date().toISOString(),
    source_message_id: null,
  };
}

/**
 * Crée le JSON state initial d'une nouvelle visite.
 * Les champs `meta.*` connus (visit_id, client_id, title, thermicien)
 * sont pré-remplis. Tous les autres champs sont à `value: null`.
 */
export function createInitialVisitJsonState(
  input: CreateInitialVisitJsonStateInput,
): VisitJsonState {
  return {
    schema_version: 1,
    meta: {
      visit_id: initField(input.visitId),
      client_id: initField(input.clientId),
      title: initField(input.title),
      address: input.address ? initField(input.address) : emptyField<string>(),
      building_type: input.buildingType
        ? initField(input.buildingType)
        : emptyField<
            "maison_individuelle" | "appartement" | "immeuble" | "tertiaire" | "autre"
          >(),
      visit_date: emptyField<string>(),
      thermicien_id: initField(input.thermicienId),
      thermicien_name: input.thermicienName
        ? initField(input.thermicienName)
        : emptyField<string>(),
      client_name: emptyField<string>(),
      client_phone: emptyField<string>(),
      client_email: emptyField<string>(),
    },
    envelope: {},
    heating: {},
    hot_water: {},
    ventilation: {},
    notes: [],
  };
}
