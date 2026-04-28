## Objectif

Sur la page **IA & Modèles**, ne garder que **2 blocs** :
1. **Modèle** (sélecteur ModelPickerGrid)
2. **Prompts système (éditables)** (SystemPromptEditor — chat unifié + analyse photo)

Tout le reste est supprimé : bloc Activation, inspecteur du dernier appel IA, et **l'onglet Dev disparaît complètement** de la sidebar.

## Changements

### 1. `src/routes/_authenticated/settings.ai.tsx` — réécriture minimaliste
Garder uniquement :
- Header de la page
- Section **Modèle** (`ModelPickerGrid`) — pas de prop `disabled`, plus de toggle
- Section **Prompts système (éditables)** (`<SystemPromptEditor />`)

Supprimé : `AiToggleCard`, `LastCallSection`, `CallInspector`, `PromptCard`, `JsonBlock`, `SectionHeader`, `CardShell`, tous les imports liés (Bot, Copy, FileCode, MessageSquare, Wrench, useLiveQuery, getDb, Badge, Button, useMemo, useState, toast, useChatStore.aiGlobalEnabled).

Note : `selectedModel` / `setSelectedModel` (Zustand) restent — c'est juste le sélecteur de modèle.

### 2. `src/features/settings/components/SettingsSidebar.tsx`
Supprimer l'entrée `dev` du tableau `SETTINGS_SECTIONS` (l'icône `Terminal` aussi de l'import lucide).

### 3. `src/routes/_authenticated/settings.dev.tsx`
Supprimer le fichier. La route `/settings/dev` n'existera plus (TanStack régénère `routeTree.gen.ts` automatiquement).

### 4. Vérifier les références orphelines
`rg "settings/dev"` après suppression — corriger toute redirection ou Link résiduel le cas échéant.

## Hors-scope

- L'éditeur de prompts (`SystemPromptEditor`) lui-même est inchangé : il garde son toggle Chat / Analyse photo en interne.
- La logique Zustand `aiGlobalEnabled` reste dans le store (utilisée ailleurs : VisitsSidebar, chat) — on retire juste son UI dans cette page.
- Aucune migration DB.
