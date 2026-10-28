// Contenu scientifique de l'application : repères officiels, fiches méthode des
// indicateurs et expérimentations personnelles. Chaque affirmation renvoie à des
// références de js/science/references.js.
//
// Niveaux de preuve affichés à l'utilisateur :
//   consensus : recommandation d'une société savante ou d'un organisme public
//   research  : résultat de recherche (expérience, méta-analyse, association observée)
//   personal  : hypothèse tirée de VOS données (exploratoire, jamais causale)

export const EVIDENCE = {
  consensus: { label: 'Consensus', desc: 'Recommandation d\'une société savante ou d\'un organisme de santé publique.' },
  research: { label: 'Recherche', desc: 'Résultat publié (expérience, méta-analyse ou association observée dans une population).' },
  personal: { label: 'Vos données', desc: 'Observation exploratoire tirée de votre journal. Une association n\'est pas une cause.' },
};

// --- Durées recommandées (sommeil par 24 h) ---------------------------------
export const AGE_GROUPS = [
  { id: '14-17', label: '14 à 17 ans', nsf: [8, 10], nsfMay: [7, 11], aasm: '8 à 10 h (13–18 ans)', aasmRef: 'paruthi2016' },
  { id: '18-25', label: '18 à 25 ans', nsf: [7, 9], nsfMay: [6, 11], aasm: '7 h ou plus', aasmRef: 'watson2015' },
  { id: '26-64', label: '26 à 64 ans', nsf: [7, 9], nsfMay: [6, 10], aasm: '7 h ou plus (jusqu\'à 60 ans dans le consensus)', aasmRef: 'watson2015' },
  { id: '65+', label: '65 ans et plus', nsf: [7, 8], nsfMay: [5, 9], aasm: '—', aasmRef: null },
];
export const AGE_BY_ID = Object.fromEntries(AGE_GROUPS.map(a => [a.id, a]));

// --- Repères de continuité chez l'adulte (NSF, Ohayon et al., 2017) ----------
// Seuls les repères de « bonne qualité » ont pu être recoupés ; les seuils par
// tranche d'âge et de « mauvaise qualité » figurent dans les tableaux de l'article.
export const QUALITY_MARKERS = [
  { key: 'sol', label: 'Latence d\'endormissement', good: '≤ 30 min', test: v => v <= 30, ref: 'ohayon2017' },
  { key: 'awakenings', label: 'Réveils de plus de 5 min', good: '≤ 1 par nuit', test: v => v <= 1, ref: 'ohayon2017', note: 'Le journal compte tous les réveils dont vous vous souvenez, pas seulement ceux de plus de 5 min.' },
  { key: 'waso', label: 'Éveil après endormissement', good: '≤ 20 min', test: v => v <= 20, ref: 'ohayon2017' },
  { key: 'se', label: 'Efficacité du sommeil', good: '≥ 85 %', test: v => v >= 85, ref: 'ohayon2017' },
];

