## Itération 7 V2 — Schéma JSON dynamique + Schema Registry offline-first

Plan définitif intégrant les 4 blocages (URN scopé, canonicalize, offline-first, RPC fuzzy) + 3 précisions (createCustomField forcé, schema_version=2, RPC increment atomique).

### Confirmation des 6 points

1. ✅ `registry_urn` scoped `(user_id, registry_urn)` — pas global
2. ✅ `canonicalizeSectionPath` AVANT toute opération registry (`buildRegistryUrn`, resolve, fuzzy, increment)
3. ✅ Offline-first via URN déterministe + enqueue `schema_registry_upsert`
4. ✅ RPC Postgres pour fuzzy search (`find_similar_schema_fields`) ET increment atomique (`increment_registry_usage`)
5. ✅ `createCustomField` PUBLIQUE force `resolveOrCreateRegistryEntry` ; `_buildCustomFieldSkeleton` PRIVÉ
6. ✅ `schema_version: z.literal(2)` ; migrate v1→v2 explicite ; `isAlreadyMigrated` = `raw.schema_version === 2`

### Décision validée — Sync registry : **Option A (mirror Dexie complet)**

Table Dexie `schema_registry` v3 + entry queue, l'engine existant (`markLocalRow*`) fonctionne sans refacto majeure du switch — juste ajouter le cas dans `tableForName`. Bonus : l'UI peut matcher offline contre les entrées déjà sync.

---

### 1. Migration SQL 003 (schema_registry + 2 RPC)

```sql
CREATE TABLE public.schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- Pas de FK vers auth.users (schéma Supabase réservé). RLS isole.
  organization_id UUID NULL,  -- Phase 4 : multi-tenant. Phase 2 : toujours null.
  registry_urn TEXT NOT NULL,
  -- Pattern : urn:vtu:schema:{canonical_section_path}.{field_key}:v1
  field_key TEXT NOT NULL,
  section_path TEXT NOT NULL,  -- TOUJOURS canonisé (ecs[] pas ecs[0])
  label_fr TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string','number','boolean','enum','multi_enum')),
  unit TEXT,
  enum_values JSONB DEFAULT '[]'::jsonb,
  synonyms JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at TIMESTAMPTZ,
  ai_suggested BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  parent_concept TEXT,
  semantic_embedding JSONB,  -- It. 10 : Gemini embeddings
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','active','deprecated','promoted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- DEUX contraintes user-scoped (équivalentes sémantiquement, lookups différents)
  UNIQUE (user_id, registry_urn),
  UNIQUE (user_id, section_path, field_key)
);

CREATE INDEX idx_schema_registry_user_section ON public.schema_registry (user_id, section_path);
CREATE INDEX idx_schema_registry_usage ON public.schema_registry (usage_count DESC);
CREATE INDEX idx_schema_registry_status ON public.schema_registry (status) WHERE status != 'deprecated';

ALTER TABLE public.schema_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schema_registry_select_own" ON public.schema_registry
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schema_registry_insert_own" ON public.schema_registry
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schema_registry_update_own" ON public.schema_registry
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger (réutilise touch_updated_at existant)
CREATE TRIGGER schema_registry_touch_updated_at
  BEFORE UPDATE ON public.schema_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RPC 1 : fuzzy search (SECURITY INVOKER → respecte RLS)
CREATE OR REPLACE FUNCTION public.find_similar_schema_fields(
  p_user_id UUID, p_section_path TEXT, p_query TEXT
) RETURNS SETOF public.schema_registry
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.schema_registry
  WHERE user_id = p_user_id AND section_path = p_section_path
    AND LENGTH(p_query) >= 2
    AND (label_fr ILIKE '%' || p_query || '%'
      OR field_key ILIKE '%' || p_query || '%'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(synonyms) syn
                 WHERE syn ILIKE '%' || p_query || '%'))
  ORDER BY usage_count DESC LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.find_similar_schema_fields TO authenticated;

-- RPC 2 : increment atomique (anti race-condition)
CREATE OR REPLACE FUNCTION public.increment_registry_usage(p_registry_id UUID)
RETURNS public.schema_registry
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.schema_registry
  SET usage_count = usage_count + 1
  WHERE id = p_registry_id AND user_id = auth.uid()
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION public.increment_registry_usage TO authenticated;

COMMENT ON TABLE public.schema_registry IS
  'Table sociale du vocabulaire métier user-scoped (Phase 4 : org-scoped).
   section_path TOUJOURS canonisé (collections : ecs[] pas ecs[0]).
   registry_urn = ancre stable à vie. Voir KNOWLEDGE.md §13.';
```

