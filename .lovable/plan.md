Je comprends le blocage : le toast affiché vient du fait que la proposition reste adressée en path positionnel (`heating.installations[0].type_value`). Même si l’apply a commencé à créer l’entrée, il reste encore des chemins de rejet et surtout la lecture/validation UI (`walkJsonPath`) ne sait pas relire ce format positionnel, donc la card classe le champ en `missing` et affiche “champ absent du JSON state”.

Plan d’implémentation ciblé :

## 1. Durcir `apply-patches.ts` en “zéro rejet”

Fichier :
```text
src/shared/llm/apply/apply-patches.ts
```

Changements :
- Supprimer le type `ApplyPatchIgnoreReason`.
- Garder la propriété `ignored` dans le résultat uniquement pour compatibilité, mais elle sera toujours `[]`.
- Supprimer tous les retours fonctionnels de rejet :
  - `path_not_found`
  - `not_a_field`
- Modifier la résolution de cible pour qu’elle retourne toujours un parent + key :
  - Path UUID : `collection[id=...].field`
    - crée/écrase les conteneurs intermédiaires si nécessaire,
    - force la collection en array,
    - crée l’entrée si l’id n’existe pas,
    - pose le field.
  - Path positionnel : `heating.installations[0].type_value`
    - force `heating.installations` en array,
    - si l’entrée indexée n’existe pas : crée un skeleton et l’ajoute,
    - si l’entrée existe mais n’est pas un objet : la remplace par un skeleton,
    - pose le field.
  - Path objet simple : `building.wall_material_value` ou path inventé
    - traverse les segments,
    - si un conteneur manque ou est primitif/array : l’écrase par `{}`,
    - pose un `Field<T>` neuf au leaf.
- Si la cible existe mais n’est pas un `Field<T>`, l’écraser avec `aiInferField(...)` au lieu de rejeter.

Contrat final :
```text
patch reçu -> chemin créé/écrasé -> Field ai_infer/unvalidated posé -> ignored=[]
```

## 2. Durcir `apply-insert-entries.ts` en “zéro rejet”

Fichier :
```text
src/shared/llm/apply/apply-insert-entries.ts
```

Changements :
- Supprimer le type `ApplyInsertIgnoreReason`.
- Garder `ignored` dans le résultat pour compatibilité, mais toujours `[]`.
- Remplacer `ensureArrayAtPath` par une version qui force le chemin :
  - si un segment intermédiaire est absent, primitif ou array : remplacé par `{}`,
  - si le dernier segment est absent, primitif ou objet : remplacé par `[]`,
  - puis l’entrée est ajoutée.
- Conserver les deux fixes déjà faits :
  - dedup intra-call,
  - `is_empty` quand aucune key non réservée n’est posée.

Contrat final :
```text
insert_entry reçu -> collection forcée en array -> entrée créée/mergée -> ignored=[]
```

## 3. Corriger la lecture/validation UI des paths positionnels

Fichier :
```text
src/shared/llm/apply/path-utils.ts
```

Pourquoi c’est nécessaire : la card lit le JSON courant avec `walkJsonPath`. Aujourd’hui, ce walker ne supporte que :
- `building.wall_material_value`
- `collection[id=...].field`

Il ne supporte pas :
```text
heating.installations[0].type_value
```

Donc même si `apply-patches.ts` a bien écrit dans `heating.installations[0].type_value`, la card peut encore dire “champ absent”.

Changements :
- Ajouter un parseur positionnel partagé :
```text
collection[N].field
```
- `walkJsonPath` résoudra aussi ce format :
  - trouve la collection,
  - lit l’entrée à l’index,
  - retourne `{ parent: entry, key: field }`.
- `validateFieldPatch` et `rejectFieldPatch` fonctionneront alors sur les patches positionnels déjà écrits.

Contrat final :
```text
Card -> readField(positionnel) trouve le Field -> status unvalidated -> clic ✓ valide sans toast
```

