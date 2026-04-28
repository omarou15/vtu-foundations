# Lot A.5 — Fixes ciblés Lot A

3 bugs résiduels après Lot A. Chaque fix est local, idempotent, et accompagné d'1 nouveau test Vitest. Aucun changement edge function, prompt, ou pipeline.

## Fix 1 — `apply-patches.ts` : promote positional sur array vide en insert auto-vivified

**Fichier** : `src/shared/llm/apply/apply-patches.ts`

Dans `resolvePatchTarget`, branche `POSITIONAL_RE` (lignes ~117-130) :
- Aujourd'hui : si `arr[idx]` n'existe pas → `path_not_found`. Le patch reste fantôme dans `metadata.proposed_patches` et apparaît dans la card avec status `missing` → click ✓ déclenche toast d'erreur.
- Après : créer une nouvelle entrée minimale (via `buildEmptyCollectionEntry(collection)` ou skeleton minimal `{ id: uuidv4(), custom_fields: [] }`), l'append dans l'array, et retourner `{ reason: "ok", parent: skeleton, key: field }`. Le patch devient appliqué normalement.

Ajouter imports manquants : `import { v4 as uuidv4 } from "uuid"` et `buildEmptyCollectionEntry` (déjà importé).

**Effet** : un patch `ventilation.installations[0].type_value="vmc_double_flux"` sur array vide crée une entrée Ventilation avec ce field. Plus de fantôme.

## Fix 2 — `apply-insert-entries.ts` : dedup intra-call

**Fichier** : `src/shared/llm/apply/apply-insert-entries.ts`

Dans la boucle `for (const op of input.insertEntries)`, **avant** d'appeler `arr.push(skeleton)` :
1. Construire la liste des entrées déjà créées dans CE call sur la même collection (lookup via `applied[].entryId` puis `arr.find(e => e.id === entryId)`).
2. Pour chaque entrée existante, tester si au moins une key non-réservée a la même valeur primitive que dans `op.fields` (compare `entry[k].value === op.fields[k]` quand `entry[k]` est un `Field<T>`).
3. Si match : merger les nouveaux fields dans cette entrée existante (sans écraser un `Field<T>` déjà posé), pousser un `applied` entry avec `merged_into_existing: true` et `continue`.
4. Sinon : comportement actuel (créer une nouvelle entrée).

Helper local `isFieldShape(node)` (copie de celui d'`apply-patches.ts`).

Étendre le type `applied[]` avec un champ optionnel `merged_into_existing?: boolean`. Pas de breaking change pour les call-sites existants.

**Effet** : pour 1 message "PAC Air/Eau 12 kW" qui produit 3 inserts variants partageant `type_value: "PAC air-eau"`, une seule entrée est créée avec les fields mergés.

## Fix 3 — Entrées vides : warning + UI dédiée

**Fichier 1** : `src/shared/llm/apply/apply-insert-entries.ts`
- Étendre `applied[]` avec `is_empty?: boolean` quand `validKeys.length === 0` après filtrage (cas `fields: {}` ou seulement keys réservées).

**Fichier 2** : `src/features/chat/components/PendingActionsCard.tsx`
- Dans `InsertRowItem` (lignes 526-539), branche `open && row.values.length === 0` : afficher un paragraphe italique muted :
  > "Entrée créée sans champ détecté — l'IA n'a rien réussi à structurer. Tu peux la rejeter ou la garder vide."
- Ajouter une variante visuelle légère (border ou badge orange) sur la row si `values.length === 0` pour signaler à l'œil.

**Effet** : plus de section dépliée vide silencieuse.

## Tests Vitest

**Fichier** : `src/shared/llm/__tests__/apply-patches.test.ts`
- Ajouter test : "positional sur array vide → promu en insert (entrée créée avec field initial)".
  - Patch : `ventilation.installations[0].type_value="vmc_double_flux"`.
  - Attendre `applied.length === 1`, `ignored.length === 0`, et `state.ventilation.installations[0].type_value.value === "vmc_double_flux"`.
- Mettre à jour le test existant ligne 187 ("index positionnel sur entrée inexistante → path_not_found") : il devient invalide. Le remplacer par "index positionnel sur entrée inexistante → auto-promote, entrée créée".

**Fichier** : `src/shared/llm/__tests__/apply-insert-entries.test.ts`
- Ajouter test : "2 inserts même collection avec field commun → dedup, 1 seule entrée mergée".
  - 2 ops sur `heating.installations`, partageant `type_value: "PAC"`, avec d'autres fields différents.
  - Attendre `applied.length === 2`, mais `state.heating.installations.length === 1`, et l'entrée contient les fields des 2 ops.
- Ajouter test : "insert avec uniquement keys réservées → entrée vide marquée `is_empty`".

## Validation manuelle (utilisateur après ship)

1. Photo VMC → 0 fantôme dans la card, l'entrée Ventilation contient `type_value=vmc_double_flux` (et `location_value=combles` si extrait).
2. Message "PAC Air/Eau 12 kW Daikin" → 1 seule "Chauffage · nouvelle entrée" avec `type_value` + `power_kw` + `brand` mergés.
3. Si une entrée vide est créée → message "l'IA n'a rien réussi à structurer" affiché à la place du contenu déplié.

## Hors-scope (confirmé)

- Refonte du prompt système pour éviter les positional patches en amont.
- Synthétiseur cross-photos.
- Nomenclature canonique.
- Edge function `vtu-llm-agent` : aucun changement.

## Détails techniques

```text
apply-patches.ts (POSITIONAL_RE branch)
  m matches → arr = ensureArrayAtPath(...)
  if (!arr) → path_not_found
  if (!arr[idx]) → 
    skeleton = buildEmptyCollectionEntry(collection) ?? { id: uuid(), custom_fields: [] }
    arr.push(skeleton)
    return { ok, parent: skeleton, key: field }
  else → { ok, parent: arr[idx], key: field }
```

```text
apply-insert-entries.ts (dedup loop)
  for op in insertEntries:
    skeleton = build(...)
    populate validKeys
    arr = ensureArrayAtPath(...)
    
    // NEW dedup
    existingThisCall = applied
      .filter(a => a.collection === op.collection)
      .map(a => arr.find(e => e.id === a.entryId))
      .filter(Boolean)
    target = existingThisCall.find(entry =>
      Object.entries(op.fields).some(([k, v]) =>
        !isReservedItemKey(k) &&
        isFieldShape(entry[k]) &&
        entry[k].value === v
      )
    )
    if target:
      merge non-reserved keys into target (skip existing Field<T>)
      applied.push({ ...target metadata, merged_into_existing: true })
      continue
    // END dedup
    
    arr.push(skeleton)
    applied.push({ ..., is_empty: validKeys.length === 0 })
```

## Risques

- Le test existant ligne 187 d'`apply-patches.test.ts` doit être réécrit (changement de comportement assumé).
- Si le LLM produit `installations[0]` ET `installations[1]` simultanément sur array vide, on créera 2 entrées dans l'ordre (correct).
- Le dedup est conservatif : il faut au moins une key+value identique. Risque faible de fusionner 2 vraies entrées différentes.
