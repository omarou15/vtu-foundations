/**
 * VTU — Sync engine offline-first (Itération 6)
 *
 * Doctrine (KNOWLEDGE §2) :
 *  - Toutes les écritures sont d'abord locales (Dexie).
 *  - L'engine vide la `sync_queue` SÉRIELLEMENT (1 entry à la fois)
 *    pour préserver l'ordre causal des messages.
 *  - Backoff exponentiel : 1s / 3s / 10s / 30s / 60s.
 *  - Au bout de MAX_ATTEMPTS, la ligne locale passe en sync_status
 *    "failed" (badge ⚠️ dans VisitCard) et l'entry est retirée de la queue.
 *  - Idempotence côté DB : `(user_id, client_id)` unique → renvoyer
 *    deux fois la même insertion ne duplique pas.
 *
 * L'engine est appelé par `useSyncEngine()` (hook côté layout protégé) :
 *  - tick toutes les 30 s
 *  - sur `online` event
 *  - sur `window.focus`
 *  - immédiatement au montage
 */

import { getDb } from "@/shared/db/schema";
import type { SyncQueueEntry } from "@/shared/types";

/**
 * Type structurel minimal du sous-ensemble de l'API Supabase utilisé
 * par l'engine. On reste compatible avec le vrai `SupabaseClient` (qui
 * implémente une API beaucoup plus large) tout en facilitant les mocks.
 */
export interface SyncSupabaseLike {
  from(table: string): {
    insert(payload: Record<string, unknown>): Promise<{
      error: { code?: string; message: string } | null;
    }>;
    update(payload: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{
        error: { code?: string; message: string } | null;
      }>;
    };
  };
}

export const MAX_ATTEMPTS = 5;
/** Backoff exponentiel en millisecondes, indexé par `attempts` (avant retry). */
export const BACKOFF_MS = [1_000, 3_000, 10_000, 30_000, 60_000] as const;

export interface RunResult {
  processed: number;
  failed: number;
  skipped: number;
}

interface RunOptions {
  /** Limite par tick (défaut 25 — évite de monopoliser le main thread). */
  maxPerTick?: number;
  /** Date.now() injectable pour les tests. */
  now?: () => number;
}

/**
 * Calcule le délai de backoff (ms) à partir du compteur d'essais déjà
 * effectués. `attempts === 0` n'a pas de backoff (première tentative).
 */
export function computeBackoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const idx = Math.min(attempts - 1, BACKOFF_MS.length - 1);
  return BACKOFF_MS[idx]!;
}

/**
 * Vide la sync_queue (sérialisé). Retourne un résumé.
 *
 * NOTE : on n'a pas de lock global persistant — un simple flag mémoire
 * `running` empêche les ticks concurrents dans la même page. Sur deux
 * onglets, Dexie est partagé : on accepte que les deux puissent essayer ;
 * l'idempotence côté serveur (unique `(user_id, client_id)`) protège.
 */
export async function runSyncOnce(
  supabase: Pick<SupabaseClient, "from">,
  options: RunOptions = {},
): Promise<RunResult> {
  const db = getDb();
  const now = options.now ?? Date.now;
  const maxPerTick = options.maxPerTick ?? 25;

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < maxPerTick; i++) {
    // On lit la prochaine entry éligible (next_attempt_at <= now).
    // Dexie ne permet pas de combiner index composé + filtre date côté
    // index, donc on lit ordonné par [next_attempt_at+attempts] et on
    // s'arrête dès qu'on tombe sur une entry future.
    const entry = await db.sync_queue
      .orderBy("[next_attempt_at+attempts]")
      .first();

    if (!entry) break;

    const due = Date.parse(entry.next_attempt_at) <= now();
    if (!due) {
      skipped++;
      break;
    }

    const result = await processEntry(supabase, entry);
    if (result === "ok") {
      processed++;
    } else if (result === "failed") {
      failed++;
    } else {
      // "retry-later" → on a re-mis à jour la queue, on s'arrête pour
      // ne pas reboucler indéfiniment sur la même entry.
      skipped++;
      break;
    }
  }

  return { processed, failed, skipped };
}

