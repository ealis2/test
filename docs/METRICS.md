<!-- Fichier généré par `node scripts/gen-docs.mjs` : ne pas modifier à la main. -->

# Indicateurs de Somnia : définitions, formules, règles

Toutes les formules sont implémentées dans `js/core/` et testées dans `tests/` (voir la colonne « Tests »).

## Principes

- Une valeur inconnue vaut `null`, jamais 0 : « aucun réveil » (0) et « je ne sais pas » (`null`) sont distincts.
- Les durées se calculent entre instants absolus (UTC) : elles restent justes lors des changements d'heure.
- Les heures d'horloge se lisent dans le fuseau **de l'épisode** (enregistré à la saisie), pas dans celui de l'appareil au moment de l'analyse.
- Une nuit appartient au jour du réveil. S'il y a plusieurs épisodes nocturnes à la même date, le plus long est retenu pour les statistiques par nuit, et le doublon est compté.
- Un épisode incohérent (lever avant coucher, latence plus éveil supérieurs à la nuit, fuseau invalide…) est exclu des statistiques, et l'exclusion est affichée.
- Les moyennes et dispersions d'heures utilisent les statistiques circulaires (23:50 et 00:10 donnent 00:00).

## Effectifs minimaux de publication

| Calcul | Minimum |
|---|---|
| Moyenne, médiane, min, max | 3 valeurs |
| Écart-type, variabilité | 5 valeurs |
| Indice de régularité (SRI) | 7 paires de jours consécutifs |
| Jet-lag social | 2 jours libres et 3 jours travaillés |
| Tendance (Theil–Sen + Mann–Kendall) | 14 nuits |
| Changement inhabituel | 5 nuits récentes et 10 nuits de référence |
| Association oui/non (Welch) | 5 nuits par groupe |
| Corrélation (Spearman) | 10 nuits |

Seuils pratiques d'un « changement inhabituel » : tst 20, sol 10, waso 10, se 5, quality 0.5, bedClock 30, wakeClock 30 (minutes, points d'efficacité ou points de qualité).

## Temps au lit

*Combien de temps ai-je passé au lit ?* — unité : minutes

