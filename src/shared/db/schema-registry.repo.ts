/**
 * VTU — Repository schema_registry (Phase 2 It. 7)
 *
 * Doctrine (KNOWLEDGE §13) :
 *  - URN DÉTERMINISTE : `urn:vtu:schema:{canonical_section_path}.{field_key}:v1`
 *    calculable sans réseau → garantit l'offline-first.
 *  - section_path TOUJOURS canonisé (collections : ecs[] pas ecs[0]) AVANT
 *    construction d'URN ou query (sinon 2 ballons ECS = 2 URN différents
 *    pour le même champ métier → explosion du registry en doublons).
 *  - resolveOrCreateRegistryEntry est le SEUL point d'entrée (via
 *    createCustomField, json-state.factory.ts) pour créer un CustomField.
 *  - Mirror Dexie complet : matching exact offline + optimistic local upsert.
 *  - Multi-tenant ready (organization_id nullable) : Phase 4 plug & play.
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalSchemaRegistryEntry } from "./schema";
import type {
  SchemaRegistryEntry,
  SchemaRegistryValueType,
  SyncQueueEntry,
} from "@/shared/types";

// ---------------------------------------------------------------------------
// Canonicalisation + URN (purs, synchrones, offline-friendly)
// ---------------------------------------------------------------------------

/**
 * Canonise un sectionPath en remplaçant les indexes numériques par []
 * pour garantir qu'un même champ métier dans une collection partage un
 * unique registry_urn indépendamment de sa position.
 *
 *   "ecs[0].calorifuge_material"  → "ecs[].calorifuge_material"
 *   "cvc.heating.installations[3].power_kw"
 *     → "cvc.heating.installations[].power_kw"
 *   "building.construction_year"  (non-collection) → inchangé
 *   "a[0].b[1].c"                 → "a[].b[].c"
 */
export function canonicalizeSectionPath(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

/**
 * Construit l'URN STABLE d'un champ métier. Pattern figé `:v1` côté code :
 * un bump `:v2` ne sera fait que si on casse la sémantique (ex: changement
 * de value_type). Voir KNOWLEDGE §13.
 */
export function buildRegistryUrn(
  sectionPath: string,
  fieldKey: string,
): string {
  const canonical = canonicalizeSectionPath(sectionPath);
  return `urn:vtu:schema:${canonical}.${fieldKey}:v1`;
}

// ---------------------------------------------------------------------------
// Type structurel mock-friendly (dette KNOWLEDGE §10)
// ---------------------------------------------------------------------------

/**
 * Sous-ensemble minimal de l'API Supabase utilisé par le repository.
 * On reste compatible avec le vrai SupabaseClient mais on facilite les
 * mocks pour les tests (cf. SyncSupabaseLike, PullSupabaseLike).
 */
export interface SchemaRegistrySupabaseLike {
  from(table: string): SchemaRegistryQueryBuilder;
  rpc<T = unknown>(
    fn: string,
    params: Record<string, unknown>,
  ): PromiseLike<{
    data: T | null;
    error: { code?: string; message: string } | null;
  }>;
}

interface SchemaRegistryQueryBuilder {
  select(columns: string): SchemaRegistryQueryBuilder;
  insert(payload: Record<string, unknown>): SchemaRegistryQueryBuilder;
  eq(column: string, value: string): SchemaRegistryQueryBuilder;
  maybeSingle(): PromiseLike<{
    data: SchemaRegistryEntry | null;
    error: { code?: string; message: string } | null;
  }>;
  single(): PromiseLike<{
    data: SchemaRegistryEntry | null;
    error: { code?: string; message: string } | null;
  }>;
}

// ---------------------------------------------------------------------------
// Mirror Dexie — helpers locaux
// ---------------------------------------------------------------------------

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true; // SSR : on assume online
  return navigator.onLine;
}

async function findLocalRegistryByUrn(
  registry_urn: string,
): Promise<LocalSchemaRegistryEntry | undefined> {
  const db = getDb();
  return db.schema_registry.where("registry_urn").equals(registry_urn).first();
}

interface UpsertLocalParams {
  registry_urn: string;
  section_path: string; // doit être déjà canonisé
  field_key: string;
  label_fr: string;
  value_type: SchemaRegistryValueType;
  unit?: string | null;
  ai_suggested: boolean;
  user_id: string;
}

/**
 * Crée localement une entrée registry en attente de sync.
 * Utilisé en mode offline OU en fallback erreur réseau.
 * `id` est un UUID local (sera remplacé par l'id serveur à la sync si
 * un autre client a déjà créé la même entrée).
 */
