## Itération 11 — Validation IA en masse + conflits + filtre "À traiter"

### Constats de l'audit

1. **Validation 1-par-1 uniquement** : `PendingActionsCard` valide patch par patch sur le message porteur ; pas d'agrégation transverse. Le bouton "Tout valider" existe mais reste **scopé au message courant**, pas à une section.
2. **Compteur "X champs IA non validés"** : déjà calculé par `countUnvalidatedAiFields` et affiché **dans le drawer JSON** uniquement. Pas en haut de la VT (dans le sous-header), donc invisible quand le user est en train de discuter.
3. **Conflits silencieusement ignorés** : `applyPatches` rejette tout patch IA qui écraserait une valeur humaine (`reason: "human_source_prime"`). Ces patches ignorés sont déjà sérialisés dans `metadata.ignored_paths` du message assistant — mais **rien ne les rend visibles** dans la UI. C'est la racine du problème "conflit".
4. **Filtre drawer JSON** : `JsonViewerDrawer` rend l'arbre brut sans filtre — pas de mode "À traiter".

### Plan d'implémentation

#### 1. Header VT — compteur "X champs IA à valider" cliquable

- Dans `src/routes/_authenticated/visits.$visitId.tsx`, ajouter dans le sous-header (ligne du toggle IA) un badge compact `{N} à valider` + `{C} conflit(s)` — visible en permanence, click ouvre directement le **drawer JSON en mode "À traiter"**.
- Live counts via Dexie : `countUnvalidatedAiFields(state)` (existe) + nouveau `countActiveConflicts(state, messages)`.

#### 2. Détection des conflits — nouveau helper

