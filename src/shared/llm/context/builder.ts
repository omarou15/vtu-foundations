/**
 * Builder du ContextBundle. Pure (pas d'I/O Dexie ici — on lui passe les
 * matériaux pré-chargés). Permet de tester sans setup IndexedDB.
 *
 * Les call sites (server function + sync engine) passeront eux-mêmes les
 * matériaux issus de Dexie (ou Supabase côté server function).
 */

import type {
  AttachmentAiDescriptionRow,
  MessageRow,
  VisitJsonState,
  VisitJsonStateRow,
  VisitRow,
} from "@/shared/types";
import type { ContextBundle } from "../types";

export interface BuildContextInput {
  visit: VisitRow;
  latestState: VisitJsonStateRow;
  recentMessages: MessageRow[];
  /** Descriptions IA des attachments cités (par message ou par visite). */
  attachmentDescriptions: Array<{
    attachment_id: string;
    media_profile: string | null;
    description: AttachmentAiDescriptionRow["description"];
  }>;
  /** Hints de nomenclature filtrés par mission_type. */
  nomenclatureHints?: Record<string, unknown>;
  /** Limite par défaut de messages récents inclus. */
  maxRecentMessages?: number;
}

const DEFAULT_MAX_RECENT_MESSAGES = 20;

export function buildContextBundle(input: BuildContextInput): ContextBundle {
  const state = input.latestState.state as VisitJsonState;
  const max = input.maxRecentMessages ?? DEFAULT_MAX_RECENT_MESSAGES;
  const recent = [...input.recentMessages]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-max)
    .map((m) => ({
      role: m.role,
      kind: m.kind,
      content: m.content,
      created_at: m.created_at,
    }));

  return {
    schema_version: state.schema_version,
    visit: {
      id: input.visit.id,
      mission_type: input.visit.mission_type,
      building_type: input.visit.building_type,
    },
    state_summary: summarizeState(state),
    recent_messages: recent,
    attachments_context: input.attachmentDescriptions.map((d) => ({
      id: d.attachment_id,
      media_profile: d.media_profile,
      short_caption: d.description.short_caption ?? null,
      detailed_description: d.description.detailed_description,
      ocr_text: d.description.ocr_text,
    })),
    nomenclature_hints: input.nomenclatureHints ?? {},
  };
}

/**
 * Projette le state en un summary plat compatible LLM.
 *
 * Note : on ne retire pas les `Field<T>` — au contraire on garde
 * `value`, `source`, `validation_status` parce que c'est ce qui permet
 * à l'IA d'appliquer le gate "humain prime".
 */
function summarizeState(state: VisitJsonState): Record<string, unknown> {
  // Pour Phase 2 on injecte le state tel quel (post-migration v2). Le
  // compresseur réduit en passes successives si trop gros.
  return state as unknown as Record<string, unknown>;
}
