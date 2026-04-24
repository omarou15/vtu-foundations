/**
 * VTU — Pull engine cross-device (Itération 6.5)
 *
 * Push (engine.ts) seul ne suffit pas : si l'utilisateur crée une VT
 * sur son tel, son PC ne la voit pas tant qu'on ne pull pas. Ici on
 * implémente le pull incrémental :
 *
 *   - Pour chaque table (visits, visit_json_state) :
 *     SELECT * WHERE user_id = userId AND updated_at > last_pulled_at
 *     ORDER BY updated_at ASC LIMIT 200
 *
 *   - Hydration initiale : si le curseur est null (premier login sur
 *     ce device), full pull (LIMIT 500).
 *
 *   - Les messages sont pull à part (lazy par VT, cf. useMessagesSync)
 *     pour ne pas charger 10k messages au login.
 *
 * Idempotence garantie par les `upsert*FromRemote` côté repos
 * (no-op si même `(user_id, client_id)` ou même `(visit_id, version)`).
 *
 * Curseur : on stocke le `updated_at` (ou `created_at` pour
 * `visit_json_state` qui n'a pas d'`updated_at`) du dernier row reçu,
 * pas `Date.now()`. Évite les lacunes en cas de skew d'horloge entre
 * le serveur et le client.
 */

import {
  getLastPulledAt,
  setLastPulledAt,
  SyncStateKey,
  upsertJsonStateFromRemote,
  upsertMessageFromRemote,
  upsertVisitFromRemote,
} from "@/shared/db";
import type { MessageRow, VisitJsonStateRow, VisitRow } from "@/shared/types";

/** Type structurel minimal du sous-ensemble Supabase utilisé pour le pull. */
export interface PullSupabaseLike {
  from(table: string): PullQueryBuilder;
}

interface PullQueryBuilder {
  select(columns: string): PullQueryBuilder;
  eq(column: string, value: string): PullQueryBuilder;
  gt(column: string, value: string): PullQueryBuilder;
  order(
    column: string,
    options?: { ascending?: boolean },
  ): PullQueryBuilder;
  limit(n: number): PullQueryBuilder;
  // Terminal : doit être awaitable.
  then<TResult1 = PullResult, TResult2 = never>(
    onfulfilled?: (value: PullResult) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): PromiseLike<TResult1 | TResult2>;
}

interface PullResult {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message: string } | null;
}

/** Limite par tick pour éviter de saturer le main thread / la bande passante. */
const PULL_LIMIT = 200;
const HYDRATION_LIMIT = 500;

export interface PullOnceResult {
  pulled: number;
  tables: Record<"visits" | "visit_json_state", number>;
}

/**
 * Vide le delta serveur → local pour les tables principales d'un user.
 * Ne touche PAS aux messages (gérés par useMessagesSync, lazy par VT).
 */
export async function runPullOnce(
  supabase: PullSupabaseLike,
  userId: string,
): Promise<PullOnceResult> {
  const tables = { visits: 0, visit_json_state: 0 };

  tables.visits = await pullVisits(supabase, userId);
  tables.visit_json_state = await pullVisitJsonStates(supabase, userId);

  return { pulled: tables.visits + tables.visit_json_state, tables };
}

async function pullVisits(
  supabase: PullSupabaseLike,
  userId: string,
): Promise<number> {
  const cursorKey = SyncStateKey.visits();
  const cursor = await getLastPulledAt(cursorKey);

  let query = supabase
    .from("visits")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });

  if (cursor) {
    query = query.gt("updated_at", cursor).limit(PULL_LIMIT);
  } else {
    // Hydration initiale : on tire jusqu'à HYDRATION_LIMIT.
    query = query.limit(HYDRATION_LIMIT);
  }

  const { data, error } = await query;
  if (error) throw new Error(`pullVisits: ${error.message}`);
  if (!data || data.length === 0) {
    // Premier pull sans données : on pose tout de même un curseur
    // (ISO du moment) pour éviter de re-tirer en mode hydration la
    // prochaine fois.
    if (!cursor) {
      await setLastPulledAt(cursorKey, new Date().toISOString());
    }
    return 0;
  }

  for (const raw of data) {
    await upsertVisitFromRemote(raw as unknown as VisitRow);
  }

  // Curseur = updated_at du DERNIER row (data trié ASC).
  const last = data[data.length - 1] as { updated_at?: string };
  if (last?.updated_at) {
    await setLastPulledAt(cursorKey, last.updated_at);
  }
  return data.length;
}

async function pullVisitJsonStates(
  supabase: PullSupabaseLike,
  userId: string,
): Promise<number> {
  // visit_json_state n'a pas de colonne updated_at — on pull par created_at.
  const cursorKey = SyncStateKey.visitJsonState();
  const cursor = await getLastPulledAt(cursorKey);

  let query = supabase
    .from("visit_json_state")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (cursor) {
    query = query.gt("created_at", cursor).limit(PULL_LIMIT);
  } else {
    query = query.limit(HYDRATION_LIMIT);
  }

  const { data, error } = await query;
  if (error) throw new Error(`pullVisitJsonStates: ${error.message}`);
  if (!data || data.length === 0) {
    if (!cursor) {
      await setLastPulledAt(cursorKey, new Date().toISOString());
    }
    return 0;
  }

  for (const raw of data) {
    await upsertJsonStateFromRemote(raw as unknown as VisitJsonStateRow);
  }
  const last = data[data.length - 1] as { created_at?: string };
  if (last?.created_at) {
    await setLastPulledAt(cursorKey, last.created_at);
  }
  return data.length;
}

/**
 * Pull lazy des messages d'une VT (utilisé par useMessagesSync à
 * l'ouverture de la route /visits/$visitId).
 *
 * Différence avec runPullOnce : pas de stockage de curseur dans
 * `sync_state` — on se base sur `created_at` du dernier message
 * local pour la VT (ce qui est plus précis si l'utilisateur a
 * supprimé sa cache puis rouvre la même VT).
 */
export async function pullMessagesForVisit(
  supabase: PullSupabaseLike,
  visitId: string,
  options: { sinceIso?: string | null } = {},
): Promise<number> {
  const since = options.sinceIso ?? null;

  let query = supabase
    .from("messages")
    .select("*")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gt("created_at", since).limit(PULL_LIMIT);
  } else {
    query = query.limit(HYDRATION_LIMIT);
  }

  const { data, error } = await query;
  if (error) throw new Error(`pullMessagesForVisit: ${error.message}`);
  if (!data || data.length === 0) return 0;

  for (const raw of data) {
    await upsertMessageFromRemote(raw as unknown as MessageRow);
  }
  return data.length;
}
