# Itération 9 VTU — Pipeline médias (Phase 2.2) — V2 RÉVISÉE

Révision intégrant les 5 corrections obligatoires.

## Corrections appliquées

### Correction 1+2 — `addMediaToVisit` n'enqueue PAS

`addMediaToVisit()` crée UNIQUEMENT :
- ligne `attachments` locale `sync_status="draft"` (nouveau statut, pas `"pending"`), `message_id=null`
- blob compressé + thumbnail dans `attachment_blobs`

**AUCUNE entry `sync_queue`** à ce stade. Les médias draft sont invisibles pour l'engine.

`attachPendingMediaToMessage(visitId, messageId)` est le SEUL point qui :
1. Update les attachments draft de la visite : `message_id = messageId`, `sync_status = "pending"`
2. Crée 1 entry `sync_queue` `op="attachment_upload"` par attachment
3. Tout dans une seule transaction Dexie (rw `attachments`, `sync_queue`)

Conséquence : si l'utilisateur prend 3 photos puis ferme l'app sans envoyer de message, les 3 attachments restent en `draft` local indéfiniment (récupérables au reload). Un cleanup explicite via bouton ✕ dans PhotoPreviewPanel supprime row + blob + queue (queue vide à ce stade).

### Correction 3 — Dépendance message côté serveur

`processAttachmentUpload(entry)` :
1. Lit la row attachment locale → récupère `message_id`
2. **Check préalable** : SELECT `messages` WHERE `id = message_id AND user_id = auth.uid()` (LIMIT 1). Si vide → retry différé :
   - Re-enqueue avec `next_attempt_at = now() + backoff(attempts)`
   - Pas d'incrément `attempts` (c'est une attente, pas un échec)
   - Log `last_error = "waiting_for_message_sync"` pour debug
3. Si message présent côté serveur :
   - Upload `compressed` → Storage
   - Upload `thumbnail` → Storage
   - INSERT `attachments` row (RLS passe, le EXISTS message est satisfait)
   - Mark `synced`

L'engine traite la queue dans l'ordre `next_attempt_at ASC`, donc le message porteur (entry `messages insert` créée avant via `appendLocalMessage` + `attachPendingMediaToMessage`) sera consommé en premier dans le scénario nominal. Le check serveur reste là comme garde-fou (race / network jitter).

Backoff suggéré : `min(1s * 2^attempts, 30s)` — borné. L'engine existant a déjà la primitive `next_attempt_at` (utilisée par les retries 5xx).

### Correction 4 — Suppression du conflict 23505 sha256

Aucune contrainte UNIQUE sur sha256 (volontaire — même photo dans 2 VTs du même user = légitime). Donc pas de gestion 23505.

Conflits restants à gérer dans `processAttachmentUpload` :
- **Storage upload conflict** (`storage/object_already_exists`) : le path `{user_id}/{visit_id}/{photos|plans|pdfs}/{id}.ext` est unique car basé sur l'attachment `id` (UUID v4). Conflit possible uniquement si retry après upload réussi mais INSERT row échoué. Stratégie : `upsert: true` sur les uploads Storage (idempotent).
- **DB INSERT conflict 23505 sur `attachments.id`** : même logique de retry après crash partiel. Stratégie : SELECT avant INSERT (idempotence) — si la row existe déjà côté serveur avec le même id, mark synced direct.

Le dedup SHA-256 reste **purement informatif côté client** : `addMediaToVisit` cherche `[user_id+sha256]` localement et retourne `is_duplicate: true` + `duplicate_of: id` pour affichage UI (badge ⚠ orange dans PhotoPreviewPanel). N'empêche jamais l'insert.

### Correction 5 — `messages.kind`

**Vérifié en DB** :
```
messages_kind_check: CHECK (kind = ANY (ARRAY['text','audio','photo','system_event']))
```

`MessageKind` TS = `"text" | "audio" | "photo" | "system_event"`. **Aucun support pour `"media"`**.

**Décision** : utiliser le kind `"photo"` existant pour les messages porteurs de médias quand l'utilisateur n'a pas tapé de texte. Justifié car :
- 95% des cas = photo terrain (le PDF/plan reste minoritaire en usage VTU)
- `metadata` porte déjà l'info précise : `{ attachment_count: N, profiles: ["photo","plan"] }` → la UI sait afficher correctement
- Pas de migration SQL nécessaire (gain de surface)

**Si message texte + médias** : kind reste `"text"` (cas standard, comme WhatsApp). `metadata.attachment_count` indique les médias attachés.

Pas de migration `messages_kind_check` dans cette itération. Reportée à It. 13 si UX MediaDrawer impose un kind dédié.

### Correction secondaire — Thumbnail PDF cohérent

Le PDF n'est pas rasterisé en It. 9. Décision uniformisée :

