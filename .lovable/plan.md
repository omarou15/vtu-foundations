## Objectif

Enrichir le formulaire "Nouvelle visite technique" pour capturer plus de métadonnées dès la création :
- date + heure automatiques (timestamp local)
- géolocalisation automatique (lat/lng navigateur)
- nouvelles options de `mission_type` et `building_type`
- champ texte libre quand "Autre" est choisi
- sous-secteur quand "Tertiaire" est choisi (+ champ libre si "Autres secteurs")

## Changements de modèle

### Types — `src/shared/types/db.ts`

Étendre les unions et `VisitRow` :

```ts
export type MissionType =
  | "audit_energetique"
  | "dpe"
  | "ppt"
  | "dtg"
  | "note_dimensionnement"
  | "autre";

export type BuildingType =
  | "maison_individuelle"
  | "appartement"
  | "copropriete"
  | "monopropriete"
  | "industrie"
  | "tertiaire"
  | "autre";

export type TertiaireSubtype =
  | "bureau"
  | "hotellerie"
  | "sante"
  | "enseignement"
  | "commerce"
  | "restauration"
  | "autre";

export interface VisitRow {
  // ... existing
  mission_type: MissionType | null;
  mission_type_other: string | null;        // libre si mission_type === "autre"
  building_type: BuildingType | null;
  building_type_other: string | null;       // libre si building_type === "autre"
  tertiaire_subtype: TertiaireSubtype | null;        // si building_type === "tertiaire"
  tertiaire_subtype_other: string | null;            // libre si tertiaire_subtype === "autre"
  visit_started_at: string;                 // ISO timestamp création (date+heure)
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
}
```

### Migration SQL (nouvelle)

`supabase/migrations/<timestamp>_visit-extended-metadata.sql` :
- `ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS` pour les 7 nouvelles colonnes
- DROP puis recreate des CHECK constraints `visits_mission_type_check` et `visits_building_type_check` avec les nouveaux sets d'enum
- Ajout `visits_tertiaire_subtype_check` (NULL ou ∈ liste)
- Idempotent (DO $$ ... EXISTS guards)

### Dexie — `src/shared/db/schema.ts`

Pas de changement de schéma d'index (on stocke les nouveaux champs dans la row, pas indexés). Aucune nouvelle version Dexie nécessaire — `LocalVisit = VisitRow & SyncFields` suit automatiquement.

### `src/shared/db/visits.repo.ts`

`createLocalVisit` :
- accepter les nouveaux paramètres optionnels (`missionTypeOther`, `buildingTypeOther`, `tertiaireSubtype`, `tertiaireSubtypeOther`, `gps`)
- `visit_started_at = now`
- les inclure dans `serializeVisitForSync`

### Meta JSON state

`createInitialVisitJsonState` (déjà appelée) reçoit `address` + `buildingType`. On ajoute :
- `missionType` → utilisé pour pré-remplir `meta.calculation_method` quand mappable (audit_energetique → audit, dpe → dpe, sinon laisser vide)
- `gps` (optionnel) → `meta` n'a pas de champ GPS aujourd'hui ; on stocke uniquement dans `visits` pour l'instant (pas de modif `MetaSchemaV2` pour ne pas casser la migration v2). Si demandé plus tard, ajout d'un champ `meta.gps` derrière `.default()`.

## Changements UI

### `src/features/visits/components/NewVisitDialog.tsx`

Nouveau layout du formulaire :

