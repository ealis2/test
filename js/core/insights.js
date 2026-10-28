// Observations et synthèses personnalisées, générées uniquement à partir des
// données disponibles. Chaque observation porte son niveau de preuve, ses
// effectifs et ne formule jamais de lien de cause à effet.

import { inRange, summarize, onePerNight, unusualChanges, associations, workFree, trend, dailySeries, periodRange, comparePeriods } from './analysis.js';
import { fmtDuration, fmtNumber, fmtClock, fmtPct } from './format.js';
import { addDays } from './time.js';

/** Direction souhaitable de chaque indicateur (pour qualifier une évolution sans jugement moral). */
export const DIRECTION = { tst: +1, sol: -1, waso: -1, se: +1, quality: +1, tib: 0, bedClock: 0, wakeClock: 0 };
export const LABELS = {
  tst: 'Temps de sommeil', tib: 'Temps au lit', sol: 'Latence d\'endormissement', waso: 'Éveils nocturnes',
  se: 'Efficacité', quality: 'Qualité ressentie', bedClock: 'Heure de coucher', wakeClock: 'Heure de réveil',
  awakenings: 'Réveils', wakeEase: 'Facilité du réveil',
};

export function fmtMetric(key, v, { signed = false } = {}) {
  if (v === null || v === undefined) return '—';
  if (key === 'se') return (signed && v > 0 ? '+' : '') + fmtPct(v);
  if (key === 'quality' || key === 'wakeEase') return (signed && v > 0 ? '+' : '') + fmtNumber(v, 1) + (signed ? '' : ' / 5');
  if (key.endsWith('Clock')) return signed ? fmtDuration(v, { signed: true }) : fmtClock(v);
  return fmtDuration(v, { signed });
}

/**
 * Synthèse « ce qui s'améliore, se dégrade, reste stable » : période récente
 * comparée à la période précédente de même longueur.
 */
export function evolution(prepared, todayKey, days = 30) {
  const cur = periodRange(days, todayKey);
  const prev = { from: addDays(cur.from, -days), to: addDays(cur.from, -1) };
  const cmp = comparePeriods(prepared.nights, prev, cur);
  const items = [];
  for (const r of cmp.rows) {
    if (r.insufficient) { items.push({ key: r.key, status: 'insufficient', nA: r.nA, nB: r.nB }); continue; }
    const dir = DIRECTION[r.key];
    const meaningful = Math.abs(r.diff) >= ({ tst: 15, tib: 15, sol: 5, waso: 5, se: 3, quality: 0.3, bedClock: 20, wakeClock: 20 }[r.key] ?? 0);
    const clear = r.p < 0.05 && meaningful;
    let status = 'stable';
    if (clear) status = dir === 0 ? 'shifted' : Math.sign(r.diff) === dir ? 'better' : 'worse';
    else if (meaningful) status = 'uncertain';
    items.push({ key: r.key, status, diff: r.diff, ci: r.ci, p: r.p, nA: r.nA, nB: r.nB, meanB: r.meanB, ref: r.ref });
  }
  return { current: cur, previous: prev, nA: cmp.nA, nB: cmp.nB, items };
}

/**
 * Observations pour l'accueil et les analyses, triées par pertinence.
 * Retourne au plus `limit` observations.
 */
