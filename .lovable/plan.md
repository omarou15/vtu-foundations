## Objectif

Refonte du flux IA en 4 phases déterministes, avec photos toujours traitées identiquement quel que soit le mode Conv/JSON. Aucune écriture structurée tant que le toggle JSON n'a pas été basculé.

Hors-scope : Inspecteur IA, overrides de prompts, audit complet (étape suivante après stabilisation).

---

## Décisions de doctrine (les 8 corrections intégrées)

1. **Batch atomique** : un seul `appendJsonStateVersion` par batch de photos (trigger = toutes les descriptions du même `parent_message_id` prêtes).
2. **Persistance unique** : `attachment_ai_descriptions` = cache local Dexie volatile. `attachments_log.items` (versionné dans `visit_json_state`) = source de vérité long terme. Pas de duplication serveur.
3. **Mapping explicite** : chaque fichier nomenclature exporte `NOMENCLATURE_MAPPING_<METHODE>` qui lie `*_TYPES` → `<section_path>.<field>`.
4. **`required_fields` déclarés dans les nomenclatures** (`pppt_systemes.ts`, `dtg_systemes.ts`, `3cl_dpe/index.ts`), pas dans le loader.
5. **Trigger Phase 3 = toggle JSON seul**. Aucune détection sémantique sur le texte. Filet de sécurité = bouton "tout refuser" sur la carte d'actions.
6. **Synthétiseur cross-photos** reçoit les descriptions complètes (`caption + detailed + ocr + observations`), fusionne les évidences inter-photos.
7. **`kind === "photo"` ⇒ Phase 1 uniquement**, même si le message porte du texte. Pas d'appel `handleExtract`.
8. **Cap 8 KB nomenclature, fallback 3 niveaux** :
   - Niveau 1 : `synonyms` tronqués à 3 par entrée
   - Niveau 2 : drop des `enums` rattachés à des sections déjà remplies dans le state courant
   - Niveau 3 : drop par priorité documentée (ordre fixe par méthode, défini dans `NOMENCLATURE_MAPPING_<METHODE>.priority_order`)

---

## Étape 0 — Brancher la nomenclature canonique

**Fichiers nomenclature** (modifiés) — `methode_energyco/pppt_systemes.ts`, `methode_energyco/dtg_systemes.ts`, `3cl_dpe/index.ts` :

Ajout de deux exports normalisés à la fin de chaque fichier :

```ts
// Mapping explicite *_TYPES → path JSON state
export const NOMENCLATURE_MAPPING_PPPT = {
  entries: [
    { types: TOITURE_TYPES,  field_path: "envelope.toiture.type_value",       priority: 1 },
    { types: FACADE_TYPES,   field_path: "envelope.facade.material_value",    priority: 2 },
    { types: CHAUFFAGE_COLLECTIF_TYPES, field_path: "heating.installations[].type_value", priority: 3 },
    // … toutes les autres
  ],
  priority_order: [/* paths dans l'ordre de drop, du moins critique au plus critique */],
};

export const REQUIRED_FIELDS_PPPT: Record<string, string[]> = {
  "envelope.toiture":      ["type_value", "etat_value", "annee_pose_value"],
  "heating.installations": ["type_value", "puissance_kw_value", "annee_pose_value"],
  // …
};
```

Idem `REQUIRED_FIELDS_DTG`, `REQUIRED_FIELDS_3CL_DPE` et `NOMENCLATURE_MAPPING_DTG`, `NOMENCLATURE_MAPPING_3CL_DPE`.

**Fichier loader : `src/domain/nomenclatures/index.ts`** (réécrit, plus de stub) :

```ts
export interface CompactNomenclatureEntry {
  code: string;
  label_fr: string;
  synonyms: string[]; // ≤ 3 après compression niveau 1
}

export interface CompactNomenclature {
  enums: Record<string /* field_path */, CompactNomenclatureEntry[]>;
  required_fields: Record<string /* section_path */, string[]>;
  size_bytes: number;
  fallback_level: 0 | 1 | 2 | 3;
}

export function getNomenclatureForMission(
  missionType: string | null,
  options?: { stateForCompression?: VisitJsonState },
): CompactNomenclature;
```

Algorithme :
1. Sélectionne `NOMENCLATURE_MAPPING_*` + `REQUIRED_FIELDS_*` selon `missionType` (`pppt`/`dtg`/`dpe`).
2. Construit `enums[field_path] = types.map({code, label_fr, synonyms})`.
3. Mesure `JSON.stringify(...).length`.
4. Si > 8192 → niveau 1 : tronque `synonyms` à 3.
5. Si toujours > 8192 → niveau 2 : pour chaque path, si `stateForCompression` montre que la section est déjà remplie (≥ 1 entrée non vide), drop l'enum.
6. Si toujours > 8192 → niveau 3 : drop par `priority_order` jusqu'à passer sous 8 KB.
7. Retourne `{enums, required_fields, size_bytes, fallback_level}`.

