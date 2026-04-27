# Fix : couper le mensonge IA + statut réel des pièces jointes (v2 — corrigé)

Objectif : (1) empêcher l'IA d'inventer le contenu d'une photo non analysée, côté **conversational ET extract**, (2) donner à l'utilisateur un retour visuel persistant sur l'état des pièces jointes au niveau VT. Aucune migration DB / RLS / sync engine.

---

## 1. Étendre le ContextBundle avec `pending_attachments` (prérequis)

Sans cela, la garde n'a rien à filtrer (vérifié : `builder.ts:58` ne génère `attachments_context` qu'à partir des descriptions existantes).

**`src/shared/llm/types.ts`** — ajouter au type `ContextBundle` :
```ts
pending_attachments: Array<{
  id: string;
  media_profile: string | null;
  reason: "no_description_yet" | "ai_disabled_when_sent";
}>;
```

**`src/shared/llm/context/builder.ts`** :
- Étendre `BuildContextInput` avec `pendingAttachments: Array<{ id, media_profile, reason }>`.
- Inclure tel quel dans le bundle retourné (default `[]`).

**Call sites** (sync engine + UI qui construisent le bundle) — `src/shared/sync/engine.llm.ts` et tout autre appelant de `buildContextBundle` :
- Charger via Dexie les `attachments` du message courant (mode extract) ou de la VT entière (mode conversational, fenêtre N derniers messages).
- Pour chaque attachment, vérifier l'absence de ligne dans `attachment_ai_descriptions` (mode `describe_media`) → ajouter à `pendingAttachments`.
- Distinguer `reason` :
  - `ai_disabled_when_sent` si le `messages.metadata.ai_enabled === false` du message porteur.
  - `no_description_yet` sinon.

**`src/server/llm.functions.ts`** — `ContextBundleSchema` (ligne ~55) : ajouter
```ts
pending_attachments: z.array(z.object({
  id: z.string(),
  media_profile: z.string().nullable(),
  reason: z.enum(["no_description_yet", "ai_disabled_when_sent"]),
})).default([]),
```

## 2. Garde anti-hallucination — conversational ET extract

**`src/server/llm.functions.ts`** — extraire `buildUserPromptConversational` et `buildUserPromptExtract` en fonctions exportées (testables). Dans chacune, si `bundle.pending_attachments.length > 0`, prepend un bloc :

```
## ATTACHMENTS NON ENCORE ANALYSÉS
Les pièces jointes suivantes ont été reçues mais leur analyse visuelle
n'est PAS terminée :
  - {id} ({media_profile}) — {reason}
RÈGLE STRICTE : tu NE DOIS PAS prétendre avoir vu, lu, analysé ces
fichiers. Confirme leur réception (nombre, type), jamais leur contenu.
[extract] N'émets AUCUN patch ni custom_field basé sur ces attachments.
```

**`src/shared/llm/prompts/system-conversational.ts`** : ajouter en fin :
> « Si une pièce jointe figure dans `pending_attachments` ou n'a ni caption ni description ni OCR, tu n'as PAS vu son contenu. N'invente jamais. Dis que l'analyse est en cours. »

**`src/shared/llm/prompts/system-extract.ts`** : ajouter dans « Règles dures » :
> « Tout attachment listé dans `pending_attachments` est INVISIBLE pour toi : aucun patch, aucun custom_field, aucun evidence_ref ne doit s'y appuyer. Tu peux ajouter un warning `attachment_pending_analysis`. »

**Note système** : SYSTEM_UNIFIED contient probablement la même logique fusionnée — vérifier `src/shared/llm/prompts/system-unified.ts` et appliquer la même règle si utilisé.

## 3. Statut visuel — décision sur `PhotoBatchProgressCard`

Coexistence assumée, rôles distincts et nommage clair :

- **`PhotoBatchProgressCard`** (existant, par-message, transitoire) : conservé tel quel. Affichage in-flow pendant le batch d'un message photo, disparaît à `done === total`.
- **Nouveau `VisitAttachmentSyncStatus`** (par-VT, persistant) : remplace le nom proposé `AttachmentBatchStatus`.

