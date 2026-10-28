# Somnia — Sources scientifiques vérifiées

> Date de la recherche : 2026-10-28.
> Document de travail pour l'équipe produit/contenu de Somnia (PWA de suivi du sommeil, francophone).

## 0. Méthode et limite de vérification (à lire d'abord)

- **Accès réseau** : dans cette session, `api.crossref.org` et `pubmed.ncbi.nlm.nih.gov` étaient **bloqués**
  par la politique réseau de l'environnement (échec DNS « ENOTFOUND », y compris via WebFetch). Aucune page n'a donc
  pu être **ouverte** (fetch) pour confirmer la correspondance DOI ↔ titre.
- **Ce qui a été fait** : chaque référence a été recoupée par **recherche web** (WebSearch). Les résultats provenaient
  d'index de PubMed, PubMed Central, des éditeurs (OUP, Elsevier, Wiley, SAGE, Dove, MDPI), de dépôts
  universitaires et de l'AASM. Dans les cas retenus, plusieurs résultats concordaient sur titre, DOI, volume, pages
  et souvent PMID.
- **Conséquence** : la consigne ne permet `verified: true` que si une page a réellement été ouverte. **Toutes les
  entrées sont donc `verified: false`**. Le champ `check` indique le niveau de recoupement :
  - `check: 'search'` : titre, DOI, journal, année, volume et pages concordent dans plusieurs résultats de recherche
    (en général un enregistrement PubMed ou PMC est indexé).
  - `check: 'search-partial'` : au moins un élément (PMID, co-auteurs) n'a pas été confirmé, ou un seul résultat secondaire le donne.
- **Pour passer à `verified: true`** : autoriser `api.crossref.org` et `pubmed.ncbi.nlm.nih.gov` dans les paramètres
  réseau de l'environnement (menu de l'environnement cloud > Edit > Network access > Allowed domains), puis relancer
  la vérification sur `https://api.crossref.org/works/<DOI>`.
- `pmid: null` signifie que le PMID n'a pas pu être confirmé (il n'a pas été deviné).
- Auteurs : seuls les auteurs vus dans les résultats sont listés. Sinon, la liste s'arrête au premier auteur suivi de « et al. ».

---

## 1. Références (TASK 1)

### 1.1 Durée de sommeil recommandée

**[1] Watson 2015 — consensus AASM/SRS adulte** (`check: search`)
- Titre exact : *Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society*
- Sleep 2015;38(6):843-844. DOI 10.5665/sleep.4716. PMID 26039963, PMC4434546.
- Message clé : ≥ 7 h par nuit, de façon régulière, chez l'adulte de 18 à 60 ans. La déclaration ne fixe pas de limite haute : plus de 9 h peut convenir à certains (jeunes adultes, récupération d'une dette de sommeil, maladie).
- Note : une version jumelle existe dans J Clin Sleep Med 2015;11(6):591-592. Il existe aussi un article « Methodology and Discussion » dans JCSM 2015;11(8):931-952. Ces deux références n'ont pas été vérifiées ici.

```js
{ id: 'watson2015', authors: 'Watson NF, Badr MS, Belenky G, et al.', title: 'Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society', journal: 'Sleep', year: 2015, volume: '38(6)', pages: '843-844', doi: '10.5665/sleep.4716', url: 'https://doi.org/10.5665/sleep.4716', pmid: '26039963', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/26039963/', type: 'consensus', verified: false, check: 'search' },
```