- `thumbnail_path` pour PDF = **NULL** en DB
- Dans `attachment_blobs`, le champ `thumbnail` est `null` pour les PDF
- Le rendu UI utilise une **icône SVG inline** (composant `<PdfThumbIcon />` 64×64, rouge style Adobe) — pas un fichier
- Aucun upload Storage de thumbnail pour les PDF

Pour photo/plan : `thumbnail_path = "{user_id}/{visit_id}/{photos|plans}/{id}.thumb.webp"` (WebP avec fallback PNG si plan, JPEG si photo).

Tests `compress.test.ts` vérifient explicitement :
- `compressMedia(jpgFile, "photo")` → `thumbnail` = Blob WebP/JPEG
- `compressMedia(pdfFile, "pdf")` → `thumbnail = null`, `metadata.thumbnail_format = null`

## Architecture finale

```text
[AttachmentSheet intention-first]
        │
        v Photo terrain | Plan/document | Importer fichier
[<input file capture/multiple>]
        │
        v
[compressMedia(file, profile)] ── browser-image-compression + exifr
        │
        v compressed Blob + thumbnail Blob|null + metadata (sha256, GPS, dims)
        │
[addMediaToVisit] ── dedup local sha256 informatif
        │
        v  TX Dexie : attachments (sync_status="draft", message_id=null)
        │             + attachment_blobs (compressed + thumbnail|null)
        │             ❌ PAS de sync_queue
        v
[PhotoPreviewPanel] grille au-dessus de l'input
        │
        v user submit (texte ou vide)
[appendLocalMessage] → kind="text" (avec texte) ou "photo" (sans texte)
        │
        v
[attachPendingMediaToMessage(visitId, messageId)]
        │
        v  TX Dexie : update attachments (message_id, sync_status="pending")
        │             + insert sync_queue ×N (op="attachment_upload")
        v
[engine.processAttachmentUpload]
        │
        ├── 1. Check message côté serveur → si absent : re-enqueue + backoff
        ├── 2. Upload compressed (upsert:true)
        ├── 3. Upload thumbnail si non-null (upsert:true)
        ├── 4. SELECT attachments by id → si présent : mark synced
        │     sinon INSERT row (RLS EXISTS message OK car message déjà syncé)
        └── 5. Mark synced
```

## Migration SQL 004

```sql
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS compressed_path TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
  ADD COLUMN IF NOT EXISTS width_px INTEGER,
  ADD COLUMN IF NOT EXISTS height_px INTEGER,
  ADD COLUMN IF NOT EXISTS sha256 TEXT,
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS media_profile TEXT
    CHECK (media_profile IN ('photo','plan','pdf')),
  ADD COLUMN IF NOT EXISTS linked_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_attachments_user_sha256
  ON public.attachments (user_id, sha256) WHERE sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_visit_profile
  ON public.attachments (visit_id, media_profile);

-- Création du bucket "attachments" (les buckets visit-photos/visit-audio existent
-- déjà mais sont scoped par usage Phase 1).
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Storage : path préfixé user_id
CREATE POLICY "attachments_storage_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "attachments_storage_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "attachments_storage_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
```

Pas de modif sur `messages_kind_check` (correction 5).

## Dexie v4

```ts
this.version(4).stores({
  attachments:
    "id, message_id, visit_id, user_id, sync_status, sha256, [user_id+sha256], [visit_id+sync_status]",
  attachment_blobs: "&attachment_id, created_at",
});
```

`LocalAttachment.sync_status` accepte désormais `"draft" | "pending" | "synced" | "failed"` (ajout de `"draft"`).

`attachment_blobs` : `{ attachment_id: string, compressed: Blob, thumbnail: Blob | null, created_at: string }`.

L'engine ignore les attachments en `sync_status="draft"` (déjà le cas vu qu'il itère sur `sync_queue`, pas sur `attachments`).

## Fichiers créés (inchangés sauf signatures)

**`src/shared/photo/compress.ts`** — 3 profils, signature inchangée. `compressed`/`thumbnail` peuvent être `null` pour PDF (`thumbnail = null`).

**`src/shared/photo/sha256.ts`** — `crypto.subtle.digest`.

**`src/shared/photo/exif.ts`** — `extractGps` via `exifr`.

**`src/shared/photo/repo.ts`** — signatures révisées :

```ts
export async function addMediaToVisit(params: {
  visitId: string;
  file: File;
  profile?: MediaProfile;
  linkedSections?: string[];
}): Promise<{
  attachment: LocalAttachment;     // sync_status="draft", message_id=null
  is_duplicate: boolean;
  duplicate_of?: string;
}>;
// ❌ NE crée PAS d'entry sync_queue. NE prend PAS messageId.

export async function attachPendingMediaToMessage(
  visitId: string, messageId: string,
): Promise<{ attached_count: number }>;
// ✅ SEUL point qui passe draft→pending et enqueue attachment_upload

export async function discardDraftMedia(attachmentId: string): Promise<void>;
// Supprime row + blob (queue vide à ce stade — pas de cleanup queue nécessaire)

export async function listVisitMedia(visitId: string): Promise<LocalAttachment[]>;
export async function listDraftMedia(visitId: string): Promise<LocalAttachment[]>;
export async function linkMediaToSection(attachmentId: string, sectionPath: string): Promise<void>;
```

