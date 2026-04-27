## Itération 10 — Steps 6 → 9 (LLM Brain wiring + tests + UI + doc)

Foundations livrées en Steps 1-5 (build vert, 127/127 tests). On câble maintenant le cerveau dans le sync engine, on monte l'UI minimale, on ajoute ~30 tests et on documente. **2 corrections préalables** avant Step 6.

---

### Pré-requis : Corrections A & B

**A. `apply-patches.ts` — gate confidence sur ai_infer unvalidated**
- Avant d'écrire un nouveau Field<T> dont `cur.source === "ai_infer"` et `cur.validation_status === "unvalidated"`, comparer la confidence actuelle vs nouvelle (mapping `high=0.9 / medium=0.7 / low=0.4 / null=0`).
- Si `score(cur.confidence) >= score(patch.confidence) - 0.1` → `ignored` avec reason `lower_or_equal_confidence_than_current`.
- Effet : en cas d'égalité (medium → medium), la 1re extraction prime. Seul un `high` peut écraser un `low`/`medium` plus ancien.

**B. `router.ts` — patterns terrain métier**
- Ajouter `TERRAIN_PATTERNS` (chiffres+unités m²/kW/kWh/kVA/cm/mm/°C/hPa/m, codes RT/RE/R+n/HSP, acronymes VMC/ECS/ITI/ITE/PAC/AEP/EU/EP/EVRT/GTB/CTA/UTA/FCU/BAES).
- Ordre final des règles déterministes : `media → non_user → empty → noise → conversational_hint → terrain_pattern → short_capture (≤4 mots) → default_extract`.
- Doctrine arbitrée : **conversational_hint prime sur terrain_pattern** (ex: « résume cette VT, surface 145 m² » → `conversational`). Documenté dans la dette §10.

---

### Step 6 — Sync engine handlers

#### 6.1 Type `SyncQueueOp` étendu
```ts
type SyncQueueOp = "insert" | "update" | "attachment_upload"
                 | "describe_media" | "llm_route_and_dispatch";
```

#### 6.2 `processDescribeMedia(supabase, entry)`
Pipeline :
1. Charger attachment Dexie. Introuvable → `mark synced`. PDF → écrire `appendLocalAttachmentAiDescription` avec `description.skipped=true, reason="pdf_no_render_phase2"` + réveiller jobs `llm_route_and_dispatch` en attente, return ok.
2. Idempotence : si `getLatestAiDescriptionForAttachment(att.id)` existe → mark synced.
3. Dépendance : si `attachment.sync_status !== "synced"` → `scheduleDependencyWait("attachment_not_uploaded")`.
4. Récupérer URL signée Storage du `compressed_path` (TTL 60s) via `supabase.storage.from(bucket).createSignedUrl(...)`. Étendre `SyncSupabaseLike.storage.from()` avec `createSignedUrl?`.
5. Appeler `describeMedia` server fn. Si `ok` → parser `result_json`/`raw_response_json`, écrire `appendLocalAttachmentAiDescription` + `appendLocalLlmExtraction` (mode `describe_media`, confidence/tokens/hash/raw response). Mark synced. Réveiller jobs en attente (cf. ci-dessous).
6. Erreurs : `rate_limited` → `scheduleDependencyWait` sans incrément (cap 3 tries puis status `rate_limited`). `payment_required` → mark failed + log llm_extractions status `failed`. `malformed_response` → 1 retry puis mark failed `malformed`. Sinon → `scheduleRetryOrFail` standard.

**Réveil jobs (Correction C v2.1) :**
```ts
const pending = await db.sync_queue
  .where("[op+row_id]").equals(["llm_route_and_dispatch", attachment.message_id])
  .filter(j => j.next_attempt_at > now && j.sync_status !== "synced")
  .toArray();
for (const j of pending) await db.sync_queue.update(j.id, { next_attempt_at: now });
```

#### 6.3 `processLlmRouteAndDispatch(supabase, entry)`
1. Charger message. `role !== "user"` → mark synced (anti-boucle défensive).
2. Charger visit + dernier `visit_json_state`.
3. Charger attachments du message ; si l'un n'est pas `synced` → `scheduleDependencyWait("attachments_not_synced")`. Si pas de description IA → `scheduleDependencyWait("ai_description_pending")`.
4. Charger les 8 derniers messages de la visite + descriptions IA des attachments.
5. `buildContextBundle(...)` puis `compressIfNeeded()` (Step 5). Si `failed` → log llm_extractions `failed` avec error_message `context_too_large_after_compress` + mark synced.
6. Router déterministe `routeMessage({ role, kind, content })` ; si `needsLlm` → `routeMessageLlm` server fn.
7. Switch :
   - `ignore` → mark synced.
   - `extract` → `extractFromMessage` server fn → parse → `applyPatches` → `applyCustomFields` → `appendJsonStateVersion` (avec `source_extraction_id`) → `appendLocalLlmExtraction` (counts, status) → `appendLocalMessage` assistant text récap court (`metadata: { llm_extraction_id, mode: "extract" }`).
   - `conversational` → `conversationalQuery` server fn → `appendLocalLlmExtraction` + `appendLocalMessage` assistant avec `result.answer_markdown`.
