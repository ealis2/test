# 🌙 Somnia — journal et analyse scientifique du sommeil

Somnia est une application web progressive (PWA) installable sur iPhone, Android et ordinateur. Elle est hébergée sur **Hostinger** à l'adresse `https://cryptologist.pro`, à la racine ou dans un sous-dossier comme `/sommeil/`.

- **Journal du sommeil** standardisé, au format de l'agenda du sommeil consensuel.
- **Mode sommeil** avec réveil.
- **Statistiques détaillées et honnêtes** : effectifs, valeurs manquantes et méthodes toujours visibles.
- **Repères scientifiques sourcés.**
- **Données personnelles** conservées sur l'appareil.

> Somnia n'est pas un dispositif médical : elle ne pose aucun diagnostic.

## Fonctionnalités opérationnelles

| Section | Ce qui fonctionne réellement |
|---|---|
| **Accueil** | Dernière nuit (cadran 24 h), moyenne sur 7 jours comparée à la semaine précédente, régularité (SRI), bilan sur 7 nuits, prochain réveil, observations datées et sourcées. |
| **Dormir** | Choix de l'heure de réveil, du son (3 sons synthétisés), du volume, de la montée progressive et de la répétition. Récapitulatif du sommeil possible, calculé avec votre latence médiane. Écran de nuit minimaliste avec horizon qui se réchauffe, mode « assombrir », modification ou annulation de la session. **Session conservée après fermeture ou rechargement.** Sonnerie plein écran (arrêter / répéter), retard enregistré si l'app était suspendue. Bilan du matin : latence, réveils, durée d'éveil, qualité, facilité du réveil, contexte, notes. |
| **Journal** | Liste filtrable (nuits, siestes, à compléter). **Calendrier** mensuel : couleurs relatives à l'objectif, moyennes hebdomadaires, siestes, saisies incohérentes, navigation au clavier, panneau du jour sans quitter le mois. Fiche détaillée : horaires, indicateurs, contexte, chronologie de la session et de l'alarme, nuit précédente / suivante. Ajout, correction et suppression (avec annulation). |
| **Analyses** | 8 sections : synthèse « s'améliore / se dégrade / stable », durée, horaires (actogramme), régularité et rythme, qualité et continuité, habitudes, comparaison de périodes et avant / après, qualité des données. Le détail figure plus bas. |
| **Science** | Durées recommandées par tranche d'âge (NSF, AASM/SRS), repères de continuité (NSF), fiche de chaque indicateur, expériences personnelles avec niveau de preuve, limites des appareils, quand consulter, **32 références** avec DOI. |
| **Réveils** | Alarmes récurrentes (jours au choix) ; objectif de lever et de sommeil, avec heure de coucher conseillée ; rappel du coucher ; notifications de secours (Web Push) avec diagnostic et bouton de test ; export calendrier `.ics` ; historique (sonné, répété, arrêté, retard). |
| **Réglages** | Objectif, tranche d'âge, thème Nuit / Aube (clair) / système, animations réduites. Export JSON et CSV, import JSON et CSV, démonstration identifiée, suppression totale, confidentialité. |

**Détail des statistiques.** Moyenne, médiane, minimum, maximum et écart-type, toujours avec leur effectif. Statistiques circulaires pour les heures. Moyennes glissantes, hebdomadaires et mensuelles. Distribution, bilan cumulé sur 7 nuits, tendance (Theil–Sen et Mann–Kendall), changements inhabituels (Welch). SRI, jet-lag social, profil par jour de la semaine, part des nuits atteignant les repères NSF. Associations exploratoires (Welch avec IC 95 %, Spearman, correction de Benjamini–Hochberg). Comparaison de deux périodes ou avant / après un changement. Bande de complétude et provenance des données.

## Limites assumées

- **Alarme sur le web.** La sonnerie retentit si Somnia est **ouverte au premier plan** : l'écran reste allumé via Wake Lock, qui fonctionne en mode app à partir d'iOS 18.4. Si l'app est fermée, iOS la suspend. Deux filets de sécurité existent alors :
  - une **notification push** envoyée par le serveur : un son unique, puis une relance 5 min plus tard, en respectant le mode silencieux ; elle n'est disponible sur iPhone que pour l'app ajoutée à l'écran d'accueil, avec iOS 16.4 ou plus récent ;
  - un **rappel de calendrier** (`.ics`).

  Pour un réveil important, gardez une alarme système.
- **Pas de « réveil intelligent ».** Aucune mesure fiable ne permet de détecter le sommeil léger avec un téléphone, et son bénéfice n'est pas démontré. L'app l'explique au lieu de le simuler.
- **Pas de phases de sommeil ni de score global.** Le journal est déclaratif. Une donnée mesurée importée (montre) est stockée à part et marquée « mesurée ».
- **Pas d'accès à Apple Santé / Health Connect** : ces services sont réservés aux apps natives. Le modèle de données est prêt à recevoir leurs données (voir `docs/ARCHITECTURE.md`).
- **Références scientifiques.** Elles ont été recoupées dans plusieurs index, mais l'environnement de développement ne pouvait pas ouvrir Crossref ni PubMed : leur DOI est cliquable pour vérification (voir `docs/SCIENCE.md`).

