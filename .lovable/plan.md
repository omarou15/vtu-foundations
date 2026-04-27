# Itération 10.5 — Refonte IA "Effet Wow + Validation Inline"

## Objectif

Passer de "IA techniquement OK" à "magique sur le terrain". Latence perçue <3s, validation 1-clic dans le chat, plus jamais de "Aucun champ mis à jour", card de propositions visuellement premium (style Claude Artifacts / Linear).

## Architecture cible

```text
User envoie message
   │
   ▼
appendLocalMessage  ─►  llm_route_and_dispatch enqueued
   │                                   │
   ▼ (UI: <100ms)                      ▼ (latence Edge ~3-5s)
Loader "thinking" inline       Edge Function vtu-llm-agent
                                       │
                                       ▼ retourne {assistant_message, patches[], custom_fields[]}
                                       │
                                       ▼
                          appendLocalMessage(role=assistant, kind="actions_card",
                                             metadata={proposed_patches, extraction_id})
                                       │
                                       ▼
                          MessageList  →  <PendingActionsCard/>
                                       │
                              [Apply] / [Ignore] inline (1 clic)
                                       │
                                       ▼
                  validateFieldPatch / rejectFieldPatch
                                       │
                                       ▼
                  appendJsonStateVersion (Field<T>.validation_status muté)
                                       │
                                       ▼
                  useLiveQuery → card re-render avec badge ✓ / ✗
```

## Chantier 1 — Edge Function `vtu-llm-agent`

**Fichier** : `supabase/functions/vtu-llm-agent/index.ts`

- Auth Bearer JWT (vérification via `getUser()` avec auth header)
- Input : `{ mode: "extract" | "conversational", messageText, contextBundle }`
- Modèle : `google/gemini-3-flash-preview` via `https://ai.gateway.lovable.dev/v1/chat/completions`
- Tool calling unique : `propose_visit_patches` qui retourne `{ assistant_message: string (≤300 chars), patches: AiFieldPatch[], custom_fields: AiCustomField[], warnings: string[], confidence_overall: number }`
- Mapping erreurs : 429 `rate_limited`, 402 `payment_required`, timeout 504, autres 502
- Timeout 60s, CORS headers
- Logging dans `llm_extractions` côté **client** (pas dans l'Edge — on garde le pattern actuel : l'Edge retourne, le client persiste)

**Ajouts `supabase/config.toml`** :
```
[functions.vtu-llm-agent]
verify_jwt = true
```

## Chantier 2 — Système prompt dual (message + patches)

**Fichier nouveau** : `src/shared/llm/prompts/system-unified.ts`

Le prompt force le LLM à TOUJOURS produire `assistant_message` + (éventuels patches). Doctrine :

