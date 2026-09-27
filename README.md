# 🌙 Somnia – Suivi du sommeil pour iPhone

Application de suivi du sommeil **installable sur iPhone** (PWA), hébergée sur Hostinger
à l'adresse **https://cryptologist.pro** (ou dans un sous-dossier, ex. `https://cryptologist.pro/sommeil/`).

Aucun Mac, aucun Xcode, aucun compte développeur Apple (99 €/an) : tout se fait depuis l'iPhone
et le panneau Hostinger.

## Les 5 rubriques

| Onglet | Contenu |
|---|---|
| 🌙 **Nuit** | Suivi de la nuit (accéléromètre + niveau sonore du micro), écran de nuit sombre, **réveil intelligent** (sonne pendant un sommeil léger dans une fenêtre de 10 à 45 min), heures de coucher idéales selon les cycles de 90 min, bilan du matin (score, hypnogramme, ressenti, habitudes). |
| 📓 **Journal** | Historique de toutes les nuits : score, horaires, mini-hypnogramme, détail des phases (profond, léger, paradoxal, éveil), efficacité, endormissement, réveils, bruits détectés, notes. Ajout manuel possible. |
| 📊 **Analyses** | Tendances sur 7 j / 30 j / 3 mois : durée vs objectif, courbe du score, régularité des horaires, phases moyennes, dette de sommeil, **impact de tes habitudes** (café, sport, écrans…) sur ton score, conseils personnalisés. |
| 🎧 **Détente** | 9 sons générés en direct et mixables (pluie, océan, vent, feu, ventilateur, orage, bruits blanc/rose/brun), minuteur avec fondu, respiration guidée (4-7-8, cohérence cardiaque, carrée), routine du coucher. |
| 🔬 **Science** | **Données en temps réel** : météo et humidité de la nuit, qualité de l'air, lever/coucher du soleil (Open-Meteo), phase de la lune, calculateur de cycles, recommandations par âge (National Sleep Foundation) et **dernières publications scientifiques** sur le sommeil (Europe PMC / PubMed), faits scientifiques sourcés. |

Réglages (⚙️) : objectif de sommeil, âge, capteurs, ville, export/import des données, nuits de démo.

## Mettre en ligne sur Hostinger

### Option A – Déploiement Git (recommandé, mises à jour automatiques)
1. hPanel → **Sites web** → cryptologist.pro → **Avancé → Git**.
2. Dépôt : `https://github.com/ealis2/test.git`, branche : celle à déployer (ex. `main`).
3. Dossier d'installation : laisser vide pour la racine, ou `sommeil` pour `https://cryptologist.pro/sommeil/`.
   ⚠️ Le déploiement à la racine exige un `public_html` vide : si ton site crypto y est déjà, utilise `sommeil`.
4. Cliquer **Créer**, puis **Déployer**. (Optionnel : activer le webhook pour déployer à chaque push.)

