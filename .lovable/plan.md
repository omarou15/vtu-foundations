# Plan de correction définitive — photos, compteur, sync PC/téléphone, analyse IA

## Objectif

Rendre le pipeline pièces jointes fiable et observable de bout en bout :

```text
Capture locale → message local → upload Storage → row attachment Cloud
→ pull/realtime autre appareil → affichage thumbnail → analyse IA
→ row attachment_ai_descriptions → compteur stable
```

Le problème actuel vient du fait que ces étapes sont asynchrones, mais l’UI les affiche comme si tout arrivait en une seule transaction. Résultat : compteurs qui régressent, photos absentes selon appareil, analyse IA difficile à diagnostiquer.

## 1. Stabiliser la sync par visite avec un orchestrateur unique

Créer un orchestrateur dédié à la visite active, au lieu de laisser `useMessagesSync` faire plusieurs pulls/realtime indépendants.

Actions :
- Remplacer le pull séquentiel fragile par une fonction unique `syncVisitAssetsSnapshot(visitId)`.
- Puller dans cet ordre strict :
  1. messages
  2. attachments
  3. attachment_ai_descriptions
  4. visit_json_state
- Écrire chaque famille de données dans Dexie par batch/transaction quand possible pour éviter les snapshots intermédiaires.
- Ajouter un verrou mémoire par `visitId` pour empêcher deux pulls simultanés dans le même onglet.
- Rendre l’effet React Strict Mode safe : si le hook monte deux fois en dev, il ne doit pas créer deux flux concurrents.
- Supprimer les `catch {}` silencieux : les erreurs restent non bloquantes pour l’utilisateur, mais elles sont enregistrées dans un état local de diagnostic.

Résultat attendu : les compteurs ne doivent plus faire `5/5 → 1/5` à cause d’un pull partiel.

## 2. Corriger les curseurs de pull attachments/descriptions

Le code actuel met à jour les curseurs dans `useMessagesSync` en relisant Dexie après le pull. C’est fragile si des données locales/remotes se mélangent.

Actions :
- Faire retourner aux fonctions de pull un résultat structuré : `{ count, lastCreatedAt }`.
- Mettre à jour `sync_state` uniquement avec le dernier `created_at` reçu du serveur, pas avec un tri Dexie postérieur.
- Garder une marge anti-skew si nécessaire : `created_at >= cursor` + upsert idempotent, ou cursor strict mais basé uniquement sur la réponse serveur.
- Ajouter des tests qui prouvent qu’un pull partiel ou vide ne fait pas régresser l’état local.

Résultat attendu : pas de ligne manquée, pas de compteur instable après refresh ou changement d’appareil.

## 3. Rendre l’affichage photo déterministe cross-device

Sur l’appareil d’origine, les blobs Dexie existent. Sur l’autre appareil, ils n’existent pas : l’image doit passer par Storage signé, puis être back-fillée localement.

Actions :
- Renforcer `useAttachmentThumb` pour exposer un statut détaillé :
  - `local_blob_available`
  - `remote_signing`
  - `remote_signed`
  - `remote_fetching`
  - `backfilled`
  - `failed`
- Ne plus retourner seulement `failed: boolean`; conserver un `error_code` / `error_message` interne.
- Corriger le fallback path : préférer `compressed_path`, sinon `thumbnail_path`, et afficher clairement si aucun path n’existe.
- Ajouter un `onError` sur `<img>` : si l’URL signée retourne 200 mais que l’image ne se décode pas, l’UI doit passer en erreur visible au lieu de rester en pulse infini.
- Dans `MessageAttachments`, afficher un état explicite :
  - “chargement…”
  - “fichier distant en récupération…”
  - “image indisponible” avec détail court en dev
- Vérifier que la lightbox utilise le même resolver que les thumbnails.

Résultat attendu : une photo uploadée sur téléphone devient visible sur PC sans dépendre du blob local initial.

## 4. Remplacer le compteur brut par un état métier stable

Le composant `VisitAttachmentSyncStatus` compte directement des rows Dexie à chaque snapshot. C’est utile, mais trop sensible aux écritures progressives.

Actions :
- Calculer un modèle stable par attachment :

```text
attachment_status = {
  uploaded: boolean,
  visible: boolean,
  ai: "not_requested" | "queued" | "running" | "done" | "failed" | "disabled_when_sent"
}
```

- Compter seulement les attachments `submitted` liés à un message existant.
- Ne jamais faire descendre artificiellement le total pendant une sync en cours : conserver le dernier total stable en mémoire tant que le snapshot est incomplet.
- Séparer visuellement :
  - `x/y uploadées`
  - `x/y visibles`
  - `x/y analysées`
- Afficher “sync en cours” au lieu de laisser croire à une régression.

Résultat attendu : le compteur peut progresser ou indiquer “sync en cours”, mais ne doit plus donner l’impression de perdre des photos.

## 5. Fiabiliser l’analyse IA image

Aujourd’hui l’analyse IA dépend du job local `describe_media` en queue. Si l’autre appareil récupère uniquement la row `attachments`, il ne doit pas forcément relancer l’analyse, mais il doit voir son état réel.

Actions :
- Introduire une notion locale explicite d’état IA, dérivée de :
  - présence d’une description dans `attachment_ai_descriptions`
  - présence d’un job `describe_media` dans `sync_queue`
  - message envoyé avec `metadata.ai_enabled === false`
  - dernière erreur LLM si disponible
