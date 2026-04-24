# VTU — Visite Technique

PWA mobile-first pour thermiciens du bureau d'études Energyco. Une visite technique = une conversation chat. L'IA structure les inputs (texte, photos, audio) dans un JSON qui sert de source de vérité au rapport final.

## Architecture (paradigme non négociable)

- **JSON = source de vérité** — `visit_json_state` versionné est l'état courant de chaque VT
- **`messages` append-only** — audit trail légal, jamais d'UPDATE
- **Optimistic concurrency** — chaque mutation crée une version +1, les writes obsolètes sont rejetés
- **Offline-first** — toutes les écritures passent par IndexedDB (Dexie), puis sync vers Supabase
- **Idempotence** — `client_id` UUID unique par `(user_id, client_id)` empêche les doublons sur retry

## Stack

- React 19 + TypeScript strict
- TanStack Start (Router file-based + server functions `createServerFn`)
- Tailwind CSS v4 + shadcn/ui
- Zustand (state global), Dexie (IndexedDB)
- Lovable Cloud (Supabase managé : auth magic link, Postgres, Storage, RLS)
- Vitest + Testing Library
- Hosting Cloudflare Workers (Lovable)

## Commandes

```bash
bun run dev         # dev server
bun run build       # production build
bun run test        # tests Vitest
bun run test:watch  # mode watch
bun run lint
```

## Itérations Phase 1

1. ✅ **Setup, design tokens, structure** — Inter, manifest installable, Vitest
2. ⏳ **Auth magic link + routing + guards**
3. ⏳ **Schéma Supabase + RLS + Dexie**
4. ⏳ **Sidebar VTs + création + JSON state initial**
5. ⏳ **Chat texte + JSON viewer**
6. ⏳ **Sync engine offline-first + tests**

## Roadmap

### 🚧 Activation PWA prod (dette technique — prompt dédié à venir)

Phase 1 livre un **manifest installable** (Add to Home Screen, icônes, `display: standalone`, theme color) **sans Service Worker**. C'est volontaire : les SW cassent l'iframe de preview Lovable (cache stale, navigation interceptée).

**À faire avant toute mise en prod utilisateur** :
- Activer Workbox via `vite-plugin-pwa` avec `devOptions.enabled = false`
- Cache strategies : `CacheFirst` pour les assets statiques, `NetworkFirst` pour `/api/*`
- Guard de registration : ne PAS register le SW si `isInIframe || isPreviewHost`
- `navigateFallbackDenylist` pour `/auth/*` et `/~oauth/*`
- Tester offline complet (avion mode) sur iOS Safari + Android Chrome

### 🔧 Pin de dépendance — `@vitejs/plugin-react`

`@vitejs/plugin-react` est pinné en **v4.x** (et non v6) car la v6 importe `vite/internal`, qui n'est plus exporté par Vite 7. Le template Lovable (`@lovable.dev/vite-tanstack-config`) injecte déjà ce plugin en v4 et c'est la version supportée. À surveiller : si Vite 7+ rouvre l'export interne ou si `@vitejs/plugin-react@7` sort compatible, on pourra remonter.

### Phase 2 (prompts ultérieurs)

- Messages photos (capture, rafale, galerie, lightbox)
- Messages audio (recording, waveform, transcription)
- Logique IA : analyse des messages + mutation du `visit_json_state`
- Génération du rapport Word depuis le JSON
- Panneau Artifacts

## Portabilité

Le code est 100% exportable GitHub. Les server functions TanStack utilisent l'authentification Supabase via header `Authorization: Bearer <jwt>` (pas de cookie magique), ce qui permet une migration directe vers Supabase Edge Functions si nécessaire.
