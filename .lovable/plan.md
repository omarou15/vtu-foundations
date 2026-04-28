# Plan — Réduction massive du payload LLM (–~50%) + suppression des rejets silencieux

## Objectif

Deux changements couplés :

1. **Bundle minimal** : ne plus envoyer au LLM que `visit` + `state` + `recent_messages` (le schéma canonique passe en dur dans le prompt système).
2. **Confiance totale au LLM** : la couche apply ne rejette plus rien silencieusement. Toute proposition devient une opération présentée sur la carte d'actions ; le user arbitre.

## Partie A — Bundle minimal

### Nouveau ContextBundle

```ts
interface ContextBundle {
  schema_version: number;
  visit: { id; mission_type; building_type };
  state: VisitJsonState;             // JSON state complet, tel quel
  recent_messages: RecentMessage[];  // compression progressive existante
}
```

Disparaissent : `state_summary`, `attachments_context`, `pending_attachments`, `schema_map`, `nomenclature_hints`.

Les descriptions de photos passent désormais par les messages assistant `photo_caption` (déjà émis par l'engine), donc via `recent_messages`.

### Fichiers touchés

- `src/shared/llm/types.ts` — refonte `ContextBundle`.
- `src/shared/llm/context/builder.ts` — ne builde plus que les 4 champs.
- `src/shared/sync/engine.llm.ts` — supprimer collecte `attachmentDescriptions` + `pendingAttachments`. Garder le check `ai_description_pending` sur les attachments du **message courant** (sinon photos parties sans caption).
- `src/shared/llm/context/compress.ts` — retirer passes OCR (`passTrimOcr`, `passDropOcr`). Reste : `passTrimAssistant`, `passTrimUser`, `passLimitMessages50/20/8`, `passStripDetails` (qui opère désormais sur `state`).
- `src/server/llm.functions.ts` — adapter `ContextBundleSchema` Zod.
- `src/server/llm.prompt-builders.ts` — supprimer `buildPendingAttachmentsGuard`.

### Prompt système enrichi

`src/shared/llm/prompts/system-unified.ts` + copie inline `supabase/functions/vtu-llm-agent/index.ts` :

- Suppression mentions `schema_map`, `attachments_context`, `pending_attachments`.
- Nouvelle section **"## SCHÉMA CANONIQUE DU JSON STATE"** listant en dur :
  - Sections plates : `meta`, `building`, `envelope.{murs|toiture|plancher_bas|ouvertures}`.
  - Collections (path → keys d'item) : `heating.installations`, `ecs.installations`, `ventilation.installations`, `energy_production.installations`, `industriel_processes.installations`, `tertiaire_hors_cvc.installations`, `pathologies.items`, `preconisations.items`, `notes.items`, `custom_observations.items`.
  - Pour chaque collection : exemple d'item canonique avec ses champs.
- Règles de lecture : `[]` = collection vide qui attend des entrées ; `value: null` = champ qui attend une valeur ; pour patcher une entrée existante → utilise son `id` UUID lu dans le state ; jamais d'index `[N]`.
- Règle anti-hallucination simplifiée : "vérifie qu'un message assistant `photo_caption` décrit la photo, sinon confirme la réception sans inventer".

### Edge function `vtu-llm-agent`

- Mettre à jour copie inline de `SYSTEM_UNIFIED`.
- `buildPromptAndHistory` : retirer le `guardBlock` calculé sur `pending_attachments`.
- `coalescePositionalPatches` : la liste `knownCollections` devient une **constante hardcodée** (10 collections), au lieu de lire `bundle.schema_map`.
- Conserver la promotion `recent_messages` → multi-tour OpenAI (utile pour références pronominales).

## Partie B — Suppression totale des rejets silencieux (couche apply)

### Doctrine

Le LLM propose, le user dispose. Aucun rejet code-side. Les propositions invalides ne sont pas filtrées : elles sont présentées telles quelles sur la carte d'actions, et le user clique Accepter / Refuser.

### Changements `apply-patches.ts`

- Supprimer rejets : `path_not_in_schema`, `entry_not_found`, `field_not_in_collection_item`, `validated_by_human`, `human_source_prime`, `positional_index_forbidden`.
- Tout patch produit une **proposition applicable** affichée sur la PendingActionsCard :
  - Path positionnel `collection[N].field` → résolu best-effort sur l'entrée à l'index N (créée si absente).
  - Path inconnu → créé à la volée dans le state comme `Field<unknown>` au chemin demandé (le user juge).
  - Conflit avec source humaine → écraseable, badge "écrasera valeur saisie" sur la carte.
- Aucun warning de rejet émis ; à la place : badge informatif sur la proposition.

### Changements `apply-insert-entries.ts`

- Supprimer rejets : `unknown_collection`, `no_valid_fields`.
- Collection inconnue → créée à la volée dans le state (`state[collection] = { items: [] }` ou similaire), entrée insérée. User juge.
- `fields: {}` → entrée vide insérée avec juste un UUID. User complète/rejette.
- Keys non reconnues d'un item → ajoutées comme `custom_fields` de l'entrée (au lieu d'être ignorées).

### Changements `apply-custom-fields.ts`

- Aucune validation snake_case bloquante : toute clé acceptée telle quelle.

### Edge function `vtu-llm-agent`

- Garder `coalescePositionalPatches` (utile pour la lisibilité de la carte : 1 carte par entité plutôt que N patches), mais **plus de filtre `dropDiags`**. Tous les `insert_entries` même `fields: {}` sont transmis.
- Garder la garde anti-mensonge `assistant_message_rewritten` (sécurité UX, pas un rejet) : si le LLM dit "j'ai ajouté X" mais ne produit aucune op, on réécrit le message — c'est de la cohérence textuelle, pas du rejet de proposition.

### PendingActionsCard

- Afficher chaque proposition avec son contexte brut.
- Pour chaque op invalide selon les anciennes règles : badge informatif (`path inconnu`, `écrase valeur saisie`, `collection nouvelle`, etc.) — le user voit, le user décide.
- Boutons Accepter / Refuser inchangés.

## Inspecteur Dev (`settings.dev.tsx`)

- Bloc 1 : retirer "Schema map" et "Descriptions photos". Ajouter "JSON state envoyé".
- Bloc 2 : retirer la table `REJECTION_RULES` (plus aucun rejet). La remplacer par un encart "Confiance totale au LLM — toute proposition est présentée à l'utilisateur".
- Bloc 2 : compression progressive — retirer les passes OCR.

## Tests Vitest

- `context.test.ts` — assertion `bundle.state` au lieu de `attachments_context`.
- `compress.test.ts` — retirer cas OCR.
- `buildUserPrompt.test.ts` — supprimer tests guard.
- `apply-patches.test.ts` — réécrire : asserter que les propositions invalides produisent une proposition + badge, pas un rejet.
- `apply-insert-entries.test.ts` — idem, asserter que `unknown_collection` et `fields: {}` produisent une entrée plutôt qu'un `ignored`.
- ~270 tests existants à passer en revue.

## Hors-scope

- Nomenclature canonique (PPPT / DTG / 3CL DPE).
- Collection `attachments_log.items`.
- Synthétiseur cross-photos.
- Filtrage du state par section pertinente.

## Risques assumés

- **Apply layer permissif** : le state peut contenir transitoirement des paths/collections inattendus tant que le user n'a pas tranché. Acceptable — la PendingActionsCard est le filtre humain.
- **Validation Zod du state** : si le LLM crée une collection hors schéma, le state sort du schéma Zod strict. → On stocke ces ajouts hors-schéma dans une section dédiée `unstructured_proposals: []` jusqu'à validation user, plutôt que de polluer les sections typées.
- **Régression UX** : la PendingActionsCard doit afficher clairement les badges informatifs, sinon le user accepte aveuglément n'importe quoi.

## Validation finale (manuelle)

1. Message texte simple → Inspecteur IA : bundle réduit à `{ schema_version, visit, state, recent_messages }`.
2. "PAC Daikin 8 kW" → 1 carte d'action insert_entry sur `heating.installations`, complète.
3. Path inventé par le LLM → 1 carte d'action avec badge "path inconnu", acceptable ou refusable par le user.
4. Collection inventée → 1 carte d'action avec badge "collection nouvelle", stockée dans `unstructured_proposals` jusqu'à acceptation.