---

## Étape 1 — Section JSON `attachments_log`

**Fichiers modifiés** : `src/shared/types/json-state.sections.ts`, `json-state.ts`, `json-state.factory.ts`, `json-state.migrate.ts`.

Schéma :
```ts
AttachmentLogItemSchema = z.object({
  id: z.string().uuid(),                          // = attachment.id
  parent_message_id: z.string().uuid(),
  short_caption: fieldSchema(z.string()),
  detailed_description: fieldSchema(z.string().nullable()),
  ocr_text: fieldSchema(z.string().nullable()),
  observations: z.array(z.object({
    section_hint: z.string(),
    observation: z.string(),
  })).default([]),
  captured_at: fieldSchema(z.string()),           // ISO
  confidence_overall: z.number().min(0).max(1),
});
AttachmentsLogSchema = z.object({ items: z.array(AttachmentLogItemSchema).default([]) });
```

Migration v2 → v3 idempotente : si `state.attachments_log` absent ou non conforme → `{ items: [] }`. Bump `SCHEMA_VERSION = 3`.

`attachment_ai_descriptions` (Dexie + Supabase) reste mais est traité comme **cache** : aucune lecture pour construire le bundle Phase 2/3 — on lit toujours depuis `attachments_log.items` du state versionné.

---

## Phase 1 — Capture photos (toujours, peu importe Conv/JSON)

`processDescribeMedia` (engine.llm.ts) — modifications :

1. Reste : appelle `describeMedia`, écrit dans `attachment_ai_descriptions` (cache local) et `llm_extractions` (audit).
2. **Ne fait PLUS** `appendJsonStateVersion` photo-par-photo.
3. **Ne fait PLUS** `maybeEmitPhotoCaption` (supprimé).
4. À la fin, appelle `tryFinalizeBatch(parent_message_id)`.

