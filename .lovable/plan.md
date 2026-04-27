## Diagnostic

La compression **est bien branchée** sur le nouveau flow multi-import. Trace vérifiée :

```
AttachmentSheet (caméra | galerie | docs)
        │
        ▼
  addMediaToVisit({ file, profile })           ← src/shared/photo/repo.ts
        │
        ▼
  compressMedia(file, profile)                 ← src/shared/photo/compress.ts
        │
        ▼
  attachments.size_bytes ← compressed.metadata.size_bytes
        │
        ▼
  DraftRow / PhotoPreviewPanel affichent draft.size_bytes
```

Le poids affiché dans la liste **est déjà le poids post-compression** (lu depuis `attachments.size_bytes`, qui est écrit après `compressMedia`).

**Vraie cause du bug** : le profil `photo` actuel ne définit que `maxWidthOrHeight: 1600` + `initialQuality: 0.80`, **sans cible de taille**. Sur une photo iPhone 12MP redimensionnée à 1600 px en WebP 80, on retombe en pratique entre 800 Ko et 2,5 Mo selon la complexité de la scène (chaufferie sombre, façade détaillée…). `browser-image-compression` n'itère pas la qualité tant qu'on ne lui passe pas `maxSizeMB`.

## Plan de correction (concis)

### 1. Forcer une cible de taille dans le profil `photo`

`src/shared/photo/compress.ts` — ajouter `maxSizeMB: 0.5` au profil `photo` :

```ts
photo: {
  maxWidthOrHeight: 1600,
  initialQuality: 0.8,
  maxSizeMB: 0.5,           // NEW — itère la qualité jusqu'à ≤ 500 Ko
  fileType: "image/webp",
  preserveExif: false,
  thumbnail: { maxWidthOrHeight: 256, initialQuality: 0.6 },
},
```

Et propager `maxSizeMB` dans l'appel `imageCompression(file, { ... })` de `compressImage`. Le profil `plan` reste **sans** `maxSizeMB` (on veut garder la lisibilité des plans détaillés à 3000 px / qualité 0.95).

### 2. Indicateur visuel "photo lourde" (> 500 Ko après compression)

Cas rare (scène très détaillée où même quality 0.5 ne descend pas sous 500 Ko). Ajouter un petit badge discret sur les thumbs des drafts photo :

- **`PhotoPreviewPanel.tsx`** (panneau au-dessus de l'input) — petit badge `⚠` jaune en bas-gauche du thumb si `draft.size_bytes > 500 * 1024` ET `media_profile === "photo"`. Tooltip : "Photo lourde — connexion lente probable".
- **`AttachmentSheet.tsx` → `DraftRow`** (liste import) — texte "lourde" en `text-warning` à côté de la taille si même condition.

Une seule helper utilitaire `isHeavyPhoto(draft)` partagée pour ne pas dupliquer la règle.

### 3. Vérifier que le poids affiché est toujours post-compression

Audit déjà fait — `DraftRow.sizeKb` (ligne 691) et `useDraftThumbUrl` lisent bien `draft.size_bytes` qui est la valeur post-compression. Pas de changement nécessaire ici, juste confirmation.

### 4. Un seul chemin de compression

Audit confirme : tous les imports (caméra rafale `handleCameraFiles`, galerie `handleImportFiles`, docs `handleImportFiles`) passent **exclusivement** par `addMediaToVisit → compressMedia`. Pas de chemin parallèle. Le toggle profil dans `PhotoPreviewPanel` recompresse aussi via `compressMedia`. Rien à consolider.

### 5. Tests

`src/shared/photo/__tests__/compress.test.ts` — ajouter :
- un test qui vérifie que l'option `maxSizeMB: 0.5` est bien transmise à `imageCompression` pour le profil photo,
- un test qui vérifie que `maxSizeMB` n'est **pas** transmise pour le profil plan.

`src/features/chat/__tests__/burst-multi-import.test.ts` — ajouter un test "isHeavyPhoto helper" : true si > 500 Ko + photo, false pour plan/pdf/photo légère.

## Fichiers touchés

- `src/shared/photo/compress.ts` — ajout `maxSizeMB` au profil photo + propagation dans `imageCompression`.
- `src/shared/photo/index.ts` (ou un nouveau `src/shared/photo/heuristics.ts`) — export d'un helper `isHeavyPhoto(draft)`.
- `src/features/chat/components/PhotoPreviewPanel.tsx` — badge ⚠ conditionnel.
- `src/features/chat/components/AttachmentSheet.tsx` — tag "lourde" dans `DraftRow`.
- `src/shared/photo/__tests__/compress.test.ts` — 2 tests.
- `src/features/chat/__tests__/burst-multi-import.test.ts` — 1 test helper.

Aucune migration SQL, aucun changement schéma Dexie.
