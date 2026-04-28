# Plan — Réduction massive du payload LLM (–~50%)

## Objectif

Ne plus envoyer au LLM que **3 choses** :

1. **Le prompt système** (statique, enrichi du schéma canonique en clair)
2. **Le JSON state complet** (source de vérité — sa structure dit tout)
3. **L'historique des messages** (compression progressive 9 passes déjà en place)

Tout le reste (`schema_map`, `attachments_context`, `pending_attachments`, `nomenclature_hints`, `state_summary` redondant) **disparaît du bundle**.

## Nouveau ContextBundle

```ts
interface ContextBundle {
  schema_version: number;
  visit: { id; mission_type; building_type };
  state: VisitJsonState;             // JSON state complet, tel quel
  recent_messages: RecentMessage[];  // compression progressive existante
}
```

Les descriptions IA des photos passent désormais via les **messages assistant `photo_caption`** (déjà émis par `maybeEmitPhotoCaption` dans `engine.llm.ts`), donc elles arrivent au LLM via `recent_messages` — plus besoin de bloc `attachments_context` dédié.

## Changements détaillés

### 1. Types — `src/shared/llm/types.ts`

`ContextBundle` : retirer `state_summary`, `attachments_context`, `pending_attachments`, `schema_map`, `nomenclature_hints`. Ajouter `state: VisitJsonState`.

### 2. Builder — `src/shared/llm/context/builder.ts`

- Retirer `attachmentDescriptions`, `pendingAttachments`, `nomenclatureHints` de `BuildContextInput` (ou les ignorer si call sites les passent encore).
- Plus d'import de `buildSchemaMap` / `compactSchemaMap`.
- Plus de `summarizeState` — on injecte le state complet sous la clé `state`.
- Garde `maxRecentMessages` (Infinity par défaut).

### 3. Engine — `src/shared/sync/engine.llm.ts`

- Retirer le calcul de `attachmentDescriptions`, `pendingAttachments`, et la boucle `recentAttachments` qui n'a plus d'utilité (lignes ~339-389).
- L'appel `buildContextBundle` se réduit à `{ visit, latestState, recentMessages }`.
- Conserver le check de blocage `ai_description_pending` sur les attachments du **message courant** (lignes 318-326) : indispensable pour ne pas envoyer un message dont les photos n'ont pas encore généré leur `photo_caption` assistant qui sert maintenant de description IA.

### 4. Compression — `src/shared/llm/context/compress.ts`

