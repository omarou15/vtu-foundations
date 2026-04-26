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
 *
 * Itération 9 : ajout de l'API Storage (upload + remove) et d'une chaîne
 * de SELECT minimaliste pour le check "message côté serveur" et pour
 * l'idempotence "row attachment déjà insérée".
 */
export interface SyncSupabaseLike {
  from(table: string): {
    insert(payload: Record<string, unknown>): PromiseLike<{
      error: { code?: string; message: string } | null;
    }>;
    update(payload: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{
        error: { code?: string; message: string } | null;
      }>;
    };
    /**
     * SELECT id FROM <table> WHERE <col> = <val> LIMIT 1.
     * Optionnelle (utilisée seulement par le handler attachment_upload
     * pour vérifier la dépendance message côté serveur).
     */
    select?(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{
          data: { id: string } | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
  };
  /**
   * API Storage. Optionnelle pour rester rétro-compatible avec les tests
   * existants qui ne ciblent pas attachment_upload. Le handler dédié
   * vérifiera sa présence à l'usage.
   */
  storage?: {
    from(bucket: string): {
      upload(
        path: string,
        file: Blob,
        options?: { upsert?: boolean; contentType?: string },
      ): PromiseLike<{
        error: { message: string } | null;
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
  supabase: SyncSupabaseLike,
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

/** Délai (ms) avant retry quand on attend une dépendance serveur (message). */
const WAIT_DEPENDENCY_BACKOFF_MS = 2_000;

async function processEntry(
  supabase: SyncSupabaseLike,
  entry: SyncQueueEntry,
): Promise<ProcessResult> {
  const db = getDb();

  // Marquer la ligne locale en "syncing" (lecture optimiste).
  await markLocalRowSyncing(entry);

  try {
    if (entry.op === "attachment_upload") {
      return await processAttachmentUpload(supabase, entry);
    }

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
    return await scheduleRetryOrFail(entry, err);
  }
}

/**
 * Schedule un retry standard (incrémente attempts + backoff exponentiel)
 * ou bascule en "failed" si MAX_ATTEMPTS atteint. Utilisé pour TOUTES les
 * erreurs "réelles" (réseau, 5xx, etc.) — l'attente de dépendance message
 * passe par `scheduleDependencyWait` qui n'incrémente PAS attempts.
 */
async function scheduleRetryOrFail(
  entry: SyncQueueEntry,
  err: unknown,
): Promise<ProcessResult> {
  const db = getDb();
  const message = extractErrorMessage(err);
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

/**
 * Re-schedule l'entry SANS incrémenter `attempts` (la cause n'est pas un
 * échec de la sync de l'attachment elle-même : on attend juste que le
 * message porteur soit synced côté serveur — RLS bloque sinon).
 */
async function scheduleDependencyWait(
  entry: SyncQueueEntry,
  reason: string,
): Promise<ProcessResult> {
  const db = getDb();
  const next = new Date(Date.now() + WAIT_DEPENDENCY_BACKOFF_MS).toISOString();
  if (entry.id != null) {
    await db.sync_queue.update(entry.id, {
      // attempts INCHANGÉ
      last_error: reason,
      next_attempt_at: next,
    });
  }
  // On garde la ligne locale en "pending" (pas "syncing") pour l'UI.
  const table = tableForName(entry.table);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (table as any)
    .update(entry.row_id, {
      sync_status: "pending",
      sync_last_error: reason,
      local_updated_at: new Date().toISOString(),
    })
    .catch(() => undefined);
  return "retry-later";
}

// ---------------------------------------------------------------------------
// attachment_upload handler (It. 9)
//
// Workflow (KNOWLEDGE §14) :
//   a) load LocalAttachment (introuvable / déjà synced → mark synced)
//   b) load AttachmentBlobRow (introuvable → mark failed "blob_missing")
//   c) check messages.id côté serveur (null → backoff sans incrément)
//   d) upload Storage compressed + thumbnail (upsert:true → idempotent)
//   e) SELECT attachments.id (présent → skip insert)
//   f) INSERT attachments (23505 = succès logique)
//   g) mark synced + remove queue entry
// ---------------------------------------------------------------------------
async function processAttachmentUpload(
  supabase: SyncSupabaseLike,
  entry: SyncQueueEntry,
): Promise<ProcessResult> {
  const db = getDb();

  // a) Charger l'attachment local
  const attachment = await db.attachments.get(entry.row_id);
  if (!attachment) {
    // Row supprimée localement (discard) → on dégage la queue entry.
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }
  if (attachment.sync_status === "synced") {
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }
  if (!attachment.message_id) {
    // Sécurité : ne devrait pas arriver (attachPendingMediaToMessage
    // garantit message_id). On traite comme attente de dépendance.
    return await scheduleDependencyWait(entry, "missing_message_id");
  }

  // b) Charger les blobs
  const blob = await db.attachment_blobs.get(entry.row_id);
  if (!blob) {
    // Incident grave — on stoppe immédiatement.
    await db.transaction(
      "rw",
      [db.sync_queue, db.attachments],
      async () => {
        await markLocalRowFailed(entry, "blob_missing");
        if (entry.id != null) await db.sync_queue.delete(entry.id);
      },
    );
    return "failed";
  }

  // c) Check dépendance message côté serveur
  const messagesTable = supabase.from("messages");
  if (!messagesTable.select) {
    // Mock incomplet — on traite comme dépendance OK pour rester rétrocompat.
  } else {
    try {
      const { data, error } = await messagesTable
        .select("id")
        .eq("id", attachment.message_id)
        .maybeSingle();
      if (error) return await scheduleRetryOrFail(entry, error);
      if (data === null)
        return await scheduleDependencyWait(entry, "message_not_synced");
    } catch (err) {
      return await scheduleRetryOrFail(entry, err);
    }
  }

  // d) Upload Storage (upsert:true → idempotent)
  if (!supabase.storage) {
    return await scheduleRetryOrFail(
      entry,
      new Error("storage api unavailable"),
    );
  }
  const bucket = supabase.storage.from(attachment.bucket);

  if (!attachment.compressed_path) {
    await db.transaction(
      "rw",
      [db.sync_queue, db.attachments],
      async () => {
        await markLocalRowFailed(entry, "missing_compressed_path");
        if (entry.id != null) await db.sync_queue.delete(entry.id);
      },
    );
    return "failed";
  }

  try {
    const up1 = await bucket.upload(
      attachment.compressed_path,
      blob.compressed,
      { upsert: true, contentType: attachment.format ?? undefined },
    );
    if (up1.error) return await scheduleRetryOrFail(entry, up1.error);

    if (blob.thumbnail !== null && attachment.thumbnail_path !== null) {
      const up2 = await bucket.upload(
        attachment.thumbnail_path,
        blob.thumbnail,
        {
          upsert: true,
          contentType:
            attachment.format === "application/pdf"
              ? "image/png"
              : (attachment.format ?? undefined),
        },
      );
      if (up2.error) return await scheduleRetryOrFail(entry, up2.error);
    }
  } catch (err) {
    return await scheduleRetryOrFail(entry, err);
  }

  // e) SELECT id pour idempotence post-crash
  const attachmentsTable = supabase.from("attachments");
  if (attachmentsTable.select) {
    try {
      const { data, error } = await attachmentsTable
        .select("id")
        .eq("id", attachment.id)
        .maybeSingle();
      if (error) return await scheduleRetryOrFail(entry, error);
      if (data !== null) {
        // Row déjà côté serveur → skip insert
        await db.transaction(
          "rw",
          [db.sync_queue, db.attachments],
          async () => {
            await markLocalRowSynced(entry);
            if (entry.id != null) await db.sync_queue.delete(entry.id);
          },
        );
        return "ok";
      }
    } catch (err) {
      return await scheduleRetryOrFail(entry, err);
    }
  }

  // f) INSERT row
  try {
    const payload = serializeAttachmentForSync(attachment);
    const { error } = await attachmentsTable.insert(payload);
    if (error) {
      const code = (error as { code?: string }).code;
      const message = error.message ?? "";
      const isDuplicate =
        code === "23505" || message.toLowerCase().includes("duplicate");
      if (!isDuplicate) return await scheduleRetryOrFail(entry, error);
    }
  } catch (err) {
    return await scheduleRetryOrFail(entry, err);
  }

  // g) Mark synced
  await db.transaction(
    "rw",
    [db.sync_queue, db.attachments],
    async () => {
      await markLocalRowSynced(entry);
      if (entry.id != null) await db.sync_queue.delete(entry.id);
    },
  );
  // h) Cleanup blob → DIFFÉRÉ (cf. pruneOldBlobs, KNOWLEDGE §14)
  return "ok";
}

function serializeAttachmentForSync(
  a: import("@/shared/db/schema").LocalAttachment,
): Record<string, unknown> {
  return {
    id: a.id,
    message_id: a.message_id,
    user_id: a.user_id,
    visit_id: a.visit_id,
    bucket: a.bucket,
    storage_path: a.storage_path,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    metadata: a.metadata,
    created_at: a.created_at,
    compressed_path: a.compressed_path,
    thumbnail_path: a.thumbnail_path,
    width_px: a.width_px,
    height_px: a.height_px,
    sha256: a.sha256,
    gps_lat: a.gps_lat,
    gps_lng: a.gps_lng,
    format: a.format,
    media_profile: a.media_profile,
    linked_sections: a.linked_sections,
  };
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
    case "schema_registry":
      return db.schema_registry;
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

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}