type ProcessResult = "ok" | "failed" | "retry-later";

async function processEntry(
  supabase: Pick<SupabaseClient, "from">,
  entry: SyncQueueEntry,
): Promise<ProcessResult> {
  const db = getDb();

  // Marquer la ligne locale en "syncing" (lecture optimiste).
  await markLocalRowSyncing(entry);

  try {
    if (entry.op === "insert") {
      const { error } = await supabase
        .from(entry.table)
        .insert(entry.payload as Record<string, unknown>);

      if (error) {
        // Idempotence : duplicate key = succès logique côté serveur.
        const code = (error as { code?: string }).code;
        const message = error.message ?? "";
        const isDuplicate =
          code === "23505" || message.toLowerCase().includes("duplicate");
        if (!isDuplicate) throw error;
      }
    } else if (entry.op === "update") {
      const payload = entry.payload as Record<string, unknown>;
      const id = payload.id as string;
      const { error } = await supabase
        .from(entry.table)
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    }

    // Succès : on marque la ligne locale "synced" + on retire l'entry.
    await db.transaction(
      "rw",
      [db.sync_queue, tableForName(entry.table)],
      async () => {
        await markLocalRowSynced(entry);
        if (entry.id != null) await db.sync_queue.delete(entry.id);
      },
    );
    return "ok";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempts = entry.attempts + 1;

    if (nextAttempts >= MAX_ATTEMPTS) {
      await db.transaction(
        "rw",
        [db.sync_queue, tableForName(entry.table)],
        async () => {
          await markLocalRowFailed(entry, message);
          if (entry.id != null) await db.sync_queue.delete(entry.id);
        },
      );
      return "failed";
    }

    const backoff = computeBackoffMs(nextAttempts);
    const next = new Date(Date.now() + backoff).toISOString();
    if (entry.id != null) {
      await db.sync_queue.update(entry.id, {
        attempts: nextAttempts,
        last_error: message,
        next_attempt_at: next,
      });
    }
    await markLocalRowSyncing(entry, message, nextAttempts);
    return "retry-later";
  }
}

// ---------------------------------------------------------------------------
// Helpers : table name → Dexie table + mark sync_status local
// ---------------------------------------------------------------------------

function tableForName(name: SyncQueueEntry["table"]) {
  const db = getDb();
  switch (name) {
    case "visits":
      return db.visits;
    case "messages":
      return db.messages;
    case "attachments":
      return db.attachments;
    case "visit_json_state":
      return db.visit_json_state;
  }
}

async function markLocalRowSyncing(
  entry: SyncQueueEntry,
  lastError: string | null = null,
  attempts: number | null = null,
): Promise<void> {
  const table = tableForName(entry.table);
  const patch: Record<string, unknown> = {
    sync_status: "syncing",
    local_updated_at: new Date().toISOString(),
  };
  if (lastError !== null) patch.sync_last_error = lastError;
  if (attempts !== null) patch.sync_attempts = attempts;
  // On ignore l'absence de la ligne (peut arriver si l'utilisateur a
  // wipe la base entre deux ticks) — pas critique.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (table as any).update(entry.row_id, patch).catch(() => undefined);
}

async function markLocalRowSynced(entry: SyncQueueEntry): Promise<void> {
  const table = tableForName(entry.table);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (table as any)
    .update(entry.row_id, {
      sync_status: "synced",
      sync_attempts: 0,
      sync_last_error: null,
      local_updated_at: new Date().toISOString(),
    })
    .catch(() => undefined);
}

async function markLocalRowFailed(
  entry: SyncQueueEntry,
  message: string,
): Promise<void> {
  const table = tableForName(entry.table);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (table as any)
    .update(entry.row_id, {
      sync_status: "failed",
      sync_attempts: MAX_ATTEMPTS,
      sync_last_error: message,
      local_updated_at: new Date().toISOString(),
    })
    .catch(() => undefined);
}
