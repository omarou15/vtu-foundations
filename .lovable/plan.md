# Fix géolocalisation : timeout, reverse geocoding, et ordre des champs

## Problèmes identifiés

1. **Géoloc charge à l'infini** : `getCurrentPosition` est appelé automatiquement à l'ouverture du dialog (sans geste utilisateur). Dans l'iframe Lovable preview, le navigateur ignore silencieusement la requête → ni `success` ni `error` → état "loading" éternel. Le timeout de 10s ne se déclenche que si le navigateur traite la requête — pas s'il la bloque en amont.
2. **Adresse non remplie** : aucune logique de reverse geocoding n'est branchée derrière les coordonnées GPS.
3. **Ordre des champs** : la position GPS est actuellement après l'adresse alors qu'elle doit être avant (puisqu'elle l'alimente).

## Changements (un seul fichier : `NewVisitDialog.tsx`)

### 1. Géolocalisation déclenchée par geste utilisateur + watchdog

- **Supprimer** l'appel automatique de `requestGeolocation` dans le `useEffect([open])`. État initial : `{ status: "idle" }` avec un message "Appuyez sur Localiser".
- **Ajouter un bouton « Localiser »** dans le bloc GPS. Le clic sur ce bouton (= geste utilisateur synchrone) appelle `navigator.geolocation.getCurrentPosition` directement, sans `await` préalable. C'est la condition pour que l'API fonctionne dans l'iframe preview (cf. note browser security).
- **Ajouter un watchdog `setTimeout(15000)`** côté JS : si aucun callback (success/error) n'est reçu sous 15s, on bascule en `{ status: "unavailable", reason: "délai dépassé" }`. Cela résout le cas où l'iframe avale la requête sans rien renvoyer.
- **Stocker le timer dans une `ref`** pour pouvoir l'annuler à la résolution ou au démontage (évite les fuites + double set d'état).

### 2. Reverse geocoding automatique → remplit l'adresse

- Au succès de la géoloc, lancer un `fetch` vers Nominatim OpenStreetMap (gratuit, sans clé API, pas de connecteur à ajouter) :
  ```
  https://nominatim.openstreetmap.org/reverse?lat=...&lon=...&format=json&accept-language=fr
  ```
- **Headers** : `Accept: application/json` (Nominatim demande un User-Agent mais les navigateurs en imposent un par défaut, OK depuis le client).
- **Comportement** :
  - Pendant l'appel : badge "Recherche de l'adresse…" sous le champ adresse.
  - Si succès et `address` actuellement vide : auto-remplir avec `data.display_name`.
  - Si l'utilisateur a déjà tapé une adresse : NE PAS écraser, mais afficher un petit lien "Utiliser l'adresse GPS" sous le champ.
  - Si échec/timeout : silencieux, on garde le champ vide (l'utilisateur saisit manuellement).
- Wrap le tout dans try/catch pour ne jamais bloquer le formulaire.

### 3. Réorganisation visuelle (ordre des champs dans le `<form>`)

Nouvel ordre :
1. Titre
2. Date & heure (auto, lecture seule)
3. **Position GPS** ← remontée ici
4. **Adresse** ← descendue, alimentée par le GPS
5. Type de mission (+ champ "Précisez" conditionnel)
6. Typologie de bâtiment (+ champs conditionnels)

### 4. Petits raffinements UX

- Le bouton "Réessayer" devient "Localiser" tant qu'on n'a jamais réussi, puis "Réessayer" après un échec.
- En statut `success`, afficher discrètement un bouton "Actualiser" (icône `RefreshCw`) pour relancer.
- Annulation propre du watchdog au démontage du composant et à la fermeture du dialog.

## Hors scope

- Pas de changement de DB ni de schéma : les colonnes `gps_lat/lng/accuracy_m` et `address` existent déjà.
- Pas de changement de `visits.repo.ts` : il consomme déjà `gps` et `address` depuis le formulaire.
- Pas d'ajout de dépendance npm (Nominatim = `fetch` natif).
- Pas de Mapbox / clé API : on garde l'approche zéro-config.

## Détails techniques

- **Pourquoi Nominatim et pas Mapbox** : pas de secret à demander à l'utilisateur, usage policy OK pour un cas ponctuel (1 req par création de visite). Si abus futur → on basculera sur Mapbox via une edge function.
- **Pourquoi le geste utilisateur est nécessaire** : Chrome/Safari/Firefox dans une iframe cross-origin (cas de la preview Lovable) ignorent les appels Permissions/Geolocation issus de code asynchrone non lié à un input handler. Le clic explicite sur "Localiser" rétablit le contexte de gesture.
- **Tests** : mettre à jour `NewVisitDialog.test.tsx` pour refléter le nouvel ordre DOM et le bouton "Localiser" (mock de `navigator.geolocation` déjà en place).
