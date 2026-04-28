# Hardening JSON Schema fields + message d'exemple générique

## Pourquoi

Le LLM continue à émettre `fields: {}` malgré le filtre côté code. La cause racine : le tool schema autorise un objet vide. En ajoutant `minProperties: 1` au sous-objet `fields`, le gateway lui-même rejette ces tool-calls invalides → le LLM est forcé de retry avec un objet rempli (ou pas du tout).

Bonus : le message de fallback contient encore "PAC air-eau Daikin 8 kW électrique" (= l'input utilisateur), ce qui crée l'illusion que le LLM répète. On le remplace par un exemple générique sans rapport avec un input typique.

## Changements

### 1. `supabase/functions/vtu-llm-agent/index.ts`

**a)** Dans `PROPOSE_VISIT_PATCHES_TOOL.function.parameters.properties.insert_entries.items.properties.fields` (vers ligne 199-204), ajouter `minProperties: 1`.

**b)** Dans la garde anti-hallucination (vers ligne 460-470), remplacer les 2 occurrences de `'PAC air-eau Daikin 8 kW électrique'` par `'chaudière gaz 24 kW de 2018'`.

### 2. `src/server/llm.functions.ts`

Dans `EXTRACT_TOOL_PARAMS.properties.insert_entries.items.properties.fields` (vers ligne 178-183), ajouter `minProperties: 1` et mettre à jour la description.

### 3. Tests + déploiement

- `bunx vitest run` → doit rester 257/257.
- Déployer `vtu-llm-agent`.

## Fichiers touchés

- `supabase/functions/vtu-llm-agent/index.ts`
- `src/server/llm.functions.ts`

Pas de migration DB. Pas de changement de prompt système.
