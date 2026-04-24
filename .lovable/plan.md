# Plan — Pré-Itération 3 : sécurité .env + refonte design Anthropic

3 blocs séquentiels, livrables explicites à la fin.

---

## Bloc 1 — Untrack `.env` (sécurité)

État vérifié :
- `.gitignore` contient bien `.env`, `.env.local`, `.env.*.local` ✅
- MAIS `git ls-files | grep .env` retourne encore `.env` ❌ (tracké)

Action : exécuter dans le sandbox
```bash
git rm --cached .env
```
puis vérifier que `git ls-files | grep .env` retourne vide.

Note transparence : je ne fais ni `git commit` ni `git push` (interdits côté agent — la sync GitHub Lovable s'en charge automatiquement après le tool call). Pas de mensonge cette fois : si la sync ne propage pas la suppression, je le dirai.

---

## Bloc 2 — Refonte palette Anthropic Claude

### 2.a `src/design-tokens.ts`
Remplacer le bloc `colors` par la palette Anthropic (terracotta `#d97757`, fond chaud `#faf9f5`, neutres `#141413` / `#b0aea5` / `#e8e6dc`, accents `#788c5d` vert, `#6a9bcc` bleu, `#b4593c` danger).

Restructurer `typography.fontFamily` en objet à 3 clés :
- `heading` → Poppins (fallback Arial)
- `body` → Lora (fallback Georgia)
- `ui` → Inter (fallback system-ui)

Le reste (`sizes`, `weights`, `lineHeights`, `radii`, `touch`, `spacing`, `layout`, `motion`, `z`, `shadows`) reste identique.

### 2.b Dépendances
```bash
bun add @fontsource/poppins @fontsource/lora
```

### 2.c `src/styles.css`
- Ajouter les imports `@fontsource/poppins/{400,500,600,700}.css` et `@fontsource/lora/{400,500}.css`.
- Dans `@theme inline` : remplacer `--font-sans` par 3 vars `--font-heading` (Poppins), `--font-body` (Lora), `--font-sans` (Inter conservé pour `font-sans` Tailwind par défaut sur l'UI).
- Recalculer toutes les variables OKLCH du `:root` selon la nouvelle palette (valeurs fournies dans le brief utilisateur, conformes aux hex Anthropic).
- Mettre à jour `--vtu-primary*` : `#d97757` / `#c66848` / `#b4593c`.
- Adapter `.dark` (proportionnellement) pour ne pas casser le contrat (mode sombre reste inactif Phase 1, mais on le garde cohérent).
- Body `font-family: var(--font-body)` (Lora par défaut).
- Ajouter utilitaires `.font-heading`, `.font-body`, `.font-ui`.

### 2.d Migration composants
Cibler tous les `<h1>` / `<h2>` existants pour ajouter `font-heading` :
- `src/routes/__root.tsx` (NotFoundComponent : `h1` 404 + `h2` "Page introuvable")
- `src/routes/login.tsx` (`h1` "Connexion VTU")
- `src/routes/auth.callback.tsx` (`h1` "Lien invalide ou expiré")
- `src/routes/_authenticated/index.tsx` (`h1` "Connecté ✅")

Cibler les paragraphes descriptifs pour `font-body` :
- `__root.tsx` "La page que vous cherchez…"
- `login.tsx` "Recevez un lien magique…" + bloc `sent`
- `auth.callback.tsx` "Ce lien magique n'a pas fonctionné…"
- `_authenticated/index.tsx` "Bienvenue {email}…"

Boutons / inputs / labels : Inter par défaut (Tailwind `font-sans` mappé sur Inter), pas de changement.

### 2.e Meta theme-color
- `src/routes/__root.tsx` : `theme-color` `#FF6B35` → `#d97757`.
- `public/manifest.webmanifest` : `theme_color` → `#d97757`, `background_color` → `#faf9f5`.

### 2.f Icônes PWA (`public/icon-192.png`, `icon-512.png`)
Régénérer avec fond `#d97757` et "V" blanc centré. Pas de source SVG/script existant : je crée un petit script Node avec `sharp` (ou `@napi-rs/canvas`) pour générer les 2 PNG, je l'exécute, je supprime ensuite la dépendance dev pour ne pas alourdir.
**Alternative plus propre proposée :** je crée un `public/icon.svg` source-de-vérité + script de build qui génère les 2 PNG, et je commit les PNG. À toi de me dire si tu préfères le script jetable (plus rapide) ou le SVG durable (recommandé).

### 2.g Tests
`src/test/design-tokens.test.ts` : MAJ des assertions
- `colors.primary` → `#d97757`
- ajout `colors.bg` → `#faf9f5`
- ajout 3 assertions sur `typography.fontFamily.{heading,body,ui}`
- les 3 assertions existantes (sizes, weights, radii, touch) restent inchangées

---

## Bloc 3 — `KNOWLEDGE.md` section 4

Réécrire intégralement la section "## 4. Design system" avec :
- Palette Anthropic complète (neutres + accents avec hex)
- 3 familles de fontes (Poppins/Lora/Inter, rôles + fallbacks + poids)
- Mention "self-hosted via @fontsource (RGPD + perf)"
- Contraintes inchangées (échelle typo, radii, touch 44px, dark mode CSS prête)
- Règle "aucune valeur hardcodée" maintenue

---

## Livrable final (un seul message à la fin)

1. Output `git ls-files | grep .env` → doit être VIDE
2. Output `git log --oneline -5` (les commits Lovable récents)
3. Output `bun run test` → 8/8 verts (avec les nouveaux asserts)
4. Output `bun run build` → taille bundle JS/CSS post-refonte (les 2 nouvelles fontes vont peser, je donne le chiffre exact)
5. Screenshot du `/login` avec la nouvelle palette (fond `#faf9f5`, bouton `#d97757`, titre Poppins, paragraphe Lora)
6. Confirmation que `KNOWLEDGE.md` §4 est à jour

---

## Question avant de lancer

**Icônes PWA** : script jetable (rapide, code éphémère dans `/tmp`) OU SVG source + script de build commité (durable, +1 fichier dans le repo) ? Par défaut je pars sur **SVG source + script** (plus propre, on pourra régénérer à volonté).

Une fois validé, j'enchaîne tout puis on passe à l'**Itération 3 (Schéma Supabase + RLS + Dexie local)**.
