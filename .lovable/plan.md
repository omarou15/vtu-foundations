# Vue satellite Mapbox haute résolution avec géoloc temps réel

## Objectif
Remplacer le stub "Coming soon" de l'onglet Mapbox par une vraie carte satellite zoomable, centrée sur le bâtiment audité, avec un mode "où je suis" mis à jour en temps réel pendant la visite.

## Pré-requis (action utilisateur, 2 min)

Tu dois créer un token public Mapbox :
1. Va sur https://account.mapbox.com/access-tokens/
2. Crée un compte gratuit si nécessaire (pas de CB demandée — 50 000 chargements de carte/mois inclus)
3. Crée un nouveau token, **coche uniquement les scopes `styles:read`, `fonts:read`, `tiles:read`**
4. **IMPORTANT — restreins le token par URL** : ajoute tes domaines (`*.lovable.app`, `*.lovableproject.com`, et ton domaine custom si tu en as un) dans "URL restrictions" pour qu'il ne puisse pas être utilisé ailleurs
5. Copie le token (commence par `pk.…`) et donne-le moi

Je le stockerai en secret runtime (`MAPBOX_PUBLIC_TOKEN`) et il sera exposé au frontend via `VITE_MAPBOX_PUBLIC_TOKEN` — c'est l'usage standard et documenté pour les tokens publics Mapbox.

## Implémentation

### 1. Dépendances
Ajout de `mapbox-gl` (v3, pèse ~800 KB gzippé, on l'importe en lazy dans l'onglet pour ne pas alourdir le bundle initial).

### 2. Réécriture de `MapboxTab.tsx`
Suppression du stub. Nouveau composant qui :
- Lit `import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN` au mount
- Si absent : affiche un message clair "Token Mapbox manquant — voir Settings"
- Si présent : initialise une `mapboxgl.Map` avec :
  - Style : `mapbox://styles/mapbox/satellite-streets-v12` (satellite + noms de rues/POI)
  - Centre initial : coordonnées GPS de la visite (`visit.gps_lat / gps_lng`)
  - Fallback : géocodage de `visit.address` via l'API Mapbox Geocoding si le GPS est absent
  - Zoom initial : 18 (échelle bâtiment), `maxZoom: 22`
  - Marqueur orange (`design-tokens.primary` #FF6B35) sur la position du bâtiment
- Contrôles : zoom +/−, plein écran, échelle, sélecteur de style (satellite pur ↔ hybride)

### 3. Mode "Où je suis" (géoloc temps réel)
Bouton flottant `Crosshair` dans le coin haut-droit de la carte :
- Premier clic : `navigator.geolocation.watchPosition` (geste utilisateur requis, comme pour le NewVisitDialog)
- Affiche un second marqueur bleu pulsant (couleur distincte du marqueur bâtiment) qui se déplace en live
- Recadrage doux sur la position au premier fix uniquement (pas à chaque update, sinon la carte saute)
- Re-clic : centre à nouveau sur ma position
- Clic long / 2e bouton : arrête le watch (économie batterie)
- Cleanup `clearWatch` au démontage de l'onglet
- Watchdog 15 s pour gérer le cas iframe-Lovable comme dans NewVisitDialog

### 4. Mise à jour de `UnifiedVisitDrawer.tsx`
Retirer `comingSoon: true` sur la tab `mapbox`.

### 5. Géocodage de fallback (si GPS visite absent)
Petit helper `geocodeAddress(address, token)` qui appelle l'endpoint Mapbox Geocoding une seule fois au mount de l'onglet et met en cache le résultat dans le composant.

## Hors scope (volontairement reportés)
- 3D buildings (toggle 2D/3D) → V2
- Outils de mesure surface/distance → V2
- Bascule satellite ↔ vue cadastre → V2
- Persistance des annotations sur la carte → V2

## Détails techniques

- **Pourquoi `VITE_…` côté front** : Mapbox impose que le token soit dans le navigateur (le SDK fait les requêtes tuiles directement). Les tokens publics `pk.…` sont conçus pour ça, et la sécurité repose sur la **restriction par URL** côté Mapbox, pas sur le secret. Pas besoin de proxy edge function.
- **Pourquoi pas Leaflet + Esri** : tu as choisi Mapbox satellite, qui a une meilleure résolution centre-villes France et un SDK natif pour la 3D + style satellite-streets très lisible.
- **Bundle** : `mapbox-gl` est lourd (~800 KB) → je l'importe **dynamiquement** dans `MapboxTab` pour qu'il ne soit téléchargé que si l'utilisateur ouvre cet onglet.
- **Compat offline** : Mapbox tuiles nécessitent du réseau ; en offline, on affiche un placeholder "Connexion requise pour la carte".
- **Tests** : pas de test unitaire de la carte elle-même (mapbox-gl ne tourne pas dans jsdom). On teste juste le branchement (token absent → message d'erreur, token présent → conteneur monté).

## Étapes d'exécution
1. Tu me donnes le token Mapbox `pk.…`
2. Je lance `add_secret` pour stocker `MAPBOX_PUBLIC_TOKEN`
3. J'ajoute `mapbox-gl` aux dépendances
4. Je code `MapboxTab` + helper geocoding
5. Je débloque l'onglet dans `UnifiedVisitDrawer`
6. Tu vérifies dans le preview
