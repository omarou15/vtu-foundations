/**
 * VTU — Détection des conflits IA ↔ humain (It. 11)
 *
 * Un "conflit actif" = l'IA a proposé une valeur (extract_from_message)
 * qui aurait écrasé un Field<T> humain (`source ∈ user/voice/photo_ocr/import`
 * avec value !== null), donc `applyPatches` l'a ignoré avec
 * `reason === "human_source_prime"`.
 *
 * Ces patches ignorés sont déjà sérialisés dans `metadata.ignored_paths`
 * du message assistant `kind="actions_card"` ET `kind="conflict_card"`.
 * On les croise avec le state COURANT pour ne garder que les conflits
 * encore "vivants" (la valeur humaine n'a pas changé entre temps).
 *
 * Pur, idempotent, testable unitaire — aucune I/O Dexie.
 */

import type { LocalMessage } from "@/shared/db/schema";
import type { VisitJsonState } from "@/shared/types";
import type { AiFieldPatch } from "@/shared/llm";
import { labelForPath, formatPatchValue } from "@/shared/llm/path-labels";
import type { Field, FieldConfidence } from "@/shared/types/json-state.field";

export interface Conflict {
  /** dot-path JSON state, ex: `heating.fuel_value` */
  path: string;
  /** Libellé humain (ex: "Chauffage · Énergie / combustible"). */
  label: string;
  /** Valeur humaine actuellement en place (formatée pour affichage). */
  humanValue: string;
  /** Source de la valeur humaine ("user" | "voice" | "photo_ocr" | "import"). */
  humanSource: string;
  humanUpdatedAt: string;
  /** Valeur que l'IA a proposée (formatée). */
  aiValue: string;
  /** Confidence de la proposition IA. */
  aiConfidence: FieldConfidence;
  /** Patch original non formaté — utilisé par overrideWithAiPatch. */
  aiPatch: AiFieldPatch;
  /** Id du message assistant qui porte la proposition (audit). */
  aiMessageId: string;
  /** Date de la proposition IA. */
  aiCreatedAt: string;
}

interface IgnoredPathEntry {
  path: string;
  reason: string;
}

interface ActionsCardMeta {
  proposed_patches?: AiFieldPatch[];
  ignored_paths?: IgnoredPathEntry[];
  /**
   * It. 11 — Quand le user tranche un conflit, on note ici les paths
   * déjà arbitrés pour qu'ils n'apparaissent plus comme actifs.
   * Valeur : "kept_human" | "took_ai".
   */
  conflict_resolutions?: Record<string, "kept_human" | "took_ai">;
}

/**
 * Retourne TOUS les conflits actifs sur la VT, triés par message le plus
 * récent en premier (le user voit d'abord les conflits frais).
 *
 * Un conflit est filtré (= traité) dans 3 cas :
 *  1. Le path n'est plus en value humaine (le user a effacé ou changé).
 *  2. Le Field actuel a `validation_status` autre que "unvalidated"
 *     (déjà arbitré, peu importe le sens).
 *  3. La metadata `conflict_resolutions[path]` est setté.
 */
export function findActiveConflicts(
  state: VisitJsonState | null | undefined,
  messages: LocalMessage[],
): Conflict[] {
  if (!state) return [];

  const HUMAN_SOURCES = new Set(["user", "voice", "photo_ocr", "import"]);
  const conflicts: Conflict[] = [];
  const seenPaths = new Set<string>();

  // Plus récent en premier — un même path peut être proposé plusieurs fois,
  // on ne garde que la dernière proposition active.
  const sorted = [...messages].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  for (const m of sorted) {
    if (m.role !== "assistant") continue;
    if (m.kind !== "actions_card" && m.kind !== "conflict_card") continue;

    const meta = (m.metadata ?? {}) as ActionsCardMeta;
    const ignored = meta.ignored_paths ?? [];
    const proposed = meta.proposed_patches ?? [];
    const resolved = meta.conflict_resolutions ?? {};

    for (const ig of ignored) {
      if (ig.reason !== "human_source_prime") continue;
      if (seenPaths.has(ig.path)) continue;
      if (resolved[ig.path]) continue; // déjà arbitré

      const patch = proposed.find((p) => p.path === ig.path);
      if (!patch) continue;

      const cur = readField(state, ig.path);
      if (!cur) continue;
      if (!HUMAN_SOURCES.has(cur.source)) continue;
      if (cur.value === null || cur.value === undefined) continue;
      if (cur.validation_status !== "unvalidated") continue;

      conflicts.push({
        path: ig.path,
        label: labelForPath(ig.path),
        humanValue: formatPatchValue(cur.value),
        humanSource: cur.source,
        humanUpdatedAt: cur.updated_at,
        aiValue: formatPatchValue(patch.value),
        aiConfidence: patch.confidence,
        aiPatch: patch,
        aiMessageId: m.id,
        aiCreatedAt: m.created_at,
      });
      seenPaths.add(ig.path);
    }
  }

  return conflicts;
}

export function countActiveConflicts(
  state: VisitJsonState | null | undefined,
  messages: LocalMessage[],
): number {
  return findActiveConflicts(state, messages).length;
}

/**
 * Filtrage par message porteur — utilisé par ConflictCard pour ne render
 * que les conflits que CE message d'assistant a soulevés (on évite
 * d'afficher la même carte à deux endroits du fil).
 */
export function filterConflictsByAssistantMessage(
  conflicts: Conflict[],
  messageId: string,
): Conflict[] {
  return conflicts.filter((c) => c.aiMessageId === messageId);
}

// ---------------------------------------------------------------------------

function readField(
  state: unknown,
  path: string,
): Field<unknown> | null {
  if (!state || typeof state !== "object") return null;
  const segments = path.split(".");
  let cur: unknown = state;
  for (let i = 0; i < segments.length - 1; i++) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[segments[i]!];
  }
  if (!cur || typeof cur !== "object") return null;
  const leaf = (cur as Record<string, unknown>)[segments[segments.length - 1]!];
  if (!leaf || typeof leaf !== "object" || !("value" in (leaf as object))) {
    return null;
  }
  return leaf as Field<unknown>;
}
