# Architecture de Somnia

## 1. Choix de la plateforme : application web progressive (PWA)

| Critère | PWA (retenue) | App native iOS/Android | Multiplateforme (Expo, Flutter) |
|---|---|---|---|
| Hébergement Hostinger `cryptologist.pro` | ✅ fichiers statiques + PHP | ❌ App Store / Play Store | ❌ idem |
| Coût et délais | Aucun compte développeur, aucun Mac | Compte Apple 99 €/an, Xcode, revue | Comptes stores, chaîne de build |
| Alarme fiable app fermée | ⚠️ notification push (son unique) | ✅ alarmes système (AlarmKit iOS 26, AlarmManager) | ✅ via modules natifs |
| Apple Santé / Health Connect | ❌ inaccessible au web | ✅ | ✅ |
| Hors ligne, installation sur l'écran d'accueil | ✅ | ✅ | ✅ |
| Maintenance | Un seul code, sans build | Deux codes | Un code, chaîne native |

La contrainte de déploiement (Hostinger, sans store) impose une PWA. Ses limites sont assumées et affichées dans l'app :

- **Alarme.** Elle sonne dans l'app tant que celle-ci reste au premier plan. Si l'app est fermée, une notification Web Push de secours est envoyée par le serveur. Il est aussi possible d'exporter les réveils vers le calendrier du système (`.ics` avec rappel).
- **Données de santé.** Le modèle et le module d'import sont prêts à recevoir des données mesurées, avec leur provenance (champ `measured`). Une intégration Apple Santé ou Health Connect demandera une enveloppe native (Capacitor, par exemple), qui réutiliserait tel quel tout le code de `js/core`.

## 2. Vue d'ensemble

```
index.html ─ js/main.js (amorçage, routeur hash, thème, service worker)
              │
              ├─ js/screens/*      Écrans (rendu DOM, aucun calcul)
              ├─ js/ui/*           Composants, graphiques SVG, utilitaires DOM
              ├─ js/alarm/*        Moteur d'alarme, sons Web Audio, push, .ics
              ├─ js/data/*         IndexedDB + migrations, dépôt, import/export, démo, reprise v1
              ├─ js/core/*         Moteur de calcul pur (sans DOM), testé sous Node
              └─ js/science/*      Références et contenus scientifiques (source unique de la doc)
sw.js          Hors ligne (cache d'abord), réception des notifications
api/*.php      Service push (abonnements, cron d'envoi, VAPID + RFC 8291), génération .ics
```

**Séparation stricte.** `js/core` ne connaît ni le DOM ni le stockage : chaque fonction prend des épisodes et rend des nombres, avec leurs effectifs. Les écrans n'effectuent aucun calcul statistique. `docs/METRICS.md` et `docs/SCIENCE.md` sont générés depuis `js/science/knowledge.js`, si bien que la documentation ne peut pas diverger du code.

**Pas de framework ni de dépendance d'exécution.** Le code est en modules ES natifs, servis tels quels : rien à compiler pour déployer sur Hostinger. Les polices sont auto-hébergées (licence OFL). Toute la page tient en moins de 1 Mo, polices comprises.

## 3. Modèle de données

Un **épisode** (nuit ou sieste) suit l'agenda du sommeil consensuel (Carney et al., 2012) :

```js
{
  id, schema: 2, type: 'night' | 'nap', tz: 'Europe/Paris',
  bedtime, lightsOff, finalWake, outOfBed,    // instants ISO 8601 UTC
  solMin, awakenings, wasoMin,                // estimations déclarées (null = inconnu)
  quality, wakeEase,                          // échelles 1–5
  freeDay,                                    // null = déduit (réveil samedi/dimanche)
  factors: { caffeineLate: true, alcohol: 2, stress: 3, … }, tags: [], notes,
  source: { kind: 'manual' | 'session' | 'import' | 'legacy-v1' | 'demo', … },
  session: { startedAt, endedAt, events: [{ t, kind }] },   // mode sommeil
  alarm: { plannedAt, rangAt, dismissedAt, snoozes, lateSec },
  measured: { tstMin, provider, method } | null,            // données d'appareil importées
  createdAt, updatedAt
}
```

