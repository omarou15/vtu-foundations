/**
 * VTU — Repository visits (Dexie local)
 *
 * Itération 4 : la création d'une VT est atomique côté local :
 *   1. INSERT visits (sync_status = "pending")
 *   2. INSERT visit_json_state v1 (sync_status = "pending")
 *   3. ENQUEUE sync_queue × 2 (visits + visit_json_state)
 *
 * Le tout dans une transaction Dexie pour garantir le tout-ou-rien.
 * La synchro effective vers Supabase sera branchée à l'Itération 6
 * (sync engine offline-first).
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalVisit, type LocalVisitJsonState } from "@/shared/db/schema";
import type {
  BuildingType,
  MissionType,
  SyncQueueEntry,
  VisitRow,
} from "@/shared/types";
import { createInitialVisitJsonState, type VisitJsonState } from "@/shared/types";

interface CreateLocalVisitInput {
  userId: string;
  title?: string;
  thermicienName?: string | null;
  address?: string | null;
  missionType?: MissionType | null;
  buildingType?: BuildingType | null;
}

export interface CreateLocalVisitResult {
  visit: LocalVisit;
  jsonState: LocalVisitJsonState;
  initialState: VisitJsonState;
}

/**
 * Crée une nouvelle visite localement (atomique).
 * - Génère `id` et `client_id` côté client (UUID).
 * - Pré-construit le squelette JSON state initial (meta.* pré-remplis).
 * - Enqueue 2 entrées dans sync_queue pour replay à l'Itération 6.
 */
export async function createLocalVisit(
  input: CreateLocalVisitInput,
): Promise<CreateLocalVisitResult> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();
  const client_id = uuidv4();
  const title = input.title?.trim() || "Nouvelle visite";
  const address = input.address?.trim() || null;
  const mission_type = input.missionType ?? null;
  const building_type = input.buildingType ?? null;

  const visit: LocalVisit = {
    id,
    user_id: input.userId,
    client_id,
    title,
    status: "draft",
    version: 1,
    address,
    mission_type,
    building_type,
    created_at: now,
    updated_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  const initialState = createInitialVisitJsonState({
    visitId: id,
    clientId: client_id,
    title,
    thermicienId: input.userId,
    thermicienName: input.thermicienName ?? null,
    address,
    buildingType: building_type,
  });

  const jsonStateRow: LocalVisitJsonState = {
    id: uuidv4(),
    visit_id: id,
    user_id: input.userId,
    version: 1,
    state: initialState,
    created_by_message_id: null,
    created_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  const visitQueueEntry: SyncQueueEntry = {
    table: "visits",
    op: "insert",
    row_id: visit.id,
    payload: serializeVisitForSync(visit),
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };

  const jsonQueueEntry: SyncQueueEntry = {
    table: "visit_json_state",
    op: "insert",
    row_id: jsonStateRow.id,
    payload: serializeJsonStateForSync(jsonStateRow),
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };

  await db.transaction(
    "rw",
    db.visits,
    db.visit_json_state,
    db.sync_queue,
    async () => {
      await db.visits.add(visit);
      await db.visit_json_state.add(jsonStateRow);
      await db.sync_queue.add(visitQueueEntry);
      await db.sync_queue.add(jsonQueueEntry);
    },
  );

  return { visit, jsonState: jsonStateRow, initialState };
}

/** Liste les visites d'un user, plus récentes en premier. */
export async function listLocalVisitsByUser(userId: string): Promise<LocalVisit[]> {
  const db = getDb();
  const visits = await db.visits
    .where("[user_id+updated_at]")
    .between([userId, ""], [userId, "\uffff"])
    .reverse()
    .toArray();
  return visits.filter((visit) => visit.status !== "archived");
}

export async function getLocalVisit(id: string): Promise<LocalVisit | undefined> {
  const db = getDb();
  return db.visits.get(id);
}

/**
 * Supprime un projet côté UX via soft-delete offline-first.
 *
 * On utilise `status="archived"` plutôt qu'un DELETE physique pour conserver
 * l'audit trail append-only et propager correctement la suppression aux autres
 * appareils via le pull `updated_at`.
 */
export async function deleteLocalVisitProject(visitId: string): Promise<void> {
  const db = getDb();
  const existing = await db.visits.get(visitId);
  if (!existing) return;

  const now = new Date().toISOString();
  const archived: LocalVisit = {
    ...existing,
    status: "archived",
    version: existing.version + 1,
    updated_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  const queueEntry: SyncQueueEntry = {
    table: "visits",
    op: "update",
    row_id: archived.id,
    payload: serializeVisitForSync(archived),
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };

  await db.transaction("rw", db.visits, db.sync_queue, async () => {
    await db.visits.put(archived);
    await db.sync_queue.add(queueEntry);
  });
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

// ---------------------------------------------------------------------------
// Serializers (payload pour sync_queue → Supabase)
// ---------------------------------------------------------------------------

function serializeVisitForSync(v: LocalVisit): Record<string, unknown> {
  return {
    id: v.id,
    user_id: v.user_id,
    client_id: v.client_id,
    title: v.title,
    status: v.status,
    version: v.version,
    address: v.address,
    mission_type: v.mission_type,
    building_type: v.building_type,
    created_at: v.created_at,
    updated_at: v.updated_at,
  };
}

function serializeJsonStateForSync(
  s: LocalVisitJsonState,
): Record<string, unknown> {
  return {
    id: s.id,
    visit_id: s.visit_id,
    user_id: s.user_id,
    version: s.version,
    state: s.state,
    created_by_message_id: s.created_by_message_id,
    created_at: s.created_at,
  };
}