// --- Fiches méthode des indicateurs (source unique de docs/METRICS.md) -------
export const METRIC_DOCS = [
  {
    id: 'tib', name: 'Temps au lit', unit: 'minutes',
    question: 'Combien de temps ai-je passé au lit ?',
    inputs: 'Heure de coucher, heure de lever.',
    formula: 'Temps au lit = lever − coucher (instants absolus, changements d\'heure inclus).',
    missing: 'Sans heure de lever, le réveil final est utilisé et la valeur est marquée « estimée » ; l\'efficacité n\'est alors pas calculée.',
    limits: 'Ce n\'est pas du sommeil : on peut être au lit éveillé.',
    refs: ['carney2012'],
  },
  {
    id: 'sol', name: 'Latence d\'endormissement', unit: 'minutes',
    question: 'Combien de temps ai-je mis à m\'endormir ?',
    inputs: 'Estimation déclarée le matin (ou heure d\'endormissement estimée, convertie).',
    formula: 'Latence = endormissement estimé − moment où vous avez essayé de dormir (extinction, sinon coucher).',
    missing: 'Non renseignée → inconnue (pas zéro). Le temps de sommeil n\'est alors pas calculé.',
    limits: 'Estimation subjective : on surestime souvent sa latence, surtout en cas d\'insomnie.',
    refs: ['carney2012', 'ohayon2017'],
  },
  {
    id: 'waso', name: 'Éveil après endormissement (WASO)', unit: 'minutes',
    question: 'Combien de temps suis-je resté éveillé pendant la nuit ?',
    inputs: 'Nombre de réveils et durée totale estimée.',
    formula: 'WASO = somme déclarée des périodes d\'éveil entre l\'endormissement et le réveil final.',
    missing: '« Aucun réveil » enregistre 0 ; une absence de réponse reste inconnue.',
    limits: 'Les réveils brefs ne laissent souvent aucun souvenir : le journal sous-estime leur nombre.',
    refs: ['carney2012', 'ohayon2017'],
  },
  {
    id: 'tst', name: 'Temps de sommeil total', unit: 'minutes',
    question: 'Combien ai-je réellement dormi ?',
    inputs: 'Extinction (ou coucher), latence, éveils nocturnes, réveil final.',
    formula: 'TST = (réveil final − extinction) − latence − WASO. Si une mesure importée existe (montre), elle est utilisée et signalée comme « mesurée ».',
    missing: 'Calculé seulement si latence ET éveils nocturnes sont connus. Sinon : « non calculable », jamais une valeur par défaut.',
    limits: 'Estimation déclarative ; l\'écart avec une mesure objective peut atteindre une heure selon les personnes (Lauderdale et al., 2008).',
    refs: ['carney2012', 'lauderdale2008'],
  },
  {
    id: 'se', name: 'Efficacité du sommeil', unit: '%',
    question: 'Quelle part du temps passé au lit ai-je dormi ?',
    inputs: 'Temps de sommeil total, temps au lit (avec heure de lever réelle).',
    formula: 'Efficacité = TST ÷ temps au lit × 100.',
    missing: 'Non calculée si l\'un des deux manque, si le lever est estimé, ou si le temps au lit est inférieur à 60 min.',
    limits: 'Repère NSF : ≥ 85 % associé à une bonne qualité chez l\'adulte. Rester au lit le matin, éveillé mais reposé, fait baisser l\'indicateur sans signifier un mauvais sommeil.',
    refs: ['carney2012', 'ohayon2017'],
  },
  {
    id: 'midsleep', name: 'Milieu du sommeil', unit: 'heure',
    question: 'À quelle heure se situe le centre de ma nuit ?',
    inputs: 'Endormissement estimé et réveil final.',
    formula: 'Milieu = endormissement + (réveil final − endormissement) ÷ 2, exprimé en heure locale du fuseau de la nuit.',
    missing: 'Non calculé sans latence ni réveil final.',
    limits: 'Indicateur de l\'heure du rythme de sommeil ; utilisé pour le jet-lag social (approche MCTQ, ici sans correction de la dette de sommeil).',
    refs: ['roenneberg2003', 'wittmann2006'],
  },
  {
    id: 'clockstats', name: 'Heures moyennes et variabilité', unit: 'heure / minutes',
    question: 'À quelle heure me couché-je en moyenne, et avec quelle régularité ?',
    inputs: 'Heures de coucher / réveil sur la période.',
    formula: 'Moyenne circulaire sur 24 h ; dispersion = écart-type circulaire σ = √(−2 ln R) converti en minutes (R : longueur du vecteur moyen).',
    missing: 'Moyenne publiée dès 3 nuits, dispersion dès 5 nuits.',
    limits: 'La moyenne circulaire évite l\'erreur classique : 23:50 et 00:10 donnent 00:00, pas 12:00.',
    refs: ['fischer2021'],
  },
  {
    id: 'sri', name: 'Indice de régularité du sommeil (SRI)', unit: 'score de −100 à 100',
    question: 'Mon sommeil tombe-t-il aux mêmes heures d\'un jour à l\'autre ?',
    inputs: 'Périodes de sommeil (endormissement → réveil final) et siestes, sur des jours consécutifs.',
    formula: 'SRI = −100 + 200 × proportion des minutes où l\'état (sommeil/éveil) est identique à t et t + 24 h, sur les paires de jours consécutifs renseignés.',
    missing: 'Jours non renseignés exclus (jamais supposés éveillés). Publié à partir de 7 paires de jours consécutifs.',
    limits: 'Depuis un journal, les éveils nocturnes ne sont pas localisés dans le temps : ils sont comptés comme du sommeil. 100 = parfaitement régulier. Certaines études utilisent une échelle 0–100.',
    refs: ['phillips2017', 'fischer2021', 'windred2024'],
  },
  {
    id: 'sjl', name: 'Jet-lag social', unit: 'minutes',
    question: 'Mes horaires du week-end s\'écartent-ils de ceux de la semaine ?',
    inputs: 'Milieu du sommeil des jours libres et des jours travaillés (jour libre : choisi, sinon réveil samedi/dimanche).',
    formula: 'Jet-lag social = | milieu moyen (jours libres) − milieu moyen (jours travaillés) |, moyennes circulaires.',
    missing: 'Publié avec au moins 2 jours libres et 3 jours travaillés.',
    limits: 'Version simple, sans la correction de dette de sommeil du MCTQ.',
    refs: ['wittmann2006', 'roenneberg2003'],
  },
  {
    id: 'balance', name: 'Bilan cumulé sur 7 nuits', unit: 'minutes',
    question: 'Ai-je dormi plus ou moins que mon objectif cette semaine ?',
    inputs: 'Temps de sommeil des 7 dernières nuits, objectif personnel.',
    formula: 'Bilan = Σ (TST − objectif) sur les nuits connues.',
    missing: 'Non publié si moins de 5 nuits sur 7 sont connues ; l\'effectif est toujours affiché.',
    limits: 'Indicateur de tendance, pas une « dette » physiologique mesurable : la récupération ne se fait pas minute pour minute.',
    refs: ['vandongen2003'],
  },
  {
    id: 'trend', name: 'Tendance persistante', unit: 'minutes par semaine',
    question: 'Mon sommeil évolue-t-il durablement ?',
    inputs: 'Série quotidienne (jours manquants laissés vides).',
    formula: 'Pente de Theil–Sen (médiane des pentes entre toutes les paires de nuits) ; significativité par test de Mann–Kendall.',
    missing: 'Publiée à partir de 14 nuits renseignées.',
    limits: 'Une tendance décrit le passé de la période choisie ; elle ne prédit pas l\'avenir.',
    refs: [],
  },
  {
    id: 'change', name: 'Changement inhabituel', unit: 'selon l\'indicateur',
    question: 'Ma dernière semaine sort-elle de l\'ordinaire ?',
    inputs: '7 dernières nuits comparées aux 28 précédentes.',
    formula: 'Test t de Welch ; signalé si p < 0,05 ET si l\'écart dépasse un seuil pratique (20 min de sommeil, 10 min de latence, 30 min d\'horaire…).',
    missing: 'Au moins 5 nuits récentes et 10 nuits de référence.',
    limits: 'Les tests répétés produisent des faux positifs : un signalement invite à regarder, pas à conclure.',
    refs: [],
  },
  {
    id: 'assoc', name: 'Associations exploratoires', unit: 'différence ou corrélation',
    question: 'Mes nuits diffèrent-elles selon mes habitudes déclarées ?',
    inputs: 'Facteurs renseignés (caféine, alcool, sport, écrans, stress…) et un indicateur choisi.',
    formula: 'Oui/non : différence de moyennes (Welch, IC 95 %). Numérique : corrélation de Spearman. Correction de Benjamini–Hochberg pour comparaisons multiples.',
    missing: 'Au moins 5 nuits par groupe, ou 10 nuits pour une corrélation. Les nuits sans réponse sont exclues, jamais comptées « non ».',
    limits: 'Association ≠ causalité : les soirs de caféine peuvent aussi être des soirs de stress. À utiliser pour formuler une expérience, pas une conclusion.',
    refs: ['irish2015'],
  },
];
export const METRIC_BY_ID = Object.fromEntries(METRIC_DOCS.map(m => [m.id, m]));

