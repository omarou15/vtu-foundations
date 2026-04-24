/**
 * VTU — Repository visits (Dexie local)
 *
 * Phase 1 : CRUD de base local-first. La synchro vers Supabase
 * sera branchée à l'Itération 6 via la sync_queue (outbox).
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalVisit } from "@/shared/db/schema";
import type { VisitRow } from "@/shared/types";
import { createInitialVisitJsonState, type VisitJsonState } from "@/shared/types";

interface CreateLocalVisitInput {
  userId: string;
  title?: string;
  thermicienName?: string | null;
}

export interface CreateLocalVisitResult {
  visit: LocalVisit;
  initialState: VisitJsonState;
}

/**
 * Crée une nouvelle visite localement.
 * - Génère `id` et `client_id` côté client (UUID).
 * - Pré-construit le squelette JSON state initial (meta.* pré-remplis).
 * - Marque `sync_status = "pending"` pour replay outbox ultérieur.
 *
 * Note : à l'Itération 4, on branchera l'enqueue sync_queue + insertion
 * de la première ligne visit_json_state. Pour l'instant on retourne
 * juste les artefacts pour validation par les tests.
 */
export async function createLocalVisit(
  input: CreateLocalVisitInput,
): Promise<CreateLocalVisitResult> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();
  const client_id = uuidv4();
  const title = input.title ?? "Nouvelle visite";

  const visit: LocalVisit = {
    id,
    user_id: input.userId,
    client_id,
    title,
    status: "draft",
    version: 1,
    created_at: now,
    updated_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  await db.visits.add(visit);

  const initialState = createInitialVisitJsonState({
    visitId: id,
    clientId: client_id,
    title,
    thermicienId: input.userId,
    thermicienName: input.thermicienName ?? null,
  });

  return { visit, initialState };
}

/** Liste les visites d'un user, plus récentes en premier. */
export async function listLocalVisitsByUser(userId: string): Promise<LocalVisit[]> {
  const db = getDb();
  return db.visits
    .where("[user_id+updated_at]")
    .between([userId, ""], [userId, "\uffff"])
    .reverse()
    .toArray();
}

export async function getLocalVisit(id: string): Promise<LocalVisit | undefined> {
  const db = getDb();
  return db.visits.get(id);
}

/**
 * Idempotence : tente d'upserter une visite Supabase reçue.
 * Si une ligne avec même (user_id, client_id) existe déjà, on no-op
 * (équivalent ON CONFLICT DO NOTHING côté DB).
 */
export async function upsertVisitFromRemote(row: VisitRow): Promise<void> {
  const db = getDb();
  const existing = await db.visits
    .where("[user_id+client_id]")
    .equals([row.user_id, row.client_id])
    .first();

  if (existing) {
    // Optimistic concurrency : on garde la version la plus haute.
    if (row.version <= existing.version) return;
  }

  const local: LocalVisit = {
    ...row,
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: new Date().toISOString(),
  };
  await db.visits.put(local);
}