## Lancer en local

```bash
php -S 127.0.0.1:8080          # sert l'app et l'API PHP
# puis ouvrir http://127.0.0.1:8080
```

Sans PHP, un simple serveur statique (`npx http-server`) suffit pour toute l'app, sauf les notifications de secours.

**Données de démonstration :** Réglages → Charger la démonstration. Ce sont 120 nuits synthétiques, signalées partout et supprimables en un geste.

## Tests

```bash
npm test                                   # 63 tests Node (calculs, fuseaux, données, alarmes, service push PHP)
npm run check                              # syntaxe JS/PHP, imports, couverture du mode hors ligne
node scripts/smoke.mjs                     # tous les écrans dans Chromium (mobile + ordinateur), erreurs et débordements
node scripts/e2e-session.mjs               # nuit complète simulée de bout en bout
```

Résultats au 28 octobre 2026 :

- `npm test` : **63 / 63 réussis** en moins d'une seconde.
- `scripts/smoke.mjs` : **22 écrans × 2 formats** sans erreur ni débordement.
- `scripts/e2e-session.mjs` : parcours réussi (démarrage, rechargement, alarme, répétition, arrêt, bilan, journal, refus d'une saisie incohérente).
- Audit axe-core (WCAG 2 AA) : **0 violation** sur 18 écrans × 2 thèmes.

Ce qui n'a **pas** pu être testé ici :

- la réception réelle d'une notification sur un iPhone (le flux push est vérifié contre un service push simulé, signature et chiffrement compris) ;
- le comportement d'Apache / LiteSpeed avec le `.htaccess` (testé avec le serveur PHP intégré).

## Mettre en ligne sur Hostinger

### Option A — Déploiement Git (mises à jour automatiques)

1. Ouvrez hPanel → **Sites web** → cryptologist.pro → **Avancé → Git**.
2. Indiquez le dépôt `https://github.com/ealis2/test.git` et la branche à publier.
3. Choisissez le dossier : `sommeil` (recommandé si un site existe déjà à la racine), ou vide pour la racine. Le déploiement à la racine exige un `public_html` vide.
4. Cliquez sur **Créer**, puis sur **Déployer**. Vous pouvez activer le webhook pour déployer à chaque push.

### Option B — Fichier ZIP

1. Lancez `npm run package`, ou téléchargez `somnia-hostinger.zip` depuis la page GitHub Pages.
2. hPanel → **Gestionnaire de fichiers** → `public_html/sommeil` → téléversez le ZIP, puis faites **Extraire**.

### Réglages Hostinger

- **SSL actif** (hPanel → Sécurité → SSL) : indispensable pour la PWA, le service worker et le push. Le `.htaccess` force déjà HTTPS.
- **PHP 8.1 ou plus**, avec les extensions `openssl` et `curl` (hPanel → Avancé → Configuration PHP). Elles sont présentes par défaut.
- **Notifications de secours.** Créez une tâche cron **chaque minute** (hPanel → Avancé → **Tâches Cron**) :
  - type « PHP » ;
  - chemin : `domains/cryptologist.pro/public_html/sommeil/api/cron.php`, à adapter au dossier choisi.

  L'écran **Réveils** de l'app indique si la tâche tourne (« Tâche planifiée active »).
- *(Facultatif)* Variables `SOMNIA_DATA_DIR`, pour stocker les abonnements hors de `public_html`, et `SOMNIA_VAPID_SUBJECT`. On peut aussi les définir dans un fichier `api/config.local.php` qui renvoie un tableau ; ce fichier n'est jamais publié dans le dépôt.

### Installer sur l'iPhone

Ouvrez `https://cryptologist.pro/sommeil/` dans **Safari**, puis touchez Partager → **Sur l'écran d'accueil**. Lancez ensuite Somnia depuis son icône : c'est obligatoire pour les notifications.

Les nuits enregistrées avec l'ancienne version de Somnia (v1) sont reprises automatiquement au premier lancement : horaires et ressenti.

### GitHub Pages

Le workflow `.github/workflows/pages.yml` lance les tests puis publie une démo statique et le ZIP. GitHub Pages n'exécute pas PHP, donc les notifications de secours y sont indisponibles. L'app le détecte et l'indique.

## Documentation

- `docs/ARCHITECTURE.md` : choix PWA, modules, modèle de données, migrations, alarmes, intégrations futures.
- `docs/METRICS.md` : chaque indicateur (formule, unités, valeurs manquantes, limites, tests). Fichier généré depuis le code.
- `docs/SCIENCE.md` : recommandations, expériences, limites, bibliographie complète. Fichier généré depuis le code.
- `docs/DESIGN.md` et `design/directions.html` : les trois directions artistiques, le système de design, l'accessibilité.
- `docs/PRIVACY.md` : politique de confidentialité.
- `docs/research/sources-verifiees.md` : vérification des sources et veille concurrentielle.

Après une modification d'un fichier de l'app, incrémentez `VERSION` dans `sw.js` (`npm run check` vérifie que chaque fichier figure dans le cache hors ligne), puis lancez `node scripts/gen-docs.mjs` si le contenu scientifique a changé.
