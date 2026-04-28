## Objectif

Créer un vrai panneau **Paramètres** (route dédiée), structuré en sections, et y livrer la **Section 2 — IA & Modèles** complète :  sélecteur parmi 4 modèles (Économique / Moyen / Supérieur / Premium) avec nom, description, prix par M tokens, indicateur de recall.

Les autres sections (Compte, Données, Prompts, Apparence…) sont juste **scaffoldées** (placeholders "Bientôt disponible") pour que la nav du panneau soit cohérente dès maintenant. On les remplira dans les itérations suivantes.

---

## 1. Architecture du panneau Paramètres

**Nouvelle route** : `src/routes/_authenticated/settings.tsx` (layout) + `src/routes/_authenticated/settings.index.tsx` (redirect → `/settings/ai`) + `src/routes/_authenticated/settings.ai.tsx` (Section 2, livrée).

**Mobile** (<md) : pleine largeur, header back + titre, liste verticale des sections, navigation classique.
**Desktop** (md+) : sidebar gauche 280px (liste sections) + contenu droit. Cohérent avec le pattern sidebar VT existant.

**Sections du panneau** (livrables progressifs, scope itération actuelle = AI seulement) :

1. Compte (placeholder)
2. **IA & Modèles ✅ livré**
3. Prompts personnalisés (placeholder)
4. Données & Sync (placeholder)
5. Apparence (placeholder)
6. À propos (placeholder)

**Entrée** : le bouton `⚙️ Settings` actuel de `VisitsSidebar` (qui ouvre le DebugPanel) est dédoublé :

- Click court → `navigate({ to: "/settings/ai" })`
- Long press / sous-menu via `DropdownMenu` → "Debug" reste accessible (on ne casse pas le diagnostic interne)

Plus simple et conforme à la maquette : on remplace le bouton par un `DropdownMenu` avec deux items "Paramètres" et "Debug". Tokens design respectés.

---

## 2. Section "IA & Modèles" — contenu fonctionnel

### a) Toggle IA global

- **Source de vérité** : nouvelle clé dans `useChatStore` → `aiGlobalEnabled: boolean` (persistée localStorage avec le reste du store, partition `vtu-chat-prefs`).
- **Sémantique** : kill-switch global. Si OFF → toutes les visites ont `isAiEnabled() === false` quel que soit le toggle per-visit.
- Refacto `isAiEnabled(visitId)` :
  ```
  return aiGlobalEnabled && Boolean(aiEnabled[visitId])
  ```
- Le toggle per-visit existant dans `visits.$visitId.tsx` (Switch en haut du chat) reste : il devient un override local **sous condition** que le global soit ON. Si global OFF → Switch désactivé visuellement + tooltip "Activez l'IA dans Paramètres".
- Pas de migration : la clé absente = défaut `true` (pour ne pas casser les utilisateurs actuels qui ont déjà toggle leurs visites).

### b) Sélecteur de modèle (4 options)

**Nouvelle clé store** : `selectedModel: ModelId` (persistée), avec `ModelId = "economic" | "standard" | "advanced" | "premium"`.

**Catalogue** déclaratif dans nouveau fichier `src/features/settings/models-catalog.ts` :


| Tier     | Label UI   | Modèle Lovable AI               | Prix in $/M | Prix out $/M | Recall estimé | Description                                                     |
| -------- | ---------- | ------------------------------- | ----------- | ------------ | ------------- | --------------------------------------------------------------- |
| economic | Économique | `google/gemini-2.5-flash-lite`  | 0.10        | 0.40         | ~50%          | Rapide, peu coûteux. Pour saisies courtes et claires.           |
| standard | Moyen      | `google/gemini-3-flash-preview` | 0.30        | 2.50         | ~70%          | Équilibré. Recommandé pour usage terrain quotidien.             |
| advanced | Supérieur  | `google/gemini-2.5-pro`         | 1.25        | 10.00        | ~85%          | Raisonnement profond. Pour visites complexes / longs contextes. |
| premium  | Premium    | `openai/gpt-5`                  | 2.50        | 20.00        | ~92%          | Précision maximale. Pour rapports critiques.                    |


> Les prix sont **indicatifs / publics** — clairement marqués "Tarifs indicatifs Lovable AI" en bas de la card (pas un engagement contractuel). Le recall est estimé d'après nos benchmarks internes (cf. KNOWLEDGE §dette It.10).

**UI cards** : 4 cards verticales (mobile) / grille 2x2 (md+). Chaque card affiche :

- Badge tier (Économique / Moyen / Supérieur / Premium) en couleur tokens
- Nom du modèle (font-heading)
- Description courte (font-body, 2 lignes)
- Bandeau prix : `0.30 $ / M tokens entrée · 2.50 $ / M tokens sortie` (font-ui tabular-nums)
- Indicateur recall : barre de progression horizontale + libellé `Recall estimé : 70%` (couleur scale verte/orange selon valeur)
- Card sélectionnée → border primary + check icon top-right
- Click → `setSelectedModel(tier)` + toast "Modèle changé : Moyen"