> "Tu es le collègue thermicien IA. Tu N'ÉCRIS JAMAIS 'Aucun champ mis à jour'. Tu réponds toujours comme un humain qui répond à un humain.
> - Si tu extrais des données : annonce-les ('J'ai relevé 4 informations, examine les propositions ci-dessous')
> - Si message conversationnel : réponds naturellement (≤2 phrases)
> - Si pas d'extraction possible mais user partage : encourage ('Décris ce que tu observes, je structurerai')"

Schéma Zod ajouté : `UnifiedExtractOutputSchema` dans `src/shared/llm/schemas/extract.schema.ts` (extension de `ExtractOutputSchema` avec `assistant_message: z.string().max(400)`).

Type étendu : `ExtractResult` gagne `assistant_message: string`.

## Chantier 3 — UX Card `<PendingActionsCard/>`

**Fichier nouveau** : `src/features/chat/components/PendingActionsCard.tsx`

Carte premium pour les messages `kind="actions_card"`. Structure :

```text
┌─────────────────────────────────────────┐
│ ✨ 4 propositions IA          [Tout appliquer] │
│ "J'ai relevé 4 informations..."         │
├─────────────────────────────────────────┤
│ Type de chauffage                       │
│ [badge: Radiateur électrique]  ●●○ med  │
│ 💡 mentionné explicitement              │
│ [Appliquer] [Ignorer]                   │
├─────────────────────────────────────────┤
│ ... 1 sous-card par patch               │
└─────────────────────────────────────────┘
```

- **Animations** : framer-motion (déjà installé) — entrée `fade-in + slide-up` sur la card, `scale-in` sur les badges post-action
- **États sous-cards** : pending (terracotta vif) / applied (badge vert ✓, opacity 0.7) / rejected (gris barré, opacity 0.5)
- **Boutons** ≥44×44px mobile-first
- **Tokens** : utilise variables CSS existantes (`--primary` terracotta, `--muted`, `--card`)
- **Hover/focus** : ring terracotta, scale 1.02 sur boutons

**Fichier nouveau** : `src/shared/llm/path-labels.ts` — mapping `path → { label_fr, format }` pour ~50 paths courants du JSON v2 (heating, ecs, ventilation, building, envelope, meta). Helper `formatPatchValue(path, value)` qui retourne badge/monospace/texte.

## Chantier 4 — Validation persistée sur Field<T>

**Fichier nouveau** : `src/shared/db/json-state.validate.repo.ts`

Deux fonctions :

```typescript
validateFieldPatch({ visitId, patchPath, sourceExtractionId, validatedBy })
  → Charge latest state, mut Field<T> au path :
    - validation_status = "validated"
    - validated_at = now, validated_by = userId
  → appendJsonStateVersion()
  → Retourne { ok, version }

rejectFieldPatch({ visitId, patchPath, sourceExtractionId, rejectedBy })
  → Idem mais validation_status = "rejected"
  → SI source était "ai_infer" exclusivement → reset value=null, source="init"
  → SI source antérieure humaine → garde value, juste mut le statut sur le patch
    (le patch IA n'est pas dans le state actuel s'il a été ignoré par apply-patches,
     mais on enregistre le refus dans `llm_extractions.warnings` pour audit)
  → appendJsonStateVersion()
```

Edge case "le patch n'existe pas dans le state" (filtré par apply-patches) : on enregistre quand même le rejet dans `llm_extractions.warnings` pour traçabilité, sans nouvelle version JSON.

**Hook nouveau** : `src/features/chat/hooks/usePendingActions.ts`

```typescript
usePendingActions(extractionId, proposedPatches)
  → useLiveQuery sur visit_json_state latest
  → calcule { applied: Set<path>, rejected: Set<path>, pending: AiFieldPatch[] }
    en lisant Field<T>.source_extraction_id === extractionId
                && validation_status ∈ {validated, rejected}
```

## Chantier 5 — Message kind `"actions_card"`

**Modifs** :

1. `src/shared/types/db.ts` — étendre `MessageKind` avec `"actions_card"`
2. `src/shared/db/messages.repo.ts` — anti-boucle inchangé (assistant ne déclenche jamais)
3. `src/shared/sync/engine.llm.ts` — `handleExtract` :
   - Crée le message assistant avec `kind="actions_card"`, `content=result.assistant_message`, `metadata={llm_extraction_id, proposed_patches, proposed_custom_fields, mode}`
   - Si 0 patch + 0 custom_field → `kind="text"` avec `content=result.assistant_message` (jamais le récap brut)
   - **Supprimer `buildExtractSummary`** (plus utilisé)
4. `src/features/chat/components/MessageList.tsx` — switch sur `message.kind` :
   - `"text"` → `MessageBubble` existant
   - `"actions_card"` → `<PendingActionsCard message={m}/>`

## Chantier 6 — Loader instantané (bonus UX)

`MessageList` détecte déjà `llmPending` via `useLiveQuery` sur `sync_queue`. Améliorer :
- Skeleton de la future card (shape grise pulsante) au lieu des 3 dots quand le dernier message user est ≥10 chars
- 3 dots conservés pour les messages courts (conversational probable)

Animation `animate-pulse` Tailwind, hauteur ~120px pour suggérer la card à venir.

## Chantier 7 — Migration provider client-side

**Fichier nouveau** : `src/shared/llm/providers/edge-function-client.ts`

```typescript
async function callVtuLlmAgent(input: {
  mode: "extract" | "conversational",
  messageText: string,
  contextBundle: ContextBundle,
  authToken: string
}): Promise<{ ok: true, result, meta, stable_prompt_hash, raw_response } | { ok: false, ... }>
```

- Fetch direct vers `${VITE_SUPABASE_URL}/functions/v1/vtu-llm-agent`
- Bearer token issu de `supabase.auth.getSession()`
- Pas de workaround `result_json/raw_response_json` (Edge retourne JSON natif)

**Modifs `engine.llm.ts`** :
- `handleExtract` et `handleConversational` appellent `callVtuLlmAgent` au lieu de `extractFromMessage`/`conversationalQuery` (TanStack)
- `processDescribeMedia` reste inchangé (TanStack `describeMedia`)
- Suppression imports `extractFromMessage`, `conversationalQuery` depuis `@/server/llm.functions`

`src/server/llm.functions.ts` : on garde `describeMedia` et `routeMessageLlm`, on **supprime** `extractFromMessage` et `conversationalQuery` (morts).

## Chantier 8 — Tests

Nouveaux :
- `src/features/chat/__tests__/PendingActionsCard.test.tsx` — render, click apply mut le state, click ignore reset value, états applied/rejected
- `src/shared/db/__tests__/json-state-validate.test.ts` — `validateFieldPatch` mut le statut, `rejectFieldPatch` reset value si source ai_infer, garde si source humaine
- `src/features/chat/__tests__/usePendingActions.test.ts` — useLiveQuery dérive correctement applied/rejected/pending
- `supabase/functions/vtu-llm-agent/index_test.ts` (Deno) — auth manquante 401, payload valide → 200 avec assistant_message, 429 mappé

Tests existants à mettre à jour :
- `engine.llm` tests : adapter au nouveau format `assistant_message`
- Pas de régression sur les 162 tests actuels

## Chantier 9 — Docs

`KNOWLEDGE.md` :
- §8 : ajouter "Itération 10.5 — Cerveau IA fluide" cochée
- §10 : retirer dette "Phase 3 → Edge Function" (faite), garder workaround `result_json` pour `describeMedia` uniquement, ajouter "Streaming SSE Gemini Phase 3 si Edge insuffisante"
- §15 : refondre section "Cerveau LLM" avec nouvelle architecture Edge + format dual + validation inline

## Critères d'acceptation

- ✅ Latence perçue iPhone : <3s avant feedback, <8s pour card complète (test manuel)
- ✅ Plus jamais de "Aucun champ mis à jour"
- ✅ Message "Bonjour on commence" → réponse texte naturelle
- ✅ Message "Maison 1948 radiateur électrique ECS VMC simple flux" → 4-5 patches dans la card
- ✅ Click Apply → Field<T> validated visible live dans drawer JSON
- ✅ Click Ignore + source ai_infer seul → value reset à null
- ✅ Tests 162 + nouveaux passent
- ✅ Build TS vert
- ✅ KNOWLEDGE à jour

## Ordre d'implémentation

1. Chantier 1 (Edge Function) + Chantier 2 (prompt) — backend complet
2. Chantier 7 (client provider) + Chantier 5 (kind actions_card côté engine)
3. Chantier 4 (repos validate/reject) + hook usePendingActions
4. Chantier 3 (PendingActionsCard + path-labels) + Chantier 6 (skeleton)
5. Chantier 8 (tests) + Chantier 9 (docs)
6. Vérif globale : `tsc --noEmit`, `bunx vitest run`, build prod