// --- Expérimentations personnelles (jamais présentées comme des certitudes) ---
export const EXPERIMENTS = [
  {
    id: 'regular-wake', title: 'Fixer une heure de lever, 7 jours sur 7',
    evidence: 'research', refs: ['phillips2017', 'windred2024', 'fischer2021'],
    why: 'Dans de grandes cohortes, un sommeil plus régulier est associé à de meilleurs indicateurs de santé ; dans l\'étude UK Biobank, la régularité prédisait la mortalité mieux que la durée. Il s\'agit d\'associations, pas d\'une preuve d\'effet causal.',
    how: 'Pendant 2 semaines, levez-vous à la même heure (± 30 min), week-end compris.',
    watch: ['SRI', 'Jet-lag social', 'Qualité ressentie'],
    when: s => s.socialJetlag !== null && s.socialJetlag > 60,
  },
  {
    id: 'caffeine-cutoff', title: 'Avancer la dernière boisson caféinée',
    evidence: 'research', refs: ['drake2013', 'gardiner2023'],
    why: 'En laboratoire, 400 mg de caféine pris même 6 h avant le coucher ont réduit le sommeil de plus d\'une heure (Drake et al., 2013). Une méta-analyse confirme une baisse du temps de sommeil et une latence allongée (Gardiner et al., 2023). La sensibilité varie selon les personnes.',
    how: 'Pendant 2 semaines, aucune caféine dans les 8 h avant le coucher. Notez « Caféine après 14 h » chaque matin.',
    watch: ['Latence', 'Temps de sommeil'],
  },
  {
    id: 'alcohol', title: 'Observer les soirs sans alcool',
    evidence: 'research', refs: ['ebrahim2013'],
    why: 'L\'alcool accélère l\'endormissement mais perturbe la seconde moitié de la nuit (revue d\'Ebrahim et al., 2013).',
    how: 'Comparez vos réveils nocturnes avec et sans alcool pendant 3 semaines, en renseignant le nombre de verres.',
    watch: ['Éveils nocturnes', 'Qualité ressentie'],
  },
  {
    id: 'activity', title: 'Ajouter de l\'activité physique en journée',
    evidence: 'research', refs: ['kredlow2015'],
    why: 'Une méta-analyse trouve des bénéfices faibles à modérés de l\'activité physique, ponctuelle ou régulière, sur plusieurs indicateurs de sommeil.',
    how: '30 min d\'activité modérée la plupart des jours ; notez la durée.',
    watch: ['Latence', 'Qualité ressentie', 'Temps de sommeil'],
  },
  {
    id: 'evening-light', title: 'Réduire la lumière des écrans le soir',
    evidence: 'research', refs: ['chang2015', 'inserm-sommeil'],
    why: 'Lire sur une liseuse rétroéclairée avant de dormir a retardé la mélatonine et l\'endormissement par rapport à un livre papier (Chang et al., 2015, étude en laboratoire).',
    how: 'Pendant 2 semaines, pas d\'écran au lit dans l\'heure qui précède le sommeil.',
    watch: ['Latence', 'Heure d\'endormissement'],
  },
  {
    id: 'goal', title: 'Viser au moins 7 h de sommeil (adulte)',
    evidence: 'consensus', refs: ['watson2015', 'hirshkowitz2015'],
    why: 'L\'AASM et la SRS recommandent au moins 7 h par nuit de façon régulière chez l\'adulte ; la NSF recommande 7 à 9 h de 18 à 64 ans.',
    how: 'Avancez progressivement l\'heure du coucher par paliers de 15 min plutôt que de retarder le lever.',
    watch: ['Temps de sommeil', 'Bilan sur 7 nuits'],
  },
];