## 4. Éviter les doublons d’entrées dans le scénario PAC Hitachi

Cas concret :
```text
patches:
  heating.installations[0].brand = Hitachi
  heating.installations[0].type_value = pompe_a_chaleur_air_eau
```

Résultat attendu après apply :
```text
heating.installations = [
  {
    id: "...",
    brand: Field(value="Hitachi", source="ai_infer", validation_status="unvalidated"),
    type_value: Field(value="pompe_a_chaleur_air_eau", source="ai_infer", validation_status="unvalidated"),
    ...skeleton fields
  }
]
```

Le deuxième patch doit utiliser l’entrée créée par le premier patch, pas créer une entrée vide séparée.

## 5. Nettoyer les métadonnées de sortie côté engine

Fichier :
```text
src/shared/sync/engine.llm.ts
```

Changements :
- Laisser `ignored_paths` et `ignored_inserts` pour compatibilité/debug, mais ils seront toujours vides sur les nouveaux appels.
- Mettre à jour les commentaires obsolètes qui parlent encore de bugs structurels ignorés.

## 6. Mettre à jour les commentaires/types obsolètes

Fichiers ciblés :
```text
src/shared/llm/types.ts
src/shared/types/json-state.schema-map.ts
src/shared/llm/apply/apply-extract-result.ts
src/shared/llm/apply/path-utils.ts
```

Changements :
- Retirer les commentaires disant que les paths positionnels sont rejetés.
- Clarifier que l’apply layer est permissif total : il matérialise, l’utilisateur arbitre ensuite.

## 7. Tests Vitest à réécrire/ajouter

Fichier :
```text
src/shared/llm/__tests__/apply-patches.test.ts
```

Tests :
- `heating.installations[0].brand` + `heating.installations[0].type_value` sur array vide :
  - `ignored=[]`,
  - une seule entrée heating,
  - les deux fields sont posés.
- Path objet qui traverse un primitif :
  - le primitif est écrasé par `{}`,
  - le field est posé,
  - `ignored=[]`.
- Cible existante non-Field :
  - écrasée par un Field neuf,
  - `ignored=[]`.
- Path inconnu profond :
  - auto-vivify complète,
  - `ignored=[]`.

Fichier :
```text
src/shared/llm/__tests__/apply-insert-entries.test.ts
```

Tests :
- Collection path qui traverse un primitif :
  - écrase le primitif,
  - crée l’array,
  - ajoute l’entrée,
  - `ignored=[]`.
- Dedup intra-call conservé : 3 variantes PAC -> 1 seule entrée mergée.
- Entrée vide conservée avec `is_empty: true`.

Fichier :
```text
src/shared/llm/__tests__/apply-extract-result.test.ts
```

Tests :
- Scénario PAC Hitachi complet via orchestrateur :
  - deux patches positionnels,
  - une seule entrée,
  - `brand` + `type_value`,
  - `patches.ignored=[]`,
  - `insertEntries.ignored=[]`.

Fichier possible si déjà cohérent avec les patterns :
```text
src/shared/llm/__tests__/path-utils.test.ts
```

Test :
- `walkJsonPath(state, "heating.installations[0].type_value")` retrouve bien le field après apply.

## Validation attendue après implémentation

- Scénario PAC Hitachi : la card ne doit plus afficher “champ absent du JSON state”.
- `heating.installations` doit contenir une seule entrée pleine avec :
  - `brand=Hitachi`,
  - `type_value=pompe_a_chaleur_air_eau`.
- Clic ✓ sur “Chauffage · Type” doit valider sans erreur.
- Inspecteur IA bloc 1 : `ignored_paths=[]` et `ignored_inserts=[]` pour les nouveaux appels.
- Le toggle Conv/JSON et `ai_route_mode` ne sont pas touchés.
- La fonction IA distante n’est pas touchée.