### 2. Fichiers créés

**`src/shared/types/json-state.bounds.ts`**
- `makeYearBound(min, offsetMax = 2)` runtime-evaluated
- Constantes : `EFFICIENCY_PCT_BOUND` (0-100), `POSITIVE_NUMBER`, `NON_NEGATIVE_INT`
- En-tête doctrine "rejette hallucinations IA, jamais bâtiment français réel" (réf KNOWLEDGE §12)

**`src/shared/types/json-state.custom-field.ts`**
- `CustomFieldValueTypeSchema` : `z.enum(["string","number","boolean","enum","multi_enum"])`
- `CustomFieldSchema` : id UUID, key/label/value/value_type/enum_values/unit/ai_suggested/promoted_to_structural (en `Field<T>`), `registry_urn: z.string()` (toujours présent — déterministe), `registry_id: z.string().uuid().nullable()` (null si offline_pending), `offline_pending: z.boolean().default(false)`, `created_at`, `created_by_message_id`
- Export PRIVÉ `_buildCustomFieldSkeleton(params)` — builder bas-niveau, NE PAS appeler en dehors de `createCustomField`

**`src/shared/types/json-state.sections.ts`**
- Schémas Zod par section, tous `.default(makeEmpty*())` :
  - `MetaSchemaV2` étendu : `building_typology`, `building_typology_other`, `calculation_method` (null par défaut), `calculation_method_other`, `external_source` (`Field<"manual"|"import">`), `reference_id`, `imported_at`, `needs_reclassification: z.boolean().default(false)` (boolean nu, pas Field)
  - `BuildingSchema` (commentaire en tête : "`meta.building_typology` est la SoT ; ici décrit le bâti physique") — `construction_year` via `makeYearBound(-500)`, `surface_habitable_m2`/`surface_terrain_m2` `.positive()`, `nb_niveaux`/`nb_logements` `.int().nonnegative()`, `wall_material_value`/`wall_material_other`, `custom_fields: CustomFieldSchema[].default([])`
  - `EnvelopeSchema` (murs, toiture, plancher_bas, ouvertures — chacun avec `*_value/_other` + custom_fields)
  - `HeatingSchema` (`installations: HeatingInstallationSchema[]`, custom_fields)
  - `EcsSchema`, `VentilationSchema`, `EnergyProductionSchema`, `IndustrielProcessesSchema`, `TertiaireHorsCvcSchema`
  - `PathologiesSchema` (`items: PathologyEntrySchema[]`)
  - `PreconisationsSchema` (`items: PreconisationEntrySchema[]`)
  - `NotesSchema` (`items: NoteEntrySchema[]` — id UUID, content `Field<string>`, created_at, related_message_id nullable)
  - `CustomObservationsSchema` (`items: CustomObservationEntrySchema[]`)
- Convention `*_other` : commentaire au-dessus de chaque champ
  ```ts
  // CONVENTION : si {parent}.value === "autre", alors {parent}_other.value DOIT être non-null.
  // Validation UI-only (pas Zod) — l'Edge Function update-json-state DOIT respecter cette règle.
  ```

