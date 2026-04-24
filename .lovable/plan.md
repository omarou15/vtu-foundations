
# VTU v2 — Prompt 1 / N · Fondations · Plan v2

Plan v1 validé + 9 ajustements intégrés ci-dessous. Le reste (6 itérations, structure de fichiers, paradigme JSON/append-only/offline-first) est inchangé.

---

## Ajustements intégrés

### 1. Stack — portabilité GitHub & Supabase Edge Functions
- Code 100% exportable GitHub (aucune dépendance vendor-locked).
- Auth des server functions via **header `Authorization: Bearer <jwt>` explicite** côté client (pas de cookie, pas de magie). Le client Supabase ré-instancié dans la server function utilise ce token. Migration vers Supabase Edge Functions = copier-coller le handler.
- **Dette PWA documentée** dans `README.md` section "Roadmap → Activation PWA prod" : Service Worker + cache strategies (Workbox), à faire avant tout user en prod.

### 2. `requireSupabaseAuth` middleware — implémentation précise

```ts
// src/integrations/supabase/auth-middleware.ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

export const requireSupabaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next, context }) => {
    // Côté client: récupère le JWT de la session locale et l'attache
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    return next({
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    });
  })
  .server(async ({ next }) => {
    const auth = getRequestHeader("authorization");
    if (!auth?.startsWith("Bearer ")) {
      throw new Response("Unauthorized: missing bearer", { status: 401 });
    }
    const token = auth.slice(7);

    // Vérification signature JWT avec SUPABASE_JWT_SECRET
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    let payload;
    try {
      ({ payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] }));
    } catch {
      throw new Response("Unauthorized: invalid signature", { status: 401 });
    }

    const userId = payload.sub as string;
    if (!userId) throw new Response("Unauthorized: no sub", { status: 401 });

    // Client Supabase scopé au user (RLS s'applique comme l'user)
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    return next({ context: { supabase, userId, claims: payload } });
  });
```

Rejet 401 explicite si header absent OU signature invalide OU `sub` absent. Aucun fallback silencieux. Portable tel quel vers une Edge Function (juste remplacer `getRequestHeader` par `req.headers.get`).

**Secret requis** : `SUPABASE_JWT_SECRET` (à récupérer dans Lovable Cloud → Settings → API). Je l'ajouterai en Itération 2.

### 3. JSON Viewer — `react-json-view-lite`
- Dépendance ajoutée à l'Itération 1.
- Wrapper `<JsonViewer>` (`features/json-state/JsonViewer.tsx`) avec :
  - Sections collapsibles par niveau (default : 2 niveaux ouverts).
  - Coloration syntaxique (theme custom basé sur design tokens).
  - Helper `highlightUnconfirmedFields(json)` qui parcourt l'arbre, détecte `{ value, fiabilite, confirmed_by_user, ... }` et applique une classe `border-l-2 border-orange-400 bg-orange-50/40` sur les nœuds avec `confirmed_by_user === false`. Inerte en Phase 1 (tous les champs initiaux sont `true`), UI prête Phase 2.
  - `<div class="overflow-x-auto">` wrapper pour scroll horizontal mobile sur longues valeurs.
  - Badge `Version N` sticky en haut du drawer.

### 4. Tests additionnels (ajoutés à l'Itération 6)
- `quota.test.ts` : mock `navigator.storage.estimate()` → 95% → write rejeté + toast émis.
- `dexie-migration.test.ts` : seed Dexie v1 avec 3 messages `pending`, lance migration v1→v2 (factice mais réelle code path), vérifie les 3 sont préservés avec leur `sync_status`.
- `session-expired.test.ts` : sync en cours, expire la session (mock supabase.auth), vérifie queue intacte + flag `needs_reauth` levé + redirect login déclenché.
- `storage-rls.test.ts` : 2 clients, user A upload `audio/{userA}/foo.webm`, user B tente GET signed URL sur ce path → 403.

### 5. Layout 20/60/20 + clavier virtuel iOS
- `<ChatScreen>` :
  ```tsx
  <div className="fixed inset-0 flex flex-col">
    <ChatHeader className="shrink-0" />              {/* fixed top */}
    <MessageList className="flex-1 overflow-y-auto" />
    <InputBar className="shrink-0" />                {/* fixed bottom */}
  </div>
  ```
- Hook `useVirtualKeyboard` :
  - Si `window.visualViewport` dispo : listen `resize`, calcule `keyboardHeight = window.innerHeight - visualViewport.height`, expose en CSS var `--kb-height`.
  - Fallback : `env(keyboard-inset-height, 0px)` (CSS Environment Variables).
  - InputBar : `style={{ paddingBottom: 'max(env(safe-area-inset-bottom), var(--kb-height))' }}`.
- **Aucun reflow** : la zone messages se contracte, l'InputBar reste collée au-dessus du clavier. Pas de jitter.