| | |
|---|---|
| Données d'entrée | Heure de coucher, heure de lever. |
| Formule | Temps au lit = lever − coucher (instants absolus, changements d'heure inclus). |
| Valeurs manquantes | Sans heure de lever, le réveil final est utilisé et la valeur est marquée « estimée » ; l'efficacité n'est alors pas calculée. |
| Limites | Ce n'est pas du sommeil : on peut être au lit éveillé. |
| Sources | [Carney et al., 2012](#carney2012) |

## Latence d'endormissement

*Combien de temps ai-je mis à m'endormir ?* — unité : minutes

| | |
|---|---|
| Données d'entrée | Estimation déclarée le matin (ou heure d'endormissement estimée, convertie). |
| Formule | Latence = endormissement estimé − moment où vous avez essayé de dormir (extinction, sinon coucher). |
| Valeurs manquantes | Non renseignée → inconnue (pas zéro). Le temps de sommeil n'est alors pas calculé. |
| Limites | Estimation subjective : on surestime souvent sa latence, surtout en cas d'insomnie. |
| Sources | [Carney et al., 2012](#carney2012) ; [Ohayon et al., 2017](#ohayon2017) |

## Éveil après endormissement (WASO)

*Combien de temps suis-je resté éveillé pendant la nuit ?* — unité : minutes

| | |
|---|---|
| Données d'entrée | Nombre de réveils et durée totale estimée. |
| Formule | WASO = somme déclarée des périodes d'éveil entre l'endormissement et le réveil final. |
| Valeurs manquantes | « Aucun réveil » enregistre 0 ; une absence de réponse reste inconnue. |
| Limites | Les réveils brefs ne laissent souvent aucun souvenir : le journal sous-estime leur nombre. |
| Sources | [Carney et al., 2012](#carney2012) ; [Ohayon et al., 2017](#ohayon2017) |

## Temps de sommeil total

*Combien ai-je réellement dormi ?* — unité : minutes

| | |
|---|---|
| Données d'entrée | Extinction (ou coucher), latence, éveils nocturnes, réveil final. |
| Formule | TST = (réveil final − extinction) − latence − WASO. Si une mesure importée existe (montre), elle est utilisée et signalée comme « mesurée ». |
| Valeurs manquantes | Calculé seulement si latence ET éveils nocturnes sont connus. Sinon : « non calculable », jamais une valeur par défaut. |
| Limites | Estimation déclarative ; l'écart avec une mesure objective peut atteindre une heure selon les personnes (Lauderdale et al., 2008). |
| Sources | [Carney et al., 2012](#carney2012) ; [Lauderdale et al., 2008](#lauderdale2008) |

## Efficacité du sommeil

*Quelle part du temps passé au lit ai-je dormi ?* — unité : %

| | |
|---|---|
| Données d'entrée | Temps de sommeil total, temps au lit (avec heure de lever réelle). |
| Formule | Efficacité = TST ÷ temps au lit × 100. |
| Valeurs manquantes | Non calculée si l'un des deux manque, si le lever est estimé, ou si le temps au lit est inférieur à 60 min. |
| Limites | Repère NSF : ≥ 85 % associé à une bonne qualité chez l'adulte. Rester au lit le matin, éveillé mais reposé, fait baisser l'indicateur sans signifier un mauvais sommeil. |
| Sources | [Carney et al., 2012](#carney2012) ; [Ohayon et al., 2017](#ohayon2017) |

## Milieu du sommeil

*À quelle heure se situe le centre de ma nuit ?* — unité : heure

| | |
|---|---|
| Données d'entrée | Endormissement estimé et réveil final. |
| Formule | Milieu = endormissement + (réveil final − endormissement) ÷ 2, exprimé en heure locale du fuseau de la nuit. |
| Valeurs manquantes | Non calculé sans latence ni réveil final. |
| Limites | Indicateur de l'heure du rythme de sommeil ; utilisé pour le jet-lag social (approche MCTQ, ici sans correction de la dette de sommeil). |
| Sources | [Roenneberg et al., 2003](#roenneberg2003) ; [Wittmann et al., 2006](#wittmann2006) |

## Heures moyennes et variabilité

*À quelle heure me couché-je en moyenne, et avec quelle régularité ?* — unité : heure / minutes

| | |
|---|---|
| Données d'entrée | Heures de coucher / réveil sur la période. |
| Formule | Moyenne circulaire sur 24 h ; dispersion = écart-type circulaire σ = √(−2 ln R) converti en minutes (R : longueur du vecteur moyen). |
| Valeurs manquantes | Moyenne publiée dès 3 nuits, dispersion dès 5 nuits. |
| Limites | La moyenne circulaire évite l'erreur classique : 23:50 et 00:10 donnent 00:00, pas 12:00. |
| Sources | [Fischer et al., 2021](#fischer2021) |

## Indice de régularité du sommeil (SRI)

*Mon sommeil tombe-t-il aux mêmes heures d'un jour à l'autre ?* — unité : score de −100 à 100

| | |
|---|---|
| Données d'entrée | Périodes de sommeil (endormissement → réveil final) et siestes, sur des jours consécutifs. |
| Formule | SRI = −100 + 200 × proportion des minutes où l'état (sommeil/éveil) est identique à t et t + 24 h, sur les paires de jours consécutifs renseignés. |
| Valeurs manquantes | Jours non renseignés exclus (jamais supposés éveillés). Publié à partir de 7 paires de jours consécutifs. |
| Limites | Depuis un journal, les éveils nocturnes ne sont pas localisés dans le temps : ils sont comptés comme du sommeil. 100 = parfaitement régulier. Certaines études utilisent une échelle 0–100. |
| Sources | [Phillips et al., 2017](#phillips2017) ; [Fischer et al., 2021](#fischer2021) ; [Windred et al., 2024](#windred2024) |

## Jet-lag social

*Mes horaires du week-end s'écartent-ils de ceux de la semaine ?* — unité : minutes

| | |
|---|---|
| Données d'entrée | Milieu du sommeil des jours libres et des jours travaillés (jour libre : choisi, sinon réveil samedi/dimanche). |
| Formule | Jet-lag social = | milieu moyen (jours libres) − milieu moyen (jours travaillés) |, moyennes circulaires. |
| Valeurs manquantes | Publié avec au moins 2 jours libres et 3 jours travaillés. |
| Limites | Version simple, sans la correction de dette de sommeil du MCTQ. |
| Sources | [Wittmann et al., 2006](#wittmann2006) ; [Roenneberg et al., 2003](#roenneberg2003) |

## Bilan cumulé sur 7 nuits

*Ai-je dormi plus ou moins que mon objectif cette semaine ?* — unité : minutes

| | |
|---|---|
| Données d'entrée | Temps de sommeil des 7 dernières nuits, objectif personnel. |
| Formule | Bilan = Σ (TST − objectif) sur les nuits connues. |
| Valeurs manquantes | Non publié si moins de 5 nuits sur 7 sont connues ; l'effectif est toujours affiché. |
| Limites | Indicateur de tendance, pas une « dette » physiologique mesurable : la récupération ne se fait pas minute pour minute. |
| Sources | [Van Dongen et al., 2003](#vandongen2003) |

## Tendance persistante

*Mon sommeil évolue-t-il durablement ?* — unité : minutes par semaine

| | |
|---|---|
| Données d'entrée | Série quotidienne (jours manquants laissés vides). |
| Formule | Pente de Theil–Sen (médiane des pentes entre toutes les paires de nuits) ; significativité par test de Mann–Kendall. |
| Valeurs manquantes | Publiée à partir de 14 nuits renseignées. |
| Limites | Une tendance décrit le passé de la période choisie ; elle ne prédit pas l'avenir. |
| Sources | — |

## Changement inhabituel

*Ma dernière semaine sort-elle de l'ordinaire ?* — unité : selon l'indicateur

| | |
|---|---|
| Données d'entrée | 7 dernières nuits comparées aux 28 précédentes. |
| Formule | Test t de Welch ; signalé si p < 0,05 ET si l'écart dépasse un seuil pratique (20 min de sommeil, 10 min de latence, 30 min d'horaire…). |
| Valeurs manquantes | Au moins 5 nuits récentes et 10 nuits de référence. |
| Limites | Les tests répétés produisent des faux positifs : un signalement invite à regarder, pas à conclure. |
| Sources | — |

## Associations exploratoires

*Mes nuits diffèrent-elles selon mes habitudes déclarées ?* — unité : différence ou corrélation

| | |
|---|---|
| Données d'entrée | Facteurs renseignés (caféine, alcool, sport, écrans, stress…) et un indicateur choisi. |
| Formule | Oui/non : différence de moyennes (Welch, IC 95 %). Numérique : corrélation de Spearman. Correction de Benjamini–Hochberg pour comparaisons multiples. |
| Valeurs manquantes | Au moins 5 nuits par groupe, ou 10 nuits pour une corrélation. Les nuits sans réponse sont exclues, jamais comptées « non ». |
| Limites | Association ≠ causalité : les soirs de caféine peuvent aussi être des soirs de stress. À utiliser pour formuler une expérience, pas une conclusion. |
| Sources | [Irish et al., 2015](#irish2015) |

## Tests de référence

`npm test` exécute notamment les vérifications suivantes :

- **Nuit de référence** : coucher 22:30, extinction 22:45, latence 15 min, éveil 20 min, réveil 06:30, lever 06:50 → temps au lit 500 min, période 450, TST 430, efficacité 86 %, milieu 02:45.
- **Changement d'heure** : 23:00 → 07:00 dure 420 min la nuit du passage à l'heure d'été et 540 min la nuit du passage à l'heure d'hiver (Europe/Paris).
- **Statistiques** : Welch identique à `t.test()` de R (t = 1,897 ; ddl = 5,882 ; p = 0,1075) ; quantiles de type 7 ; loi de Student et loi normale contrôlées sur valeurs de table.
- **SRI** : horaires identiques → 100 ; alternance 23:00–07:00 / 01:00–09:00 → −100 + 200 × 1200/1440 ; jours manquants exclus.
- **Jet-lag social** : milieu 03:00 en semaine et 05:00 le week-end → 120 min.
- **Données manquantes** : jours sans saisie = `null` dans les séries, jamais 0 ; bilan cumulé refusé sous 5 nuits sur 7.