**`src/shared/types/json-state.migrate.ts`**
- `isAlreadyMigrated(raw)` → `(raw as any)?.schema_version === 2`
- `migrateVisitJsonState(raw): VisitJsonState`
  1. Si `isAlreadyMigrated(raw)` → parse direct via `VisitJsonStateSchema` (idempotent)
  2. Si `raw.schema_version !== 1` → throw (futur bump explicite)
  3. Hydrate sections manquantes via `makeEmpty*()`
  4. Mappe `meta.building_type` v1 → `meta.building_typology` v2 :
     - `maison_individuelle → maison`, `appartement → appartement`, `tertiaire → tertiaire`, `autre → autre`
     - `immeuble → null` + `meta.needs_reclassification = true`
  5. `meta.calculation_method = null` + flag si null
  6. `meta.external_source = {value:"manual", source:"init", confidence:"high"}`, `reference_id`/`imported_at` = emptyField
  7. Toutes nouvelles collections initialisées à `[]`
  8. Force `schema_version: 2`
  9. Parse final via `VisitJsonStateSchema`

**`src/shared/db/schema-registry.repo.ts`** (clé du V2)

```ts
// PUR, SYNCHRONE, OFFLINE-FRIENDLY
export function canonicalizeSectionPath(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

export function buildRegistryUrn(sectionPath: string, fieldKey: string): string {
  const canonical = canonicalizeSectionPath(sectionPath);
  return `urn:vtu:schema:${canonical}.${fieldKey}:v1`;
}

// Type structurel mock-friendly (dette KNOWLEDGE §10)
export interface SchemaRegistrySupabaseLike {
  from(table: string): { /* select/eq/upsert minimal */ };
  rpc(fn: string, params: Record<string, unknown>): PromiseLike<{
    data: SchemaRegistryEntry[] | SchemaRegistryEntry | null;
    error: { code?: string; message: string } | null;
  }>;
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
}

export async function resolveOrCreateRegistryEntry(params: {
  sectionPath: string; fieldKey: string; labelFr: string;
  valueType: CustomFieldValueType; unit?: string | null; aiSuggested: boolean;
}): Promise<{
  registry_urn: string;          // TOUJOURS retourné (déterministe)
  registry_id: string | null;    // null si offline ou en attente
  is_new: boolean;
  similar_existing: SchemaRegistryEntry[];
  offline_pending: boolean;
}> {
  const canonical_path = canonicalizeSectionPath(params.sectionPath);
  const registry_urn = buildRegistryUrn(canonical_path, params.fieldKey);

  const enqueueAndReturn = async () => {
    // 1. Mirror local Dexie (Option A) : écrit immédiatement dans schema_registry locale
    //    avec sync_status="pending", id=uuidv4() (id local en attendant id serveur)
    // 2. Enqueue sync_queue : op "insert", table "schema_registry", payload upsert
    await upsertLocalRegistryPending({ registry_urn, section_path: canonical_path, ...params });
    return { registry_urn, registry_id: null, is_new: true, similar_existing: [], offline_pending: true };
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) return enqueueAndReturn();

  try {
    // Match exact local d'abord (mirror Dexie peuplé par pull)
    const localExact = await findLocalRegistryByUrn(registry_urn);
    if (localExact?.sync_status === "synced") {
      // Increment atomique côté serveur via RPC
      await supabase.rpc("increment_registry_usage", { p_registry_id: localExact.id });
      return { registry_urn, registry_id: localExact.id, is_new: false, similar_existing: [], offline_pending: false };
    }
    // Pas en local → check serveur (RLS scope user_id)
    const { data: remoteExact, error: e1 } = await supabase
      .from("schema_registry").select("*")
      .eq("user_id", userId).eq("registry_urn", registry_urn).maybeSingle();
    if (e1) throw e1;
    if (remoteExact) {
      await supabase.rpc("increment_registry_usage", { p_registry_id: remoteExact.id });
      await upsertLocalRegistryFromRemote(remoteExact);
      return { registry_urn, registry_id: remoteExact.id, is_new: false, similar_existing: [], offline_pending: false };
    }
    // Match fuzzy via RPC
    const { data: similar } = await supabase.rpc("find_similar_schema_fields", {
      p_user_id: userId, p_section_path: canonical_path, p_query: params.labelFr,
    });
    // Création (le caller décidera de fusionner ou non sur similar_existing)
    const id = uuidv4();
    const { data: created, error: e2 } = await supabase.from("schema_registry").insert({
      id, user_id: userId, registry_urn, section_path: canonical_path,
      field_key: params.fieldKey, label_fr: params.labelFr, value_type: params.valueType,
      unit: params.unit ?? null, ai_suggested: params.aiSuggested, usage_count: 1,
    }).select().single();
    if (e2) {
      if (e2.code === "23505") {
        // Race condition : un autre client a inséré le même URN. Re-fetch.
        const { data: refetch } = await supabase.from("schema_registry").select("*")
          .eq("user_id", userId).eq("registry_urn", registry_urn).single();
        if (refetch) {
          await upsertLocalRegistryFromRemote(refetch);
          return { registry_urn, registry_id: refetch.id, is_new: false,
                   similar_existing: similar ?? [], offline_pending: false };
        }
      }
      throw e2;
    }
    await upsertLocalRegistryFromRemote(created);
    return { registry_urn, registry_id: created.id, is_new: true,
             similar_existing: similar ?? [], offline_pending: false };
  } catch {
    // Fallback offline-first sur erreur réseau
    return enqueueAndReturn();
  }
}

// Helper findSimilarFields (utilisé par UI It. 11) — délègue à la RPC
export async function findSimilarFields(sectionPath: string, query: string) {
  const canonical = canonicalizeSectionPath(sectionPath);
  const { data } = await supabase.rpc("find_similar_schema_fields", {
    p_user_id: userId, p_section_path: canonical, p_query: query,
  });
  return data ?? [];
}
```

