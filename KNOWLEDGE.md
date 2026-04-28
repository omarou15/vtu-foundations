# VTU — Knowledge File (règles non négociables pour tous les prompts)

Ce fichier est la source de vérité du projet. Avant CHAQUE
prompt, Lovable doit relire ce document. Les règles ici
l'emportent sur toute autre source (mémoire, intuition, plans
antérieurs).

---

## 1. Contexte produit

**VTU** = PWA mobile-first pour thermiciens d'**Energyco**
(bureau d'études thermiques France). Un thermicien fait une
visite technique de bâtiment en 15 min depuis son téléphone :
photos, dictées vocales, notes texte. L'IA structure en
rapport Word.

**User archétype** : Omar + équipe de 15 thermiciens.
Contraintes terrain : gants, soleil direct, réseau 4G faible,
cave/chaufferie sombre, iPhone et Android mixtes.

---

## 2. Paradigme architectural NON NÉGOCIABLE

**JSON = source de vérité.** Pas un chatbot classique.

Trois couches :
1. `messages` — **append-only**, audit trail légal. JAMAIS
   d'UPDATE. Correction = nouveau message.
2. `visit_json_state` — **versionné**, source de vérité.
   Chaque mutation = nouvelle ligne version+1. JAMAIS muter
   sur place.
3. `rapport Word` — généré DEPUIS le JSON, JAMAIS depuis la
   conversation.

**Optimistic concurrency** : chaque write envoie sa version.
Writes obsolètes rejetés (409). En Phase 1 infrastructure
prête mais inerte (pas d'IA qui mute).

**Offline-first** : toutes les écritures passent par
IndexedDB (Dexie) d'abord, puis sync queue vers Supabase.
Lecture toujours depuis IndexedDB via `useLiveQuery`.

**Idempotence** : `client_id` UUID généré côté client.
Unique par `(user_id, client_id)`. `ON CONFLICT DO NOTHING`
côté upsert.

---

## 3. Stack (fixée, ne pas dévier)

- React 19 + TypeScript strict (0 `any`, 0 `@ts-ignore`)
- TanStack Start (Router file-based + server functions)
- Tailwind CSS v4 + shadcn/ui (Radix)
- Zustand (state global — pas Redux, pas Context)
- Dexie.js (IndexedDB offline-first)
- Lovable Cloud (Supabase managé) : auth magic link +
  Postgres + Storage + RLS
- Vitest + Testing Library
- Hosting Cloudflare Workers (Lovable)

Dépendances du projet (toujours à jour) :
- zustand, dexie, dexie-react-hooks, uuid, react-json-view-lite
- @fontsource/inter, @fontsource/poppins, @fontsource/lora
  (self-hosted, pas Google Fonts CDN)
- date-fns (fr locale)

---

## 4. Design system (source : `src/design-tokens.ts`)

Palette officielle **Anthropic Claude** — style sophistiqué,
terracotta + beige chaleureux. Cohérent avec le positionnement
Energyco (bureau d'études premium, pas startup tech).

### Couleurs

**Neutres :**
- Dark        `#141413`  (texte principal)
- Light       `#faf9f5`  (fond clair chaleureux, pas blanc pur)
- Mid Gray    `#b0aea5`  (éléments secondaires)
- Light Gray  `#e8e6dc`  (fonds subtils, séparateurs)

**Accents :**
- Primary Orange `#d97757`  (terracotta — actions principales)
- Blue           `#6a9bcc`  (info / liens)
- Green          `#788c5d`  (success / online)
- Danger         `#b4593c`  (erreurs / destructive)

### Typographie (3 familles complémentaires)

- **Poppins** (400/500/600/700) — headings (h1/h2/h3),
  fallback Arial. Classe utilitaire : `.font-heading`.
- **Lora** (400/500) — body text long (paragraphes éditoriaux),
  fallback Georgia. Classe utilitaire : `.font-body`. Appliquée
  par défaut sur `<body>`.
- **Inter** (400/500/600/700) — UI (boutons, labels, inputs,
  badges, nombres), fallback system-ui. Classe utilitaire :
  `.font-ui` (= Tailwind `font-sans`).

Toutes self-hosted via `@fontsource` (RGPD + perf).

### Contraintes

- **Échelle typo** : 12/14/16/18/20/24/32 px
- **Radii** : 6/8/12/16/20 px
- **Touch target minimum** : 44×44 px (Apple HIG)
- **Thème** : clair par défaut (dark mode CSS prête, inactive)

**Aucune couleur/taille/radius HARDCODÉE** dans les composants.
Toujours `tokens.*` ou classes Tailwind mappées sur les
variables CSS (`var(--primary)`, etc.).

---

## 5. UX doctrine

**Un seul écran : un chat.** Comme WhatsApp / Claude mobile.

**Règle des zones 20/60/20** :
- 20% haut : header stable (contexte VT)
- 60% milieu : dynamique (messages)
- 20% bas : actions fréquentes (input bar)
- **L'input bar NE BOUGE JAMAIS** quand le clavier s'ouvre.
  Utiliser `visualViewport` API + variable CSS `--kb-height`.

**Safe area iOS** : toujours `env(safe-area-inset-*)` sur
les bords. Tester iPhone 12+ avec Dynamic Island.

**Viewport** : `width=device-width, initial-scale=1,
viewport-fit=cover`. JAMAIS `maximum-scale=1` (casse a11y).

**Loi de Fitts** : zone pouce droit en bas pour les actions
fréquentes. Bouton envoi toujours en bas à droite.

---

## 6. Architecture de code

Arborescence imposée :

```
src/
├── features/
│   ├── auth/         # magic link, callback, guards (It.2)
│   ├── visits/       # CRUD VT, sidebar, json_state initial (It.4)
│   ├── chat/         # messages texte + JSON viewer (It.5)
│   └── json-state/   # mutateurs + versioning + concurrency (It.4-6)
├── shared/
│   ├── db/           # Dexie schema + repositories (It.3)
│   ├── sync/         # outbox + replay engine (It.6)
│   ├── hooks/        # useAuth, useOnline, useLiveQuery wrappers
│   ├── types/        # types Supabase + json_state schema (zod)
│   └── ui/           # composants transverses (Toast, ErrorBoundary…)
├── components/ui/    # shadcn (subset minimal — voir KNOWLEDGE §3)
├── integrations/
│   └── supabase/     # client.ts, client.server.ts, auth-middleware.ts, types.ts (auto-générés)
├── routes/           # TanStack Router file-based (__root.tsx, index.tsx, etc.)
├── lib/              # utils transverses (cn, etc.)
├── design-tokens.ts  # SOURCE DE VÉRITÉ design system
└── styles.css        # variables CSS (mapping OKLCH des tokens) + safe-area utils
```

> Note : la section 6 du brief original avait l'arborescence
> vide. La version ci-dessus reflète la structure matérialisée
> à l'Itération 1 et validée. À corriger si divergence avec
> ton intention.

---

## 7. Lecture obligatoire avant chaque itération

Avant CHAQUE prompt utilisateur, l'agent doit :
1. Relire ce fichier KNOWLEDGE.md en intégralité.
2. Vérifier que les changements proposés respectent §2 (paradigme),
   §3 (stack), §4 (design tokens), §5 (UX doctrine), §6 (arbo).
3. En cas de conflit avec une demande utilisateur, signaler
   explicitement le conflit avant d'agir.

---

## 8. Scope Phase 1 (checklist à jour)

- [x] Itération 1 — Setup, design tokens, structure, manifest
- [x] Itération 2 — Auth magic link + routing + guards
- [x] Itération 3 — Schéma Supabase + RLS + Dexie local
- [x] Itération 4 — Sidebar VTs + création + JSON state initial
- [x] Itération 5 — Chat texte + JSON viewer + menu stubs
- [x] Itération 6 — Sync engine offline-first + Edge Function scaffold
- [x] Itération 6.5 — Pull cross-device + Realtime (pré-requis prod)
- [x] Itération 7 — Schéma JSON dynamique v2 + Schema Registry offline-first
- [x] Itération 9 — Pipeline médias photos / plans / PDFs (intention-first)
- [x] Itération 10 — Cerveau LLM (router hybride + extract + describe + conversational)
- [x] Itération 10.5 — Refonte UX IA (Edge Function `vtu-llm-agent`, validation inline, skeleton card, dual output `assistant_message` + patches)
- [x] Itération 10.6 — Capture médias terrain : rafale caméra, multi-import galerie, lightbox swipable

**✅ Phase 1 + It. 7 + It. 9 + It. 10 + It. 10.5 + It. 10.6 (Phase 2) COMPLÈTES.** Prochaine
étape : audio (it. 8 reportée), rapport Word.

**HORS scope Phase 1** : audio, photos, IA mutation JSON, rapport
Word, artifacts, transcription, croquis, géoloc, laser, settings,
multi-user, partage, push, édition message, export.

### Architecture sync cross-device (Itération 6.5)

- **PUSH** (`runSyncOnce`) : vide la `sync_queue` locale vers Supabase,
  sérialisé, backoff exponentiel, idempotence via `(user_id, client_id)`.
- **PULL périodique** (`runPullOnce`) : pour `visits` + `visit_json_state`,
  fetch `WHERE user_id = ? AND updated_at > last_pulled_at` (curseur en
  Dexie `sync_state` v2). Hydration initiale = LIMIT 500 sans `gt`.
- **PULL lazy par VT** (`useMessagesSync` → `pullMessagesForVisit`) :
  à l'ouverture d'une VT, fetch les messages > `last_local_created_at`.
  Évite de charger 10k messages au login.
- **REALTIME** (`useMessagesSync`) : channel `visit-{id}` avec
  `postgres_changes` filtré par `visit_id=eq.{id}` sur `messages` +
  `visit_json_state`. Cleanup au unmount. Pas de realtime sur la sidebar
  (pull 30s suffit).

### Dette technique notée (cosmétique, non bloquante)
- Migration 002 : l'index `idx_visits_user_updated` est dupliqué entre
  001 et 002. Lovable ne peut pas modifier rétroactivement les fichiers
  de migration appliqués (read-only). À nettoyer dans une migration 004
  de housekeeping si on touche encore aux index. `IF NOT EXISTS` protège
  l'idempotence en attendant — pas d'impact runtime.
- Itération 6 : `runSyncOnce` accepte `SyncSupabaseLike` (type structurel
  minimal) au lieu de `SupabaseClient` complet — le type Database est trop
  profond pour TS sans `excessively deep` warning. Le call site
  (`useSyncEngine`) cast via `as unknown as`. Idem `runPullOnce`
  (`PullSupabaseLike`) et `useMessagesSync`. Acceptable car la surface
  utilisée est triviale et stable. **It. 7** : même pattern pour
  `SchemaRegistrySupabaseLike` (`schema-registry.repo.ts`) — call sites
  cast via `as unknown as`.
- **It. 9 — Orphelins Storage attachments** : possibles si l'INSERT row
  échoue définitivement après upload Storage réussi. Acceptable Phase 2
  (volume faible). Cleanup via Edge Function Phase 3 si nécessaire.
- **It. 9 — Thumbnail PDF = icône SVG inline** (lucide FileText). Pas de
  `pdfjs-dist` Phase 2. Si client demande la vraie page 1, prévoir
  ~400KB gzipped Phase 3.
- **It. 9 — Cleanup blobs locaux** : `pruneOldBlobs()` est un stub
  Phase 2 (retourne 0). Implémentation TTL 7 jours Phase 3 si le quota
  IndexedDB devient problématique.
- **It. 10.5 — Provider LLM migré vers Edge Function `vtu-llm-agent`** :
  l'extract et le conversational passent maintenant par la Supabase Edge
  Function (modèle `google/gemini-3-flash-preview`) via
  `src/shared/llm/providers/edge-function-client.ts`. Latence cible <8s
  (vs. ~50s en server fn TanStack). `describeMedia` reste sur la server
  fn TanStack — non bloquant car découplé du chat. Workaround
  sérialisation TanStack (cf. ci-dessous) toujours d'actualité pour
  describe_media uniquement.
- **It. 10 — Vision PDF différée Phase 2.5** : `processDescribeMedia`
  écrit `description.skipped=true reason="pdf_no_render_phase2"` dès
  qu'il rencontre `media_profile==="pdf"`. Pas de rendu page 1 vers PNG
  pour l'instant (économie ~400KB pdfjs-dist). Le router donne quand
  même la trace OCR via attachments_context (vide tant que skipped).
- **It. 10 — Audio (Whisper) reporté Phase 3** : la transcription audio
  reste hors-scope. Les messages `kind="audio"` sont routés `extract`
  (média) mais sans contenu textuel exploitable tant que la
  transcription n'arrive pas. UI It. 8 reportée.
- **It. 10 — Nomenclatures vides en Phase 2** : `nomenclature_hints`
  est passé à `{}` dans `buildContextBundle`. Phase 2.5 : injecter les
  catalogues 3CL_DPE / DTG / méthode_energyco selon
  `meta.calculation_method` pour orienter `extract_from_message`.
- **It. 10 — Cap context 100k tokens, compress 5 passes max** :
  `compressContextBundle` applique 5 passes (drop nomenclature → drop
  ocr_text long → réduire detailed_description → tronquer recent_messages
  → drop attachments_context). Au-delà → status `failed` avec
  `context_too_large_after_compress` (logué dans `llm_extractions`).
  L'utilisateur ne voit qu'un récap "extraction trop volumineuse, je
  retente sur le prochain message".
- **It. 10 — Recall Gemini estimé 55-70% en extract** : sur des
  messages terrain courts (« VMC SF, R+2, HSP 2.7, 145 m² »), Gemini
  Flash extrait correctement 55-70% des champs. Le reste passe par la
  validation manuelle (compteur "X champs IA à valider" dans le
  drawer JSON). Doctrine : LLM propose, user valide.
- **It. 10 — Workaround sérialisation TanStack** : les server
  functions LLM retournent `result_json` et `raw_response_json`
  (chaînes JSON) plutôt que les types nus. Cause : TanStack Start v1
  enforce une `ValidateSerializableMapped` qui rejette `Record<string,
  unknown>` et `unknown`. Les call sites (`engine.llm.ts`)
  `JSON.parse` à la réception. Re-évaluer Phase 3 si TanStack assouplit
  la contrainte ou si on passe en Edge Function.
- **It. 10 — Router edge case "VMC ok ?"** : la phrase courte « VMC
  ok ? » match d'abord `CONVERSATIONAL_HINTS` (« ? » final) →
  `conversational`. C'est l'arbitrage doctrinal documenté §15 (hint
  prime sur terrain_pattern). Si le user attendait une saisie, il
  écrira sans le « ? ».
- **It. 10.6 — Dictée audio native = transcription clavier iOS suffit.**
  Whisper reporté Phase 4+ si jargon thermique mal transcrit en
  pratique terrain.
- **It. 10.6 — Limite batch import = 10 fichiers** (`MAX_BATCH` dans
  `AttachmentSheet`). Au-delà, toast warning et seuls les N premiers
  sont ajoutés. Volumétrie suffisante pour une visite type ; à
  réévaluer si retours terrain demandent plus.

### §14 — Pipeline médias (Phase 2 It. 9)

**Intention-first** : l'`AttachmentSheet` propose 3 actions explicites
(📷 Photo terrain / 📄 Plan ou document / 🎙 Dictée — désactivée).
Le profil choisi pilote `compressMedia(file, profile)`.

**3 profils** :
- `photo` : 1600px, WebP 0.80, EXIF strip (GPS extrait à part).
- `plan` : 3000px, WebP 0.95, EXIF préservé.
- `pdf` : passthrough (pas de re-encode), thumbnail = icône SVG inline.

**Dual storage** : chaque attachment a `compressed_path` + `thumbnail_path`
(NULL pour PDF) dans le bucket `attachments`. Le sync engine upload les
deux avec `upsert: true` → idempotent sur retry après crash.

**Dedup SHA-256** : informatif uniquement. Pas de contrainte UNIQUE
serveur (même photo dans 2 VTs = légitime). Badge ⚠ "Dup" dans
PhotoPreviewPanel.

**Offline-first strict** : `addMediaToVisit` crée la row en
`sync_status="draft"` SANS entry `sync_queue`. Seul
`attachPendingMediaToMessage(visitId, messageId)` transitionne
draft → pending et enqueue les `attachment_upload`. Garantit que
`message_id` (NOT NULL côté DB + RLS qui exige le message existant)
est toujours renseigné avant l'upload.

**Handler engine `attachment_upload`** (workflow ordonné) :
  1. Load LocalAttachment (introuvable / déjà synced → mark synced)
  2. Load AttachmentBlobRow (introuvable → mark failed `blob_missing`)
  3. SELECT `messages.id` côté serveur — si null, **backoff sans
     incrémenter `attempts`** (on attend que le message soit synced).
  4. Upload Storage compressed + thumbnail (`upsert: true`).
  5. SELECT `attachments.id` — si présent, skip INSERT (idempotence
     post-crash).
  6. INSERT row (23505 = succès logique).
  7. Mark synced + retire l'entry de la queue.

**Message kind au submit** :
- `drafts.length === 0` → `text`
- tous les drafts ont `media_profile === "pdf"` → `document`
- sinon (≥1 image photo OU plan) → `photo`

### §17 — Capture médias terrain (It. 10.6)

Architecture **client-side pure** : aucun changement Dexie / Supabase
/ sync_queue. Tout repose sur le pipeline §14 existant.

**3 chantiers UX** :

1. **Rafale caméra** (`AttachmentSheet` mode `burst`) :
   - Bouton « Prendre des photos » → input camera natif (`capture="environment"`).
   - Après chaque shot, retour dans la sheet avec **grille 3 colonnes**
     des photos déjà prises dans la session courante (réactif via
     `useLiveQuery(listDraftMedia)`).
   - 2 CTA : « Prendre une autre » (rouvre la caméra) | « Envoyer (N) »
     (crée 1 message `kind="photo"` + `attachPendingMediaToMessage`
     pour rattacher les N drafts en bloc).
   - Compteur visible `N / 10` (badge primary tabular-nums).
   - Retrait individuel via bouton ✕ sur chaque thumbnail.

2. **Multi-import galerie** (`AttachmentSheet` mode `import`) :
   - Bouton « Importer plans / documents » → input
     `<input type="file" multiple accept="image/*,application/pdf">`
     (sélection multiple iOS native).
   - Liste verticale des fichiers (thumbnail + nom + taille +
     bouton retirer). Mix images + PDFs autorisé.
   - Limite `MAX_BATCH = 10` : si dépassement, toast warning et
     seuls les N premiers sont ajoutés.

3. **Lightbox plein écran** (`MediaLightbox`, montée via portail) :
   - Tap sur n'importe quelle thumbnail dans le chat
     (`MessageAttachments`) → ouvre le portail bg-black/95.
   - **Swipe horizontal** entre médias d'un même message
     (touch start/move/end + threshold 60px), flèches clavier
     (←/→) et boutons desktop (md+).
   - Indicateur `N / total`, fermeture via ✕ / Escape / tap fond noir.
   - Source image : **blob local Dexie en priorité** (instantané,
     offline) → fallback URL signée Supabase Storage (TTL 600s).
   - Footer : description IA (`short_caption`) si dispo via
     `attachment_ai_descriptions`, en gradient bottom.
   - PDF → icône + bouton « Ouvrir le PDF » (URL signée).

**Confirmation fermeture** : si l'utilisateur ferme la sheet alors qu'il
a ≥1 draft en cours, un `AlertDialog` propose « Garder pour plus tard »
(les drafts restent attachés à la prochaine soumission via le ChatInputBar)
ou « Tout supprimer ». Garantit qu'**aucune photo n'est perdue par
fermeture accidentelle**.

**Multi-photos & LLM** : `processLlmRouteAndDispatch` (engine.llm.ts)
itère sur TOUS les attachments du message et `scheduleDependencyWait`
si UN SEUL `describe_media` n'est pas terminé. Le dernier
`describe_media` qui aboutit appelle `wakeUpPendingDispatchJobs(message_id)`
qui réveille le dispatch via l'index composé `[op+row_id]`. Pour 5
photos d'un même message, **les 5 descriptions IA arrivent en parallèle
dans le contexte avant l'extract** — comportement déjà fonctionnel,
hérité d'It. 10 sans modification.

**Affichage chat** : `MessageList` rend désormais les messages
`kind="photo"` ou `kind="document"` via `MessageAttachments` (grille
1/2/3 colonnes selon N). Badge ✨ par thumbnail si description IA dispo.


### §13 — JSON dynamique : architecture & gouvernance (Phase 2 It. 7)

- **3 niveaux de métadonnées** : (1) `Field<T>` traçable (value + source +
  confidence + updated_at + source_message_id), (2) sections structurelles
  Zod (`building`, `envelope`, `heating`, ...), (3) `custom_fields[]`
  ad-hoc ancrés sur registry.
- **`registry_urn` = ancre stable à vie** : pattern figé
  `urn:vtu:schema:{canonical_section_path}.{field_key}:v1`. Bump `:v2`
  uniquement si rupture sémantique (ex: changement de `value_type`).
- **Canonicalisation `sectionPath`** : `canonicalizeSectionPath` remplace
  `[\d+]` par `[]` AVANT toute opération registry (build URN, lookup,
  fuzzy, increment). Sinon 2 ballons ECS = 2 URN différents pour le même
  champ métier → explosion du registry.
- **`schema_registry` = table sociale** scopée user (`UNIQUE (user_id,
  registry_urn)`). Phase 4 : org-scoped via `organization_id` (déjà
  nullable en DB).
- **Anti-prolifération** : `_buildCustomFieldSkeleton` est PRIVÉ. Le SEUL
  point d'entrée public est `createCustomField` (json-state.factory.ts)
  qui FORCE le passage par `resolveOrCreateRegistryEntry`.
- **Offline-first du registry** : URN déterministe calculable sans réseau.
  En offline (ou erreur réseau), mirror Dexie + enqueue
  `schema_registry_upsert` dans la `sync_queue`. `registry_id` = null
  tant que la sync n'a pas confirmé ; `registry_urn` suffit pour la
  traçabilité immédiate. Conflict 23505 côté serveur = succès logique.
- **2 RPC Postgres** : `find_similar_schema_fields(user, path, query)`
  (fuzzy ILIKE label/key/synonyms, ORDER BY usage_count, LIMIT 10) et
  `increment_registry_usage(id)` (atomique, anti race-condition).
- **Migration v1 → v2** : `migrateVisitJsonState` idempotent, mappe
  `building_type → building_typology` (`immeuble → null +
  needs_reclassification`), bump `schema_version: 1 → 2`. Appliquée
  automatiquement par `upsertJsonStateFromRemote` (rétrocompat pull
  cross-device).
- **Bornes physiques** (`json-state.bounds.ts`) : rejettent UNIQUEMENT
  les hallucinations IA. JAMAIS un bâtiment français réel (Tour
  Montparnasse 59 niveaux, campus 150k m², chaufferie 5MW, monument an
  1100). `makeYearBound(min, offsetMax=2)` runtime-evaluated.
- Sync sérialisé : un seul tick à la fois par fenêtre via flag mémoire.
  Sur multi-onglets, l'idempotence DB (unique `(user_id, client_id)`)
  protège — pas de lock cross-tab pour Phase 1.
- Realtime activé UNIQUEMENT sur `messages` + `visit_json_state`. Si on
  veut un jour voir instantanément les VTs créées sur un autre device
  apparaître dans la sidebar, ajouter `visits` à la publication realtime
  et s'abonner globalement (channel `user-{userId}`).
- Limite 500 rows sur hydration initiale : si un thermicien dépasse 500
  VTs un jour, paginer. Improbable Phase 1-2.

---

## 9. Sécurité

- `.env` JAMAIS commité (toujours dans `.gitignore`)
- Secrets serveur dans Lovable Cloud Secrets, JAMAIS en clair
- RLS user-scoped sur TOUTES les tables
- Server functions : `Authorization: Bearer <JWT>` enforced via
  `requireSupabaseAuth` middleware
- Storage buckets : policies basées sur path
  `{user_id}/{visit_id}/*`
- **Dev auth** : un bouton "Connexion rapide (dev)" est visible
  uniquement sous `import.meta.env.DEV`. Compte de test
  `dev@energyco.fr` créé dans Supabase pour le développement.
  Ce bouton ne peut PAS apparaître en production (tree-shaking
  de Vite élimine la branche morte au build).

---

## 10. Communication avec le user

- Français systématique
- Challenger les demandes qui contredisent ce document
- Ne JAMAIS inventer de feature hors scope
- Signaler les substitutions de stack au lieu de les faire
  silencieusement
- Mesurer avant d'affirmer (tailles bundle, temps de build)
- JAMAIS de mensonge de rapport : si une correction échoue, le
  dire clairement au lieu de prétendre qu'elle est faite

---

## §15 — Cerveau LLM It. 10 (Context Engineering 2026)

Le cerveau de VTU est un orchestrateur LLM **hybride et déterministe-d'abord**.
Aucune instance ne décide seule de modifier la source de vérité (le JSON
state versionné). Doctrine non négociable : **LLM propose, user valide**.

### Les 4 modes

1. **`router`** (déterministe, fallback Flash-Lite réservé Phase 2.5).
   Décide si un message user → `extract` / `conversational` / `ignore`.
   Implémenté dans `src/shared/llm/router.ts`. Ordre des règles :
   `media → non_user → empty → noise → conversational_hint →
   terrain_pattern → short_capture → default_extract`.
   **Arbitrage clé** : `conversational_hint` PRIME sur `terrain_pattern`.

2. **`describe_media`** (Gemini multimodal). Analyse une photo / un plan
   et écrit `attachment_ai_descriptions` (short_caption + detailed +
   ocr_text + structured_observations). PDF skippé Phase 2 (rendu page 1
   reporté). Réveille les jobs `llm_route_and_dispatch` en attente sur
   le même message via index Dexie composé `[op+row_id]`.

3. **`extract_from_message`** (Gemini Pro/Flash structured output).
   Génère des `AiFieldPatch[]` ciblant des Field<T> du JSON state. Passe
   par `applyPatches` (gates de sécurité, cf. plus bas) puis
   `appendJsonStateVersion` avec `source_extraction_id`. Émet un
   message assistant récapitulatif court.

4. **`conversational_query`** (Gemini Flash). Réponse texte (markdown
   léger) sur le contexte de la VT. Pas de mutation du JSON state.

### Architecture en 3 blocs (context bundle stable)

`buildContextBundle` produit un bundle dont la sérialisation est
déterministe (clés triées, `stableSerialize`) → `hashContext` SHA-256
identique entre 2 builds équivalents → cache prompt côté Gemini OK.

- **Bloc 1 — Visit + state_summary** : projection plate du JSON state
  v2 (incluant Field<T> avec source/validation_status, indispensables
  aux gates).
- **Bloc 2 — Recent messages** : 8 derniers (dispatch) ou 20 (defaults),
  triés par `created_at`.
- **Bloc 3 — Attachments context** : descriptions IA des médias liés
  au message courant (short_caption + detailed + ocr_text).
- (Optionnel) **nomenclature_hints** : vide en Phase 2.

### 4 stratégies (Write / Select / Compress / Isolate)

- **Write** : audit trail systématique. Toute requête LLM aboutit à
  une row `llm_extractions` (provider, model_version, input/output
  tokens, latency, stable_prompt_hash, status, raw_response complet).
  Toute description média écrit `attachment_ai_descriptions`.
- **Select** : le router déterministe sélectionne la voie. Les patches
  IA traversent `applyPatches` qui sélectionne ce qu'il accepte.
- **Compress** : `compressContextBundle` réduit en 5 passes successives
  jusqu'à ≤100k tokens estimés. Au-delà → `failed`, audit trail.
- **Isolate** : provider abstrait derrière
  `src/shared/llm/providers/lovable-gemini.ts`. Les server functions
  ne connaissent que le contrat `ProviderResult<T>`. Phase 3 = swap
  vers Edge Function sans toucher engine ni call sites.

### Garde-fous anti-hallucination (apply-patches)

Tous appliqués dans l'ordre :

1. **`validation_status === "validated"`** → IGNORÉ
   (`validated_by_human`). Un user peut toujours bloquer un champ.
2. **`source ∈ {user, voice, photo_ocr, import}` ET `value !== null`** →
   IGNORÉ (`human_source_prime`). Une donnée humaine n'est JAMAIS
   écrasée par une extraction IA, même `high`.
3. **`source === "ai_infer"` + `unvalidated` + `value !== null`** : gate
   confidence (`high=0.9 / medium=0.7 / low=0.4 / null=0`). Si
   `score(cur) >= score(patch) - 0.1` → IGNORÉ
   (`lower_or_equal_confidence_than_current`). Effet : seul un `high`
   peut écraser un `low`/`medium` plus ancien ; les égalités préservent
   la 1re extraction (audit trail stable).
4. **Bornes physiques** (`json-state.bounds.ts`) — pré-check côté schéma
   Zod : rejet UNIQUEMENT des hallucinations (60 niveaux, etc.), jamais
   un bâtiment français réel.

### Anti-boucle (impératif)

- `appendLocalMessage` enqueue `llm_route_and_dispatch` UNIQUEMENT si
  `role === "user"` ET (`content.length >= 10` OU `attachment_count > 0`).
- `processLlmRouteAndDispatch` re-vérifie `message.role === "user"` avant
  d'appeler le LLM (sécurité en profondeur).
- Le message assistant récap émis après `extract` ou `conversational`
  ne déclenche RIEN (gate role).

### Isolation sync_status

Les ops LLM (`describe_media`, `llm_route_and_dispatch`) ne contaminent
PAS le `sync_status` de la row sous-jacente (attachment / message). Le
processeur core skip `markLocalRowSyncing` pour ces ops, et utilise des
variantes `scheduleRetryOrFailLlm` / `scheduleDependencyWaitLlm`
queue-only. L'audit LLM est tracké séparément dans `llm_extractions` /
`attachment_ai_descriptions`.

### Doctrine "LLM propose / user valide" — livrée It. 10.5

It. 10 livrait la moitié du cerveau (la **proposition**). It. 10.5 livre
l'autre moitié : la **validation inline dans le chat**, sans détour par
le drawer JSON.

**Brief flow** :
1. User envoie un message terrain (ex: "ECS gaz 200L installée 2018").
2. Engine route → Edge Function `vtu-llm-agent` (mode `extract`).
3. La fonction renvoie `assistant_message` (texte naturel) + `patches[]`
   + `custom_fields[]`. Les patches sont appliqués immédiatement comme
   `Field<T>` `source="ai_infer"` + `validation_status="unvalidated"`.
4. Engine crée un message assistant `kind="actions_card"` avec les
   patches en metadata.
5. `MessageList` rend ce message via `PendingActionsCard.tsx` : libellé
   humain via `path-labels.ts` + boutons Apply/Ignore par patch + "Tout
   valider" si >1 pending.
6. Apply → `validateFieldPatch()` (passe à `validated`, append nouvelle
   version JSON). Ignore → `rejectFieldPatch()` (reset à null si
   `ai_infer`, sinon préserve la valeur, statut `rejected`). Toutes les
   actions créent une **nouvelle version** du JSON state (append-only).

**UX premium It. 10.5** :
- **Pas de récap robot** : `assistant_message` Gemini, jamais "Aucun
  champ mis à jour".
- **Skeleton card-shaped** pendant que le LLM travaille (préfigure la
  forme finale → réduit la latence perçue).
- **Latence cible <8s** via Edge Function + `gemini-3-flash-preview`.
- **Cohérence drawer JSON** : la card lit le `Field<T>` réel via
  `useLiveQuery`, donc reflète aussi les changements faits dans le drawer.


---

## §16 — Monitoring & Observabilité production (it. 10.5+)

**Objectif** : zéro surprise sur l'usage fonctionnel et la santé technique
de l'app déployée. Page `/admin/monitoring` réservée au rôle `admin`.

### Accès & sécurité
- Table `public.user_roles` (enum `app_role`: admin/moderator/user) +
  fonction `has_role(uuid, app_role)` `SECURITY DEFINER` (anti-récursion RLS).
- Hook `useIsAdmin()` côté client → redirige les non-admins vers `/visits`.
- L'Edge Function `vtu-monitoring` exige un JWT valide ; la vérification
  fine du rôle admin se fait côté front avant l'appel.

### Signaux suivis
1. **LLM** : volume d'extractions, latence p50/p95/p99, taux d'erreur,
   tokens in/out, coût USD estimé (via `llm_extractions`).
2. **Sync & Queue** : âge max des messages user sans réponse assistant
   (proxy de backlog) → détecte un Edge Function bloqué.
3. **Usage fonctionnel** : utilisateurs actifs, visites créées, messages,
   rythme par jour.
4. **Infra Cloud** : row counts + `last_write` par table critique
   (visits, messages, attachments, llm_extractions, visit_json_state).

### Seuils conservateurs (par défaut)
- LLM p95 : warning >12s, critical >20s.
- LLM error rate : warning >5%, critical >15%.
- Sync backlog (age max) : warning >30s, critical >2min.
- Coût USD/24h : warning >$5, critical >$20.

### Logs 24h
- Timeline filtrable (toutes / erreurs LLM / extractions lentes >10s).
- Fenêtres : 1h, 6h, 24h (par défaut), 3j, 7j.
- Auto-refresh 30s côté front via `useMonitoring()`.

### Fichiers
- `supabase/functions/vtu-monitoring/index.ts` (agrégation serveur).
- `src/features/admin/{useIsAdmin,useMonitoring}.ts`.
- `src/routes/_authenticated/admin.monitoring.tsx`.

### Promotion d'un compte admin
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<uid>', 'admin') ON CONFLICT DO NOTHING;
```

---

## Dette technique

- **Truth-gate côté Edge function (`vtu-llm-agent`)** : la garde anti-hallucination réécrit `assistant_message` quand `totalOps=0` + mots-clés. Couche temporaire, fragile (couplage avec le filtre `fields={}` et le `coalesce` positional). À remplacer par génération déterministe côté client après `applyExtractResult` quand on aura un cycle de stabilité.