### 6. Safe area iOS (Dynamic Island, home indicator)
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` dans `__root.tsx`.
- Header : `padding-top: env(safe-area-inset-top, 0)`.
- Input bar : `padding-bottom: max(env(safe-area-inset-bottom, 0), var(--kb-height))`.
- Sidebar : padding-top safe area sur le header logo.
- Bottom sheet : padding-bottom safe area.
- Test ciblé iPhone 12 / 14 Pro (Dynamic Island).

### 7. Design tokens — précisés

```ts
// src/design-tokens.ts
export const tokens = {
  colors: {
    primary: '#FF6B35', primaryHover: '#E85A2A',
    bg: '#FFFFFF', bgMuted: '#FAFAF9', bgSubtle: '#F5F5F4',
    text: '#1C1917', textMuted: '#78716C', textSubtle: '#A8A29E',
    border: '#E7E5E4',
    success: '#10B981', warning: '#F59E0B', danger: '#EF4444',
    statusInProgress: '#10B981', statusDone: '#6B7280', statusDraft: '#F59E0B',
    online: '#10B981', offline: '#9CA3AF',
  },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    sizes: { xs: 12, sm: 14, base: 16, md: 18, lg: 20, xl: 24, '2xl': 32 },
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  },
  radii: { xs: 6, sm: 8, md: 12, lg: 16, xl: 20 },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  touch: { minTarget: 44 },
} as const;
```

- **Inter self-hosted** via `@fontsource/inter` (poids 400/500/600/700) — pas de Google Fonts CDN (RGPD + perf).
- Variables CSS injectées dans `:root` depuis `tokens` (généré automatiquement, pas dupliqué manuellement).
- Tailwind theme étendu pour matcher (mais tokens TS = source unique).

### 8. Compteurs VisitCard live
- Hook `useVisitCounters(visitId)` :
  ```ts
  return useLiveQuery(async () => {
    const msgs = await db.messages.where('visit_id').equals(visitId).toArray();
    return {
      photos: msgs.filter(m => m.type === 'photos').reduce((n, m) => n + (m.metadata?.photo_count ?? 1), 0),
      notes: msgs.filter(m => m.type === 'text').length,
      audio: msgs.filter(m => m.type === 'audio').length,
    };
  }, [visitId]);
  ```
- VisitCard affiche `{counters.photos} photos · {counters.notes} notes` (audio caché tant qu'à 0).
- Phase 1 : seul `notes` est non-nul (texte uniquement). Phase 2 : photos s'animent toutes seules dès qu'un message photo est créé. Zéro changement à VisitCard.

### 9. A11y sur Dialog / Sheet / Drawer
- shadcn/ui (Radix sous le capot) gère déjà :
  - Focus trap dans le portal.
  - `Escape` ferme.
  - Focus restauré sur l'élément déclencheur à la fermeture.
  - `aria-modal="true"`, `role="dialog"`, `aria-labelledby` correct.
- **Vérifications additionnelles** dans chaque composant :
  - `DialogTitle` toujours présent (visible ou `<VisuallyHidden>` pour les sheets sans titre).
  - `DialogDescription` ou `aria-describedby` quand pertinent.
  - Premier élément focusable = input principal (pas le bouton "Annuler").
  - Test Vitest + Testing Library : ouvrir Dialog, `userEvent.keyboard('{Escape}')`, vérifier fermeture + focus restauré.
- Touch targets ≥ 44×44px (déjà dans tokens, enforced via composant `<TouchableButton>` wrapper).
- Contraste AAA sur texte principal (orange #FF6B35 sur blanc OK pour les boutons mais PAS pour le texte body).

---

## Mises à jour des itérations

- **Itération 1** : ajoute `react-json-view-lite`, `@fontsource/inter`, `jose` aux dépendances. Génère `design-tokens.ts` complet + variables CSS. Inter chargé via `@fontsource/inter/{400,500,600,700}.css`.
- **Itération 2** : ajoute `SUPABASE_JWT_SECRET` aux secrets, implémente `requireSupabaseAuth` complet. Test 401 si pas de header.
- **Itération 3** : ajoute migration Dexie helper + test v1→v2 placeholder (la migration sera réelle quand on changera le schéma, mais le code path est testé maintenant).
- **Itération 4** : VisitCard utilise `useVisitCounters`.
- **Itération 5** : ChatScreen layout 20/60/20 strict + `useVirtualKeyboard` + safe areas + JsonViewer avec `react-json-view-lite` + `highlightUnconfirmedFields`.
- **Itération 6** : 4 nouveaux tests (quota, migration, session expirée, storage RLS) + README section "Roadmap → Activation PWA prod" documente la dette SW.

---

## Récap pour Default Mode

- ✅ Stack adaptée + portabilité GitHub garantie
- ✅ Auth server function bétonnée (JWT verify + Bearer header)
- ✅ JSON viewer pro (lib + highlight Phase 2 ready)
- ✅ 4 tests edge cases ajoutés (10 tests au total minimum)
- ✅ Layout 20/60/20 + visualViewport + safe areas
- ✅ Inter self-hosted + tokens précis
- ✅ Compteurs live cross-prompt (zéro refacto en Phase 2)
- ✅ A11y Radix + checks explicites
- ✅ Dette PWA tracée dans README

Je bascule en Default Mode et lance l'**Itération 1** (setup + design tokens + Inter + structure + manifest installable + Vitest). Je te ping quand c'est buildable pour QA visuel avant d'enchaîner Itération 2.