**Nouveau `src/features/chat/components/VisitAttachmentSyncStatus.tsx`** :
- Props `{ visitId: string }`.
- 2× `useLiveQuery` Dexie filtrés sur `visit_id` :
  - `attachments` (toutes),
  - `attachment_ai_descriptions` (mode `describe_media`).
- Compteurs :
  - `total = attachments.length` (exclure ceux en `sync_status === "draft"`)
  - `uploaded = sync_status === "synced"`
  - `inFlight = sync_status in ("pending","syncing")`
  - `failed = sync_status === "failed"`
  - `analyzed = nb d'attachment_id ayant ≥ 1 ai_description`
  - `aiDisabledCount` = attachments dont le message porteur a `metadata.ai_enabled === false` ET sans description (nécessite jointure messages)
- Rendu (compact, design-tokens uniquement, `text-xs font-ui`) :
  - `total === 0` → `null`.
  - Format base : `📎 {analyzed}/{total} analysées · {uploaded}/{total} uploadées`.
  - `inFlight > 0` → spinner + « upload/analyse en cours… ».
  - `failed > 0` → badge destructif `{failed} échec(s)`.
  - `aiDisabledCount > 0` → libellé info « {n} envoyée(s) avec IA désactivée — réactiver l'IA pour analyser ».
  - Tout réussi → vert discret « tout est synchronisé ».

**Intégration `src/routes/_authenticated/visits.$visitId.tsx`** : insérer entre `<section>` MessageList et `<ChatInputBar>` (ligne ~318).

Export via `src/features/chat/index.ts`.

## 4. Tests

**`src/server/__tests__/buildUserPrompt.test.ts`** (nouveau) :
- `buildUserPromptConversational` avec `pending_attachments=[{id,media_profile:"photo",reason:"no_description_yet"}]` → contient `ATTACHMENTS NON ENCORE ANALYSÉS` + `tu NE DOIS PAS prétendre`.
- Idem `pending_attachments=[]` → bloc absent.
- `buildUserPromptExtract` : mêmes 2 cas + vérifier `N'émets AUCUN patch`.
- `buildUserPromptConversational` avec `reason:"ai_disabled_when_sent"` → mention spécifique du choix utilisateur.

**`src/shared/llm/__tests__/context.test.ts`** : étendre les cas existants pour vérifier que `pendingAttachments` est propagé correctement par `buildContextBundle`.

**`src/features/chat/__tests__/VisitAttachmentSyncStatus.test.tsx`** (nouveau) :
- 0 attachments → `null`.
- 3 `synced` + 0 ai_descriptions → `0/3 analysées · 3/3 uploadées`.
- 3 `synced` + 3 ai_descriptions → `tout est synchronisé`.
- 2 `synced` + 1 `pending` → spinner + label « en cours ».
- 1 `synced` sans description, message porteur `ai_enabled:false` → label « IA désactivée ».

## 5. Hors scope (prompts suivants)

- Pull cross-device des `attachments` + `attachment_ai_descriptions` + blobs → prompt 2.
- Re-analyse a posteriori d'attachments envoyés en IA off → prompt 3.
- Pas de migration DB ni RLS.

## Critères d'acceptation

- [ ] `bun run lint` + `bun run typecheck` verts.
- [ ] Tests existants (44/44) restent verts.
- [ ] Nouveaux tests verts (prompt builders × 2 modes + composant).
- [ ] Quand un attachment sans description est dans le contexte, l'IA conversationnelle répond explicitement « analyse en cours » et ne décrit pas le contenu.
- [ ] `extract_from_message` ne produit aucun patch/custom_field référençant un `pending_attachment`.
- [ ] Sous l'input bar, compteur `n/m analysées · n/m uploadées` visible et réactif (Dexie liveQuery).
- [ ] État « IA désactivée » distingué de « analyse en cours ».