**Tests** (~24 cumulés, total 128/128) :
- `compress.test.ts` (~8) — incl. `pdf → thumbnail null`
- `repo.test.ts` (~11) — incl. :
  - `addMediaToVisit ne crée PAS d'entry sync_queue`
  - `addMediaToVisit crée bien la row en sync_status="draft"`
  - `attachPendingMediaToMessage transitionne draft→pending et enqueue N entries`
  - `discardDraftMedia nettoie row + blob`
- `engine-attachment-upload.test.ts` (~5) — incl. :
  - `processAttachmentUpload diffère si message absent côté serveur (re-enqueue + backoff sans incrément attempts)`
  - `processAttachmentUpload est idempotent sur retry (SELECT avant INSERT)`
  - `processAttachmentUpload utilise upsert:true sur Storage`
- `PhotoPreviewPanel.test.tsx` (~5) — incl. badge dedup informatif, toggle profil JPEG

## Fichiers modifiés (révisions)

**`src/features/chat/components/AttachmentSheet.tsx`** — 3 actions intention-first.

**`src/features/chat/components/PhotoPreviewPanel.tsx`** — affiche les attachments draft de la visite courante (lit `listDraftMedia`).

**`src/features/chat/components/ChatInputBar.tsx`** — au submit :
1. `appendLocalMessage({ kind: text ? "text" : "photo", content: text || null, metadata: { attachment_count: drafts.length } })`
2. `attachPendingMediaToMessage(visitId, message.id)`
3. Dans cet ordre — l'entry sync_queue du message est créée avant celles des attachments, donc l'engine syncera le message en premier.

**`src/features/chat/store.ts`** — pas de `pendingMedia` en mémoire : on s'appuie sur Dexie `listDraftMedia(visitId)` (source de vérité unique). PhotoPreviewPanel le lit via `useLiveQuery`.

**`src/shared/sync/engine.ts`** :
- `SyncQueueEntry["op"]` : ajoute `"attachment_upload"`
- `SyncSupabaseLike` : ajoute `storage.from(bucket).upload(path, blob, { upsert: boolean, contentType: string })`
- Nouveau `processAttachmentUpload(entry)` avec check message + backoff (correction 3)
- Backoff helper : `nextAttemptDelayMs(attempts) = Math.min(1000 * 2 ** attempts, 30_000)`

**`src/shared/db/schema.ts`** : Dexie v4, `LocalAttachment.sync_status` étendu.

**`src/shared/types/db.ts`** : `AttachmentRow` étendu, `SyncQueueEntry["op"]` ajoute `"attachment_upload"`. **`MessageKind` inchangé** (correction 5).

**`src/integrations/supabase/types.ts`** : régénéré post-migration (auto).

**`src/features/json-state/components/JsonViewerDrawer.tsx`** : compteur "N médias attachés" stub.

**`KNOWLEDGE.md`** :
- §8 : check It. 9
- §14 NOUVEAU : "Pipeline médias : 3 profils, intention-first, dual storage, dedup SHA-256 informatif, draft→pending workflow, attachment_upload différé jusqu'à message synced"

## Ordre d'implémentation

1. Migration SQL 004 (attachments columns + bucket + Storage RLS)
2. Dexie v4 (`attachments` étendue + `sync_status="draft"` + `attachment_blobs`)
3. `bun add browser-image-compression exifr`
4. `compress.ts` + `sha256.ts` + `exif.ts` + tests compress
5. `repo.ts` (addMediaToVisit DRAFT-only, attachPendingMediaToMessage, discardDraftMedia) + tests repo
6. Handler `processAttachmentUpload` dans `engine.ts` (check message + backoff + idempotence) + tests engine
7. Refonte AttachmentSheet (intention-first)
8. PhotoPreviewPanel (live query draft) + intégration ChatInputBar (kind="photo" si vide)
9. Stub compteur médias dans JsonViewerDrawer
10. Tests UI
11. KNOWLEDGE §8 + §14
12. `bun run test` (cible 128/128) + `bun run build`

## Hors scope (rappel)

Vision IA (It. 10), annotations (Phase 3), MediaDrawer plein (It. 13), cleanup TTL blobs (It. 12), Géoloc/Laser/Croquis (Phase 3), rendu pdfjs (It. 13).

---

**5 corrections appliquées + cohérence thumbnail PDF (null en DB, SVG icône en UI). Prêt à coder dès validation.**
