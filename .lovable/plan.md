## Itération 12 — Vue Synthèse (lecture humaine de la VT)

Une nouvelle vue **lecture seule** accessible depuis le menu hamburger en haut de la VT, qui rend l'état du JSON de façon lisible (pas de JSON brut) — pensée pour relire en fin de visite ou montrer au client.

### 1. Route & navigation

- **Nouvelle route** : `src/routes/_authenticated/visits.$visitId.summary.tsx` → `/visits/:visitId/summary`.
- Route plate (pas de layout partagé) : page plein écran avec son propre header (bouton retour vers `/visits/:visitId`).
- **Entrée** : transformer le bouton hamburger (`Menu`) en `DropdownMenu` dans `visits.$visitId.tsx` :
  - "Liste des visites" (ouvre le sidebar mobile, comportement actuel)
  - "Synthèse de la VT" (`<Link to="/visits/$visitId/summary">`)
  - "Vue JSON brut" (ouvre le drawer existant)

### 2. Composant `VisitSummaryView`

Fichier `src/features/visits/components/VisitSummaryView.tsx`. Lit via `useLiveQuery` :
- `visit` (Dexie)
- `latestJsonState` (`getLatestLocalJsonState`)
- `messages` (pour `findActiveConflicts`)
- `media` (`listVisitMedia`) regroupés par `linked_sections[0]`

#### Layout (style fiche bâtiment Notion / dashboard Linear)

```text
┌─────────────────────────────────────────┐
│  ← Retour     Synthèse VT     ⋯         │  header sticky
├─────────────────────────────────────────┤
│  [Compteur global : 18 ✓ · 4 IA · 2 ⚠] │  carte récap
├─────────────────────────────────────────┤
│  🏠 Identification du bâtiment          │  carte
│   Adresse · Type · Surface · Année…     │
├─────────────────────────────────────────┤
│  🧱 Enveloppe          [4 champs · 2 📷]│  carte par section
│   Murs : Béton · Isolation 12cm        │
│   Toiture : ⚠ vide  → Compléter →      │
│   [photos miniatures de la section]     │
├─────────────────────────────────────────┤
│  🔥 Chauffage          [3 champs · 1 📷]│
│  💧 ECS                [2 champs]       │
│  🌬 Ventilation         [vide]          │
│  ❄️ Climatisation       [vide]          │
│  🔧 Procédés / 💡 Tertiaire / …         │
└─────────────────────────────────────────┘
```

#### Compteur global (en haut)
Trois badges côte à côte : **N validés** / **N IA non validés** / **N champs vides critiques**. Le 3e ne compte que les champs "critiques" listés ci-dessous.

#### Carte par section
- Icône thématique + libellé FR (réutiliser `SECTION_LABELS` de `path-labels.ts`).
- Compteur "N champs · M photos".
- **Liste des champs renseignés** : libellé (via `labelForPath`) → valeur formatée (via `formatPatchValue`). Les `*_value` + `*_other === "autre"` sont fusionnés ("Autre : précision").
- **Champs IA non validés** : pastille `Sparkles` discrète + valeur en italique.
- **Champs en conflit** : badge ⚠ destructif "Conflit non résolu".
- **Champs vides critiques** : ligne grisée "— vide —" avec lien "Compléter →" qui retourne au chat (`/visits/$visitId`) — pas d'édition inline.
- **Photos de la section** : strip horizontal de miniatures (3-4 visibles, scroll horizontal). Tap = ouvre la `MediaLightbox` existante.
- Section entièrement vide ET non critique → repliée par défaut (juste l'en-tête grisé).

#### Champs critiques (vide = warning)
Liste durcie dans un nouveau `src/features/visits/lib/critical-fields.ts` :
- `meta.address`, `meta.building_typology`, `meta.calculation_method`
- `building.construction_year`, `building.surface_habitable_m2`, `building.nb_niveaux`
- Au moins 1 installation dans `heating.installations`
- Au moins 1 installation dans `ecs.installations` (sauf si typologie = tertiaire pur)

### 3. Helpers nouveaux

`src/features/visits/lib/summary.ts` (pure, testé) :
- `buildSectionSummary(state, sectionKey)` → `{ entries: SummaryEntry[], filled, total }` où `SummaryEntry = { path, label, value, status: "ok" | "ai_unvalidated" | "conflict" | "empty_critical" }`.
- `groupMediaBySection(media)` → `Record<string, LocalAttachment[]>` basé sur `linked_sections[0]` (fallback `"other"`).
- `countSummaryGlobals(state, messages)` → `{ validated, aiUnvalidated, emptyCritical, conflicts }`.

Réutilise : `findUnvalidatedAiFieldPaths`, `findActiveConflicts`, `listFieldsInSection`, `labelForPath`, `formatPatchValue`.

### 4. Style & responsive

- Mobile-first (430px viewport) : cartes pleine largeur, padding 16px, séparateur fin entre cartes.
- Desktop (>=md) : conteneur `max-w-3xl mx-auto`, espacement aéré.
- Animations : `framer-motion` n'est pas dispo → simples transitions Tailwind (`transition-colors`, `animate-in fade-in`).
- Tokens existants : `bg-card`, `border-border`, `text-muted-foreground`, badges `bg-primary/10`, `bg-warning/15`, `bg-destructive/10` (déjà utilisés dans le drawer).

### 5. Tests

- `src/features/visits/__tests__/summary.test.ts` :
  - `buildSectionSummary` retourne les bons statuts (ok / ai_unvalidated / conflict / empty_critical).
  - `groupMediaBySection` regroupe correctement et fallback `"other"`.
  - `countSummaryGlobals` agrège correctement les compteurs.
- Smoke RTL : `VisitSummaryView` rend les cartes et le badge "Compléter →" pour un champ critique vide.

### 6. Hors scope (volontairement)

- Pas d'édition (lecture seule, doctrine respectée).
- Pas d'export Word — c'est le précurseur, pas le rapport final.
- Pas d'impression/PDF (réservé Phase 2 final).
- Pas de drag-drop des photos entre sections.
