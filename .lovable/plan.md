# Itération 10 — Cerveau LLM (Plan v2.1 final)

**Plan v2 + 7 corrections + 3 micro-corrections (A/B/C) + note dette router. Approuvé verbalement, j'ai besoin de l'approbation formelle pour passer en mode build et coder.**

## Décisions actées

| # | Décision |
|---|---|
| Q1 | `PPPT_NOMENCLATURE.PATHOLOGIES` (vérifié présent ligne 1092) injecté dans la nomenclature 3CL pour audit logement. |
| Q2 | PDFs **non** envoyés à Gemini → `ai_description = { skipped: true, reason: "pdf_no_render_phase2", short_caption, structured_observations: [], ocr_text: null }`. |
| Q3 | Tous les appels LLM via **server function TanStack Start** (`createServerFn`). |
| Q4 | `appendJsonStateVersion` **local pur** (Dexie + sync_queue). |
| Q5 | Mutation IA = **Option B** : `validation_status="unvalidated"`. **Field<T> étendu (étape 1.5)**. |
| Q6 | `ai_description` = **table dédiée** `attachment_ai_descriptions` (append-only). |
| Q7 | Router **hybride** : déterministe → fallback Flash-Lite uniquement pour ambigus courts. |

## Points fixés (corrections 1-7 + A/B/C)

- `role` = `"user"|"assistant"|"system"` partout
- **Pas de `messages.ai_extraction_id`** (append-only, lien via `metadata.llm_extraction_id`)
- `Field<T>` étendu (validation_status, validated_at, validated_by, source_extraction_id, evidence_refs)
- Apply-patches gates étendus aux sources `voice/photo_ocr/import` (toutes humain prime)
- describe_media schema 2 niveaux (short_caption + detailed_description ≤180 mots)
- llm_extractions enrichi (context_bundle, raw_request_summary, stable_prompt_hash, cached_input_tokens, provider_request_id)
- Caching observabilité (snapshot test sur stable_prompt_hash)
- compress.ts en **5 passes cascade** (soft trim → réduire historique → drop visible_* → strip historique → failed)
- Re-enqueue ciblée via index Dexie composite `[op+row_id]`
- Note dette router "VMC ok ?" dans KNOWLEDGE §10

## Décision pratique sur schema_version

Je garde `schema_version: 2` (le test `extended.test.ts` attend strictement v2 et bumper casserait inutilement 3 fichiers). Les nouveaux champs `Field<T>` It. 10 sont ajoutés **dans la v2** avec back-fill via `migrateVisitJsonState` (idempotent). Les tests existants `json-state-migrate.test.ts` continuent à passer sans modification.

## Migration SQL 005 ⚠

Le tool `supabase--migration` n'est pas exposé dans la session sandbox actuelle. **Le SQL est prêt** (bucket fix + visit_json_state.source_extraction_id + llm_extractions + attachment_ai_descriptions, RLS + indexes). À l'approbation, je vais essayer de l'écrire dans `supabase/migrations/` — si le système refuse, je préviens et tu déclenches manuellement via l'UI Lovable.

**Important** : les tests Vitest tournent sur fake-indexeddb (pas Supabase), donc les 157 tests passent même sans la migration appliquée en prod. La migration est requise uniquement pour le smoke-test E2E iPhone.

## Architecture fichiers à créer

```text
src/shared/llm/
  index.ts, types.ts, router.ts
  providers/lovable-gemini.ts
  prompts/{system-router, system-describe-media, system-extract, system-conversational}.ts
  schemas/{router, describe-media, extract}.schema.ts
  context/{builder, serialize-stable, compress, tokens-estimate, hash}.ts
  apply/{apply-patches, apply-custom-fields}.ts
  __tests__/  (~30 tests)
src/server/llm.functions.ts
src/shared/db/{llm-extractions, attachment-ai-descriptions}.repo.ts
src/shared/db/json-state.repo.ts  (+ appendJsonStateVersion)
src/shared/db/field-migration.ts  (helpers back-fill)
src/domain/nomenclatures/index.ts (loader)
src/domain/nomenclatures/{nf_en_16247, thce_ex}/index.ts (stubs)
```

## Modifications

- `src/shared/types/json-state.field.ts` — Field<T> étendu, helpers (emptyField, initField, aiInferField)
- `src/shared/types/json-state.migrate.ts` — back-fill It. 10 idempotent + walker
- `src/shared/types/db.ts` — SyncQueueOp += `describe_media | llm_route_and_dispatch`
- `src/shared/db/schema.ts` — Dexie v5 (attachment_ai_descriptions + llm_extractions stores + index `[op+row_id]` sur sync_queue)
- `src/shared/sync/engine.ts` — handlers processDescribeMedia + processLlmRouteAndDispatch
- `src/shared/db/messages.repo.ts` — appendLocalMessage enqueue llm_route_and_dispatch si role="user" + seuils
- `src/shared/sync/engine.ts` (processAttachmentUpload) — enqueue describe_media après ok
- `src/features/json-state/components/JsonViewerDrawer.tsx` — compteur "X champs IA non validés"
- `src/features/chat/components/MessageList.tsx` — loader chat (useLiveQuery sync_queue)
- `KNOWLEDGE.md` — §8 [x] It. 10, §10 dettes, §15 NOUVEAU "Cerveau LLM"

## Tests cibles : 127 → ~157

| Fichier | Nb |
|---|---|
| field-migration.test.ts | 4 (back-fill, idempotent, ai_infer→unvalidated, init→validated) |
| router.test.ts | 7 (médias, "?", "R+2", "HSP 2.7", "VMC ok ?", "ok"→llm, "résume...") |
| describe-media.test.ts | 4 |
| extract.test.ts | 7 (incl. voice/photo_ocr/import non-null → ignoré) |
| conversational.test.ts | 2 |
| context-builder.test.ts | 6 (incl. compress 5 passes) |
| engine.llm.test.ts | 4 (incl. re-enqueue describe_media réveille route_and_dispatch) |

## Questions résiduelles

**Aucune bloquante.**

**LOVABLE_API_KEY confirmée** présente dans secrets Supabase (visible dans `<secrets>`).

**1 inconnue couverte par fallback** : si l'API Gemini Gateway diverge sur `response_format` JSON schema, je convertis vers tool calling — je préviens avant de coder.

---

**À l'approbation : code en un seul passage. Cible 157/157 verts.**
