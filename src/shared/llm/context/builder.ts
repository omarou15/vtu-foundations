/**
 * Builder du ContextBundle. Pure (pas d'I/O Dexie ici — on lui passe les
 * matériaux pré-chargés).
 *
 * Refonte avril 2026 — bundle minimal :
 *   { schema_version, visit, state, recent_messages }
 *
 * Le SCHÉMA CANONIQUE est dans le prompt système. Les descriptions de
 * photos passent via les messages assistant `photo_caption` (déjà dans
 * recent_messages). Plus de `schema_map`, `attachments_context`,
 * `pending_attachments`, `nomenclature_hints`, `state_summary` séparé.
 */

import type {
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
  /**
   * Limite optionnelle de messages récents inclus.
   * Par défaut : illimité (Number.POSITIVE_INFINITY) — la compression
   * progressive de `compress.ts` se charge de réduire si le bundle
   * dépasse le budget tokens.
   */
  maxRecentMessages?: number;
}

const DEFAULT_MAX_RECENT_MESSAGES = Number.POSITIVE_INFINITY;

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
    state,
    recent_messages: recent,
  };
}