- Quand `describe_media` échoue définitivement, ne pas supprimer l’information : créer/enregistrer un diagnostic local visible.
- Ne pas relancer automatiquement l’IA pour les attachments envoyés IA off ; afficher une action claire “Analyser maintenant” si l’IA est activée.
- Prévoir une fonction idempotente `enqueueDescribeMediaForAttachment(attachmentId)` réutilisable par :
  - upload réussi local
  - bouton manuel “Analyser maintenant”
  - récupération cross-device si aucune analyse n’existe et IA active
- Sur erreur Lovable AI 402/429/API key/runtime, afficher un toast ou un statut compréhensible au lieu d’un échec silencieux.

Résultat attendu : l’utilisateur sait si l’image est en attente, analysée, désactivée IA, ou en erreur réelle.

## 6. Ajouter un panneau debug temporaire, dev-only

Ajouter un composant de diagnostic activable uniquement en développement ou via flag discret.

Actions :
- Créer `SyncDebugOverlay` ou `VisitSyncDiagnosticsPanel`.
- Afficher pour la visite active :
  - nombre `messages`
  - nombre `attachments`
  - nombre `attachment_blobs`
  - nombre `attachment_ai_descriptions`
  - nombre de jobs `sync_queue` par op
  - derniers `sync_last_error`
  - état des URLs signées / erreurs image
- Ne pas afficher ce panneau aux utilisateurs finaux en production.
- Ajouter un bouton “copier diagnostic” pour récupérer un JSON utile sans DevTools.

Résultat attendu : on n’a plus besoin de demander à l’utilisateur d’ouvrir IndexedDB/Network pour comprendre où ça bloque.

## 7. Sécuriser Realtime et multi-onglets

Realtime peut doubler les écritures locales si deux channels sont actifs ou si Strict Mode remonte le hook.

Actions :
- Nommer les channels avec un suffixe stable et vérifier cleanup.
- Ajouter un registry mémoire des subscriptions actives par `visitId`.
- S’assurer qu’un seul channel par visite est actif dans un onglet.
- Garder les upserts idempotents, mais éviter les rafales inutiles.
- Optionnel : utiliser `BroadcastChannel` pour élire un onglet “sync leader” si plusieurs onglets VT sont ouverts.

Résultat attendu : moins de write storms Dexie, donc moins de snapshots incohérents.

## 8. Ajustements base de données / Cloud

À vérifier avant migration : les tables existent déjà et RLS semble correcte côté rows. Le point important est la traçabilité des erreurs et la realtime.

Actions possibles selon inspection :
- Vérifier que `attachments` et `attachment_ai_descriptions` sont bien dans la publication realtime.
- Ajouter si nécessaire une table légère ou colonnes de diagnostic n’est pas prioritaire ; préférer d’abord le diagnostic local pour ne pas complexifier le modèle.
- Ne pas rendre le bucket public : les photos doivent rester privées, avec URLs signées.
- Ne pas stocker de rôles sur profiles/users.

Résultat attendu : pas de régression sécurité, photos privées, sync autorisée uniquement au propriétaire.

## 9. Tests à ajouter

Ajouter des tests ciblés, pas seulement des tests de rendu.

Tests sync :
- Pull messages + attachments + descriptions dans l’ordre.
- Pull idempotent : relancer deux fois ne duplique rien.
- Curseur basé sur réponse serveur, pas sur tri Dexie local.
- Strict Mode / double call : pas de double channel logique.

Tests UI compteur :
- 5 attachments synced + 0 descriptions → `0/5 analysées`, pas “tout synchronisé”.
- 5 attachments synced + 5 descriptions → tout synchronisé.
- Snapshot intermédiaire pendant pull → affiche “sync en cours”, ne descend pas brutalement.
- IA off → statut “envoyée avec IA désactivée”, pas erreur.

Tests thumbnail :
- Blob local disponible → utilise blob.
- Pas de blob + path remote OK → signed URL affichée puis backfill.
- Pas de path → erreur visible.
- `<img onError>` → état indisponible.

Tests IA :
- `describe_media` succès → insertion description + compteur progresse.
- erreur 429/402 → message visible, retry contrôlé.
- IA off → pas d’hallucination, pas de job automatique sauf action utilisateur.

## 10. Ordre d’exécution recommandé

1. Corriger les curseurs et l’orchestrateur de sync par visite.
2. Stabiliser `VisitAttachmentSyncStatus` avec un modèle métier par attachment.
3. Rendre `useAttachmentThumb` observable et corriger les états infinis.
4. Ajouter les diagnostics dev-only.
5. Fiabiliser le job IA image et les erreurs visibles.
6. Ajouter tests sync/UI/thumbnail/IA.
7. Vérifier realtime/RLS/storage en dernier.

## Critères d’acceptation

- Une rafale de 5 photos envoyée depuis téléphone apparaît sur PC après sync.
- Les thumbnails sont visibles sur l’autre appareil sans blob local initial.
- Le compteur ne régresse plus de manière trompeuse.
- L’utilisateur voit clairement : uploadé, visible, analysé, IA off ou erreur.
- Si Lovable AI échoue, l’erreur n’est plus silencieuse.
- L’IA ne prétend jamais avoir analysé une image sans description réelle.
- Les tests ciblés passent.
- Aucune modification des fichiers auto-générés `src/integrations/supabase/client.ts` ou `types.ts`.
- Le bucket reste privé et les accès passent par URLs signées.