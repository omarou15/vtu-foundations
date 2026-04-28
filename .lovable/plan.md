# Diagnostic + correction : l'IA ne répond pas

## Cause racine identifiée

Capture d'écran : tu as envoyé "Bonjour" (7 caractères) et "test" (4 caractères) → aucune réponse de l'IA, aucun appel réseau capturé, aucun log côté edge function.

Diagnostic complet effectué :

1. ✅ **Edge function `vtu-llm-agent`** : testée en direct avec `curl`, répond en 1.6s avec un tool-call Gemini valide. La nouvelle table `llm_system_prompts` est bien lue (sinon erreur 500).
2. ✅ **Migration DB** : table créée, RLS OK, trigger « un seul actif par user » OK.
3. ✅ **Client edge-function-client.ts** : code propre, gère bien JWT + payload.
4. ❌ **Côté enqueue** : l'appel n'est **jamais déclenché** parce qu'une vieille gate filtre les messages courts.

### Le bug

Dans `src/shared/db/messages.repo.ts` lignes 73-76 :

```ts
const shouldDispatchLlm =
  aiEnabled &&
  input.role === "user" &&
  (contentLen >= 10 || attachmentCount > 0);
```

Tout message texte de **moins de 10 caractères** est silencieusement écarté du dispatch LLM. "Bonjour" (7c), "test" (4c), "ok", "merci", "oui", "non" → jamais envoyés au LLM.

C'est une gate héritée d'une époque où on craignait de surcharger le LLM avec du bavardage. Avec la doctrine actuelle :
- toggle IA explicite par visite,
- prompt système qui gère lui-même les salutations (`<edge_cases>` : « Salutation / "ok" / "merci" → réponse simple, aucune proposition »),

…cette gate est devenue **nuisible** : elle rend l'IA muette pour les messages les plus naturels en début de conversation.

## Correction

**Un seul fichier touché** : `src/shared/db/messages.repo.ts`.

Remplacer la gate `contentLen >= 10` par : « le message a au moins quelque chose (texte non vide OU au moins 1 attachment) ». Le toggle IA + le prompt système suffisent à gérer les cas triviaux.

```ts
const hasSomething =
  (input.content ?? "").trim().length > 0 || attachmentCount > 0;
const shouldDispatchLlm =
  aiEnabled && input.role === "user" && hasSomething;
```

## Validation

1. `bunx vitest run` — vérifier que les 260 tests passent toujours (aucun test ne couvre la gate `>= 10`, vérifié par grep).
2. `supabase--curl_edge_functions` — refaire un appel direct pour reconfirmer la chaîne serveur (déjà OK, mais sanity check après build).
3. **Test fonctionnel via la preview** : envoyer "Bonjour" depuis l'UI, vérifier qu'une réponse assistant arrive en <5s, et que l'inspecteur IA `/settings/dev` montre l'appel avec ton prompt système actif.

Je ne te recontacterai qu'une fois ces 3 étapes vertes.

## Pourquoi c'était invisible jusqu'ici

- Aucun log côté client ni côté edge → le message « disparaissait » silencieusement dans le `if`.
- Les tests existants utilisent tous des messages longs (descriptions techniques) → la gate n'a jamais été déclenchée en test.
- Les changements récents (refonte prompt, table éditable) n'ont pas touché à ce fichier → on cherchait dans la mauvaise direction.

Hors scope : ajouter un test de non-régression sur la gate (juste 1 it() qui vérifie qu'un message "ok" enqueue bien un `llm_route_and_dispatch`). Je l'ajoute aussi pendant que j'y suis, c'est trivial et ça scelle le bug.
