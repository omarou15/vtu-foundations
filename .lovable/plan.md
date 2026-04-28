# Plan — Historique IA illimité + compression progressive auto

## Objectif

Lever le cap actuel de 8 messages envoyés à l'IA, et le remplacer par une compression **progressive et automatique** des messages : on garde tous les messages tant qu'on tient dans le budget tokens, sinon on dégrade par étapes au lieu de tronquer brutalement.

## État actuel (3 caps en cascade)

```text
src/shared/sync/engine.llm.ts:335     .slice(-8)                       (lecture Dexie)
src/shared/llm/context/builder.ts:48  DEFAULT_MAX_RECENT_MESSAGES = 20 (cap builder)
src/shared/llm/context/compress.ts:28 RECENT_MESSAGES_HARD_LIMIT = 8   (passe 2 hard cap)
```

Conséquence : même si on lève les deux premiers, la passe 2 retombe à 8 dès qu'on dépasse 12k tokens. Aucune compression intermédiaire.

## Changements

### 1. Lecture Dexie illimitée — `src/shared/sync/engine.llm.ts`

Supprimer le `.slice(-8)` ligne 335. Charger tout l'historique trié chronologiquement.

### 2. Builder sans cap par défaut — `src/shared/llm/context/builder.ts`

`DEFAULT_MAX_RECENT_MESSAGES = Number.POSITIVE_INFINITY`. Le `.slice(-Infinity)` retourne le tableau complet. Le paramètre reste configurable pour les tests.

### 3. Refonte `compress.ts` — compression progressive des messages

Remplacer la passe 2 actuelle (hard cap à 8) par **5 sous-passes graduelles** sur `recent_messages`, appliquées dans cet ordre seulement si le budget n'est pas tenu après chaque sous-passe :

```text
Pass 1   soft trim ocr_text > 500c                            (inchangé)
Pass 2a  tronquer messages assistant > 800 chars              (… + suffixe)
Pass 2b  tronquer messages user > 1500 chars                  (… + suffixe)
Pass 2c  garder les 50 derniers messages
Pass 2d  garder les 20 derniers messages
Pass 2e  garder les 8 derniers messages (filet final)
Pass 3   drop ocr_text complet sur attachments_context        (inchangé)
Pass 4   strip detailed_description + state non essentiel     (inchangé)
Pass 5   failed                                                (inchangé)
```

Chaque sous-passe re-mesure les tokens via `estimateTokens` et sort dès qu'on est sous le budget. `passes_applied` devient un compteur cumulatif (0 à 9) pour conserver la traçabilité dans `llm_extractions.raw_request_summary`.

### 4. Inspecteur Dev — `src/routes/_authenticated/settings.dev.tsx`

Mettre à jour l'affichage du catalogue Bloc 2 : remplacer la mention "limite 8 messages" par la nouvelle table de passes (Pass 1 → Pass 5) avec leurs seuils, pour que le diagnostic reflète le vrai pipeline.

### 5. Tests Vitest

- Mettre à jour `src/shared/llm/__tests__/context.test.ts` (si assertions sur `slice(-8)`).
- Ajouter `src/shared/llm/context/__tests__/compress.test.ts` couvrant : (a) bundle léger → 0 passe, (b) bundle moyen → soft trim ocr suffit, (c) bundle long historique → escalade 2a→2b→2c, (d) bundle énorme → finit par 2e ou `failed`.
- Vérifier que les 265 tests existants restent verts.

## Risques assumés

- **Coût tokens** : visites longues = bundles plus gros tant qu'on est sous budget. Acceptable, c'est le but.
- **Latence LLM** : marginale (+100-300 ms sur visites de 100+ messages).
- **Qualité IA** : meilleure mémoire conversationnelle. Le LLM voit tout l'historique et peut référencer des échanges anciens.
- **Sécurité / RLS / JSON state** : aucun impact, on ne touche que la lecture et la sérialisation.

## Hors scope

- Pas d'override Dev manuel des passes (reporté Lot 2).
- Pas de toggle "tout / 50 / 20 / 8" dans l'UI utilisateur.
- Pas de modif edge function `vtu-llm-agent` (accepte déjà un tableau de longueur arbitraire).
