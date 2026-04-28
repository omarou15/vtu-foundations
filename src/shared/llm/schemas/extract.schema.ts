/**
 * Schema de sortie d'extract_from_message — It. 11.6 : 3 verbes distincts.
 *
 * Doctrine VTU :
 *   - L'IA propose dans le cadre de la `schema_map` que le bundle lui montre.
 *   - Trois verbes explicites pour qu'il n'y ait jamais d'ambiguïté :
 *
 *       1. `patches[]` (set_field)
 *          Modifie un Field<T> existant. Path syntaxe :
 *            - "building.wall_material_value"        (object field plat)
 *            - "envelope.murs.material_value"        (sous-objet)
 *            - "heating.installations[id=abc].type"  (entrée collection par UUID)
 *          INTERDIT : index positionnel `[N]` — rejeté par l'apply layer.
 *
 *       2. `insert_entries[]` (insert_entry)
 *          Crée une nouvelle entrée dans une collection connue. UUID
 *          généré par l'apply layer (jamais par le LLM).
 *          `collection` doit ∈ schema_map.collections.
 *          `fields` keys doivent ⊆ schema_map.collections[c].item_fields.
 *
 *       3. `custom_fields[]` (custom_field)
 *          Vocabulaire émergent : concept absent du schéma. Alimente le
 *          Schema Registry (quarantaine 5 occurrences avant promotion).
 *
 *   - L'apply layer rejette tout ce qui sort de ce cadre, sans
 *     auto-vivify. Plus jamais de fail silencieux.
 */
import { z } from "zod";

const ConfidenceSchema = z.enum(["low", "medium", "high"]);

/** set_field — modification d'un Field<T> existant. */
export const AiFieldPatchSchema = z.object({
  path: z.string().min(1).max(160),
  value: z.unknown(),
  confidence: ConfidenceSchema,
  evidence_refs: z.array(z.string()).max(20).default([]),
});

/** insert_entry — création d'une nouvelle entrée dans une collection. */
export const AiInsertEntrySchema = z.object({
  /** Path absolu vers la collection, ex: "heating.installations". */
  collection: z.string().min(1).max(80),
  /**
   * Valeurs initiales (keys ⊆ schema_map.collections[c].item_fields).
   * Champs non listés restent emptyField() côté apply.
   */
  fields: z.record(z.string(), z.unknown()),
  confidence: ConfidenceSchema,
  evidence_refs: z.array(z.string()).max(20).default([]),
});

/** custom_field — concept hors schéma, alimente le Schema Registry. */
export const AiCustomFieldSchema = z.object({
  section_path: z.string().min(1).max(80),
  field_key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/),
  label_fr: z.string().min(1).max(120),
  value: z.unknown(),
  value_type: z.enum(["string", "number", "boolean", "enum", "multi_enum"]),
  unit: z.string().max(20).nullable(),
  confidence: ConfidenceSchema,
  evidence_refs: z.array(z.string()).max(20).default([]),
});

export const ExtractOutputSchema = z.object({
  patches: z.array(AiFieldPatchSchema).max(40).default([]),
  insert_entries: z.array(AiInsertEntrySchema).max(20).default([]),
  custom_fields: z.array(AiCustomFieldSchema).max(20).default([]),
  warnings: z.array(z.string().max(200)).max(20).default([]),
  confidence_overall: z.number().min(0).max(1),
});

export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

/**
 * It. 10.5 — Sortie unifiée Edge Function `vtu-llm-agent`.
 * Étend ExtractOutputSchema avec un assistant_message obligatoire.
 * Mode "extract" et "conversational" partagent ce schéma : pour
 * conversational, patches/insert_entries/custom_fields sont vides.
 */
export const UnifiedAgentOutputSchema = z.object({
  assistant_message: z.string().min(1).max(400),
  patches: z.array(AiFieldPatchSchema).max(40).default([]),
  insert_entries: z.array(AiInsertEntrySchema).max(20).default([]),
  custom_fields: z.array(AiCustomFieldSchema).max(20).default([]),
  warnings: z.array(z.string().max(200)).max(20).default([]),
  confidence_overall: z.number().min(0).max(1),
});

export type UnifiedAgentOutput = z.infer<typeof UnifiedAgentOutputSchema>;
