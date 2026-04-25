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

**✅ Phase 1 + It. 7 (Phase 2 fondations) COMPLÈTES.** Prochaine étape :
audio, photos, IA mutation JSON, rapport Word.

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