- Plus de `attachments_context` à traiter dans les passes.
- Réordonner les passes : OCR-related (1, 3) supprimées. Reste 2a, 2b, 2c, 2d, 2e, puis une nouvelle passe 4 = strip détails du `state` (drop `custom_fields[]`, drop sections vides) — best-effort.
- Mettre à jour `passStripDetails` pour opérer sur `state` (retirer `notes`, `preconisations` non essentiels).
- Adapter le test `compress.test.ts` :
  - Supprimer cas (b) gros OCR (n'existe plus).
  - Garder cas (a) léger, (c) historique long, (d) bundle énorme, (e) ordre chronologique.

### 5. Prompt système — `src/shared/llm/prompts/system-unified.ts` + copie inline `supabase/functions/vtu-llm-agent/index.ts`

Réécrire entièrement avec :
- Suppression de toute mention `schema_map`, `attachments_context`, `pending_attachments`.
- Nouvelle section **"## SCHÉMA CANONIQUE DU JSON STATE"** listant en dur :
  - Sections plates : `meta`, `building`, `envelope` (avec sous-objets `murs|toiture|plancher_bas|ouvertures`).
  - Collections (path → keys de l'item canonique) : `heating.installations`, `ecs.installations`, `ventilation.installations`, `energy_production.installations`, `industriel_processes.installations`, `tertiaire_hors_cvc.installations`, `pathologies.items`, `preconisations.items`, `notes.items`, `custom_observations.items`.
  - Pour chaque collection : un exemple d'item vide montrant les champs canoniques (cf. `json-state.sections.ts`).
- Règles de lecture du JSON :
  - "Une collection à `[]` existe et attend des entrées."
  - "Un `Field<T>` à `value: null` existe et attend une valeur."
  - "Pour patcher une entrée existante : utilise son `id` (UUID listé dans le state). JAMAIS d'index `[N]`."
  - "Une info hors schéma → `custom_fields` (snake_case)."
  - "Tu n'inventes JAMAIS un path absent du schéma."
- Règle anti-hallucination attachments simplifiée :
  - "Pour chaque attachment cité dans `recent_messages`, vérifie qu'un message assistant `photo_caption` ultérieur fournit une description. Sinon : confirme la réception, n'invente JAMAIS le contenu."

### 6. Edge function — `supabase/functions/vtu-llm-agent/index.ts`

- Mettre à jour la copie inline de `SYSTEM_UNIFIED`.
- Dans `buildPromptAndHistory` :
  - Retirer le `guardBlock` calculé sur `pending_attachments` (la règle est dans le système).
  - Retirer la suppression `delete bundleForPrompt.recent_messages` qui n'a plus de sens si on garde la promotion multi-tour ; **arbitrage** : conserver la promotion en multi-tour (utile pour références pronominales) ET retirer `recent_messages` du JSON dump (déjà le cas).
- Dans le handler : adapter `coalescePositionalPatches` pour lire `knownCollections` depuis une **liste hardcodée** (10 collections du schéma canonique) au lieu de `bundle.schema_map.collections`.
- Le `apply layer` côté client reste strict — garde `path_not_in_schema`, `positional_index_forbidden`, `unknown_collection`.

### 7. Server function `extractFromMessage` / `conversationalQuery` — `src/server/llm.functions.ts`

- Retirer les champs supprimés du `ContextBundleSchema` Zod.
- Ajouter `state: z.unknown()` (validation lâche, le state est déjà validé en amont).

### 8. Helpers prompt — `src/server/llm.prompt-builders.ts`

- Supprimer `buildPendingAttachmentsGuard` et son usage dans `buildUserPromptExtract` / `buildUserPromptConversational`. Les prompts deviennent : header + JSON dump du bundle + message.
- Adapter `src/server/__tests__/buildUserPrompt.test.ts` en conséquence (supprimer les tests de guard).

### 9. Inspecteur Dev — `src/routes/_authenticated/settings.dev.tsx`

- Mettre à jour les `JsonAccordion` du `CallInspector` :
  - Retirer "Schema map" et "Descriptions photos incluses".
  - Ajouter "JSON state envoyé" qui lit `bundle.state`.
- Mettre à jour le bloc "Compression progressive" (passes OCR retirées).
- Ajouter une note "Payload allégé : 3 blocs seulement (visit, state, recent_messages)."

### 10. Tests Vitest

Fichiers à mettre à jour :
- `src/shared/llm/__tests__/context.test.ts` — retirer assertion sur `attachments_context`, ajouter assertion sur `bundle.state`.
- `src/shared/llm/context/__tests__/compress.test.ts` — retirer cas OCR, adapter helper `makeBundle`.
- `src/server/__tests__/buildUserPrompt.test.ts` — supprimer tests guard, adapter prompts.
- Vérifier que les ~270 tests existants restent verts.

## Hors-scope (volontaire)

- Branchement nomenclature canonique (PPPT / DTG / 3CL DPE).
- Création de la collection `attachments_log.items` dans le JSON state.
- Synthétiseur cross-photos.
- Filtrage du state par section pertinente (envoi total pour l'instant).

## Risques assumés

- **Taille du state** : un state V2 entièrement rempli reste plus petit qu'un schema_map complet + attachments_context. Net positif.
- **Photos sans caption assistant** : déjà gardé par le check `ai_description_pending` côté engine.
- **Régression `path_not_in_schema`** : le LLM dispose maintenant du schéma en clair (prompt système) ET de la structure du state — meilleure orientation qu'avec `schema_map` séparé.

## Validation finale (manuelle)

1. Message texte simple → Inspecteur IA montre `state` dans le bundle, plus aucun `schema_map / attachments_context / pending_attachments`.
2. Photo + texte → l'extraction propose un `insert_entry` correctement formé (description disponible via le message assistant `photo_caption`).
3. "ajoute une PAC air-eau Daikin 8 kW" → un `insert_entry` complet sur `heating.installations` (pas de `fields: {}`).