Nouvelle fonction `tryFinalizeBatch(parent_message_id)` :
1. Lit tous les attachments du `parent_message_id`.
2. Si l'un n'a pas de description en cache → return (pas encore prêt).
3. Sinon, **un seul `appendJsonStateVersion`** : ajoute N entrées `attachments_log.items` en une fois (Field<T> v2, `source: "ai_infer"`, `validation_status: "unvalidated"`).
4. Appelle `synthesizePhotoBatch(parent_message_id, descriptions)` :
   - Si N === 1 → message assistant = `short_caption` (pas d'appel LLM).
   - Si 2 ≤ N ≤ 3 → message assistant = concatène `short_caption` côté client (pas d'appel LLM).
   - Si N ≥ 4 → appel LLM nouveau mode `synthesize_batch` qui reçoit **toutes les descriptions complètes** (`short_caption + detailed_description + ocr_text + observations`) et retourne 1 message de 3-5 phrases fusionnant les évidences cross-photos.
5. Émet 1 seul message assistant (`metadata.ai_enabled = false` pour anti-boucle).

**`processLlmRouteAndDispatch`** :
- Si `message.kind === "photo"` → court-circuit immédiat. Marque `ok`, ne déclenche jamais `handleExtract` ni `handleConversational`. Le texte porté par le message photo est **ignoré en Phase 1** (sera repris dans `recent_messages` au prochain message texte de l'utilisateur).
- Sinon → comportement Phase 2 / 3 selon toggle.

---

## Phase 2 — Conversation de complétude (toggle Conv)

Toggle Conv (déjà acté) déclenche `handleConversational`.

Bundle enrichi via `buildContextBundle` :
- `state_summary` (existant, inclut désormais `attachments_log.items` car c'est une section du state)
- `nomenclature_hints.enums` filtrés (sortie de `getNomenclatureForMission`)
- `nomenclature_required_fields` (nouveau champ `ContextBundle`)

**Plus aucune lecture de `attachment_ai_descriptions`** dans le builder — tout passe par le state.

Prompt système conversational mis à jour (`src/shared/llm/prompts/system-conversational.ts` + copie inline `vtu-llm-agent`) :

> "Compare `nomenclature_required_fields` aux champs réellement remplis dans `state_summary` et aux observations dans `state_summary.attachments_log.items`. Réponds en texte court (≤4 phrases) listant les manques prioritaires. AUCUN tool call structuré, AUCUN patches/insert_entries/custom_fields. Si tu détectes une valeur dans une observation photo qui correspond à un required_field manquant, signale-le et propose à l'utilisateur de basculer en mode JSON pour l'implémenter."

---

## Phase 3 — Implémentation (toggle JSON, message texte)

**Trigger = toggle JSON seul**. Le contenu du message ne décide rien.

`handleExtract` reçoit le bundle complet (state + `attachments_log.items` + `nomenclature_hints.enums` + `nomenclature_required_fields`).

Prompt extract durci :
> "Tu DOIS respecter les énums fermées de `nomenclature_hints.enums.<field_path>`. Toute valeur hors énum → `custom_field` obligatoire, JAMAIS de `set_field` avec une valeur inconnue. Tu peux puiser dans `state_summary.attachments_log.items[*].observations` et `ocr_text` comme `evidence_refs`."

`actions_card` (existant) affiche les propositions.

**Nouveau bouton "Tout refuser"** sur `PendingActionsCard` (filet de sécurité Phase 3) — rejette tous les patches/inserts/custom_fields en un clic, sans appliquer.

---

## Phase 4 — Correction (toggle JSON sur état existant)

User en mode JSON envoie "corrige X" → `handleExtract` traite naturellement (déjà OK avec `set_field`).

---

## Toggle Conv / JSON

`useChatStore` (déjà planifié) :
- `routeMode: Record<visitId, "conv" | "json">` (default `"conv"`)
- `setRouteMode(visitId, mode)`

`ChatInputBar` : segmented switch 2 positions Conv/JSON à gauche du bouton Send.

`appendLocalMessage` injecte `metadata.ai_route_mode` lue du store.

`engine.llm.ts` dispatcher :
```ts
if (message.kind === "photo") return phase1Only();
if (message.metadata?.ai_route_mode === "json") return handleExtract(...);
return handleConversational(...);
```

Toggle JSON sur message texte vide → autorisé (l'utilisateur peut juste vouloir relancer une extraction sur le contexte courant). Aucune validation côté UI.

---

## Détails techniques

**Nouveau mode LLM `synthesize_batch`** :
- Edge function `vtu-llm-agent` accepte `mode: "synthesize_batch"` avec input `{ photo_descriptions: [{caption, detailed, ocr, observations}, …] }`.
- Sortie : `{ assistant_message: string }`.
- Pas de schéma complexe, pas de tool call.

**Fichiers modifiés**
- `src/domain/nomenclatures/index.ts` (réécrit)
- `src/domain/nomenclatures/methode_energyco/pppt_systemes.ts` (+ exports MAPPING + REQUIRED_FIELDS)
- `src/domain/nomenclatures/methode_energyco/dtg_systemes.ts` (idem)
- `src/domain/nomenclatures/3cl_dpe/index.ts` (idem)
- `src/shared/types/json-state.sections.ts`, `json-state.ts`, `json-state.factory.ts`, `json-state.migrate.ts`
- `src/shared/llm/types.ts` (ContextBundle + `nomenclature_required_fields`)
- `src/shared/llm/context/builder.ts` (accepte `requiredFields`, ne lit plus `attachmentDescriptions`)
- `src/shared/llm/prompts/system-conversational.ts`, `system-extract.ts`, `system-unified.ts`
- `src/shared/sync/engine.llm.ts` (refonte processDescribeMedia + tryFinalizeBatch + synthesizePhotoBatch + court-circuit photo dans dispatch)
- `supabase/functions/vtu-llm-agent/index.ts` (nouveau mode `synthesize_batch`, prompts mis à jour, accepte `nomenclature_required_fields`)
- `src/features/chat/store.ts` (ajout `routeMode` + setter)
- `src/features/chat/components/ChatInputBar.tsx` (segmented switch Conv/JSON)
- `src/features/chat/components/PendingActionsCard.tsx` (bouton "Tout refuser")

**Suppressions**
- `maybeEmitPhotoCaption` (engine.llm.ts) — remplacée par `tryFinalizeBatch`.

**Tests à ajouter / mettre à jour**
- `src/domain/nomenclatures/__tests__/compact.test.ts` — fallback 3 niveaux (cap 8 KB), mapping explicite chargé selon mission_type
- `src/shared/types/__tests__/json-state-migrate.test.ts` — migration v2→v3 idempotente (rejouer 2× n'altère rien)
- `src/shared/sync/__tests__/engine.synthesize-batch.test.ts` — synthétiseur N=1, N=3, N=4, N=10, N=50 (mock LLM pour N≥4, vérifie 1 seul message émis, 1 seul `appendJsonStateVersion`)
- `src/shared/sync/__tests__/engine.photo-shortcircuit.test.ts` — `kind=photo` avec `content=texte` → handleExtract jamais appelé
- `src/features/chat/__tests__/route-mode.test.ts` — toggle JSON sur texte vide → handleExtract appelé ; toggle Conv → handleConversational
- `src/shared/llm/__tests__/context.test.ts` — `attachments_log.items` lu depuis state, pas depuis `attachment_ai_descriptions`

---

## Validation finale

1. Batch de 5 photos → 1 seul `appendJsonStateVersion` (5 items dans `attachments_log.items`), 1 seul message synthèse LLM.
2. Toggle Conv après photos → réponse texte listant les `required_fields` manquants, aucun patch.
3. Toggle JSON + n'importe quel message → carte d'actions avec patches respectant les énums + bouton "Tout refuser" fonctionnel.
4. Photo + texte ("voici ma chaudière, marque XYZ") → seulement Phase 1, le texte est conservé dans `recent_messages` pour la suite.
5. Tous les tests Vitest passent.
