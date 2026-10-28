# Système de design « Observatoire »

## Directions explorées

Les trois directions sont visibles dans la planche comparative `design/directions.html`, avec de vraies polices et de vraies couleurs.

| Critère (1–5) | A · Observatoire | B · Papier de nuit | C · Abysse |
|---|---|---|---|
| Originalité | 4 | 4 | 2 |
| Lisibilité des données | 5 | 3 | 2 |
| Cohérence avec la science | 5 | 3 | 1 |
| Accessibilité | 5 | 4 | 2 |
| Adéquation au coucher | 5 | 4 | 2 |
| **Total** | **24** | 18 | 9 |

- **A · Observatoire.** Un instrument d'astronomie posé près du lit : encre profonde, graduations fines, une seule lumière chaude (ambre) réservée aux actions et au matin. La nuit se lit sur un cadran de 24 h ; les horaires s'affichent en actogramme.
- **B · Papier de nuit.** Un carnet éditorial, des serifs, de l'encre sur papier sombre. Chaleureux, mais peu dense en données.
- **C · Abysse.** De la bioluminescence avec des halos cyan. Le rendu est spectaculaire, mais il manque de netteté. La direction est proche des modèles existants et s'accompagne de « scores » et de « phases » qu'on ne peut pas mesurer.

**Retenue : A**, avec deux emprunts à B : la serif Fraunces pour les chiffres clés et des phrases de synthèse en tête des analyses.

## Langage visuel

- **Sémantique des couleurs, cohérente partout.**
  - *Moon* `#9db7ff` : le sommeil.
  - *Bed* `#4d5d8f` : le temps au lit hors sommeil.
  - *Dusk* `#c3a8ff` : le coucher.
  - *Dawn* `#f2b66d` : le réveil, ainsi que les actions principales.
  - *Nap* : les siestes.
  - Hachures : donnée absente, jamais une barre à zéro.
- **Typographie.**
  - Fraunces (taille optique) pour les chiffres clés et les titres.
  - Instrument Sans pour l'interface.
  - IBM Plex Mono pour les heures, les axes et les métadonnées.
  - Les trois polices sont auto-hébergées, sous licence OFL.
- **Surfaces.** Des « plaques » à filet fin plutôt que des cartes interchangeables. Le verre dépoli est réservé aux éléments flottants (barre d'onglets, feuilles). Un seul dégradé signature : l'horizon d'aube, présent sur les écrans de nuit, de réveil et d'accueil.
- **Graphiques.**
  - Chaque graphique porte un titre en forme de question, une période explicite et sa légende.
  - Une infobulle s'affiche au survol, au toucher et au clavier (flèches).
  - Un tableau de données accessible est disponible sous chaque graphique.
  - La méthode de calcul est dépliable.
- **Mouvement.**
  - Entrée dans la nuit par un fondu flouté.
  - L'horizon se réchauffe à mesure que le réveil approche.
  - Le soleil se lève sur l'écran de sonnerie.
  - Tout est désactivable (préférence système ou réglage de l'app).

## Jetons

Les jetons sont dans `css/tokens.css`, avec deux thèmes :

- **Nuit** : par défaut, sombre.
- **Aube** : clair, papier chaud. Il peut aussi suivre automatiquement le thème du système.

Les espacements suivent une base de 4 px. Les rayons font 8, 14 et 22 px, ou sont arrondis en pilule. La typographie va de 12 à 68 px.

## Composants

`js/ui/components.js` et `css/app.css` fournissent :

- l'en-tête de page, les plaques, les tuiles de chiffres clés avec effectif ;
- les badges de niveau de preuve, les citations cliquables, les encarts « données insuffisantes » ;
- le panneau « Méthode de calcul » ;
- un contrôle segmenté, une échelle 1–5 (radiogroup), un compteur distinguant « inconnu » et 0, un interrupteur ;
- une feuille modale (`<dialog>` natif) et des toasts annoncés aux lecteurs d'écran.

## Accessibilité vérifiée

- **Audit automatisé.** axe-core 4.10 (WCAG 2 A/AA et bonnes pratiques) a été passé sur 18 écrans, en thème Nuit et en thème Aube, avec le jeu de démonstration : **0 violation** après corrections. Les corrections ont porté sur les contrastes du calendrier et de la barre d'onglets en thème clair, des tableaux défilants rendus focalisables, une étiquette de champ fichier et des rôles ARIA.
- **Interaction.** Cibles tactiles d'au moins 44 px, focus visible, navigation au clavier dans le calendrier (flèches) et dans les graphiques.
- **Mouvement.** `prefers-reduced-motion` est respecté.
- **Écrans étroits.** Aucun débordement horizontal à 390 px ni à 1366 px (`scripts/smoke.mjs`).