async function upsertLocalRegistryPending(
  params: UpsertLocalParams,
): Promise<LocalSchemaRegistryEntry> {
  const db = getDb();
  // Déduplication locale : si même URN déjà présent, on retourne l'existant.
  const existing = await findLocalRegistryByUrn(params.registry_urn);
  if (existing) return existing;

  const now = new Date().toISOString();
  const id = uuidv4();
  const local: LocalSchemaRegistryEntry = {
    id,
    user_id: params.user_id,
    organization_id: null,
    registry_urn: params.registry_urn,
    section_path: params.section_path,
    field_key: params.field_key,
    label_fr: params.label_fr,
    value_type: params.value_type,
    unit: params.unit ?? null,
    enum_values: [],
    synonyms: [],
    usage_count: 1,
    first_seen_at: now,
    promoted_at: null,
    ai_suggested: params.ai_suggested,
    description: null,
    parent_concept: null,
    semantic_embedding: null,
    status: "candidate",
    created_at: now,
    updated_at: now,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };
  await db.schema_registry.put(local);

  // Enqueue dans sync_queue (le payload exclut id local + champs sync).
  const queueEntry: SyncQueueEntry = {
    table: "schema_registry",
    op: "insert",
    row_id: id,
    payload: {
      id,
      user_id: params.user_id,
      registry_urn: params.registry_urn,
      section_path: params.section_path,
      field_key: params.field_key,
      label_fr: params.label_fr,
      value_type: params.value_type,
      unit: params.unit ?? null,
      ai_suggested: params.ai_suggested,
      usage_count: 1,
    },
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };
  await db.sync_queue.add(queueEntry);

  return local;
}

/**
 * Sync mirror Dexie depuis une ligne serveur (utilisé après un INSERT
 * en ligne réussi, ou par le pull si on l'ajoute un jour).
 */
async function upsertLocalRegistryFromRemote(
  row: SchemaRegistryEntry,
): Promise<void> {
  const db = getDb();
  const local: LocalSchemaRegistryEntry = {
    ...row,
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: new Date().toISOString(),
  };
  await db.schema_registry.put(local);
}

// ---------------------------------------------------------------------------
// resolveOrCreateRegistryEntry — POINT D'ENTRÉE UNIQUE
// ---------------------------------------------------------------------------

export interface ResolveOrCreateParams {
  sectionPath: string;
  fieldKey: string;
  labelFr: string;
  valueType: SchemaRegistryValueType;
  unit?: string | null;
  aiSuggested: boolean;
  /** ID utilisateur courant (RLS user_id). Requis pour Supabase + offline. */
  userId: string;
}

export interface ResolveOrCreateResult {
  /** TOUJOURS retourné (déterministe, calculable offline). */
  registry_urn: string;
  /** UUID serveur. `null` si offline ou en attente de sync. */
  registry_id: string | null;
  /** `true` si la création a été tentée (vs match d'une entrée existante). */
  is_new: boolean;
  /** Entrées proches détectées par fuzzy match (via RPC find_similar_schema_fields). */
  similar_existing: SchemaRegistryEntry[];
  /** `true` tant que la sync mirror Dexie → Supabase n'est pas terminée. */
  offline_pending: boolean;
}

/**
 * Résout ou crée une entrée schema_registry. SEUL point d'entrée pour
 * créer un CustomField (via createCustomField, json-state.factory.ts).
 *
 * Workflow online :
 *   1. Match exact local (mirror Dexie déjà sync)
 *   2. Match exact serveur via RLS-scoped SELECT
 *   3. Fuzzy match via RPC `find_similar_schema_fields` (info pour UI/IA)
 *   4. INSERT (idempotent grâce à UNIQUE(user_id, registry_urn))
 *   5. Conflict 23505 = race → re-fetch et merge
 *
 * Workflow offline (ou erreur réseau) :
 *   1. URN déterministe calculé localement
 *   2. Mirror Dexie + enqueue sync_queue
 *   3. Retourne offline_pending: true
 */
