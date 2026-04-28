
## Réponse directe à ta question : pourquoi le JSON reste vide ?

D'après les logs Edge Function que je vois :
```
llm_raw_output {"patches_count":5,"insert_entries_count":1, ...}
```

**Le LLM (Claude Sonnet 4.5 via OpenRouter) retourne bien des patches et 1 insert.** Il propose les bonnes choses (ECS ballon_electrique 150L, chauffage radiateur, VMC simple flux). Donc le bug n'est PAS côté LLM.

Le bug est côté **apply layer** (couche `applyExtractResult` côté client). Et c'est exactement ce que l'autre app décrit dans sa réponse, mais inversé :

### Diagnose précise (vs réponse de l'autre app)

L'autre app dit "VTU n'a pas ce problème car markdown + sections fermées". **C'est faux pour la version actuelle de VTU**. VTU a depuis migré vers un modèle "champs structurés" (`heating.installations[]` avec `type_value`, `fuel_value`, `capacity_l`...) — exactement le modèle vulnérable décrit. Et les 3 garde-fous mentionnés ne sont pas tous en place :
- ✅ Prompt directif (présent dans `system-unified.ts`)
- ✅ `minProperties: 1` (présent dans `PROPOSE_VISIT_PATCHES_TOOL`)
- ✅ Skip silencieux des inserts vides (`hasUsefulField` dans `applyInsertEntries`)

Donc le bug n'est pas un insert vide. Il est ailleurs. Voici les 3 hypothèses précises basées sur le code :

### Hypothèse #1 — État UI vs état persisté désynchronisés
L'image montre "5 champs validés" + "1 entrée en attente" → donc `applyExtractResult` a bien tourné. La carte d'actions affiche le résultat. Mais le **viewer JSON brut** (image 16 = autre app, montrant un JSON rempli) compare un format d'**export** (`informations_techniques.enveloppe.groups.Mur[]`) à l'état interne VTU (`heating.installations[]`). Ce n'est pas le même schéma. Si tu regardes le panel JSON dans VTU lui-même (drawer JSON), il devrait être rempli. **À vérifier en premier.**

### Hypothèse #2 — `appendJsonStateVersion` échoue silencieusement
Dans `engine.llm.ts:561`, on appelle `appendJsonStateVersion` seulement si `applyOut.totalApplied > 0`. Si `applyOut.applied.length === 0` partout (collections inconnues du schemaMap, paths invalides...), aucune version n'est écrite. La carte d'actions affiche les `proposed_*` depuis le `metadata` du message, MAIS le state ne change pas → les patches montrent `status: "missing"` côté UI. La validation par bouton ✓ retourne alors "champ absent du JSON state".

### Hypothèse #3 — Path mismatch entre LLM et schemaMap
Le LLM émet `collection: "ecs.installations"` (vu dans le system prompt). Mais si le schemaMap dérive depuis le state initial qui n'a pas ces collections au top-level (peut-être nichées sous `informations_techniques.equipements_techniques.ecs.installations`), `applyInsertEntries` crée bien l'array (force-array), mais à un mauvais endroit, et la carte d'actions ne le retrouve plus pour le rendu.

---

## Plan correctif (3 étapes ordonnées, aucune refonte risquée tant qu'on n'a pas confirmé l'hypothèse)

### Étape 1 — Instrumentation diagnostique (5 min, ZÉRO risque)

Ajouter un `console.info` après `applyExtractResult` dans `engine.llm.ts:559` :

```ts
console.info("[apply-extract] result", {
  llm_proposed: { patches: result.patches?.length, inserts: result.insert_entries?.length },
  applied: { patches: applyOut.patches.applied.length, inserts: applyOut.insertEntries.applied.length },
  total: applyOut.totalApplied,
  state_keys_top: Object.keys(applyOut.state),
  state_keys_heating: Object.keys((applyOut.state as any).heating ?? {}),
  state_keys_ecs: Object.keys((applyOut.state as any).ecs ?? {}),
  state_keys_ventilation: Object.keys((applyOut.state as any).ventilation ?? {}),
  ecs_installations_count: ((applyOut.state as any).ecs?.installations ?? []).length,
  heating_installations_count: ((applyOut.state as any).heating?.installations ?? []).length,
  ventilation_installations_count: ((applyOut.state as any).ventilation?.installations ?? []).length,
});
```

Tu fais 1 essai, tu m'envoies la sortie console, et on sait exactement laquelle des 3 hypothèses est la bonne.

### Étape 2 — Fix ciblé selon l'hypothèse confirmée

**Si hyp. #1** (juste un malentendu UI) : pas de fix code, je t'explique où voir le JSON brut dans VTU (drawer JSON via le bouton "JSON" en haut).

**Si hyp. #2** (totalApplied = 0) : on log les `applied` détaillés, et probablement `applyPatches` rejette les paths. Fix dans `apply-patches.ts` (couche permissive comme dans `apply-insert-entries.ts`).

**Si hyp. #3** (path mismatch) : on aligne soit le prompt (pour qu'il émette le bon path), soit le schemaMap (pour exposer les collections au bon niveau). Fix le moins invasif : ajouter un mapping de paths legacy dans `apply-insert-entries.ts`.

### Étape 3 — Question précise à poser à l'autre app (si besoin)

Si après l'étape 2 on est encore bloqué :

> "Vous mentionnez `vtFullV1Schema` validé par `exportVtFull` côté serveur. Pouvez-vous partager :
> 1. Le shape exact de la collection ECS dans votre vt_schema_v1 (path absolu depuis la racine, type des items)
> 2. Le code de `buildAgentEntry(content)` qui transforme le markdown en entrée typée — comment vous mappez le markdown libre vers les champs structurés `type_value`, `fuel_value`, etc. ?
> 3. Comment l'IA différencie un message « ECS électrique 150L » d'un message « ECS thermodynamique 200L » si elle ne propose qu'un bloc markdown libre ? Y a-t-il un parser regex côté serveur, ou le LLM est-il rappelé pour structurer le markdown ?"

Cette question est utile UNIQUEMENT si on confirme que VTU doit migrer vers le modèle "markdown + post-parse serveur" (gros refactor). À ne déclencher qu'après l'étape 1.

---

## Détails techniques (section pour Lovable / dev)

**Fichiers à modifier en étape 1 :**
- `src/shared/sync/engine.llm.ts` ligne 559 → ajouter le console.info ci-dessus.

**Fichiers à inspecter en étape 2 (selon hypothèse) :**
- `src/shared/llm/apply/apply-patches.ts` (rejet des paths)
- `src/shared/types/json-state.schema-map.ts` (déclaration des collections)
- `src/shared/types/json-state.ts` (shape du state initial — ligne 83-85 : heating/ecs/ventilation au top-level confirmé)

**Pourquoi je ne propose pas de tout réécrire tout de suite :**
- L'architecture VTU actuelle (champs structurés + 3 verbes + apply permissif) est cohérente et a déjà les 3 garde-fous mentionnés par l'autre app.
- Migrer vers le modèle "markdown + sections fermées" = 2-3 jours de refactor + perte de la granularité validation par champ (qui est ce que tu vois fonctionner sur l'image avec "Validé" par champ).
- Le bug est très probablement ponctuel (apply layer ou path), pas architectural.

**Pas de changement Edge Function dans ce plan** — le LLM fait son boulot, les logs le confirment.