```text
[Titre]
[Adresse]
[Date & heure]      ← auto, affiché en lecture seule (Input disabled, format fr-FR)
[Position GPS]      ← auto, affichage "Lat, Lng (±Xm)" + bouton "Réessayer"
                      états : "Localisation en cours…", "Refusée", "Indisponible"
[Type de mission ▾]
  - Audit énergétique
  - DPE
  - PPT
  - DTG
  - Note de dimensionnement
  - Autre
[Précisez la mission]   ← visible UNIQUEMENT si mission_type === "autre"

[Typologie de bâtiment ▾]
  - Maison individuelle
  - Appartement
  - Copropriété
  - Monopropriété
  - Industrie
  - Tertiaire
  - Autre
[Précisez le bâtiment]  ← visible si building_type === "autre"

[Sous-secteur tertiaire ▾]   ← visible si building_type === "tertiaire"
  - Bureau
  - Hôtellerie
  - Santé
  - Enseignement
  - Commerce
  - Restauration
  - Autres secteurs
[Précisez le secteur]   ← visible si tertiaire_subtype === "autre"
```

Comportements clés :
- **Timestamp auto** : `useState(() => new Date())` au mount, refresh à chaque ouverture du dialog (déjà géré via `useEffect([open])`). Stocké en ISO, affiché formaté.
- **Géoloc auto** : au mount du dialog, `navigator.geolocation.getCurrentPosition(...)` avec `enableHighAccuracy: true, timeout: 10000`. Trois états : `idle | loading | success | denied | error`. Bouton "Réessayer" si pas success. Le formulaire reste submittable même sans GPS (champ optionnel).
- **Champs conditionnels** : un changement de `mission_type` qui n'est plus "autre" reset `mission_type_other`. Idem `building_type` reset `tertiaire_subtype` + les `_other`. Idem `tertiaire_subtype`.
- **Validation Zod étendue** : superRefine —
  - si `mission_type === "autre"` → `mission_type_other` requis non vide
  - si `building_type === "autre"` → `building_type_other` requis non vide
  - si `building_type === "tertiaire"` → `tertiaire_subtype` requis
  - si `tertiaire_subtype === "autre"` → `tertiaire_subtype_other` requis non vide
- Le bouton "Créer la visite" reste disabled tant que la validation échoue.

### Liste des labels FR

Constantes `MISSION_OPTIONS` et `BUILDING_OPTIONS` mises à jour. Nouvelle constante `TERTIAIRE_SUBTYPE_OPTIONS`.

## Points d'intégration aval (vérifier la non-régression)

- `src/features/visits/lib/icons.ts` : ajouter une icône pour les 4 nouvelles missions (`ppt`, `dtg`, `note_dimensionnement`) et 2 nouveaux building (`copropriete`, `monopropriete`, `industrie`). Fallback générique si non trouvé.
- `src/features/visits/components/VisitCard.tsx` + `VisitsSidebar.tsx` : afficher le label du nouveau set. Si on stocke un `mission_type_other`, l'utiliser en priorité dans l'affichage du sous-titre.
- `src/server/llm.functions.ts` + `src/shared/llm/context/builder.ts` : injection de mission/building dans le prompt LLM — étendre la liste autorisée mentionnée dans le contexte.
- Tests existants à mettre à jour :
  - `NewVisitDialog.test.tsx` : nouveaux options (audit énergétique, dpe restent OK), ajout d'un test "Autre → champ libre requis" et "Tertiaire → sous-secteur requis"
  - `createLocalVisit.test.ts` : passer les nouveaux champs et vérifier la sérialisation
  - `dexie-v1.test.ts`, `pull.test.ts`, `json-state-migrate.test.ts` : ajuster les fixtures qui contiennent `mission_type` pour rester valides
  - mock `navigator.geolocation` dans le setup test (`src/test/setup.ts`)

## Permissions navigateur (PWA)

La géolocalisation déclenche un prompt natif au premier appel. Pas de config supplémentaire nécessaire (HTTPS requis, déjà le cas en prod et preview Lovable). Sur refus, on continue sans bloquer.

## Hors-scope

- Pas de re-conception de la sidebar visites
- Pas de modification de `MetaSchemaV2` (gardé stable pour ne pas re-trigger une migration v2→v3 du JSON state)
- Pas de mise à jour des nomenclatures LLM (Lot B distinct)
- Pas d'édition post-création de ces métadonnées dans cette itération (on les ajoutera plus tard dans `UnifiedVisitDrawer` si besoin)