export function buildInsights(prepared, { todayKey, goalMin, limit = 6 }) {
  const out = [];
  const nights = prepared.nights;
  const recent7 = inRange(nights, addDays(todayKey, -6), todayKey);
  const prev7 = inRange(nights, addDays(todayKey, -13), addDays(todayKey, -7));
  const s7 = summarize(recent7), sp = summarize(prev7);

  if (!nights.length) return [{ id: 'empty', level: 'personal', tone: 'neutral', title: 'Votre première nuit', text: 'Lancez une session ce soir ou ajoutez une nuit au journal : les analyses apparaîtront dès 3 nuits renseignées.' }];

  // 1. Semaine en cours vs précédente
  if (!s7.tst.insufficient && !sp.tst.insufficient) {
    const d = s7.tst.mean - sp.tst.mean;
    out.push({
      id: 'week-vs-prev', level: 'personal', tone: Math.abs(d) < 15 ? 'neutral' : d > 0 ? 'positive' : 'attention', score: Math.min(3, Math.abs(d) / 20),
      title: Math.abs(d) < 15 ? 'Semaine stable' : d > 0 ? 'Vous dormez davantage cette semaine' : 'Vous dormez moins cette semaine',
      text: `Temps de sommeil moyen : ${fmtDuration(s7.tst.mean)} sur les 7 derniers jours (${s7.tst.n} nuits) contre ${fmtDuration(sp.tst.mean)} la semaine précédente (${sp.tst.n} nuits), soit ${fmtDuration(d, { signed: true })}.`,
    });
  }

  // 2. Changements inhabituels
  for (const c of unusualChanges(nights).filter(c => c.notable)) {
    const dir = DIRECTION[c.key];
    out.push({
      id: 'change-' + c.key, level: 'personal', tone: dir === 0 ? 'neutral' : Math.sign(c.diff) === dir ? 'positive' : 'attention', score: 3,
      title: `${LABELS[c.key]} : changement inhabituel`,
      text: `Sur vos ${c.nB} dernières nuits, l'écart avec les ${c.nA} nuits précédentes est de ${fmtMetric(c.key, c.diff, { signed: true })} (IC 95 % : ${fmtMetric(c.key, c.ci[0], { signed: true })} à ${fmtMetric(c.key, c.ci[1], { signed: true })}). À observer, sans conclure trop vite.`,
      link: '#/stats',
    });
  }

  // 3. Jet-lag social
  const wf = workFree(inRange(nights, addDays(todayKey, -29), todayKey));
  if (!wf.insufficient && wf.socialJetlag >= 60) {
    out.push({
      id: 'sjl', level: 'research', tone: 'attention', score: 2, refs: ['wittmann2006'],
      title: `Jet-lag social de ${fmtDuration(wf.socialJetlag)}`,
      text: `Sur 30 jours, le milieu de votre sommeil se décale de ${fmtDuration(wf.socialJetlag)} entre jours libres (${wf.free.n} nuits) et jours travaillés (${wf.work.n} nuits). Ce décalage a été décrit comme un « jet-lag » hebdomadaire.`,
      link: '#/stats/rhythm',
    });
  }

  // 4. Associations robustes (après correction multiple)
  for (const key of ['sol', 'tst', 'quality']) {
    for (const a of associations(inRange(nights, addDays(todayKey, -89), todayKey), key).filter(a => a.robust && a.method === 'welch')) {
      out.push({
        id: `assoc-${a.factor.id}-${key}`, level: 'personal', tone: 'neutral', score: 1.5,
        title: `${a.factor.label} et ${LABELS[key].toLowerCase()}`,
        text: `Sur 90 jours, les nuits avec « ${a.factor.label.toLowerCase()} » (${a.nYes}), votre ${LABELS[key].toLowerCase()} moyenne différait de ${fmtMetric(key, a.diff, { signed: true })} par rapport aux autres nuits (${a.nNo}). C'est une association observée dans vos données, pas une cause : une expérience de 2 semaines peut aider à y voir plus clair.`,
        link: '#/stats/habits',
      });
    }
  }

  // 5. Tendance sur 30 jours
  const series = dailySeries(nights, addDays(todayKey, -29), todayKey, 'tst');
  const t = trend(series);
  if (!t.insufficient && t.p < 0.05 && Math.abs(t.slopePerWeek) >= 5) {
    out.push({
      id: 'trend', level: 'personal', tone: t.slopePerWeek > 0 ? 'positive' : 'attention', score: 1.5,
      title: t.slopePerWeek > 0 ? 'Tendance à la hausse' : 'Tendance à la baisse',
      text: `Sur 30 jours (${t.n} nuits), votre temps de sommeil évolue d'environ ${fmtDuration(t.slopePerWeek, { signed: true })} par semaine (pente de Theil–Sen).`,
      link: '#/stats',
    });
  }

  // 6. Repère de consensus (sans culpabiliser)
  if (!s7.tst.insufficient && s7.tst.mean < 420) {
    out.push({
      id: 'consensus-7h', level: 'consensus', tone: 'neutral', score: 1, refs: ['watson2015'],
      title: 'Repère : 7 h ou plus',
      text: `Votre moyenne récente est de ${fmtDuration(s7.tst.mean)}. Chez l'adulte, l'AASM et la SRS recommandent au moins 7 h de façon régulière. Les besoins varient d'une personne à l'autre.`,
      link: '#/science',
    });
  }

  // 7. Données manquantes empêchant les calculs
  const { nights: last14 } = onePerNight(inRange(nights, addDays(todayKey, -13), todayKey));
  const noTst = last14.filter(x => x.m.tst === null).length;
  if (last14.length >= 3 && noTst / last14.length > 0.4) {
    out.push({
      id: 'missing-tst', level: 'personal', tone: 'neutral', score: 0.8,
      title: 'Temps de sommeil non calculable',
      text: `${noTst} nuits sur ${last14.length} n'ont pas de latence ou de durée d'éveil renseignée : le temps de sommeil réel ne peut pas être calculé sans ces estimations.`,
      link: '#/journal',
    });
  }

  // 8. Objectif personnel atteint la nuit dernière
  const last = onePerNight(nights).nights.at(-1);
  if (last && last.m.tst !== null && last.m.nightKey >= addDays(todayKey, -1)) {
    const d = last.m.tst - goalMin;
    out.push({
      id: 'last-night', level: 'personal', tone: d >= 0 ? 'positive' : 'neutral', score: 0.5,
      title: d >= 0 ? 'Objectif atteint la nuit dernière' : 'Nuit plus courte que votre objectif',
      text: `${fmtDuration(last.m.tst)} de sommeil estimé pour un objectif de ${fmtDuration(goalMin)} (${fmtDuration(d, { signed: true })}).`,
    });
  }

  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
}