`src/features/json-state/lib/conflicts.ts` :
- Type `Conflict { path, label, humanValue, aiValue, aiConfidence, aiMessageId, aiPatch }`.
- Fonction `findActiveConflicts(state, messages)` : pour chaque message `actions_card` non-archivé, parcourt `metadata.ignored_paths` filtrés par `reason === "human_source_prime"`, va lire le `Field<T>` actuel (la valeur humaine) et croise avec `metadata.proposed_patches[path]` (la valeur IA proposée). Ne garde que les conflits "vivants" (la valeur humaine n'a pas changé depuis).
- Idempotent et pur (testable unitaire).

#### 3. Carte "Conflit" inline dans le chat

`src/features/chat/components/ConflictCard.tsx` (nouveau) :
- Rendu côte à côte des 2 valeurs (Apple/Linear style : 2 cartes mini, pastilles "Saisie manuelle" / "Proposition IA + confidence").
- 3 actions : `Garder la mienne` / `Prendre celle de l'IA` / `Garder les deux dans une note` (3e = ajoute un `observations.notes` libre, optionnel — décider plus tard si trop coûteux, bouton primaire reste les 2 premiers).
- Backend :
  - `Garder la mienne` → marque le `Field<T>` humain comme `validation_status="validated"` (acte explicite) + log dans metadata du message conflit que le user a tranché → la carte disparait.
  - `Prendre IA` → bypass le gate `human_source_prime` : on overwrite le Field via un nouveau helper `overrideWithAiPatch({path, patch, sourceMessageId})` qui pose un `aiInferField` puis le valide automatiquement (puisque l'utilisateur vient d'arbitrer en sa faveur).
- Affichage : un message `kind="conflict_card"` est créé par l'engine LLM s'il y a au moins un patch ignoré pour `human_source_prime`. Le `MessageList` rend `ConflictCard` dans ce cas.

> Alternative plus simple si on veut éviter un nouveau kind : exposer les conflits **uniquement dans le drawer JSON** (section "Conflits à arbitrer") + un badge dans le header. Le brief demande "voir une carte" donc on choisit la carte inline. Limiter à 1 carte par patch (pas de doublons), avec collapsing si plus de 5.

#### 4. Validation par section ("Tout valider l'enveloppe")

Dans le **drawer JSON** (le seul endroit où on a une vue arborescente) :
- Au-dessus de chaque section (`envelope`, `heating`, etc.), si elle contient des Field IA non-validés, afficher un mini bandeau sticky : `Enveloppe — 8 champs IA à valider` + 2 boutons `Tout valider` / `Tout rejeter`.
- Backend : nouveau helper `validateSectionPatches({userId, visitId, sectionPath})` et `rejectSectionPatches(...)` qui collectent tous les paths sous la section avec `source==="ai_infer" && validation_status==="unvalidated"`, puis appliquent en **une seule** nouvelle version JSON state (transaction atomique = 1 version, pas N versions).
- Existant `validateFieldPatch` est par-champ ; on factorise via une fonction interne `applyValidationOps(state, ops[])` réutilisée par les 2 entry points.

#### 5. Drawer JSON — mode "À traiter" / "Tout"

- Ajouter un toggle segmenté en haut du drawer : `Tout` | `À traiter` (default `Tout` pour pas dépayser, switch persistant via store).
- Mode "À traiter" :
  - Filtre l'arbre pour ne montrer **que** les sections qui contiennent au moins un Field `ai_infer + unvalidated` ou un conflit actif.
  - À l'intérieur d'une section, masque les Field déjà validés. Si un conflit actif existe sur le path, badge orange "Conflit" cliquable qui scrolle/ouvre la ConflictCard correspondante.
  - Affiche en haut un récap : `12 champs · 3 conflits · 4 sections`.
  - Quand vide → empty state "Tout est traité ✓".
- Implémentation : on remplace `<JsonView>` par un viewer custom **uniquement en mode "À traiter"** (la lib externe ne permet pas le filter par node). En mode "Tout", on garde la lib actuelle.

#### 6. Doctrine "audit < 60s"

- Garantir que depuis le badge header, en 2 clicks max, on est sur la section problématique. Validation par section = 1 click pour 8 champs.
- Animations : `framer-motion` déjà disponible ? Vérifier — sinon micro-transitions Tailwind (`transition-all duration-150`) pour les disparitions de cards (Linear-like).

### Fichiers touchés / créés

**Créés** :
- `src/features/json-state/lib/conflicts.ts` — détection conflits actifs.
- `src/features/json-state/lib/section-paths.ts` — collecte récursive des paths sous une section.
- `src/shared/db/json-state.validate.repo.ts` (déjà existant) — ajout `validateSectionPatches`, `rejectSectionPatches`, `overrideWithAiPatch`.
- `src/features/chat/components/ConflictCard.tsx` — UI carte conflit.
- `src/features/json-state/components/JsonViewerFiltered.tsx` — vue custom filtrée mode "À traiter".
- Tests : `conflicts.test.ts`, `validate-section.test.ts`, `conflict-card.test.tsx`.

**Édités** :
- `src/routes/_authenticated/visits.$visitId.tsx` — badges header + handler ouverture drawer en mode "À traiter".
- `src/features/json-state/components/JsonViewerDrawer.tsx` — toggle Tout/À traiter, bandeaux section + boutons "Tout valider/rejeter" par section.
- `src/features/json-state/lib/inspect.ts` — export d'un helper `findUnvalidatedAiFieldPaths` (liste, pas seulement count).
- `src/features/json-state/index.ts` — exports.
- `src/features/chat/components/MessageList.tsx` — render `ConflictCard` quand `kind === "conflict_card"`.
- `src/shared/sync/engine.llm.ts` — après `applyPatches`, si conflits `human_source_prime` ≥ 1 → créer un message `kind="conflict_card"` séparé du `actions_card` (ou attaché à lui via metadata, à arbitrer côté implémentation pour éviter la pollution du fil).
- `src/shared/db/messages.repo.ts` / `MessageKind` type — ajouter `"conflict_card"`.
- `src/features/chat/store.ts` — ajout slice `jsonViewerMode: "all" | "todo"` persisté.
- `KNOWLEDGE.md` — section §15 / changelog It. 11.

### Choix UX assumés (style Linear/Notion)

- **Badge header** : pill compacte fond `bg-primary/10` text `text-primary` + chiffre tabular-nums. Click = scale-up subtil.
- **Bandeau section dans drawer** : sticky en haut de chaque section repliable, fond `bg-card/95 backdrop-blur`, séparateur `border-b border-border`.
- **ConflictCard** : 2 colonnes égales sur desktop, stack vertical mobile. La colonne IA a un liseré gauche `border-l-2 border-primary` et icône `Sparkles`. La colonne humaine a `border-l-2 border-muted-foreground/40` et icône `User`. Bouton primaire = celui qui n'a pas la valeur la plus récente (heuristique : on met en avant l'action la plus probable, sans la pré-sélectionner).
- **Animations** : `transition-all duration-200 ease-out` + `animate-in fade-in slide-in-from-bottom-1` sur apparition, `animate-out fade-out` sur disparition après validation.
- **Pas de modal** : tout reste en flux (chat ou drawer). Cohérent avec la doctrine 20/60/20.

### Ce qu'on ne fait PAS dans cette itération

- Pas d'undo bulk (un "Annuler" toast suffit pour l'unitaire ; trop coûteux à implémenter sans changer le modèle de versions).
- Pas de raccourcis clavier (visite = mobile-first ; à voir Phase 4 desktop).
- Pas de batch validate cross-sections ("Tout valider la VT") — risque de catastrophe en 1 click. Section reste le bon grain.
