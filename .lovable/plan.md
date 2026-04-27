## Problème

Dans la sheet "+", on a aujourd'hui 2 actions actives :
1. **Prendre des photos** → ouvre la caméra (rafale)
2. **Importer plans / documents** → ouvre la galerie en multi-sélection (mais accepte `image/*,application/pdf` mélangés)

Le menu n'expose **pas d'entrée claire dédiée** pour "importer des photos depuis la galerie iOS". Un thermicien qui veut joindre 8 photos déjà prises plus tôt dans la journée ne sait pas où cliquer (l'option existante parle de "plans / documents").

## Solution — 3 intentions distinctes au menu

Restructurer le menu de `AttachmentSheet.tsx` en 3 boutons explicites :

```text
┌──────────────────────────────────────────┐
│ 📷  Prendre des photos                   │
│     Caméra — rafale terrain              │
├──────────────────────────────────────────┤
│ 🖼️  Importer depuis la galerie           │  ← NOUVEAU
│     Photos déjà prises (multi-sélection) │
├──────────────────────────────────────────┤
│ 📄  Importer plans / documents           │
│     PDF, plans scannés                    │
└──────────────────────────────────────────┘
```

## Changements techniques

**Fichier unique : `src/features/chat/components/AttachmentSheet.tsx`**

1. **Nouveau mode** `Mode = "menu" | "burst" | "import-photos" | "import-docs"` (renommer `import` → split en deux).

2. **Deux inputs file séparés** au lieu d'un seul :
   - `galleryRef` : `accept="image/*"` `multiple` → photos uniquement, force `profile: "photo"` à l'ajout.
   - `docsRef` : `accept="application/pdf,image/*"` `multiple` → docs/plans, garde `detectDefaultProfile()` (qui mappe PNG→plan, PDF→pdf).

3. **MenuView** : ajouter une 3e `IntentButton` avec icône `ImageIcon` (déjà importée de lucide-react), titre "Importer depuis la galerie", `data-testid="attach-gallery"`.

4. **ImportView** : prend un prop `kind: "photos" | "docs"` pour adapter le titre ("Photos importées" vs "Plans & documents") et la description. Logique d'ajout identique sauf que le mode photos passe explicitement `profile: "photo"` (ignore `detectDefaultProfile`).

5. **handleSend** : la logique `allPdf` reste correcte (tous les drafts photos ne seront jamais "pdf", donc `kind` du message sera `photo`).

6. **Test** : ajouter un cas dans `burst-multi-import.test.ts` vérifiant que la 3e entrée du menu existe et déclenche le mode `import-photos`.

## Hors scope

- Pas de changement DB / Supabase.
- Pas de changement aux flux burst caméra / docs existants.
- Pas de toucher à `MessageAttachments.tsx` ni `MediaLightbox.tsx`.