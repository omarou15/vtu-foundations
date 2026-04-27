# Itération 14 — Thumbnails fiables + progression photo par photo

## Diagnostic

### Bug 1 — Thumbnails ne s'affichent pas dans le chat (les 8 carrés bleus avec « ? »)

`MessageAttachments.tsx` lit le blob via `attachment_blobs.get(attachment.id)` et fait `useLiveQuery`. Mais quand on ouvre une visite re-pullée depuis un autre device (ou après un reload + cache vidé), il n'y a **pas de blob local** : la photo a été uploadée vers le bucket `attachments`, la row `attachments` est arrivée via realtime, mais `attachment_blobs` est vide pour cet `id`. Au bout de 5 s, le composant bascule sur l'icône `ImageOff` (ce qu'on voit avec les « ? » bleus).

Aucun mécanisme ne va chercher la thumbnail signée depuis Supabase Storage si le blob local n'existe pas.

### Bug 2 — Aucun retour pendant que l'IA analyse les photos

Aujourd'hui le flow rafale (8 photos) est :

```
1. addMediaToVisit ×8       → 8 attachments draft + 8 blobs locaux
2. send                      → 1 message + attachPendingMediaToMessage (×8 sync_queue attachment_upload)
3. appendLocalMessage user   → enqueue 1 job llm_route_and_dispatch (lié au message)
4. engine sériel :
   a) 8 × attachment_upload   → chacun finit en enqueue describe_media
   b) 8 × describe_media       → ~15-25 s par photo via Gemini
   c) llm_route_and_dispatch  → BLOQUE jusqu'à ce que TOUTES les 8 photos soient describe (cf engine.llm.ts L298-306 boucle attachments + scheduleDependencyWait)
   d) extract                  → 1 seul message assistant final
```

→ Pendant 2-4 minutes, l'utilisateur voit uniquement le `ThinkingSkeletonCard` « J'analyse vos observations… ». Aucun signal de progression. La synthèse n'arrive qu'à la toute fin.

L'utilisateur demande deux choses, dans l'ordre :
1. Indicateur **« n/N analysées »** qui progresse au fur et à mesure.
2. Si techniquement c'est analysé une par une, **émettre une bulle assistant dès qu'une photo est prête** au lieu d'attendre toutes.

Le pipeline actuel analyse déjà **photo par photo** (1 job describe_media par attachment) → on a tout pour streamer.

---

## Plan d'action

### A. Réparer les thumbnails (priorité #1)

**Composant `MessageAttachments.tsx` + nouveau hook `useAttachmentThumb`**

1. Étendre la lecture : si le blob local est absent **ET** que `attachment.sync_status === "synced"` **ET** que `attachment.thumbnail_path` existe, on appelle `supabase.storage.from(bucket).createSignedUrl(thumbnail_path, 3600)` (ou `compressed_path` en fallback) **une seule fois par session**.
2. Cacher l'URL signée dans une Map mémoire (`attachmentId → { url, expiresAt }`) pour éviter de re-signer à chaque rerender. TTL 1h, refresh quand on s'approche.
3. Optionnel mais sain : back-fill du blob local en arrière-plan (`fetch(signedUrl) → put attachment_blobs`) pour que la prochaine ouverture soit instantanée et offline-friendly. Ne bloque pas l'affichage.
4. Le délai « 5 s sans blob = failed » est trop court : on l'enlève. La nouvelle logique est : `blob local || URL signée distante || skeleton tant qu'on n'a essayé ni l'un ni l'autre`. `failed` n'apparaît que si le fetch distant échoue avec 404 (vraie photo perdue).

Appliquer la même logique dans `PhotosTab.tsx` (drawer) qui a la même structure que `AttachmentThumb`.

### B. Streaming « n/N analysées » + bulles assistant intermédiaires

**1. Nouveau composant `PhotoBatchProgressCard` (chat)**

Affiché **à la place** du `ThinkingSkeletonCard` quand le dernier message user est un `kind === "photo"` ou `"document"` avec `attachment_count > 1`.

Lit en `useLiveQuery` :
- `count(attachment_ai_descriptions WHERE message_id du dernier user)` → analysées
- `attachment_count` du message → total

Affiche : `Sparkles + barre de progression + "3/8 photos analysées"`. Quand `analysées === total`, le card disparaît et on retombe sur le `ThinkingSkeletonCard` standard pour la phase extract finale.

**2. Émission incrémentale d'une bulle assistant par photo prête**

Modifier `processDescribeMedia` (engine.llm.ts) : juste après `appendLocalAttachmentAiDescription`, si **plusieurs** attachments sont liés au même message :
- Émettre un message assistant `kind: "text"` court, contenu = `result.short_caption` (légende ≤ 160c déjà produite par le LLM, parfaite pour cet usage).
- Metadata : `{ kind_origin: "photo_caption", attachment_id, batch_index: N, batch_total: M, ai_enabled: false }` (`ai_enabled: false` empêche tout dispatch en cascade).
- Idempotent : check qu'aucun message assistant `photo_caption` n'existe déjà pour cet attachment_id avant d'insérer (chercher via metadata, ou plus simple : une nouvelle table légère `assistant_caption_emitted` ou un flag dans `attachment_ai_descriptions`).

Si **une seule** photo est attachée au message, on n'émet pas de caption intermédiaire (le futur message extract suffit, pas de bruit).

**3. Présentation dans `MessageList`**

Les bulles `photo_caption` s'affichent comme des bulles assistant standard mais avec :
- Icône ✨ devant
- Style légèrement plus discret (`text-muted-foreground`, `border-dashed`, `text-xs`)
- Pas de timestamp (ou très discret)

Optionnellement, on les **regroupe visuellement** : si N captions consécutives partagent le même `parent_message_id`, on les empile dans un seul container avec une mini-grille de thumbnails à gauche. À spécifier au moment du build, défaut = bulles séparées (plus simple).

**4. Card final inchangé**

Quand `processLlmRouteAndDispatch` finit, le message `actions_card` final arrive et offre la synthèse globale + les patches à valider. Les captions intermédiaires restent dans l'historique comme trace.

### C. Détails complémentaires

- **Toast d'échec ciblé** : si une photo échoue (`describe_media` → status `failed`), émettre une bulle assistant courte « ⚠️ Photo X non analysée » + lien pour relancer.
- **Drawer « Photos »** : afficher un petit badge ✨ sur les vignettes déjà décrites (déjà partiellement présent dans `MessageAttachments`, le porter dans `PhotosTab`).

---

## Fichiers touchés

**Nouveau**
- `src/features/chat/lib/useAttachmentThumb.ts` — hook qui résout `blob local → signed url → fetch back-fill`.
- `src/features/chat/components/PhotoBatchProgressCard.tsx` — card « n/N analysées ».

**Modifiés**
- `src/features/chat/components/MessageAttachments.tsx` — utilise `useAttachmentThumb`, retire le timeout 5 s naïf.
- `src/features/visits/components/PhotosTab.tsx` — idem.
- `src/features/chat/components/MessageList.tsx` — sélectionne `PhotoBatchProgressCard` quand last user message est photo/document multi.
- `src/shared/sync/engine.llm.ts` — émission idempotente d'une bulle assistant `photo_caption` après chaque `describe_media` réussi (uniquement si batch ≥ 2).
- `src/shared/types/db.ts` — élargir le type metadata des messages pour `kind_origin: "photo_caption"`.
- Tests à ajouter : `MessageAttachments.thumb-fallback.test.ts`, `engine.describe-media.batch-emit.test.ts`.

---

## Hors-scope (à confirmer)

- Migration DB pour stocker un cache d'URL signée → **non**, on garde en mémoire (régénérable).
- Déplacer les analyses photo vers un job `EdgeRuntime.waitUntil` côté Edge Function → **non** maintenant : l'engine côté client gère déjà la file en série, le vrai problème UX est juste l'absence de feedback. On y reviendra si la latence Gemini reste un blocker après ce fix.

GO ?