**[2] Hirshkowitz 2015 — durées NSF** (`check: search`)
- *National Sleep Foundation's sleep time duration recommendations: methodology and results summary*
- Sleep Health 2015;1(1):40-43. DOI 10.1016/j.sleh.2014.12.010. PMID 29073412 (lu dans l'URL PubMed indexée).
- Co-auteurs non confirmés, d'où le seul premier auteur listé.

```js
{ id: 'hirshkowitz2015', authors: 'Hirshkowitz M, et al.', title: "National Sleep Foundation's sleep time duration recommendations: methodology and results summary", journal: 'Sleep Health', year: 2015, volume: '1(1)', pages: '40-43', doi: '10.1016/j.sleh.2014.12.010', url: 'https://doi.org/10.1016/j.sleh.2014.12.010', pmid: '29073412', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/29073412/', type: 'consensus', verified: false, check: 'search' },
```

**[3] Paruthi 2016 — consensus pédiatrique AASM** (`check: search`) — **CORRECTION / PRÉCISION**
- Le DOI 10.5664/jcsm.5866 correspond à la **déclaration courte** : *Recommended Amount of Sleep for Pediatric Populations: A Consensus Statement of the American Academy of Sleep Medicine*, J Clin Sleep Med 2016;12(6):785-786. PMID 27250809, PMC4877308.
- Ce n'est **pas** l'article méthodologique (*Consensus Statement of the AASM on the Recommended Amount of Sleep for Healthy Children: Methodology and Discussion*, JCSM 2016;12(11):1549-1561). D'après une source secondaire, ce dernier porte le DOI 10.5664/jcsm.6288, **non vérifié**.
- Valeurs par 24 h, siestes comprises : 4-12 mois 12-16 h ; 1-2 ans 11-14 h ; 3-5 ans 10-13 h ; 6-12 ans 9-12 h ; 13-18 ans 8-10 h.

```js
{ id: 'paruthi2016', authors: "Paruthi S, Brooks LJ, D'Ambrosio C, et al.", title: 'Recommended Amount of Sleep for Pediatric Populations: A Consensus Statement of the American Academy of Sleep Medicine', journal: 'Journal of Clinical Sleep Medicine', year: 2016, volume: '12(6)', pages: '785-786', doi: '10.5664/jcsm.5866', url: 'https://doi.org/10.5664/jcsm.5866', pmid: '27250809', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/27250809/', type: 'consensus', verified: false, check: 'search' },
```

### 1.2 Qualité du sommeil

**[4] Ohayon 2017 — recommandations NSF sur la qualité du sommeil** (`check: search-partial`, PMID non confirmé)
- *National Sleep Foundation's sleep quality recommendations: first report*
- Sleep Health 2017;3(1):6-19. DOI 10.1016/j.sleh.2016.11.006. Auteurs : Ohayon M, Wickwire EM, Hirshkowitz M, Albert SM, Avidan A, Daly FJ, … Vitiello MV.
- Méthode : revue systématique de 277 études, puis RAND/UCLA Appropriateness Method (Delphi modifié, 3 tours de vote).
- Conclusion de l'abstract : les 4 variables de **continuité** (latence d'endormissement, nombre d'éveils > 5 min, WASO, efficacité du sommeil) sont des indicateurs appropriés de bonne qualité **à tous les âges**. Le consensus est faible ou absent pour l'architecture (stades) et les siestes.

**Seuils « bonne qualité » chez l'adulte.** Ils viennent du communiqué NSF de janvier 2017 (EurekAlert, Medical News Today, Sleep Review) et de la couverture Healio, pas du tableau de l'article :

| Indicateur | Bonne qualité (communiqué NSF) | Remarque |
|---|---|---|
| Latence d'endormissement (SOL) | ≤ 30 min | Healio indique ≤ 15 min « pour tous les âges ». Il est probable que l'article distingue 0-15 min (approprié) et 16-30 min. **À vérifier** dans le texte intégral. |
| Éveils > 5 min | ≤ 1 par nuit | |
| WASO | ≤ 20 min | Un tableau ANSI/CTA/NSF-2110 (standard distinct, 2025) donne < 20 min pour les jeunes adultes et les adultes, et < 30 min pour les ≥ 65 ans. Ce ne sont **pas** les chiffres de l'article de 2017. |
| Efficacité (SE) | ≥ 85 % | |

- **Non obtenu** : les seuils de **mauvaise qualité** (« inappropriate ») et les seuils **par tranche d'âge** 18-25 / 26-64 / 65+. Ils figurent dans les tableaux de résultats de l'article, mais le texte intégral n'a pas pu être ouvert. Aucun chiffre n'est donné ici pour éviter toute invention.
  Copies du texte intégral repérées : escholarship.org/uc/item/qt9xc5x5h2 et fatiguemanagersnetwork.org (PDF de l'article).
- **Recommandation produit** : en attendant, utiliser les 4 seuils du communiqué (SOL ≤ 30, éveils ≤ 1, WASO ≤ 20, SE ≥ 85 %) avec la mention « repères NSF 2017 ». Ne pas afficher de jugement « mauvais » chiffré avant d'avoir vérifié le tableau.

```js
{ id: 'ohayon2017', authors: 'Ohayon M, Wickwire EM, Hirshkowitz M, et al.', title: "National Sleep Foundation's sleep quality recommendations: first report", journal: 'Sleep Health', year: 2017, volume: '3(1)', pages: '6-19', doi: '10.1016/j.sleh.2016.11.006', url: 'https://doi.org/10.1016/j.sleh.2016.11.006', pmid: null, type: 'consensus', verified: false, check: 'search-partial' },
```

**[22] Buysse 2014 — définition de la « santé du sommeil »** (`check: search`)
- *Sleep health: can we define it? Does it matter?* Sleep 2014;37(1):9-17. DOI 10.5665/sleep.3298. PMID 24470692.
- L'article propose une définition multidimensionnelle : satisfaction, vigilance, horaires, efficacité, durée (SATED). La dimension « Regularity » (RU-SATED) est un ajout ultérieur, et l'échelle RU-SATED de l'Université de Pittsburgh est soumise à autorisation.

```js
{ id: 'buysse2014', authors: 'Buysse DJ', title: 'Sleep health: can we define it? Does it matter?', journal: 'Sleep', year: 2014, volume: '37(1)', pages: '9-17', doi: '10.5665/sleep.3298', url: 'https://doi.org/10.5665/sleep.3298', pmid: '24470692', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/24470692/', type: 'review', verified: false, check: 'search' },
```

### 1.3 Agenda du sommeil (cœur du produit)

**[5] Carney 2012 — Consensus Sleep Diary (CSD)** (`check: search`)
- *The Consensus Sleep Diary: standardizing prospective sleep self-monitoring*. Sleep 2012;35(2):287-302. DOI 10.5665/sleep.1642. PMID 22294820, PMC3250369.
- Auteurs : Carney CE, Buysse DJ, Ancoli-Israel S, Edinger JD, Krystal AD, Lichstein KL, Morin CM.

**Items du CSD-Core (9 items, rempli le matin, format 24 h).** Liste corroborée par un protocole d'essai clinique (SAP NCT04532749) et une copie de la figure 1. Libellés paraphrasés, **libellés exacts à vérifier** sur la figure 1 :
1. Heure de coucher (*time got into bed*)
2. Heure à laquelle on a essayé de dormir (*time tried to go to sleep*)
3. Durée pour s'endormir (*how long to fall asleep*) → SOL
4. Nombre de réveils, sans compter le réveil final
5. Durée totale de ces réveils → WASO
6. Heure du réveil final
7. Heure du lever (*time got out of bed for the day*)
8. Qualité du sommeil (très mauvaise / mauvaise / correcte / bonne / très bonne)
9. Commentaires

Il existe des versions étendues (CSD-E, CSD-M) avec des items supplémentaires : siestes, alcool, caféine, médicaments, réveil précoce. Leur liste exacte **n'a pas été confirmée** ici.

**Variables dérivées.** Elles sont confirmées par une étude psychométrique secondaire (Maich et al., *Psychometric Properties of the Consensus Sleep Diary in Those With Insomnia Disorder*), pas par le texte de Carney 2012 lui-même :

| Variable | Définition |
|---|---|
| TIB (time in bed) | heure du lever (item 7) − heure de coucher (item 1) |
| SOL | item 3 |
| WASO | item 5 (durée cumulée des éveils nocturnes) |
| Éveil terminal / EMA (*terminal wakefulness*) | heure du lever (item 7) − heure du réveil final (item 6) |
| TWT (total wake time) | SOL + WASO + éveil terminal |
| TST (total sleep time) | TIB − TWT |
| SE (sleep efficiency) | TST / TIB × 100 |

- Ambiguïtés à trancher dans le code :
  - Le délai entre l'item 1 et l'item 2 (au lit avant d'essayer de dormir, par exemple pour lire) est compté dans TIB. Il fait donc baisser SE.
  - « EMA » est parfois défini autrement : réveil avant l'heure *souhaitée*. Ce point n'a pas été confirmé dans Carney 2012.
  - Un autre dénominateur de SE a été proposé : Reed & Sacco 2016, *Measuring Sleep Efficiency: What Should the Denominator Be?*, PMC4751425 (non vérifié).

```js
{ id: 'carney2012', authors: 'Carney CE, Buysse DJ, Ancoli-Israel S, et al.', title: 'The Consensus Sleep Diary: standardizing prospective sleep self-monitoring', journal: 'Sleep', year: 2012, volume: '35(2)', pages: '287-302', doi: '10.5665/sleep.1642', url: 'https://doi.org/10.5665/sleep.1642', pmid: '22294820', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/22294820/', type: 'method', verified: false, check: 'search' },
```

**[23] Lauderdale 2008 — sommeil déclaré vs mesuré** (`check: search`)
- *Self-reported and measured sleep duration: how similar are they?* Epidemiology 2008;19(6):838-845. DOI 10.1097/EDE.0b013e318187a7b0. PMID 18854708.
- Note : le manuscrit auteur (PMC2785092) porte un titre différent (« Sleep duration: how well do self-reports reflect objective measures? The CARDIA Sleep Study »). Citer le titre publié.

```js
{ id: 'lauderdale2008', authors: 'Lauderdale DS, Knutson KL, Yan LL, Liu K, Rathouz PJ', title: 'Self-reported and measured sleep duration: how similar are they?', journal: 'Epidemiology', year: 2008, volume: '19(6)', pages: '838-845', doi: '10.1097/EDE.0b013e318187a7b0', url: 'https://doi.org/10.1097/EDE.0b013e318187a7b0', pmid: '18854708', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/18854708/', type: 'cohort', verified: false, check: 'search' },
```

### 1.4 Régularité et rythmes

**[6] Phillips 2017 — Sleep Regularity Index (SRI)** (`check: search`) — **PRÉCISION DU TITRE**
- Titre exact : *Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing*
- Sci Rep 2017;7:3216. DOI 10.1038/s41598-017-03171-4. PMID 28607474, PMC5468315. Open access (CC BY 4.0).
- Étude : 61 étudiants, agendas de sommeil sur 30 jours. Corrélation SRI × performance académique : r = 0,37.
- Les co-auteurs au-delà de Phillips viennent de la requête et sont cohérents avec les résultats. Un dépôt signale des variations d'ordre selon les bases, à vérifier.

**Formule du SRI.** Corroborée par des articles qui la citent (Sci Rep 2018 *Validation of the SRI in Older Adults*, Lunsford-Avery et al.) et par la documentation GGIR, **pas** par la section Méthodes de l'original :

```
SRI = -100 + 200 / (M·(N-1)) · Σ_{j=1..M} Σ_{i=1..N-1} δ(s_{i,j}, s_{i+1,j})
```

- s_{i,j} ∈ {éveil, sommeil} est l'état à l'instant j du jour i.
- M est le nombre d'époques par jour, N le nombre de jours.
- δ = 1 si les deux états sont identiques, 0 sinon.

Interprétation : probabilité d'être dans le même état à 24 h d'intervalle, ramenée à l'échelle −100…100.
- 100 = parfaitement régulier.
- 0 = aléatoire.
- < 0 = concordance inférieure au hasard.

Plusieurs études (dont UK Biobank) rapportent un score 0–100 : vérifier l'échelle avant de comparer des valeurs.

Implémentation agenda : discrétiser chaque nuit en époques (par exemple 1 min ou 30 s), sur des jours consécutifs. L'agenda ne capte pas les micro-éveils non saisis.

```js
{ id: 'phillips2017', authors: "Phillips AJK, Clerx WM, O'Brien CS, et al.", title: 'Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing', journal: 'Scientific Reports', year: 2017, volume: '7', pages: '3216', doi: '10.1038/s41598-017-03171-4', url: 'https://doi.org/10.1038/s41598-017-03171-4', pmid: '28607474', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/28607474/', type: 'cohort', verified: false, check: 'search' },
```

**[7] Windred 2024 — régularité vs durée et mortalité** (`check: search`)
- *Sleep regularity is a stronger predictor of mortality risk than sleep duration: A prospective cohort study*. Sleep 2024;47(1):zsad253. Publié en ligne le 21/09/2023. DOI 10.1093/sleep/zsad253. PMID 37738616 (via UK Biobank).
- Le titre a été confirmé jusqu'à « …than sleep duration ». Le sous-titre « A prospective cohort study » n'a pas été confirmé et doit être vérifié avant affichage.
- Étude UK Biobank, 60 977 participants avec accéléromètre. Par rapport au quintile de SRI le plus bas, les quatre quintiles supérieurs ont un risque de mortalité toutes causes 20 à 48 % plus faible.

```js
{ id: 'windred2024', authors: 'Windred DP, Burns AC, Lane JM, et al.', title: 'Sleep regularity is a stronger predictor of mortality risk than sleep duration', journal: 'Sleep', year: 2024, volume: '47(1)', pages: 'zsad253', doi: '10.1093/sleep/zsad253', url: 'https://doi.org/10.1093/sleep/zsad253', pmid: '37738616', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/37738616/', type: 'cohort', verified: false, check: 'search' },
```

**[8] Fischer, Klerman, Phillips 2021 — métriques de régularité** (`check: search`)
- *Measuring sleep regularity: theoretical properties and practical usage of existing metrics*. Sleep 2021;44(10):zsab103. DOI 10.1093/sleep/zsab103. PMID 33864369, PMC8503839.
- Points utiles pour le produit :
  - Le social jetlag capte les variations hebdomadaires, pas les variations jour à jour.
  - L'écart-type et la stabilité interjournalière (IS) demandent plus d'une semaine de données pour être non biaisés.
  - Le SRI et le CPD sont sensibles à l'ordre des jours.

```js
{ id: 'fischer2021', authors: 'Fischer D, Klerman EB, Phillips AJK', title: 'Measuring sleep regularity: theoretical properties and practical usage of existing metrics', journal: 'Sleep', year: 2021, volume: '44(10)', pages: 'zsab103', doi: '10.1093/sleep/zsab103', url: 'https://doi.org/10.1093/sleep/zsab103', pmid: '33864369', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/33864369/', type: 'method', verified: false, check: 'search' },
```

**[9] Wittmann 2006 — social jetlag** (`check: search`)
- *Social jetlag: misalignment of biological and social time*. Chronobiol Int 2006;23(1-2):497-509. DOI 10.1080/07420520500545979. PMID 16687322.
- Étude observationnelle transversale (questionnaire MCTQ, n = 501). Le type « cohort » est le plus proche dans l'énumération.

```js
{ id: 'wittmann2006', authors: 'Wittmann M, Dinich J, Merrow M, Roenneberg T', title: 'Social jetlag: misalignment of biological and social time', journal: 'Chronobiology International', year: 2006, volume: '23(1-2)', pages: '497-509', doi: '10.1080/07420520500545979', url: 'https://doi.org/10.1080/07420520500545979', pmid: '16687322', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/16687322/', type: 'cohort', verified: false, check: 'search' },
```

**[10] Roenneberg 2003 — MCTQ / chronotypes** (`check: search`) — **PRÉCISION DU TITRE**
- Titre complet : *Life between clocks: daily temporal patterns of human chronotypes*. J Biol Rhythms 2003;18(1):80-90. DOI 10.1177/0748730402239679. PMID 12568247.
- Article fondateur du questionnaire MCTQ. Il définit le point médian du sommeil les jours libres (MSF) comme marqueur du chronotype.

```js
{ id: 'roenneberg2003', authors: 'Roenneberg T, Wirz-Justice A, Merrow M', title: 'Life between clocks: daily temporal patterns of human chronotypes', journal: 'Journal of Biological Rhythms', year: 2003, volume: '18(1)', pages: '80-90', doi: '10.1177/0748730402239679', url: 'https://doi.org/10.1177/0748730402239679', pmid: '12568247', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/12568247/', type: 'method', verified: false, check: 'search' },
```

### 1.5 Technologies grand public et suivi du sommeil

**[11] de Zambotti 2019** (`check: search`)
- *Wearable Sleep Technology in Clinical and Research Settings*. Med Sci Sports Exerc 2019;51(7):1538-1557. DOI 10.1249/MSS.0000000000001947. PMID 30789439, PMC6579636.

```js
{ id: 'dezambotti2019', authors: 'de Zambotti M, Cellini N, Goldstone A, Colrain IM, Baker FC', title: 'Wearable Sleep Technology in Clinical and Research Settings', journal: 'Medicine & Science in Sports & Exercise', year: 2019, volume: '51(7)', pages: '1538-1557', doi: '10.1249/MSS.0000000000001947', url: 'https://doi.org/10.1249/MSS.0000000000001947', pmid: '30789439', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/30789439/', type: 'review', verified: false, check: 'search' },
```

**[12] Chinoy 2021** (`check: search-partial`, PMID non confirmé)
- *Performance of seven consumer sleep-tracking devices compared with polysomnography*. Sleep 2021;44(5):zsaa291. Publié en ligne en décembre 2020. DOI 10.1093/sleep/zsaa291.
- Étude : 34 jeunes adultes, 7 appareils.
- Résultats : sensibilité ≥ 0,93, spécificité 0,18-0,54 (les appareils détectent mal l'éveil). La performance baisse lors des nuits perturbées.

```js
{ id: 'chinoy2021', authors: 'Chinoy ED, Cuellar JA, Huwa KE, et al.', title: 'Performance of seven consumer sleep-tracking devices compared with polysomnography', journal: 'Sleep', year: 2021, volume: '44(5)', pages: 'zsaa291', doi: '10.1093/sleep/zsaa291', url: 'https://doi.org/10.1093/sleep/zsaa291', pmid: null, type: 'experimental', verified: false, check: 'search-partial' },
```

**[13] Khosla 2018 — position AASM** (`check: search-partial`, PMID non confirmé)
- *Consumer Sleep Technology: An American Academy of Sleep Medicine Position Statement*. J Clin Sleep Med 2018;14(5):877-880. DOI 10.5664/jcsm.7128. PMC5940440.
- Message : les technologies grand public ne peuvent pas servir au diagnostic ni au traitement. Elles peuvent faciliter le dialogue patient-clinicien.

```js
{ id: 'khosla2018', authors: 'Khosla S, Deak MC, Gault D, et al.', title: 'Consumer Sleep Technology: An American Academy of Sleep Medicine Position Statement', journal: 'Journal of Clinical Sleep Medicine', year: 2018, volume: '14(5)', pages: '877-880', doi: '10.5664/jcsm.7128', url: 'https://doi.org/10.5664/jcsm.7128', pmid: null, type: 'position', verified: false, check: 'search-partial' },
```

**[14] Baron 2017 — orthosomnie** (`check: search`)
- *Orthosomnia: Are Some Patients Taking the Quantified Self Too Far?* J Clin Sleep Med 2017;13(2):351-354. DOI 10.5664/jcsm.6472. PMID 27855740, PMC5263088.
- Série de cas (case report). Le type « review » est le plus proche dans l'énumération.
- À utiliser pour le ton produit : éviter l'anxiété liée au score.

```js
{ id: 'baron2017', authors: 'Baron KG, Abbott S, Jao N, Manalo N, Mullen R', title: 'Orthosomnia: Are Some Patients Taking the Quantified Self Too Far?', journal: 'Journal of Clinical Sleep Medicine', year: 2017, volume: '13(2)', pages: '351-354', doi: '10.5664/jcsm.6472', url: 'https://doi.org/10.5664/jcsm.6472', pmid: '27855740', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/27855740/', type: 'review', verified: false, check: 'search' },
```

### 1.6 Facteurs de mode de vie

**[15] Drake 2013 — caféine 0/3/6 h** (`check: search`)
- *Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed*. J Clin Sleep Med 2013;9(11):1195-1200. DOI 10.5664/jcsm.3170. PMID 24235903, PMC3805807.
- Protocole : 400 mg de caféine, même prise 6 h avant le coucher.
- Résultat : la caféine prise 6 h avant le coucher réduit déjà le TST objectif, et les sujets ne le perçoivent pas.

```js
{ id: 'drake2013', authors: 'Drake C, Roehrs T, Shambroom J, Roth T', title: 'Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed', journal: 'Journal of Clinical Sleep Medicine', year: 2013, volume: '9(11)', pages: '1195-1200', doi: '10.5664/jcsm.3170', url: 'https://doi.org/10.5664/jcsm.3170', pmid: '24235903', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/24235903/', type: 'experimental', verified: false, check: 'search' },
```

**[16] Gardiner 2023 — méta-analyse caféine** (`check: search`)
- *The effect of caffeine on subsequent sleep: A systematic review and meta-analysis*. Sleep Med Rev 2023;69:101764. DOI 10.1016/j.smrv.2023.101764. PMID 36870101.
- Résultats (24 études) : TST −45 min environ, SE −7 %, SOL et WASO augmentés.
- Recommandation des auteurs : café ≥ 8,8 h avant le coucher.

```js
{ id: 'gardiner2023', authors: 'Gardiner C, Weakley J, et al.', title: 'The effect of caffeine on subsequent sleep: A systematic review and meta-analysis', journal: 'Sleep Medicine Reviews', year: 2023, volume: '69', pages: '101764', doi: '10.1016/j.smrv.2023.101764', url: 'https://doi.org/10.1016/j.smrv.2023.101764', pmid: '36870101', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/36870101/', type: 'meta-analysis', verified: false, check: 'search' },
```

**[17] Ebrahim 2013 — alcool et sommeil** (`check: search`)
- *Alcohol and sleep I: effects on normal sleep*. Alcohol Clin Exp Res 2013;37(4):539-549. DOI 10.1111/acer.12006. PMID 23347102.

```js
{ id: 'ebrahim2013', authors: 'Ebrahim IO, Shapiro CM, Williams AJ, Fenwick PB', title: 'Alcohol and sleep I: effects on normal sleep', journal: 'Alcoholism: Clinical and Experimental Research', year: 2013, volume: '37(4)', pages: '539-549', doi: '10.1111/acer.12006', url: 'https://doi.org/10.1111/acer.12006', pmid: '23347102', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/23347102/', type: 'systematic-review', verified: false, check: 'search' },
```

**[18] Kredlow 2015 — activité physique** (`check: search`)
- *The effects of physical activity on sleep: a meta-analytic review*. J Behav Med 2015;38(3):427-449. DOI 10.1007/s10865-015-9617-6. PMID 25596964.

```js
{ id: 'kredlow2015', authors: 'Kredlow MA, Capozzoli MC, Hearon BA, Calkins AW, Otto MW', title: 'The effects of physical activity on sleep: a meta-analytic review', journal: 'Journal of Behavioral Medicine', year: 2015, volume: '38(3)', pages: '427-449', doi: '10.1007/s10865-015-9617-6', url: 'https://doi.org/10.1007/s10865-015-9617-6', pmid: '25596964', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/25596964/', type: 'meta-analysis', verified: false, check: 'search' },
```

**[19] Chang 2015 — liseuses lumineuses** (`check: search`)
- *Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness*. PNAS 2015;112(4):1232-1237. Publié en ligne le 22/12/2014. DOI 10.1073/pnas.1418490112. PMID 25535358, PMC4313820.

```js
{ id: 'chang2015', authors: 'Chang AM, Aeschbach D, Duffy JF, Czeisler CA', title: 'Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness', journal: 'Proceedings of the National Academy of Sciences of the USA', year: 2015, volume: '112(4)', pages: '1232-1237', doi: '10.1073/pnas.1418490112', url: 'https://doi.org/10.1073/pnas.1418490112', pmid: '25535358', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/25535358/', type: 'experimental', verified: false, check: 'search' },
```

**[26] Irish 2015 — hygiène du sommeil** (`check: search`)
- *The role of sleep hygiene in promoting public health: A review of empirical evidence*. Sleep Med Rev 2015;22:23-36. Publié en ligne en octobre 2014. DOI 10.1016/j.smrv.2014.10.001. PMID 25454674, PMC4400203.

```js
{ id: 'irish2015', authors: 'Irish LA, Kline CE, Gunn HE, Buysse DJ, Hall MH', title: 'The role of sleep hygiene in promoting public health: A review of empirical evidence', journal: 'Sleep Medicine Reviews', year: 2015, volume: '22', pages: '23-36', doi: '10.1016/j.smrv.2014.10.001', url: 'https://doi.org/10.1016/j.smrv.2014.10.001', pmid: '25454674', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/25454674/', type: 'review', verified: false, check: 'search' },
```

### 1.7 Clinique, privation, inertie, mortalité

**[20] Riemann 2023 — recommandation européenne insomnie** (`check: search-partial`)
- *The European Insomnia Guideline: An update on the diagnosis and treatment of insomnia 2023*. J Sleep Res 2023;32(6):e14035. DOI 10.1111/jsr.14035.
- PMID 38016484 : une seule source secondaire le donne, **à confirmer**.
- Le TCC-I (thérapie cognitivo-comportementale de l'insomnie) est le traitement de première ligne.

```js
{ id: 'riemann2023', authors: 'Riemann D, et al.', title: 'The European Insomnia Guideline: An update on the diagnosis and treatment of insomnia 2023', journal: 'Journal of Sleep Research', year: 2023, volume: '32(6)', pages: 'e14035', doi: '10.1111/jsr.14035', url: 'https://doi.org/10.1111/jsr.14035', pmid: '38016484', type: 'consensus', verified: false, check: 'search-partial' },
```

**[21] Van Dongen 2003 — coût cumulatif de l'éveil** (`check: search`)
- *The cumulative cost of additional wakefulness: dose-response effects on neurobehavioral functions and sleep physiology from chronic sleep restriction and total sleep deprivation*. Sleep 2003;26(2):117-126. DOI 10.1093/sleep/26.2.117. PMID 12683469.

```js
{ id: 'vandongen2003', authors: 'Van Dongen HPA, Maislin G, Mullington JM, Dinges DF', title: 'The cumulative cost of additional wakefulness: dose-response effects on neurobehavioral functions and sleep physiology from chronic sleep restriction and total sleep deprivation', journal: 'Sleep', year: 2003, volume: '26(2)', pages: '117-126', doi: '10.1093/sleep/26.2.117', url: 'https://doi.org/10.1093/sleep/26.2.117', pmid: '12683469', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/12683469/', type: 'experimental', verified: false, check: 'search' },
```

**[24] Hilditch & McHill 2019 — inertie du sommeil** (`check: search`)
- *Sleep inertia: current insights*. Nat Sci Sleep 2019;11:155-165. DOI 10.2147/NSS.S188911. PMID 31692489, PMC6710480.

```js
{ id: 'hilditch2019', authors: 'Hilditch CJ, McHill AW', title: 'Sleep inertia: current insights', journal: 'Nature and Science of Sleep', year: 2019, volume: '11', pages: '155-165', doi: '10.2147/NSS.S188911', url: 'https://doi.org/10.2147/NSS.S188911', pmid: '31692489', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/31692489/', type: 'review', verified: false, check: 'search' },
```

**[25] Cappuccio 2010 — durée et mortalité** (`check: search`) — **PRÉCISION DU TITRE**
- Titre complet : *Sleep duration and all-cause mortality: a systematic review and meta-analysis of prospective studies*. Sleep 2010;33(5):585-592. DOI 10.1093/sleep/33.5.585. PMID 20469800, PMC2864873.
- Résultats (16 études) : sommeil court RR 1,12 (IC 95 % 1,06-1,18) ; sommeil long RR 1,30 (1,22-1,38).

```js
{ id: 'cappuccio2010', authors: "Cappuccio FP, D'Elia L, Strazzullo P, Miller MA", title: 'Sleep duration and all-cause mortality: a systematic review and meta-analysis of prospective studies', journal: 'Sleep', year: 2010, volume: '33(5)', pages: '585-592', doi: '10.1093/sleep/33.5.585', url: 'https://doi.org/10.1093/sleep/33.5.585', pmid: '20469800', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/20469800/', type: 'meta-analysis', verified: false, check: 'search' },
```

### 1.8 Références additionnelles trouvées (TASK 3)

```js
{ id: 'campanella2024', authors: 'Campanella C, Byun K, Senerat A, et al.', title: "The Efficacy of a Multimodal Bedroom-Based 'Smart' Alarm System on Mitigating the Effects of Sleep Inertia", journal: 'Clocks & Sleep', year: 2024, volume: '6(1)', pages: '183-199', doi: '10.3390/clockssleep6010013', url: 'https://doi.org/10.3390/clockssleep6010013', pmid: null, type: 'experimental', verified: false, check: 'search-partial' },
{ id: 'bhat2015', authors: 'Bhat S, et al.', title: 'Is There a Clinical Role For Smartphone Sleep Apps? Comparison of Sleep Cycle Detection by a Smartphone Application to Polysomnography', journal: 'Journal of Clinical Sleep Medicine', year: 2015, volume: '11(7)', pages: '709-715', doi: '10.5664/jcsm.4840', url: 'https://doi.org/10.5664/jcsm.4840', pmid: '25766719', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/25766719/', type: 'experimental', verified: false, check: 'search' },
```

---

## 2. Sources officielles francophones (TASK 2)

Aucune de ces pages n'a pu être **ouverte** (même restriction réseau). URL et contenu sont corroborés par la recherche web uniquement : **UNVERIFIED**.

1. **Inserm — dossier « Sommeil » (« Faire la lumière sur notre activité nocturne »)**
   - URL : https://www.inserm.fr/dossier/sommeil/
   - Éditeur : Inserm. Réalisé avec Pierre-Hervé Luppi (CRNL, Lyon). Mis à jour en novembre 2024, selon un communiqué Inserm.
   - Voir aussi la page Journée du sommeil de la salle de presse Inserm : https://presse.inserm.fr/cest-dans-lair/journee-internationale-du-sommeil-14-mars/
2. **Santé publique France — Baromètre 2024 : « Sommeil : temps moyen sur 24 heures et plainte d'insomnie »**
   - URL : https://www.santepubliquefrance.fr/determinants-de-sante/sommeil/documents/rapport-synthese/sommeil-temps-moyen-sur-24-heures-et-plainte-d-insomnie.-barometre-de-sante-publique-france-resultats-de-l-edition-2024
   - Chiffres, adultes de 18 à 79 ans : moyenne 7 h 32 par 24 h ; 21,5 % de « courts dormeurs » (≤ 6 h) ; 1 adulte sur 3 se plaint d'insomnie.
   - Page thématique : https://www.santepubliquefrance.fr/sommeil (repères grand public : ≥ 7 h chez l'adulte, écrans coupés 1 h avant le coucher, pas de café 5 à 6 h avant, horaires réguliers, chambre à 18 °C).
3. **Santé publique France — BEH 2019 n° 8-9 « Le temps de sommeil en France »** (Baromètre 2017)
   - URL : https://beh.santepubliquefrance.fr/beh/2019/8-9/2019_8-9_1.html
   - Chiffres : 6 h 42 par 24 h en semaine en 2017 ; 35,9 % dorment moins de 6 h.

Complément clinique : HAS/SFTG, *Prise en charge du patient adulte se plaignant d'insomnie en médecine générale* (décembre 2006), PDF : https://www.has-sante.fr/upload/docs/application/pdf/rpc_sftg_insomnie_-_recommandations.pdf. Cette recommandation est ancienne. Pour l'insomnie, préférer Riemann 2023.
Autre source francophone : INSV (Institut National du Sommeil et de la Vigilance), https://institut-sommeil-vigilance.org/ (dossiers de presse annuels de la Journée du sommeil).

---

## 3. Vérifications ciblées (TASK 3)

### 3.1 « Réveil intelligent » (réveil en sommeil léger via accéléromètre ou micro du téléphone)

**Verdict : les preuves sont insuffisantes.** Aucun essai randomisé n'a été trouvé montrant qu'une app smartphone (accéléromètre ou micro) réveillant en sommeil léger réduit l'inertie du sommeil ou la sensation de « gueule de bois » matinale.

- **Campanella et al. 2024**, *Clocks & Sleep* 6(1):183-199, doi 10.3390/clockssleep6010013. C'est l'essai le plus proche : laboratoire, 4 nuits, réveil « intelligent » multimodal (lumière, son, température) comparé à une alarme classique. Effet global faible. Un effet modulé par le chronotype et la durée d'exposition lumineuse a été observé. Ce n'est pas un test de détection de phase par smartphone.
- **Bhat et al. 2015**, *J Clin Sleep Med* 11(7):709-715, doi 10.5664/jcsm.4840. Une app smartphone d'actimétrie (l'app Sleep Time, d'après le communiqué AASM) a été comparée à la polysomnographie chez 20 adultes. Elle détecte bien le sommeil, mais ses paramètres absolus et ses stades **corrèlent mal** avec la polysomnographie. La prémisse « détecter le sommeil léger avec le téléphone » est donc fragile.
- Contexte : l'inertie du sommeil est plus forte au réveil en sommeil lent profond (Hilditch & McHill 2019). La logique physiologique est plausible, mais l'efficacité des apps n'est pas démontrée.
- **Recommandation produit** : ne pas revendiquer de bénéfice. Si la fonction est proposée, la présenter comme « fenêtre de réveil », sans promesse de santé.

### 3.2 Capacités iOS pour la PWA

- **Web Push** : disponible depuis **iOS/iPadOS 16.4** (mars 2023), **uniquement pour les web apps ajoutées à l'écran d'accueil**, pas dans un onglet Safari. Elle repose sur Push API, Notifications API et Service Worker. La demande de permission doit suivre un geste utilisateur (tap).
  - Source : WebKit, *Web Push for Web Apps on iOS and iPadOS* (B. Eidson, J. Simmons), https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
  - Statut : UNVERIFIED (page non ouverte, contenu corroboré par plusieurs reprises : Daring Fireball, mjtsai, 9to5Mac).
- **Screen Wake Lock API** :
  - Supportée dans Safari depuis **16.4** (tables de support Chrome Developers et Vaadin).
  - De **iOS 16.4 à 18.3**, elle ne fonctionnait **pas** dans les web apps en mode standalone (écran d'accueil). `navigator.wakeLock` existe mais le verrou ne prend pas effet. Bug WebKit 254545 : https://bugs.webkit.org/show_bug.cgi?id=254545
  - **Corrigé dans iOS/iPadOS 18.4** : « Fixed Screen Wake Lock API for Home Screen Web Apps ». Source : WebKit, *WebKit Features in Safari 18.4*, https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
  - Statut : UNVERIFIED (page non ouverte, corroborée par la recherche).
  - Implication : sur iOS < 18.4 en standalone, prévoir un fallback (message utilisateur) et ne pas se fier à la seule détection de fonctionnalité.

---

## 4. Veille concurrentielle (TASK 4)

Indicatif, à partir de connaissances générales et de comparatifs grand public (Wareable, Rise, revues d'apps). Fonctions, prix et modèles évoluent : à revérifier avant tout usage marketing.

| App | Points forts | Lacune / opportunité pour Somnia (agenda, privacy-first, web) |
|---|---|---|
| **Sleep Cycle** | Suivi sans wearable (micro/accéléromètre), « réveil intelligent », détection du ronflement, forte notoriété | Le réveil intelligent n'est pas démontré (cf. 3.1) et les stades estimés sont peu fiables. Somnia peut proposer un agenda standardisé (CSD) transparent, sans enregistrement audio. |
| **Oura** | Bague avec capteurs (FC, VFC, température), scores de récupération, bonne ergonomie | Matériel coûteux plus abonnement, données dans le cloud. Somnia : zéro matériel, données locales, métriques expliquées plutôt que scores opaques. |
| **Apple Santé / Sommeil (Watch)** | Intégré à l'écosystème, détection automatique, horaires de sommeil | Réservé à Apple, peu d'éducation et de contexte (caféine, alcool, écrans). Somnia : multiplateforme web, facteurs de mode de vie liés à des sources citées. |
| **Rise Science** | Centré sur la dette de sommeil et le rythme circadien (prévision d'énergie), fonctionne avec ou sans wearable | Abonnement, modèle propriétaire. Somnia : métriques ouvertes (SRI, social jetlag, SE) avec formules et références publiées. |
| **Pillow** | Belle présentation, Apple Watch ou iPhone, enregistrement des bruits, réveil intelligent | iOS uniquement, stades peu précis. Somnia : focus sur les tendances et la régularité. |
| **AutoSleep** | Achat unique (sans abonnement), très riche en données, siestes, Apple Watch | Interface jugée surchargée par des utilisateurs, iOS uniquement. Somnia : interface simple en français, contenu santé publique FR (SpF, Inserm). |

**Positionnement suggéré.** Agenda de sommeil fondé sur le Consensus Sleep Diary, données 100 % locales (IndexedDB) et export utilisateur, métriques de régularité validées (SRI, social jetlag) et repères chiffrés sourcés (AASM/SRS, NSF). Le ton doit éviter l'orthosomnie (Baron 2017) et rappeler que l'app ne pose pas de diagnostic (Khosla 2018).

---

## 5. Récapitulatif des corrections

- [3] Le DOI jcsm.5866 correspond à la **déclaration courte** pédiatrique (12(6):785-786), pas à l'article méthodologique (12(11):1549-1561).
- [6] Titre exact ajouté : « Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing ». Article n° 3216.
- [10] Titre complet : « …: daily temporal patterns of human chronotypes ». Pages 80-90.
- [25] Titre complet : « …of prospective studies ». Pages 585-592.
- [7] Publié en ligne en 2023, numéro de 2024. [12] En ligne en décembre 2020, numéro de 2021. [19] En ligne en décembre 2014, numéro de 2015. [26] En ligne en octobre 2014, numéro de 2015.
- [1] Version jumelle dans JCSM 2015;11(6):591-592 (non vérifiée).
- [23] Le titre du manuscrit PMC diffère du titre publié. Citer le titre publié.
- Aucune erreur de DOI n'a été détectée sur les 26 références : chaque DOI fourni correspond au titre attendu dans les résultats de recherche.