### Option B – Sans GitHub, depuis l'iPhone (fichier ZIP)
Utiliser `somnia-hostinger.zip` (instructions dans `LISEZ-MOI.txt` à l'intérieur) : le téléverser dans
`public_html/sommeil` via le Gestionnaire de fichiers de hPanel, puis « Extraire ».

### Option C – Gestionnaire de fichiers (ZIP GitHub)
1. Télécharger le dépôt en ZIP depuis GitHub (bouton **Code → Download ZIP**).
2. hPanel → **Gestionnaire de fichiers** → `public_html` (ou créer `public_html/sommeil`).
3. Téléverser le ZIP, clic droit → **Extraire**, et vérifier que `index.html` est directement dans le dossier.

### Vérifications
- **SSL activé** (hPanel → Sécurité → SSL) : obligatoire, l'iPhone refuse micro, capteurs,
  géolocalisation et installation sans HTTPS. Le `.htaccess` force déjà la redirection HTTPS.
- **PHP 8.x** (hPanel → Avancé → Configuration PHP) pour `api/science.php`, le proxy qui récupère
  les publications scientifiques et les met en cache 6 h. S'il ne fonctionne pas, l'app appelle
  Europe PMC directement.

## Installer sur l'iPhone 15
1. Ouvrir **Safari** (pas Chrome) sur `https://cryptologist.pro/sommeil/` (ou la racine).
2. Toucher **Partager** ⎋ → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancer Somnia depuis l'icône : l'app s'ouvre en plein écran, fonctionne hors ligne.

## Précision des analyses
- **Éveil / sommeil** : algorithme d'actigraphie de **Cole-Kripke** (Sleep, 1992) + règles de correction de
  **Webster** (1982), méthodes validées face à la polysomnographie (~85-90 % d'accord minute par minute).
  Calibré pour qu'un simple retournement ne compte pas comme un réveil.
- **Endormissement** : premier bloc de 10 min de sommeil continu. **Réveils** : éveils de 3 min ou plus.
- **Cycles** : découpés sur tes propres mouvements (70-120 min) plutôt que sur une durée fixe.
- **Phases profond / léger / paradoxal** : estimation (aucun téléphone ne peut les mesurer sans capteur cardiaque/cérébral).
- **Indice de fiabilité** par nuit : détecte les coupures de mesure (app en pause), un iPhone posé ailleurs que sur le matelas, les nuits trop courtes.
- Le **score** repose surtout sur les données mesurées (durée, efficacité, endormissement, éveils) ; les phases estimées ne pèsent que 10 points.

## Utilisation la nuit
1. Brancher l'iPhone au chargeur, le poser **sur le matelas** près de l'oreiller, écran vers le haut.
2. Toucher **Commencer ma nuit**, autoriser *Mouvement et orientation* et *Micro*.
3. Laisser l'app ouverte : l'écran reste allumé en très sombre (toucher pour l'assombrir davantage).
4. Le matin : arrêter l'alarme ou **maintenir** le bouton pour terminer la nuit.

**Limites d'une app web sur iOS (à connaître)** :
- iOS met en pause les apps web quand l'écran est verrouillé : il faut laisser Somnia **ouverte**
  (elle garde l'écran allumé automatiquement). C'est aussi pour cela que le réveil ne sonne que si
  l'app est ouverte : garde une alarme de secours dans l'app Horloge.
- Désactive le verrouillage automatique si l'écran s'éteint malgré tout (Réglages → Luminosité → Verrouillage auto).
- Pas d'accès à Apple Santé / Apple Watch (réservé aux apps natives).
- Le micro mesure uniquement un **niveau sonore** ; aucun son n'est enregistré ni envoyé.
- Toutes les nuits restent **sur l'iPhone** (stockage local). Exporte-les régulièrement (⚙️ → Exporter).

## Tester en local sur un ordinateur
```bash
php -S localhost:8080        # ou : npx http-server
```
Puis ouvrir http://localhost:8080 (les capteurs ne fonctionnent que sur l'iPhone, en HTTPS).

## Structure
```
index.html            Page principale
css/style.css         Design (thème nuit, adapté à l'iPhone : encoche, Dynamic Island)
js/app.js             Les 5 rubriques et les réglages
js/tracker.js         Capteurs, écran allumé, réveil intelligent
js/analysis.js        Estimation des phases, score, statistiques
js/charts.js          Graphiques SVG
js/sounds.js          Sons relaxants et sonnerie (Web Audio)
js/science.js         Données temps réel (Open-Meteo, Europe PMC)
api/science.php       Proxy + cache pour les publications scientifiques
sw.js                 Fonctionnement hors ligne
manifest.webmanifest  Installation sur l'écran d'accueil
.htaccess             HTTPS, cache, sécurité (Hostinger / LiteSpeed)
```

Après une modification, incrémenter `VERSION` dans `sw.js` pour que les iPhones récupèrent la mise à jour.

> Somnia estime les phases de sommeil par actigraphie et modèle des cycles, comme les applis grand
> public. Ce n'est pas un dispositif médical.