// --- Quand en parler à un professionnel de santé -----------------------------
export const CONSULT = {
  refs: ['riemann2023', 'khosla2018'],
  intro: 'Somnia ne pose aucun diagnostic. Ces situations justifient d\'en parler à un médecin, qui pourra s\'appuyer sur votre journal :',
  items: [
    'Des difficultés à vous endormir ou à rester endormi au moins 3 nuits par semaine depuis plus de 3 mois, avec un retentissement dans la journée (critères décrits dans les recommandations européennes sur l\'insomnie).',
    'Un ronflement fort, des pauses respiratoires constatées par un proche, ou des réveils en suffoquant.',
    'Une somnolence importante dans la journée, en particulier au volant.',
    'Des mouvements ou sensations gênantes dans les jambes le soir, des comportements inhabituels pendant le sommeil.',
  ],
  cbti: 'Pour l\'insomnie chronique, la thérapie cognitivo-comportementale (TCC-I) est le traitement recommandé en première intention par les recommandations européennes (Riemann et al., 2023).',
};

// --- Limites des appareils et des méthodes -----------------------------------
export const DEVICE_LIMITS = [
  { title: 'Un journal est subjectif', text: 'Il reste la méthode de référence pour l\'auto-observation en clinique (agenda du sommeil consensuel), mais l\'estimation du temps de sommeil diffère d\'une mesure objective, parfois de beaucoup.', refs: ['carney2012', 'lauderdale2008'] },
  { title: 'Les montres et bagues estiment', text: 'Les appareils grand public détectent assez bien le sommeil par rapport à l\'éveil, mais leurs estimations des phases (léger, profond, paradoxal) s\'écartent de la polysomnographie et varient selon les modèles.', refs: ['chinoy2021', 'dezambotti2019', 'khosla2018'] },
  { title: 'Le téléphone posé sur le lit', text: 'Les apps qui déduisent des « cycles » à partir des mouvements du matelas concordent mal avec la polysomnographie. C\'est pourquoi Somnia n\'affiche aucune phase de sommeil.', refs: ['bhat2015'] },
  { title: 'Le « réveil intelligent »', text: 'Aucune étude solide ne montre qu\'une app de téléphone réveillant en « sommeil léger » réduit la somnolence du réveil. Somnia ne propose donc pas cette fonction.', refs: ['bhat2015', 'campanella2024', 'hilditch2019'] },
  { title: 'Trop suivre peut nuire', text: 'Chercher des données « parfaites » peut entretenir l\'anxiété liée au sommeil (« orthosomnie »). Les chiffres sont des repères, pas des notes.', refs: ['baron2017'] },
];
