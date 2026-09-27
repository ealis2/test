// Questionnaires cliniques validés (versions françaises courantes).
// Outils de dépistage/auto-évaluation : ils ne remplacent pas un diagnostic médical.

const ISI_SCALE = ['Aucune', 'Légère', 'Moyenne', 'Très', 'Extrêmement'];

export const TESTS = [
  {
    id: 'isi',
    name: 'Index de Sévérité de l\'Insomnie (ISI)',
    short: 'Insomnie',
    ico: '🌙',
    ref: 'Morin, 1993 ; validation Bastien, Vallières & Morin, Sleep Med 2001',
    intro: 'Pour chaque question, pense aux 2 dernières semaines.',
    questions: [
      { q: 'Difficulté à t\'endormir', o: ISI_SCALE },
      { q: 'Difficulté à rester endormi(e)', o: ISI_SCALE },
      { q: 'Problème de réveil trop tôt le matin', o: ISI_SCALE },
      { q: 'Es-tu satisfait(e) de ton sommeil actuel ?', o: ['Très satisfait', 'Satisfait', 'Moyennement', 'Insatisfait', 'Très insatisfait'] },
      { q: 'Tes difficultés de sommeil sont-elles visibles par les autres (qualité de vie) ?', o: ['Pas du tout', 'Un peu', 'Moyennement', 'Beaucoup', 'Énormément'] },
      { q: 'À quel point es-tu inquiet(e) ou préoccupé(e) par tes difficultés de sommeil ?', o: ['Pas du tout', 'Un peu', 'Moyennement', 'Beaucoup', 'Énormément'] },
      { q: 'Tes difficultés de sommeil perturbent-elles ton fonctionnement quotidien (fatigue, concentration, humeur…) ?', o: ['Pas du tout', 'Un peu', 'Moyennement', 'Beaucoup', 'Énormément'] },
    ],
    score: a => a.reduce((s, v) => s + v, 0),
    max: 28,
    interpret(sc) {
      if (sc <= 7) return { txt: 'Pas d\'insomnie cliniquement significative', cls: 'good' };
      if (sc <= 14) return { txt: 'Insomnie sub-clinique (légère)', cls: 'warn', advice: 'Applique les règles d\'hygiène du sommeil et garde des horaires réguliers.' };
      if (sc <= 21) return { txt: 'Insomnie clinique modérée', cls: 'bad', advice: 'Parles-en à ton médecin : la thérapie cognitivo-comportementale de l\'insomnie (TCC-I) est le traitement de référence.' };
      return { txt: 'Insomnie clinique sévère', cls: 'bad', advice: 'Consulte un médecin ou un centre du sommeil. La TCC-I est le traitement recommandé en premier.' };
    },
  },
  {
    id: 'ess',
    name: 'Échelle de Somnolence d\'Epworth',
    short: 'Somnolence',
    ico: '😪',
    ref: 'Johns, Sleep 1991',
    intro: 'Quelle est la probabilité que tu t\'assoupisses (pas seulement te sentir fatigué) dans ces situations, dans ta vie récente ?',
    questions: [
      'Assis(e) en train de lire',
      'En regardant la télévision',
      'Assis(e), inactif(ve), dans un lieu public (cinéma, réunion)',
      'Passager d\'une voiture roulant 1 h sans arrêt',
      'Allongé(e) l\'après-midi pour te reposer',
      'Assis(e) en parlant avec quelqu\'un',
      'Assis(e) calmement après un repas sans alcool',
      'Au volant, arrêté(e) quelques minutes dans un embouteillage',
    ].map(q => ({ q, o: ['Jamais', 'Faible chance', 'Chance moyenne', 'Forte chance'] })),
    score: a => a.reduce((s, v) => s + v, 0),
    max: 24,
    interpret(sc) {
      if (sc <= 10) return { txt: 'Somnolence diurne normale', cls: 'good' };
      if (sc <= 12) return { txt: 'Somnolence légère', cls: 'warn', advice: 'Vérifie ta durée de sommeil et ta dette de sommeil (onglet Analyses).' };
      if (sc <= 15) return { txt: 'Somnolence modérée', cls: 'bad', advice: 'Somnolence excessive : parles-en à un médecin, surtout si tu conduis.' };
      return { txt: 'Somnolence sévère', cls: 'bad', advice: 'Consulte un médecin. Évite de conduire en cas de fatigue.' };
    },
  },
  {
    id: 'rmeq',
    name: 'Questionnaire matin/soir réduit (rMEQ)',
    short: 'Chronotype',
    ico: '🐦',
    ref: 'Adan & Almirall, Pers Individ Dif 1991 (d\'après Horne & Östberg, 1976)',
    intro: 'Réponds selon ton rythme naturel, sans contrainte d\'horaire.',
    questions: [
      { q: 'Si tu étais libre de ton emploi du temps, à quelle heure te lèverais-tu ?', o: ['11 h – 12 h', '9 h 45 – 11 h', '7 h 45 – 9 h 45', '6 h 30 – 7 h 45', '5 h – 6 h 30'], v: [1, 2, 3, 4, 5] },
      { q: 'Dans la demi-heure qui suit ton réveil, comment te sens-tu ?', o: ['Très fatigué(e)', 'Plutôt fatigué(e)', 'Plutôt reposé(e)', 'Très reposé(e)'], v: [1, 2, 3, 4] },
      { q: 'Vers quelle heure du soir te sens-tu fatigué(e) et as-tu besoin de dormir ?', o: ['2 h – 3 h', '0 h 45 – 2 h', '22 h 15 – 0 h 45', '21 h – 22 h 15', '20 h – 21 h'], v: [1, 2, 3, 4, 5] },
      { q: 'À quel moment de la journée te sens-tu au mieux de ta forme ?', o: ['22 h – 5 h', '17 h – 22 h', '10 h – 17 h', '8 h – 10 h', '5 h – 8 h'], v: [1, 2, 3, 4, 5] },
      { q: 'On parle de personnes « du matin » et « du soir ». Tu te considères comme :', o: ['Nettement du soir', 'Plutôt du soir', 'Plutôt du matin', 'Nettement du matin'], v: [0, 2, 4, 6] },
    ],
    score: (a, t) => a.reduce((s, v, i) => s + t.questions[i].v[v], 0),
    max: 25,
    interpret(sc) {
      if (sc >= 22) return { txt: 'Nettement du matin', cls: 'good', advice: 'Profite de tes matinées pour les tâches exigeantes ; couche-toi tôt de façon régulière.' };
      if (sc >= 18) return { txt: 'Modérément du matin', cls: 'good' };
      if (sc >= 12) return { txt: 'Ni du matin ni du soir', cls: 'good' };
      if (sc >= 8) return { txt: 'Modérément du soir', cls: 'warn', advice: 'La lumière du jour le matin et une lumière tamisée le soir t\'aideront à avancer ton horloge.' };
      return { txt: 'Nettement du soir', cls: 'warn', advice: 'Lumière vive le matin, écrans et lumière forte évités le soir, horaires fixes même le week-end.' };
    },
  },
  {
    id: 'stopbang',
    name: 'STOP-BANG (risque d\'apnée du sommeil)',
    short: 'Apnée',
    ico: '🫁',
    ref: 'Chung et al., Anesthesiology 2008 ; Chest 2016',
    intro: 'Réponds par oui ou non.',
    questions: [
      'Ronfles-tu fort (assez pour être entendu à travers une porte fermée ou gêner ton partenaire) ?',
      'Te sens-tu souvent fatigué(e) ou somnolent(e) pendant la journée ?',
      'Quelqu\'un a-t-il observé que tu arrêtais de respirer ou suffoquais pendant ton sommeil ?',
      'As-tu (ou es-tu traité(e) pour) une hypertension artérielle ?',
      'Ton IMC est-il supérieur à 35 kg/m² ?',
      'As-tu plus de 50 ans ?',
      'Ton tour de cou est-il supérieur à 40 cm ?',
      'Es-tu un homme ?',
    ].map(q => ({ q, o: ['Non', 'Oui'] })),
    score: a => a.reduce((s, v) => s + v, 0),
    max: 8,
    interpret(sc, a) {
      const stop = a.slice(0, 4).reduce((s, v) => s + v, 0);
      const high = sc >= 5 || (stop >= 2 && (a[4] || a[6] || a[7]));
      if (high) return { txt: 'Risque élevé d\'apnée obstructive', cls: 'bad', advice: 'Parles-en à ton médecin : un enregistrement du sommeil (polygraphie) permet de confirmer ou non. L\'apnée non traitée augmente le risque cardiovasculaire.' };
      if (sc >= 3) return { txt: 'Risque intermédiaire', cls: 'warn', advice: 'Surveille les ronflements (mesurés par Somnia) et parles-en à ton médecin s\'ils sont fréquents ou si tu es fatigué(e) en journée.' };
      return { txt: 'Risque faible', cls: 'good' };
    },
  },
];
