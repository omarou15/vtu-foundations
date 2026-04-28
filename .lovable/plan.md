
# Plan — Prompt photo éditable + analyses visibles dans le JSON

Deux problèmes à corriger ensemble :

1. **Le prompt photo (`SYSTEM_DESCRIBE_MEDIA`) n'est pas éditable** depuis l'UI — uniquement le prompt chat (`SYSTEM_UNIFIED`) l'est aujourd'hui via la table `llm_system_prompts`.
2. **Les analyses détaillées des photos sont invisibles** : elles sont bien produites et stockées en DB (table `attachment_ai_descriptions` avec `detailed_description`, `structured_observations`, `ocr_text`), mais seul le `short_caption` apparaît dans le chat. Rien n'est exposé dans la vue JSON / Synthèse.

## Ce qu'on va construire

### A. Prompt photo éditable

1. **Étendre la table `llm_system_prompts`** : ajouter une colonne `kind text not null default 'unified'` avec contrainte CHECK `kind in ('unified','describe_media')`. Migrer le trigger d'unicité « un seul actif » pour qu'il scope par `(user_id, kind)` au lieu de `user_id` seul. Backfill des lignes existantes en `kind = 'unified'`.

2. **Repo `system-prompt.repo.ts`** : ajouter un paramètre `kind` (`"unified" | "describe_media"`) à toutes les fonctions (`getActiveSystemPrompt`, `listSystemPrompts`, `saveSystemPrompt`, `activateSystemPrompt`).

3. **Composant `SystemPromptEditor`** : ajouter un sélecteur d'onglet en haut « Prompt chat » / « Prompt analyse photo » qui pilote le `kind` chargé/sauvegardé. Le défaut affiché bascule entre `SYSTEM_UNIFIED` et `SYSTEM_DESCRIBE_MEDIA`.

4. **Côté pipeline photo** : `describeMedia` (server function dans `src/server/llm.functions.ts`) doit lire le prompt actif depuis la DB pour cet utilisateur avant l'appel Gemini, avec fallback sur la constante `SYSTEM_DESCRIBE_MEDIA`. Ça suit le même pattern que l'edge function `vtu-llm-agent` fait déjà pour `SYSTEM_UNIFIED`.

### B. Analyses photo visibles

Le drawer JSON (panneau droit dans la capture) montre aujourd'hui uniquement `visit_json_state.state`. On y ajoute un onglet supplémentaire **« Analyses photo »** qui liste, pour la visite en cours :

- Pour chaque attachment de la visite ayant une description IA :
  - Vignette + nom de fichier
  - `short_caption` (titre)
  - `detailed_description` (description longue)
  - `structured_observations[]` (groupées par `section_hint`)
  - `ocr_text` si présent (dans un bloc `<pre>` monospace)
  - `confidence_overall` + provider/model en footer

- Source : `db.attachment_ai_descriptions` filtré par `visit_id`, jointe avec `db.attachments` pour le nom et la thumb. Live via `useLiveQuery`.

Cet onglet se place à côté de l'onglet **Arbre / À traiter** déjà présent dans le drawer JSON. Aucune modification du `state` lui-même : on respecte la doctrine anti-hallucination (les détails restent factuels, hors state).

## Détails techniques

**Migration SQL** :
```sql
alter table public.llm_system_prompts
  add column kind text not null default 'unified';
alter table public.llm_system_prompts
  add constraint llm_system_prompts_kind_check
  check (kind in ('unified','describe_media'));

-- Trigger d'unicité par (user_id, kind)
create or replace function public.deactivate_other_system_prompts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active then
    update public.llm_system_prompts
       set is_active = false
     where user_id = new.user_id
       and kind = new.kind
       and id <> new.id
       and is_active = true;
  end if;
  return new;
end $$;
```

**`describeMedia` lecture DB** : ajouter dans la server function un appel Supabase (avec service role ou auth user via header) pour récupérer le prompt actif `kind='describe_media'` et l'utiliser à la place de la constante. Déjà éprouvé côté `vtu-llm-agent`.

**Drawer JSON** : `src/features/json-state/components/JsonViewerDrawer.tsx` (ou équivalent du drawer visible dans la capture) — ajouter un troisième tab. Composant `PhotoAnalysisList` simple, lecture Dexie temps réel.

## Hors-scope (volontaire)

- Pas d'injection des `detailed_description` dans le `state` JSON — anti-hallucination.
- Pas de versioning séparé des deux prompts (l'historique reste partagé visuellement, juste filtré par kind).
- Pas de rebuild automatique des descriptions existantes après changement de prompt — ne s'applique qu'aux nouvelles photos.

## Tests

- Migration : vérifier qu'on peut avoir 1 actif par kind par user.
- Repo : tests unitaires save/get/list/activate avec `kind`.
- Server function : test que le prompt DB override la constante quand présent.
- Drawer : test rendering avec descriptions vides / avec OCR / sans OCR.

Cible : 100% des tests existants verts + nouveaux tests pour les 4 points ci-dessus.