### c) Propagation du modèle choisi vers l'edge

C'est le seul changement runtime : aujourd'hui `MODEL` est constant dans `vtu-llm-agent/index.ts`.

1. `CallVtuLlmAgentInput` (`edge-function-client.ts`) accepte un champ optionnel `model?: string`.
2. Dans `engine.llm.ts` (les 2 call sites `processLlmRouteAndDispatch` + le mode conversational), on lit `useChatStore.getState().selectedModel`, on mappe via le catalogue → string `"google/gemini-3-flash-preview"`, on passe au client.
3. `vtu-llm-agent/index.ts` :
  - `parseInput` accepte `model?: string` (allowlist stricte des 4 valeurs catalogue, fallback `MODEL` constant si invalide → log warning).
  - L'appel `fetch(GATEWAY_URL, { body: JSON.stringify({ model: chosenModel, ... }) })` utilise la valeur reçue.
4. `processLlmRouteAndDispatch` log déjà `meta.model_version` retourné par le gateway → trace automatique dans `llm_extractions`.

Pas de migration DB. Pas de changement d'API publique.

---

## 3. Fichiers créés / édités

**Créés**

- `src/routes/_authenticated/settings.tsx` (layout, sidebar nav)
- `src/routes/_authenticated/settings.index.tsx` (redirect vers `/settings/ai`)
- `src/routes/_authenticated/settings.ai.tsx` (Section 2 livrée)
- `src/routes/_authenticated/settings.account.tsx` (placeholder ComingSoonPanel)
- `src/routes/_authenticated/settings.prompts.tsx` (placeholder)
- `src/routes/_authenticated/settings.data.tsx` (placeholder)
- `src/routes/_authenticated/settings.appearance.tsx` (placeholder)
- `src/routes/_authenticated/settings.about.tsx` (placeholder)
- `src/features/settings/index.ts`
- `src/features/settings/models-catalog.ts`
- `src/features/settings/components/SettingsSidebar.tsx`
- `src/features/settings/components/AiToggleCard.tsx`
- `src/features/settings/components/ModelPickerGrid.tsx`
- `src/features/settings/components/ModelCard.tsx`
- `src/features/settings/__tests__/models-catalog.test.ts` (sanity : 4 tiers, IDs uniques)
- `src/features/settings/__tests__/store-ai-global.test.ts` (kill-switch sémantique)

**Édités**

- `src/features/chat/store.ts` : ajoute `aiGlobalEnabled`, `selectedModel`, accesseurs ; `isAiEnabled(visitId)` devient `aiGlobalEnabled && per-visit`.
- `src/features/chat/__tests__/store.test.ts` : couvre nouveau comportement kill-switch.
- `src/features/visits/components/VisitsSidebar.tsx` : remplace le bouton Settings par `DropdownMenu` (Paramètres / Debug).
- `src/routes/_authenticated/visits.$visitId.tsx` : Switch IA per-visit affiche tooltip + disabled si global OFF.
- `src/shared/llm/providers/edge-function-client.ts` : `CallVtuLlmAgentInput.model?: string`.
- `src/shared/sync/engine.llm.ts` : lit `selectedModel` du store et le passe à `callVtuLlmAgent`.
- `supabase/functions/vtu-llm-agent/index.ts` : `MODEL` devient default, `parseInput` accepte `model` (allowlist), `fetch` utilise la valeur résolue.
- `KNOWLEDGE.md` : ajoute brève entrée §dette / §settings — "It. 11.7 — Panneau Settings (sect. AI livrée). Modèle propagé via edge function (allowlist 4 tiers). Sections account/prompts/data/appearance/about scaffoldées."

---

## 4. Hors scope (explicite)

- Édition des system prompts (sera Section 3, prompts persisted Supabase + RLS)
- Export / suppression données (Section 4)
- Dark mode toggle (Section 5)
- Vrais benchmarks de recall mesurés (les % affichés sont déclaratifs)
- Pricing dynamique fetch depuis le gateway (constants en dur dans le catalogue)

---

## 5. Tests / QA

- Vitest : `models-catalog.test.ts`, `store-ai-global.test.ts`, mise à jour `store.test.ts` (kill-switch). Cible : 257 → 260+ verts.
- Manuel : ⚙️ → Paramètres → bascule IA OFF → ouvrir une visite → constater Switch chat désactivé. Sélectionner "Premium" → envoyer un message → vérifier dans `llm_extractions.model_version` que c'est bien `openai/gpt-5`.

Pas de migration DB, pas de changement RLS.