export async function resolveOrCreateRegistryEntry(
  supabase: SchemaRegistrySupabaseLike,
  params: ResolveOrCreateParams,
): Promise<ResolveOrCreateResult> {
  const canonical_path = canonicalizeSectionPath(params.sectionPath);
  const registry_urn = buildRegistryUrn(canonical_path, params.fieldKey);

  const enqueueAndReturn = async (): Promise<ResolveOrCreateResult> => {
    const local = await upsertLocalRegistryPending({
      registry_urn,
      section_path: canonical_path,
      field_key: params.fieldKey,
      label_fr: params.labelFr,
      value_type: params.valueType,
      unit: params.unit ?? null,
      ai_suggested: params.aiSuggested,
      user_id: params.userId,
    });
    return {
      registry_urn,
      // En offline, on a un id LOCAL (UUID) — on ne l'expose pas comme
      // registry_id côté serveur tant que la sync n'a pas confirmé.
      // Mais le caller a besoin d'une référence stable : on retourne null
      // pour signaler l'attente, l'URN suffit pour la traçabilité.
      registry_id: null,
      is_new: local.usage_count === 1,
      similar_existing: [],
      offline_pending: true,
    };
  };

  if (!isOnline()) return enqueueAndReturn();

  try {
    // 1. Match exact local d'abord (matching offline-friendly)
    const localExact = await findLocalRegistryByUrn(registry_urn);
    if (localExact && localExact.sync_status === "synced") {
      // Increment atomique côté serveur (anti race-condition)
      await supabase.rpc("increment_registry_usage", {
        p_registry_id: localExact.id,
      });
      return {
        registry_urn,
        registry_id: localExact.id,
        is_new: false,
        similar_existing: [],
        offline_pending: false,
      };
    }

    // 2. Match exact serveur (RLS scope user_id automatiquement)
    const remoteExactRes = await supabase
      .from("schema_registry")
      .select("*")
      .eq("user_id", params.userId)
      .eq("registry_urn", registry_urn)
      .maybeSingle();

    if (remoteExactRes.error) throw remoteExactRes.error;

    if (remoteExactRes.data) {
      const remote = remoteExactRes.data;
      await supabase.rpc("increment_registry_usage", {
        p_registry_id: remote.id,
      });
      await upsertLocalRegistryFromRemote(remote);
      return {
        registry_urn,
        registry_id: remote.id,
        is_new: false,
        similar_existing: [],
        offline_pending: false,
      };
    }

    // 3. Fuzzy match via RPC (pour info UI/IA, non bloquant)
    const fuzzyRes = await supabase.rpc<SchemaRegistryEntry[]>(
      "find_similar_schema_fields",
      {
        p_user_id: params.userId,
        p_section_path: canonical_path,
        p_query: params.labelFr,
      },
    );
    const similar_existing = fuzzyRes.data ?? [];

    // 4. INSERT (idempotent grâce à UNIQUE(user_id, registry_urn))
    const id = uuidv4();
    const insertRes = await supabase
      .from("schema_registry")
      .insert({
        id,
        user_id: params.userId,
        registry_urn,
        section_path: canonical_path,
        field_key: params.fieldKey,
        label_fr: params.labelFr,
        value_type: params.valueType,
        unit: params.unit ?? null,
        ai_suggested: params.aiSuggested,
        usage_count: 1,
      })
      .select("*")
      .single();

    if (insertRes.error) {
      // 5. Conflict 23505 = race condition → re-fetch et merge
      if (insertRes.error.code === "23505") {
        const refetch = await supabase
          .from("schema_registry")
          .select("*")
          .eq("user_id", params.userId)
          .eq("registry_urn", registry_urn)
          .single();
        if (refetch.data) {
          await upsertLocalRegistryFromRemote(refetch.data);
          return {
            registry_urn,
            registry_id: refetch.data.id,
            is_new: false,
            similar_existing,
            offline_pending: false,
          };
        }
      }
      throw insertRes.error;
    }

    if (insertRes.data) {
      await upsertLocalRegistryFromRemote(insertRes.data);
      return {
        registry_urn,
        registry_id: insertRes.data.id,
        is_new: true,
        similar_existing,
        offline_pending: false,
      };
    }

    // Cas improbable : pas d'erreur mais pas de data → on bascule offline.
    return enqueueAndReturn();
  } catch {
    // Toute erreur réseau / RPC : fallback offline-first.
    return enqueueAndReturn();
  }
}

// ---------------------------------------------------------------------------
// findSimilarFields — délègue à la RPC, canonise toujours
// ---------------------------------------------------------------------------

export async function findSimilarFields(
  supabase: SchemaRegistrySupabaseLike,
  params: {
    sectionPath: string;
    query: string;
    userId: string;
  },
): Promise<SchemaRegistryEntry[]> {
  const canonical = canonicalizeSectionPath(params.sectionPath);
  const res = await supabase.rpc<SchemaRegistryEntry[]>(
    "find_similar_schema_fields",
    {
      p_user_id: params.userId,
      p_section_path: canonical,
      p_query: params.query,
    },
  );
  return res.data ?? [];
}

// Re-exports pour les tests + autres modules.
export { findLocalRegistryByUrn, upsertLocalRegistryFromRemote, upsertLocalRegistryPending };