**`src/shared/types/json-state.factory.ts`** (séparé pour casser cycle d'import)

```ts
// PUBLIC — SEUL point d'entrée pour créer un CustomField
export async function createCustomField(params: {
  sectionPath: string; fieldKey: string; labelFr: string;
  valueType: CustomFieldValueType; value: unknown;
  source: FieldSource; confidence: FieldConfidence; aiSuggested: boolean;
}): Promise<CustomField> {
  const { registry_urn, registry_id, offline_pending } =
    await resolveOrCreateRegistryEntry({
      sectionPath: params.sectionPath, fieldKey: params.fieldKey,
      labelFr: params.labelFr, valueType: params.valueType,
      unit: null, aiSuggested: params.aiSuggested,
    });
  return _buildCustomFieldSkeleton({ ...params, registry_urn, registry_id, offline_pending });
}
```

**`src/domain/nomenclatures/index.ts`** — stub, contrat futur documenté.

**Tests créés** (cumul It. 7 = 36 tests)
- `json-state-bounds.test.ts` (~7) : Tour Montparnasse 59 niveaux ✓, campus 150k m² ✓, chaufferie 5MW ✓, monument 1450 ✓, rejet année 3024, rejet surface négative, rejet efficacité 150%
- `json-state-extended.test.ts` (~12) : structure sections, `*_other` libre, custom_fields[], custom_observations, schema_version=2
- `json-state-migrate.test.ts` (~6) : v1→v2 mapping, immeuble→null+flag, ecs reste [], idempotence (re-run sur v2 = no-op), preserve meta rempli, calculation_method null+flag
- `schema-registry-canonicalize.test.ts` (~4) : ecs[0]→ecs[], cvc.heating.installations[3]→[], préserve sans array, multiple a[0].b[1].c→a[].b[].c
- `schema-registry.test.ts` (~4) : URN déterministe, resolve crée nouveau, resolve match exact local + RPC increment, findSimilarFields délègue à RPC + canonise
- `schema-registry-offline.test.ts` (~3) : offline → URN déterministe + enqueue, fallback erreur réseau → enqueue, handler engine.ts traite `schema_registry insert` idempotent (23505 = succès)

### 3. Fichiers modifiés

**`src/shared/db/schema.ts`** — Dexie v3
- Nouvelle table `schema_registry` : `"id, &registry_urn, section_path, [section_path+field_key], sync_status"`
- `LocalSchemaRegistryEntry = SchemaRegistryEntry & SyncFields`
- Nouvelle version `this.version(3).stores({ schema_registry: "..." })`

**`src/shared/types/db.ts`**
- `SyncQueueTable` étend : `| "schema_registry"`
- Nouveau type `SchemaRegistryEntry` (mirror DB)

**`src/shared/sync/engine.ts`**
- `tableForName` ajoute `case "schema_registry": return db.schema_registry;`
- Le code générique `insert` fonctionne déjà (idempotence 23505 = succès via `UNIQUE (user_id, registry_urn)`)
- Aucun refacto majeur — juste l'ajout du case

**`src/shared/types/json-state.ts`**
- Devient orchestrateur : re-exports + assemblage `VisitJsonStateSchema` racine avec `schema_version: z.literal(2)`
- `createInitialVisitJsonState` produit un state v2 complet, mappe `buildingType` v1→`building_typology` v2

**`src/shared/types/index.ts`** : exports custom-field/sections/bounds/migrate/factory

**`src/shared/db/json-state.repo.ts`** : `upsertJsonStateFromRemote` passe `state` par `migrateVisitJsonState` AVANT `put` (rétrocompat pull cross-device VTs Phase 1)

**`src/shared/db/index.ts`** : exports `schema-registry.repo`

**`src/integrations/supabase/types.ts`** : régénéré automatiquement (table + RPC)

**`KNOWLEDGE.md`** :
- §8 : check `[x] Itération 7 — Schéma JSON dynamique + Schema Registry offline-first`
- §10 : note dette `SchemaRegistrySupabaseLike` (justification = `SyncSupabaseLike`)
- §13 NOUVEAU : "JSON dynamique : architecture et gouvernance" (3 niveaux de métadonnées, registry_urn ancre stable, schema_registry table sociale, anti-prolifération, rapport Word dynamique, MCP Server) + sous-section "Canonicalisation des sectionPath" + sous-section "Offline-first du registry"

### 4. Ordre d'implémentation

1. Migration SQL 003 (table + 2 RPC)
2. Dexie v3 (table `schema_registry` locale)
3. `json-state.bounds.ts` + tests bounds
4. `json-state.custom-field.ts` (`_buildCustomFieldSkeleton` privé)
5. `json-state.sections.ts`
6. Refactor `json-state.ts` (assemblage + `schema_version: 2`)
7. `json-state.migrate.ts` + tests migration
8. `json-state-extended.test.ts`
9. `schema-registry.repo.ts` (canonicalize + buildUrn + resolveOrCreate offline-first + findSimilar via RPC)
10. Tests canonicalize + registry online + registry offline
11. `json-state.factory.ts` (`createCustomField` PUBLIC)
12. Wire `tableForName` dans `engine.ts` + extension `SyncQueueTable`
13. `migrateVisitJsonState` dans `upsertJsonStateFromRemote`
14. `domain/nomenclatures/index.ts` stub
15. KNOWLEDGE.md §8 + §10 + §13
16. `bun run test` (cible 99/99) + `bun run build`

### 5. Récap tests

| Fichier | Tests |
|---|---|
| `json-state-bounds.test.ts` | 7 |
| `json-state-extended.test.ts` | 12 |
| `json-state-migrate.test.ts` | 6 |
| `schema-registry-canonicalize.test.ts` | 4 |
| `schema-registry.test.ts` | 4 |
| `schema-registry-offline.test.ts` | 3 |
| **Total It. 7** | **36** |
| **Cumul Phase 1+It. 7** | **99** |

### 6. Une seule question résiduelle (réponse par défaut prête)

**Q-A : `createCustomField` côté SSR ?** Le `factory.ts` importe `supabase` browser-side et touche `navigator.onLine`. Si jamais une server function (Phase 2 It. 10, Edge Function) a besoin de créer un CustomField, elle ne peut pas appeler `createCustomField` (offline check + Dexie). Proposition : variante serveur `createCustomFieldServer(params, supabaseAdmin)` qui saute le mirror Dexie + le check offline, mais réutilise `buildRegistryUrn`/`canonicalizeSectionPath`/`resolveOrCreateRegistryEntry` côté server (sans la branche enqueue). À implémenter quand It. 10 en aura besoin, pas It. 7. **Pour It. 7 : seule la version client `createCustomField` existe.**

---

**Prêt à coder dès validation Omar. Aucun fichier touché à ce stade.**