8. Erreurs : même mapping que 6.2.

#### 6.4 Export `tableForName` (déjà géré pour les nouvelles tables, OK).

#### 6.5 Trigger `appendLocalMessage`
Dans `messages.repo.ts`, **dans la même transaction** que l'insert messages + sync_queue principal :
```ts
if (input.role === "user" && (
    (input.content?.length ?? 0) >= 10 ||
    (input.metadata?.attachment_count ?? 0) > 0)) {
  await db.sync_queue.add({
    table: "messages", op: "llm_route_and_dispatch",
    row_id: message.id, payload: { message_id: message.id, visit_id: input.visitId },
    attempts: 0, last_error: null, created_at: now, next_attempt_at: now,
  });
}
```

#### 6.6 Trigger `describe_media` après upload attachment
Dans `processAttachmentUpload`, après mark synced réussi : enqueue `describe_media` pour cet attachment (PDF inclus, le handler skip lui-même).

---

### Step 7 — Tests (~30 nouveaux, total ≈ 157)

Tous les appels Gemini mockés via `vi.mock` sur `@/shared/llm/providers/lovable-gemini`. **Aucun réseau réel.**

| Fichier | Tests |
|---|---|
| `router.test.ts` | media→extract, "?" seul→conversational, "explique"→conversational, R+2/HSP 2.7/VMC SF→extract via terrain_pattern, "résume cette VT, surface 145 m²"→conversational, "ok"→ignore (~7) |
| `describe-media.test.ts` | photo OK→row créée, PDF→skipped écrit sans server fn, plan OK, photo flou→warnings (~4) |
| `extract.test.ts` | Field vide→appliqué, source ∈ {user, voice, photo_ocr, import}→ignoré, ai_infer validated→ignoré, ai_infer unvalidated low→high (overwrite), high→low (ignored), medium→medium (ignored, égalité), bornes physiques violées→ignoré+warning, custom_field→registry call, appendJsonStateVersion 1× pour N patches (~10) |
| `conversational.test.ts` | résumé cite champs, hors-sujet recadré (~2) |
| `context-builder.test.ts` | bloc 1 stable bit-pour-bit (snapshot sortKeys), nomenclature 3CL si `calculation_method="3cl_dpe"`, DTG si `methode_energyco`+`dtg`, cap tokens→compress 5 passes, registry top + section_path (~5) |
| `engine.llm.test.ts` | happy describe_media→row, llm_route_and_dispatch attend describe_media, 429→backoff sans incrément, role="assistant" jamais déclenché, PDF→skipped 1 seul appel (~5) |

---

### Step 8 — UI minimale (3 affichages, pas de cartes d'action)

#### 8.1 Loader chat
`src/features/chat/components/MessageList.tsx` — `useLiveQuery` sur `sync_queue [op+row_id]=["llm_route_and_dispatch", lastUserMessageId]`. Si entry non synced → afficher 3 dots animés sous le dernier user message.

#### 8.2 Compteur "X champs IA non validés"
Dans le drawer JSON viewer (`src/features/json-state/components/JsonViewerDrawer.tsx`) :
- Ajouter helper `countUnvalidatedAiFields(state)` (deep walk, count Field<T> avec `source==="ai_infer" && validation_status==="unvalidated"`) — placer dans `src/shared/types/json-state.field.ts` ou nouveau `json-state.helpers.ts`.
- `useLiveQuery` sur `visit_json_state` → badge à côté du titre.

#### 8.3 Badge ✨ thumbnails
`PhotoPreviewPanel.tsx` (+ équivalent drawer) — `useLiveQuery` sur `attachment_ai_descriptions where attachment_id`. Si présent → overlay petit ✨.

---

### Step 9 — KNOWLEDGE.md

- §8 Phase 2 : cocher [x] It. 10.
- §10 Dette technique — ajouter 8 entrées (provider Gateway → Edge Fn Phase 3, vision PDF Phase 2.5, Whisper Phase 3, nomenclatures vides, cap 100k tokens compress 5 passes, recall Gemini ~55-70%, workaround sérialisation `result_json`, router edge case "VMC ok ?").
- §15 NOUVEAU — "Cerveau LLM It. 10 (Context Engineering 2026)" : 4 modes, architecture 3 blocs, 4 stratégies (Write/Select/Compress/Isolate), garde-fous anti-hallu, audit trail, anti-boucle, doctrine "LLM propose / user valide en It. 11", isolation provider.

---

### Critères d'acceptation
- 157/157 tests verts, TS strict 0 warning, `bun run build` OK.
- Anti-boucle vérifié (assistant message ne déclenche jamais `llm_route_and_dispatch`).
- `stable_prompt_hash` identique entre 2 appels équivalents (snapshot test).
- Sources humaines (`user`, `voice`, `photo_ocr`, `import`) jamais overwritten ; `ai_infer + validated` jamais overwritten ; gate confidence sur `ai_infer + unvalidated` opérationnel.
- KNOWLEDGE §8/§10/§15 à jour.

---

### Questions résiduelles
Aucune — les 2 arbitrages (gate confidence, ordre router conversational > terrain) sont fixés ci-dessus. GO code après approbation.