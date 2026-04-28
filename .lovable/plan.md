# Prompt système éditable depuis l'inspecteur IA

## Objectif

Sortir `SYSTEM_UNIFIED` du code (hardcodé dans `system-unified.ts` + copie inline dans l'edge function) pour qu'il devienne :
- **persisté en base** (modifiable sans redéploiement),
- **éditable depuis `/settings/dev`** (textarea + bouton Sauvegarder + bouton Réinitialiser au défaut),
- **envoyé à chaque appel LLM** par l'edge function (qui le lit en DB, plus en dur),
- **versionné** (historique des modifications, possibilité de revenir en arrière).

La version actuelle (Energyco) devient le **prompt par défaut** intégré au code, utilisé en fallback si la DB est vide.

## Architecture

### 1. Nouvelle table `llm_system_prompts`

Stocke les versions successives du prompt système, par utilisateur (pour l'instant mono-user dev, mais scope user_id propre dès le départ).

Colonnes :
- `id uuid pk`
- `user_id uuid not null` (RLS : own only)
- `content text not null` (le prompt complet)
- `is_active boolean not null default false` (un seul actif par user)
- `label text` (optionnel : "v3 — moins verbeux", etc.)
- `created_at timestamptz default now()`

Index : `(user_id, is_active) where is_active = true`.

RLS : select / insert / update own (delete interdit, on garde l'historique).

Trigger : avant insert/update si `is_active = true`, désactiver les autres prompts du même user (un seul actif à la fois).

### 2. Edge function `vtu-llm-agent` — lecture DB du prompt

Au début de chaque appel :
1. Récupère le `user_id` depuis le JWT.
2. Query `llm_system_prompts` where `user_id = X and is_active = true` → récupère `content`.
3. Si aucune ligne active → fallback sur la constante `SYSTEM_UNIFIED` inline (= prompt Energyco actuel).
4. Utilise ce contenu comme `system_prompt` dans l'appel LLM **et** dans `request_summary.system_prompt` retourné au client.

Conséquence : `src/shared/llm/prompts/system-unified.ts` reste comme **valeur par défaut** (référence), mais n'est plus la source de vérité runtime.

### 3. UI `/settings/dev` — bloc "Prompt système"

Nouveau bloc en haut de l'inspecteur, au-dessus des 4 blocs wire actuels :

```
┌─ Prompt système (envoyé au LLM) ─────────────────┐
│ [Label optionnel: v3 — ton plus direct       ]   │
│                                                   │
│ ┌───────────────────────────────────────────┐    │
│ │ <role>                                     │    │
│ │ Tu es l'Agent IA de VTU...                 │    │
│ │ ...                                        │    │
│ │ (textarea full height, ~25 lignes)         │    │
│ └───────────────────────────────────────────┘    │
│                                                   │
│ Dernière modif : il y a 2h • v4 active            │
│                                                   │
│ [Réinitialiser au défaut] [Annuler] [Sauvegarder]│
└───────────────────────────────────────────────────┘

▾ Historique (5 versions)
  • v4 — actif — il y a 2h
  • v3 — il y a 1j        [Activer] [Voir]
  • v2 — il y a 3j        [Activer] [Voir]
  ...
```

Comportement :
- Au mount : fetch `llm_system_prompts` actif du user → préremplit la textarea. Si vide → préremplit avec la constante par défaut + badge "Défaut (non sauvegardé)".
- **Sauvegarder** : insert nouvelle ligne avec `is_active = true` (le trigger désactive l'ancienne). Toast "Prompt système mis à jour — actif au prochain message".
- **Réinitialiser au défaut** : remplit la textarea avec la constante du code (ne sauvegarde pas tant que l'user ne clique pas Sauvegarder).
- **Annuler** : recharge depuis la DB.
- **Activer** (sur une version d'historique) : passe `is_active = true` sur cette ligne.
- **Voir** : ouvre une dialog read-only avec le contenu de la version.

Validation : longueur min 100 caractères, max 50 000. Pas de validation sémantique (on fait confiance au user dev).

### 4. Suppression de la copie inline du prompt dans l'edge function

La constante `SYSTEM_UNIFIED` reste dans l'edge function uniquement comme **fallback** quand la DB est vide. Toute modif "officielle" passe par la DB.

`src/shared/llm/prompts/system-unified.ts` reste exporté pour :
- afficher "Réinitialiser au défaut" côté UI,
- bootstrap initial.

Les deux copies (TS + edge) restent bit-identiques (= défaut Energyco actuel).

## Fichiers touchés

**Nouveaux**
- Migration SQL : table `llm_system_prompts` + RLS + trigger un-seul-actif
- `src/features/settings/system-prompt.repo.ts` : `getActiveSystemPrompt()`, `saveSystemPrompt(content, label?)`, `listSystemPrompts()`, `activateSystemPrompt(id)`
- `src/features/settings/SystemPromptEditor.tsx` : composant éditeur (textarea + boutons + historique)

**Modifiés**
- `supabase/functions/vtu-llm-agent/index.ts` : lecture DB du prompt actif au lieu de la constante inline (fallback constante si vide)
- `src/routes/_authenticated/settings.dev.tsx` : ajout du bloc `<SystemPromptEditor />` en tête, le bloc "Prompt système" actuel (lecture seule depuis `request_summary.system_prompt`) reste pour montrer ce qui a été réellement envoyé sur le dernier appel

## Détails techniques

- **Lecture DB côté edge function** : utilise le client Supabase déjà importé, query simple avec `auth.uid()` extrait du JWT (header `Authorization`).
- **Cache** : pas de cache dans l'edge (cold start = 1 query rapide indexée). Si problème de latence plus tard, on ajoutera un cache mémoire 30s.
- **Migration de l'existant** : aucune. Tant qu'aucun user n'a sauvegardé, le fallback constante sert le prompt Energyco actuel → comportement identique à aujourd'hui.
- **Inspector** : le bloc lecture seule "Prompt système" affiché sous chaque appel continue de venir de `request_summary.system_prompt` (donc montre bien la version qui a été envoyée à ce moment-là, pas la version courante en DB → utile si tu modifies le prompt entre deux messages).
- **Sécurité** : RLS stricte par `user_id`, aucune exposition cross-user. Le prompt n'est pas un secret mais reste privé par compte.
- **Tests** : ajouter tests Vitest sur `system-prompt.repo.ts` (insert active désactive l'ancien, fallback si vide).

## Points hors scope (à confirmer si tu veux les ajouter)

- Partage du prompt entre users d'une même organisation (aujourd'hui : per-user).
- Diff visuel entre deux versions de l'historique.
- A/B test entre deux prompts.