- **Fuseaux.** Chaque épisode garde le fuseau IANA dans lequel il a été vécu. Les heures d'horloge sont calculées dans ce fuseau (`Intl.DateTimeFormat`), les durées entre instants UTC.
- **Validation** (`validateEpisode`). Les *erreurs* excluent l'épisode des statistiques et sont affichées. Les *avertissements* (nuit de moins d'une heure, latence supérieure à 2 h…) sont conservés et signalés.
- **Provenance.** `tstSource` vaut `declared` ou `measured`. Une donnée importée n'écrase jamais une déclaration : elle est rangée à part dans `measured`.

## 4. Stockage et migrations

- **IndexedDB** (`somnia`). Magasins : `episodes`, `alarms`, `alarmLog`, `kv` (réglages et session en cours). Les migrations sont versionnées dans `js/data/db.js` : une fonction par version, jamais modifiée après publication.
- **Persistance.** L'app appelle `navigator.storage.persist()`. Si IndexedDB est indisponible (navigation privée), elle bascule sur un adaptateur mémoire et l'annonce par un toast.
- **Reprise Somnia v1.** Les nuits du `localStorage` « somnia.v1 » sont importées une seule fois (horaires et ressenti). Les phases estimées de la v1 ne sont pas reprises.
- **Session en cours.** Elle est enregistrée dans `kv` à chaque événement : démarrage, arrière-plan, retour, sonnerie, répétition, arrêt. Elle survit à la fermeture et au rechargement de l'app.

## 5. Alarmes et notifications

```
Préparer la nuit ─► session (IndexedDB) ─► moteur d'alarme (vérification chaque seconde + au retour au premier plan)
        │                                       └─► sonne (Web Audio, montée progressive) ─► arrêt / répétition ─► bilan du matin
        └─► planning ─► api/push.php (abonnement, heures) ─► api/cron.php (chaque minute) ─► Web Push ─► sw.js ─► notification
```

- **Web Audio.** Le contexte audio est débloqué par le geste « Commencer ma nuit », puis maintenu actif par un oscillateur à volume nul. `navigator.audioSession.type = 'playback'` (Safari 17 et plus) permet d'ignorer le bouton silencieux.
- **Écran allumé.** L'API Screen Wake Lock est utilisée quand elle est disponible (iOS 18.4 et plus en mode app).
- **Retard.** Une alarme qui sonne en retard parce que l'app était suspendue enregistre son retard, visible dans la fiche de la nuit et dans l'historique.
- **Push.** Implémentation PHP sans bibliothèque : JWT VAPID ES256 et chiffrement `aes128gcm` (RFC 8291). Le test `tests/push.e2e.test.mjs` vérifie la signature et déchiffre le message comme le ferait un navigateur.
- **Sécurité du service push.**
  - Seuls les hôtes push connus sont acceptés (pas de requête vers un hôte arbitraire).
  - Le jeton d'accès est stocké uniquement haché.
  - Les requêtes sont limitées par IP, avec une IP hachée.
  - `api/data` et `api/lib` sont interdits d'accès web.
  - Aucune donnée de sommeil n'est transmise au serveur.

## 6. Intégrations futures (Apple Santé, Health Connect, montres)

`js/data/importexport.js` centralise l'entrée des données. Pour ajouter une source :

1. Convertir chaque échantillon de sommeil en épisode et renseigner `source: { kind: 'import', provider, permission }`.
2. Placer la mesure objective dans `measured.tstMin` et ses méthodes dans `measured.method`. Les phases éventuelles iront dans un champ séparé, jamais dans les indicateurs déclarés.
3. Valider avec `validateEpisode`. Le moteur utilise automatiquement `measured` et marque `tstSource: 'measured'`.

## 7. Qualité

| Commande | Rôle |
|---|---|
| `npm test` | Tests Node : calculs, statistiques, fuseaux, données, alarmes, service push PHP de bout en bout |
| `npm run check` | Syntaxe JS et PHP, imports, couverture du cache hors ligne |
| `node scripts/smoke.mjs` | Tous les écrans dans Chromium, mobile et ordinateur, sans erreur ni débordement horizontal |
| `node scripts/e2e-session.mjs` | Nuit complète simulée : préparation, rechargement, alarme, répétition, bilan, journal |
| `node scripts/gen-docs.mjs` | Régénère `docs/METRICS.md` et `docs/SCIENCE.md` |
| `npm run package` | Construit `dist/somnia-hostinger.zip` |
