// Centre d'analyse. Chaque bloc répond à une question précise, affiche ses
// effectifs, ses valeurs manquantes, sa méthode de calcul et ses limites.

import { h, icon } from '../ui/dom.js';
import { durationChart, timingChart, lineChart, intervalChart, histogram, weekdayChart, completenessStrip, dataTable, legend } from '../ui/charts.js';
import { statTile, plate, insufficient, methodDetails, evidenceBadge, segmented, cite } from '../ui/components.js';
import { inRange, summarize, onePerNight, dailySeries, rolling, aggregate, cumulativeBalance, trend, workFree, sleepRegularityIndex, associations, comparePeriods, dataQuality, OUTCOMES, THRESHOLDS } from '../core/analysis.js';
import { evolution, buildInsights, LABELS, fmtMetric, DIRECTION } from '../core/insights.js';
import { describe } from '../core/stats.js';
import { addDays, daysBetweenKeys, keyRange } from '../core/time.js';
import { fmtDuration, fmtClock, fmtNumber, fmtPct, fmtP, fmtDateKey, WEEKDAYS_SHORT, WEEKDAYS_LONG } from '../core/format.js';
import { QUALITY_MARKERS } from '../science/knowledge.js';
import { demoBanner } from './shared.js';

const SECTIONS = [
  ['overview', 'Synthèse'], ['duration', 'Durée'], ['timing', 'Horaires'], ['rhythm', 'Régularité'],
  ['quality', 'Qualité'], ['habits', 'Habitudes'], ['compare', 'Comparer'], ['data', 'Données'],
];
const PERIOD_OPTS = [[7, '7 j'], [30, '30 j'], [90, '90 j'], [365, '1 an'], ['all', 'Tout']];

let period = (() => { try { return JSON.parse(sessionStorage.getItem('somnia.period')) ?? 30; } catch { return 30; } })();
let habitOutcome = 'tst';
let compareState = null;

function range(app) {
  const today = app.todayKey();
  if (period === 'all') {
    const keys = app.prepared().nights.map(x => x.m.nightKey).sort();
    const from = keys[0] || today;
    return { from, to: today, days: daysBetweenKeys(from, today) + 1, label: `depuis le ${fmtDateKey(from, { day: 'numeric', month: 'short', year: 'numeric' })}` };
  }
  return { from: addDays(today, -(period - 1)), to: today, days: period, label: `${period} derniers jours` };
}

const clockFmt = v => fmtClock(v);
const nfmt = (key) => v => fmtMetric(key, v);

export function render(app, section = 'overview') {
  if (!SECTIONS.some(([k]) => k === section)) section = 'overview';
  const p = app.prepared();
  const r = range(app);
  const nights = inRange(p.nights, r.from, r.to);
  const naps = inRange(p.naps, r.from, r.to);
  const root = h('div', { class: 'stats-page' });
  if (app.repo.hasDemo) root.append(demoBanner(app));
  root.append(h('header', { class: 'page-head' },
    h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, `Analyses · ${r.label}`), h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, SECTIONS.find(([k]) => k === section)[1]))),
    h('div', { class: 'stats-controls' },
      h('nav', { class: 'seg stats-tabs', 'aria-label': 'Sections d\'analyse' }, SECTIONS.map(([k, t]) => h('a', { href: `#/stats/${k}`, 'aria-current': k === section ? 'page' : null, class: 'seg-link' }, t))),
      section !== 'compare' ? segmented(PERIOD_OPTS, period, v => { period = v; try { sessionStorage.setItem('somnia.period', JSON.stringify(v)); } catch { /* ignoré */ } app.rerender(); }, 'Période analysée') : null));

  if (!p.nights.length) {
    root.append(h('div', { class: 'empty' }, h('h2', { class: 'h2' }, 'Pas encore de données'), h('p', { class: 'prose' }, 'Les analyses apparaissent dès 3 nuits renseignées. Aucune statistique n\'est calculée sur des données absentes.'), h('div', { class: 'row-actions' }, h('a', { class: 'btn primary', href: '#/entry/new' }, 'Ajouter une nuit'), h('a', { class: 'btn ghost', href: '#/settings/data' }, 'Charger la démonstration'))));
    return root;
  }
  const ctx = { app, p, r, nights, naps, goal: app.repo.settings.goalMin };
  const builders = { overview, duration, timing, rhythm, quality, habits, compare, data };
  root.append(builders[section](ctx));
  return root;
}

// ------------------------------------------------------------------ helpers
function nBadge(n, missing) {
  return h('span', { class: 'micro faint mono' }, `n = ${n}${missing ? ` · ${missing} manquante(s)` : ''}`);
}
function statRowTable(rows) {
  // rows: [label, describeResult, formatter]
  return h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tableau de données' }, h('table', { class: 'data-table stat-table' },
    h('thead', null, h('tr', null, ['Indicateur', 'n', 'Moyenne', 'Médiane', 'Min', 'Max', 'Écart-type'].map(x => h('th', { scope: 'col' }, x)))),
    h('tbody', null, rows.map(([label, d, f]) => h('tr', null,
      h('th', { scope: 'row' }, label),
      h('td', null, `${d.n}${d.missing ? ` (+${d.missing} ∅)` : ''}`),
      ...(d.insufficient ? [h('td', { colspan: 5, class: 'faint' }, `insuffisant (min. ${THRESHOLDS.describe})`)] : [d.mean, d.median, d.min, d.max].map(v => h('td', null, f(v))).concat(h('td', null, d.sd === null ? '—' : f === clockFmt ? fmtDuration(d.sd) : f(d.sd).replace(/^\+/, '')))))))));
}

// ------------------------------------------------------------------ Synthèse
function overview({ app, p, r, nights, goal }) {
  const s = summarize(nights, r);
  const wrap = h('div');
  const ev = evolution(p, r.to, Math.min(r.days, 365));
  const groups = { better: [], worse: [], stable: [], shifted: [], uncertain: [], insufficient: [] };
  for (const it of ev.items) groups[it.status].push(it);
  const line = it => h('li', null, h('b', null, LABELS[it.key]), ' : ',
    it.status === 'insufficient' ? `données insuffisantes (${it.nA} vs ${it.nB} nuits)` : `${fmtMetric(it.key, it.diff, { signed: true })} (IC 95 % ${fmtMetric(it.key, it.ci[0], { signed: true })} à ${fmtMetric(it.key, it.ci[1], { signed: true })})`);
  wrap.append(plate({
    eyebrow: `${r.days} derniers jours vs ${r.days} précédents`, title: 'Qu\'est-ce qui a changé ?',
    aside: evidenceBadge('personal'),
    children: [
      h('div', { class: 'evo' },
        h('div', { class: 'evo-col better' }, h('p', { class: 'eyebrow' }, 'S\'améliore'), groups.better.length ? h('ul', null, groups.better.map(line)) : h('p', { class: 'small faint' }, 'Rien de net.')),
        h('div', { class: 'evo-col worse' }, h('p', { class: 'eyebrow' }, 'Se dégrade'), groups.worse.length ? h('ul', null, groups.worse.map(line)) : h('p', { class: 'small faint' }, 'Rien de net.')),
        h('div', { class: 'evo-col stable' }, h('p', { class: 'eyebrow' }, 'Stable ou incertain'), h('ul', null, [...groups.shifted, ...groups.stable, ...groups.uncertain].map(it => h('li', null, h('b', null, LABELS[it.key]), it.status === 'shifted' ? ` : décalage net de ${fmtDuration(it.diff, { signed: true })}` : it.status === 'uncertain' ? ' : écart notable mais incertain' : ' : stable'))))),
      groups.insufficient.length ? h('p', { class: 'small faint' }, `Non comparables faute de données : ${groups.insufficient.map(i => LABELS[i.key].toLowerCase()).join(', ')}.`) : null,
      h('details', { class: 'method' }, h('summary', null, 'Méthode'), h('div', { class: 'body' },
        h('p', null, `Comparaison de la période choisie (${ev.nB} nuits) avec la période précédente de même durée (${ev.nA} nuits) par un test t de Welch. « S'améliore » ou « se dégrade » exige à la fois p < 0,05 et un écart pratique minimal (15 min de sommeil, 5 min de latence, 3 points d'efficacité, 0,3 point de qualité, 20 min d'horaire).`),
        h('p', null, 'Les heures de coucher et de réveil n\'ont pas de « bon » sens : leur décalage est signalé sans jugement.'))),
    ],
  }));

  wrap.append(h('div', { class: 'section stats four' },
    statTile({ label: 'Sommeil moyen', value: s.tst.insufficient ? '—' : fmtDuration(s.tst.mean), na: s.tst.insufficient, meta: `médiane ${fmtDuration(s.tst.median)} · n=${s.tst.n}` }),
    statTile({ label: 'Coucher moyen', value: s.bedClock.insufficient ? '—' : fmtClock(s.bedClock.mean), na: s.bedClock.insufficient, meta: s.bedSd === null ? `n=${s.bedClock.n}` : `± ${fmtDuration(s.bedSd)} · n=${s.bedClock.n}` }),
    statTile({ label: 'Lever moyen', value: s.outClock.insufficient ? '—' : fmtClock(s.outClock.mean), na: s.outClock.insufficient, meta: `n=${s.outClock.n}` }),
    statTile({ label: 'Efficacité', value: s.se.insufficient ? '—' : fmtPct(s.se.mean), na: s.se.insufficient, meta: `n=${s.se.n} · repère ≥ 85 %` })));
  wrap.append(h('p', { class: 'small faint section-note' }, `${s.n} nuits renseignées sur ${s.expectedDays} jours (${s.missingDays} sans saisie)${s.duplicates ? `, ${s.duplicates} doublon(s) fusionné(s)` : ''}.`));

  const series = dailySeries(nights, r.from, r.to);
  wrap.append(h('div', { class: 'section' }, plate({
    eyebrow: 'Durée', title: 'Combien ai-je dormi chaque nuit ?',
    children: [durationChart({ series: series.map(x => ({ key: x.key, tst: x.value, tib: x.item?.m.tib ?? null, id: x.item?.e.id })), rollingSeries: rolling(series, 7, 4), goal }),
      legend([['', 'var(--moon)', 'Temps de sommeil'], ['', 'var(--bed)', 'Temps au lit'], ['line', 'var(--fg-1)', 'Moyenne glissante 7 j'], ['dash', 'var(--dawn)', `Objectif ${fmtDuration(goal)}`], ['hatch', '', 'Nuit non renseignée']])],
  })));

  const ins = buildInsights(p, { todayKey: r.to, goalMin: goal, limit: 8 });
  wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Observations', title: 'Ce que vos données suggèrent', children: ins.map(i => h('article', { class: 'insight' }, h('div', { class: 'title' }, h('span', null, h('span', { class: ['tone', i.tone] }), ' ', i.title), evidenceBadge(i.level)), h('p', null, i.text), i.refs ? cite(i.refs) : null)) })));
  return wrap;
}

// ------------------------------------------------------------------ Durée
function duration({ r, nights, goal }) {
  const wrap = h('div');
  const s = summarize(nights, r);
  const series = dailySeries(nights, r.from, r.to);
  const roll = rolling(series, 7, 4);
  wrap.append(plate({
    eyebrow: `${r.label}`, title: 'Combien ai-je dormi, nuit après nuit ?', aside: nBadge(s.tst.n, s.tst.missing),
    children: [
      durationChart({ series: series.map(x => ({ key: x.key, tst: x.value, tib: x.item?.m.tib ?? null, id: x.item?.e.id })), rollingSeries: roll, goal, height: 240 }),
      legend([['', 'var(--moon)', 'Temps de sommeil'], ['', 'var(--bed)', 'Temps au lit (sans temps de sommeil : contour pointillé)'], ['line', 'var(--fg-1)', 'Moyenne glissante 7 j (≥ 4 nuits)'], ['dash', 'var(--dawn)', 'Objectif'], ['hatch', '', 'Non renseignée']]),
      dataTable(['Date', 'Sommeil', 'Au lit', 'Moy. 7 j'], series.map((x, i) => [x.key, fmtDuration(x.value), fmtDuration(x.item?.m.tib ?? null), fmtDuration(roll[i].value)])),
      methodDetails('tst'),
    ],
  }));
  wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Statistiques descriptives', title: 'Quelle est la dispersion de mes nuits ?', children: [
    statRowTable([['Temps de sommeil', s.tst, v => fmtDuration(v)], ['Temps au lit', s.tib, v => fmtDuration(v)], ['Coucher', { ...s.bedClock, median: null, min: null, max: null, sd: s.bedSd }, clockFmt], ['Réveil final', { ...s.wakeClock, median: null, min: null, max: null, sd: s.wakeSd }, clockFmt]]),
    h('p', { class: 'small faint' }, 'Heures : moyenne et écart-type circulaires (la médiane, le minimum et le maximum n\'ont pas de sens sur une horloge et ne sont pas affichés). ∅ = valeur non calculable.'),
    methodDetails('clockstats'),
  ] })));

  const tstVals = nights.map(x => x.m.tst).filter(v => v !== null);
  const weekly = aggregate(series, 'week', 3);
  const monthly = aggregate(series, 'month', 5);
  wrap.append(h('div', { class: 'grid2 section' },
    plate({ eyebrow: 'Distribution', title: 'Mes nuits typiques', aside: nBadge(tstVals.length), children: tstVals.length >= 7 ? [histogram({ values: tstVals, goal }), h('p', { class: 'small faint' }, 'Tranches de 30 minutes. Ligne pointillée : objectif.')] : insufficient('Il faut au moins 7 nuits avec un temps de sommeil pour une distribution lisible.') }),
    plate({ eyebrow: 'Par semaine et par mois', title: 'Comment évolue la moyenne ?', children: weekly.filter(w => !w.insufficient).length >= 2 ? [
      lineChart({ keys: weekly.map(w => w.key), series: [{ name: 'Moyenne hebdo', color: 'var(--moon)', points: weekly.map(w => ({ key: w.key, value: w.mean })) }], yFormat: v => fmtDuration(v, { compact: true }), refLine: goal, labelText: 'Moyenne hebdomadaire du temps de sommeil' }),
      h('p', { class: 'small faint' }, 'Semaines commençant le lundi ; moyenne publiée à partir de 3 nuits renseignées dans la semaine.'),
      dataTable(['Période', 'n', 'Moyenne', 'Médiane'], [...weekly.map(w => [`sem. du ${w.key}`, String(w.n), fmtDuration(w.mean), fmtDuration(w.median)]), ...monthly.map(mo => [mo.key, String(mo.n), fmtDuration(mo.mean), fmtDuration(mo.median)])], 'Voir les moyennes hebdomadaires et mensuelles'),
    ] : insufficient('Au moins deux semaines avec 3 nuits renseignées sont nécessaires.') })));

  const bal = cumulativeBalance(dailySeries(nights, addDays(r.to, -6), r.to), goal, 7);
  const t = trend(series);
  wrap.append(h('div', { class: 'grid2 section' },
    plate({ eyebrow: 'Sommeil cumulé', title: 'Bilan des 7 dernières nuits', children: bal.insufficient ? insufficient(`${bal.known} nuit(s) connue(s) sur 7 : il en faut au moins 5 pour un bilan.`) : [
      h('p', { class: 'display small-display' }, fmtDuration(bal.balance, { signed: true })),
      h('p', { class: 'small muted' }, `Somme des écarts à votre objectif (${fmtDuration(goal)}) sur ${bal.known} nuit(s) connue(s)${bal.complete ? '' : ' : les nuits manquantes ne sont pas comptées'}.`),
      methodDetails('balance')] }),
    plate({ eyebrow: 'Tendance', title: 'Mon sommeil évolue-t-il durablement ?', children: t.insufficient ? insufficient(`${t.n} nuit(s) sur la période : 14 sont nécessaires pour estimer une tendance.`) : [
      h('p', { class: 'display small-display' }, `${fmtDuration(t.slopePerWeek, { signed: true })}`, h('span', { class: 'unit' }, '/sem.')),
      h('p', { class: 'small muted' }, `${t.p < 0.05 ? 'Tendance statistiquement nette' : 'Pas de tendance nette'} (Mann–Kendall ${fmtP(t.p)}, n = ${t.n}).`),
      methodDetails('trend')] })));
  return wrap;
}

// ------------------------------------------------------------------ Horaires
function timing({ p, r, nights, naps }) {
  const wrap = h('div');
  const { nights: list } = onePerNight(nights);
  const byKey = new Map(list.map(x => [x.m.nightKey, x]));
  const napBy = new Map();
  for (const n of naps) napBy.set(n.m.nightKey, [...(napBy.get(n.m.nightKey) || []), { a: n.m.bedClock, b: n.m.wakeClock }]);
  const keys = keyRange(r.days > 120 ? addDays(r.to, -119) : r.from, r.to);
  const rows = keys.map(k => { const x = byKey.get(k); return x ? { key: k, bed: x.m.bedClock, onset: x.m.onsetClock, wake: x.m.wakeClock, out: x.m.outClock, naps: napBy.get(k), id: x.e.id } : { key: k, bed: null, naps: napBy.get(k) }; });
  wrap.append(plate({
    eyebrow: r.days > 120 ? '120 derniers jours' : r.label, title: 'À quelles heures ai-je dormi ?', aside: nBadge(list.length),
    children: [timingChart({ rows }), legend([['', 'var(--bed)', 'Au lit'], ['', 'var(--moon)', 'Sommeil estimé'], ['', 'var(--dusk)', 'Coucher'], ['', 'var(--dawn)', 'Réveil'], ['', 'var(--nap)', 'Sieste'], ['hatch', '', 'Non renseignée']]),
      h('p', { class: 'small faint' }, 'Actogramme : une ligne par jour (date du réveil), axe de 18 h à 14 h. Des barres alignées verticalement signalent des horaires réguliers.')],
  }));
  const series = dailySeries(nights, r.from, r.to, 'bedClock');
  const wakeS = dailySeries(nights, r.from, r.to, 'wakeClock');
  const s = summarize(nights, r);
  wrap.append(h('div', { class: 'section' }, plate({
    eyebrow: 'Coucher et réveil', title: 'Mes horaires dérivent-ils ?',
    children: [
      h('div', { class: 'grid2' },
        lineChart({ keys: series.map(x => x.key), series: [{ name: 'Coucher', color: 'var(--dusk)', points: series }], clock: true, height: 160, labelText: 'Heure de coucher par nuit' }),
        lineChart({ keys: wakeS.map(x => x.key), series: [{ name: 'Réveil', color: 'var(--dawn)', points: wakeS }], clock: true, height: 160, labelText: 'Heure de réveil par nuit' })),
      h('dl', { class: 'kv' },
        h('div', null, h('dt', null, 'Coucher moyen'), h('dd', null, s.bedClock.insufficient ? '—' : fmtClock(s.bedClock.mean), h('small', null, s.bedSd !== null ? ` ± ${fmtDuration(s.bedSd)}` : ' (dispersion : 5 nuits min.)'))),
        h('div', null, h('dt', null, 'Réveil moyen'), h('dd', null, s.wakeClock.insufficient ? '—' : fmtClock(s.wakeClock.mean), h('small', null, s.wakeSd !== null ? ` ± ${fmtDuration(s.wakeSd)}` : ''))),
        h('div', null, h('dt', null, 'Milieu du sommeil moyen'), h('dd', null, s.midSleep.insufficient ? '—' : fmtClock(s.midSleep.mean)))),
      methodDetails('clockstats'),
    ],
  })));
  return wrap;
}

// ------------------------------------------------------------------ Régularité et rythme
function rhythm({ p, r, nights, naps, goal }) {
  const wrap = h('div');
  const sri = sleepRegularityIndex(nights, naps);
  const wf = workFree(nights);
  wrap.append(h('div', { class: 'grid2' },
    plate({ eyebrow: 'Indice de régularité (SRI)', title: 'Mon sommeil tombe-t-il aux mêmes heures ?', aside: evidenceBadge('research'), children: sri.insufficient
      ? [insufficient(`${sri.pairs} paire(s) de jours consécutifs renseignés : il en faut ${THRESHOLDS.sriPairs}. Les jours sans saisie ne sont jamais supposés éveillés.`), methodDetails('sri')]
      : [h('p', { class: 'display' }, fmtNumber(sri.sri), h('span', { class: 'unit' }, '/ 100')), sriGauge(sri.sri),
        h('p', { class: 'small muted' }, `Calculé sur ${sri.pairs} paires de jours consécutifs (${fmtNumber(sri.minutesCompared)} minutes comparées). 100 = mêmes états veille/sommeil à 24 h d'intervalle ; 0 = aucun lien.`),
        methodDetails('sri')] }),
    plate({ eyebrow: 'Jet-lag social', title: 'Le week-end décale-t-il mon horloge ?', aside: evidenceBadge('research'), children: wf.insufficient
      ? [insufficient(`Jours libres : ${wf.free.n} (2 requis) · jours travaillés : ${wf.work.n} (3 requis).`), methodDetails('sjl')]
      : [h('p', { class: 'display' }, fmtDuration(wf.socialJetlag)),
        h('p', { class: 'small muted' }, `Milieu du sommeil : ${fmtClock(wf.work.mid.mean)} les jours travaillés (n=${wf.work.n}), ${fmtClock(wf.free.mid.mean)} les jours libres (n=${wf.free.n}).`),
        methodDetails('sjl')] })));

  const rows = [['Temps de sommeil', 'tst', fmtDuration], ['Coucher', 'bed', fmtClock], ['Réveil', 'wake', fmtClock]];
  wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Semaine et week-end', title: 'En quoi mes jours libres diffèrent-ils ?', children: [
    h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tableau de données' }, h('table', { class: 'data-table' },
      h('thead', null, h('tr', null, h('th', null, h('span', { class: 'sr-only' }, 'Indicateur')), h('th', null, `Jours travaillés (n=${wf.work.n})`), h('th', null, `Jours libres (n=${wf.free.n})`))),
      h('tbody', null, rows.map(([label, k, f]) => h('tr', null, h('th', { scope: 'row' }, label),
        ...['work', 'free'].map(g => { const d = wf[g][k]; return h('td', null, d.insufficient ? 'insuffisant' : f(d.mean)); })))))),
    h('p', { class: 'small faint' }, 'Jour libre : celui que vous avez indiqué, sinon un réveil le samedi ou le dimanche. Modifiable dans chaque nuit.'),
  ] })));

  const { nights: list } = onePerNight(nights);
  const groups = [1, 2, 3, 4, 5, 6, 0].map(wd => {
    const xs = list.filter(x => x.m.weekday === wd);
    const d = describe(xs.map(x => x.m.tst), { minN: 2 });
    return { label: WEEKDAYS_SHORT[wd], longLabel: `Réveil le ${WEEKDAYS_LONG[wd]}`, mean: d.mean, n: d.n, free: wd === 0 || wd === 6 };
  });
  const varTst = describe(list.map(x => x.m.tst), { minN: THRESHOLDS.spread });
  wrap.append(h('div', { class: 'grid2 section' },
    plate({ eyebrow: 'Profil hebdomadaire', title: 'Quels jours dors-je le moins ?', children: [weekdayChart({ groups, goal }), h('p', { class: 'small faint' }, 'Moyenne par jour du réveil, publiée à partir de 2 nuits.')] }),
    plate({ eyebrow: 'Variabilité de la durée', title: 'Mes nuits se ressemblent-elles ?', children: varTst.insufficient ? insufficient('Au moins 5 nuits avec temps de sommeil sont nécessaires.') : [
      h('p', { class: 'display small-display' }, `± ${fmtDuration(varTst.sd)}`),
      h('p', { class: 'small muted' }, `Écart-type du temps de sommeil (n = ${varTst.n}). Écart interquartile : ${fmtDuration(varTst.q1)} – ${fmtDuration(varTst.q3)}.`)] })));
  return wrap;
}

function sriGauge(v) {
  const pct = Math.max(0, Math.min(100, v));
  return h('div', { class: 'gauge', role: 'img', 'aria-label': `SRI ${fmtNumber(v)} sur une échelle de 0 à 100` },
    h('div', { class: 'gauge-track' }, h('i', { style: { width: pct + '%' } })),
    h('div', { class: 'gauge-scale micro faint mono' }, h('span', null, '0'), h('span', null, '50'), h('span', null, '100')));
}

// ------------------------------------------------------------------ Qualité et continuité
function quality({ r, nights }) {
  const wrap = h('div');
  const s = summarize(nights, r);
  wrap.append(h('div', { class: 'stats four' },
    statTile({ label: 'Latence médiane', value: s.sol.insufficient ? '—' : `${Math.round(s.sol.median)} min`, na: s.sol.insufficient, meta: `n=${s.sol.n}${s.sol.missing ? ` · ${s.sol.missing} ∅` : ''}` }),
    statTile({ label: 'Éveil nocturne', value: s.waso.insufficient ? '—' : `${Math.round(s.waso.median)} min`, na: s.waso.insufficient, meta: `médiane · n=${s.waso.n}` }),
    statTile({ label: 'Réveils / nuit', value: s.awakenings.insufficient ? '—' : fmtNumber(s.awakenings.mean, 1), na: s.awakenings.insufficient, meta: `n=${s.awakenings.n}` }),
    statTile({ label: 'Qualité ressentie', value: s.quality.insufficient ? '—' : `${fmtNumber(s.quality.mean, 1)}/5`, na: s.quality.insufficient, meta: `n=${s.quality.n}` })));

  const { nights: list } = onePerNight(nights);
  wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Repères NSF de bonne qualité (adultes)', title: 'Combien de nuits atteignent les repères ?', aside: evidenceBadge('consensus'), children: [
    h('div', { class: 'markers' }, QUALITY_MARKERS.map(q => {
      const vals = list.map(x => x.m[q.key]).filter(v => v !== null);
      const ok = vals.filter(q.test).length;
      return h('div', { class: 'marker' },
        h('p', { class: 'small' }, q.label, h('span', { class: 'faint' }, ` · repère ${q.good}`)),
        vals.length >= 3 ? h('div', { class: 'gauge-track' }, h('i', { style: { width: (ok / vals.length * 100) + '%' } })) : null,
        h('p', { class: 'micro faint mono' }, vals.length >= 3 ? `${ok}/${vals.length} nuits (${fmtPct(ok / vals.length * 100)})` : `données insuffisantes (n=${vals.length})`),
        q.note ? h('p', { class: 'micro faint' }, q.note) : null);
    })),
    h('p', { class: 'small faint' }, 'Repères décrits comme associés à une bonne qualité de sommeil. Ce ne sont pas des seuils de diagnostic.'),
    cite(['ohayon2017']),
  ] })));

  const mk = key => dailySeries(nights, r.from, r.to, key);
  const panel = (title, question, key, color, opts = {}) => {
    const sr = mk(key);
    const n = sr.filter(x => x.value !== null).length;
    return plate({ eyebrow: title, title: question, aside: nBadge(n), children: n >= 3
      ? [lineChart({ keys: sr.map(x => x.key), series: [{ name: title, color, points: sr }], height: 150, yFormat: opts.fmt, band: opts.band, labelText: question }), opts.method ? methodDetails(opts.method) : null]
      : insufficient('Au moins 3 nuits renseignées sont nécessaires.') });
  };
  wrap.append(h('div', { class: 'grid2 section' },
    panel('Latence', 'Combien de temps pour m\'endormir ?', 'sol', 'var(--dusk)', { fmt: v => `${Math.round(v)} min`, band: [0, 30], method: 'sol' }),
    panel('Éveil nocturne', 'Combien de temps éveillé la nuit ?', 'waso', 'var(--attention)', { fmt: v => `${Math.round(v)} min`, band: [0, 20], method: 'waso' }),
    panel('Efficacité', 'Quelle part du temps au lit ai-je dormi ?', 'se', 'var(--moon)', { fmt: v => `${Math.round(v)} %`, band: [85, 100], method: 'se' }),
    panel('Temps au lit', 'Combien de temps au lit ?', 'tib', 'var(--bed)', { fmt: v => fmtDuration(v, { compact: true }), method: 'tib' }),
    panel('Qualité ressentie', 'Comment ai-je jugé mes nuits ?', 'quality', 'var(--positive)', { fmt: v => fmtNumber(v, 1) }),
    panel('Réveil', 'Mes réveils ont-ils été faciles ?', 'wakeEase', 'var(--dawn)', { fmt: v => fmtNumber(v, 1) })));
  wrap.append(h('p', { class: 'small faint section-note' }, 'Bandes vertes : repères NSF de bonne qualité (latence ≤ 30 min, éveil ≤ 20 min, efficacité ≥ 85 %).'));
  return wrap;
}

// ------------------------------------------------------------------ Habitudes
function habits({ app, r, nights }) {
  const wrap = h('div');
  const res = associations(nights, habitOutcome);
  const outcome = OUTCOMES.find(o => o.key === habitOutcome);
  const bool = res.filter(x => x.method === 'welch' && !x.insufficient);
  const num = res.filter(x => x.method === 'spearman' && !x.insufficient);
  const skipped = res.filter(x => x.insufficient);
  const fmtU = v => fmtMetric(habitOutcome, v, { signed: true });
  wrap.append(h('div', { class: 'banner info', role: 'note' }, icon('info'), h('span', { class: 'grow' }, h('b', null, 'Analyses exploratoires. '), 'Une association signifie que deux choses varient ensemble dans vos données, pas que l\'une cause l\'autre. Utilisez-les pour choisir une expérience, pas pour conclure.')));
  wrap.append(h('div', { class: 'toolbar' }, h('span', { class: 'small muted' }, 'Indicateur étudié :'), segmented(OUTCOMES.map(o => [o.key, o.label]), habitOutcome, v => { habitOutcome = v; app.rerender(); }, 'Indicateur étudié')));
  wrap.append(plate({ eyebrow: `Facteurs oui / non · ${r.label}`, title: `Mes nuits diffèrent-elles selon mes habitudes ?`, aside: evidenceBadge('personal'), children: bool.length ? [
    intervalChart({ rows: bool.map(b => ({ label: b.factor.label, meta: `oui n=${b.nYes} · non n=${b.nNo}`, diff: b.diff, ci: b.ci, highlight: b.robust, extra: [['Avec', fmtMetric(habitOutcome, b.meanB)], ['Sans', fmtMetric(habitOutcome, b.meanA)], ['p (corrigé)', fmtP(b.pAdj)]] })), unitFormat: fmtU }),
    h('p', { class: 'small faint' }, `Point : différence de ${outcome.label.toLowerCase()} moyenne (nuits « oui » − nuits « non ») ; trait : intervalle de confiance à 95 %. En ambre : association qui résiste à la correction pour comparaisons multiples (Benjamini–Hochberg).`),
    dataTable(['Facteur', 'Oui (n)', 'Non (n)', 'Différence', 'IC 95 %', 'p brut', 'p corrigé'], bool.map(b => [b.factor.label, String(b.nYes), String(b.nNo), fmtU(b.diff), `${fmtU(b.ci[0])} à ${fmtU(b.ci[1])}`, fmtP(b.p), fmtP(b.pAdj)])),
    methodDetails('assoc'),
  ] : insufficient(`Aucun facteur oui/non n'a au moins ${THRESHOLDS.association} nuits dans chaque groupe sur cette période. Renseignez le contexte de vos journées pour activer ces comparaisons.`) }));
  if (num.length) wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Facteurs numériques', title: 'Plus de… est-il associé à plus ou moins de… ?', children: [
    h('div', { class: 'list' }, num.map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, x.factor.label), h('p', { class: 'sub' }, `ρ de Spearman = ${fmtNumber(x.rho, 2)} · n = ${x.n} · ${fmtP(x.pAdj)} (corrigé)`)), h('span', { class: ['evidence', x.robust ? 'personal' : 'demo'] }, x.robust ? 'net' : 'incertain')))),
    h('p', { class: 'small faint' }, 'ρ va de −1 (relation inverse) à +1 (relation directe) ; 0 = pas de relation monotone.'),
  ] })));
  if (skipped.length) wrap.append(h('p', { class: 'small faint section-note' }, `Non testés faute de données : ${skipped.map(x => x.factor.label.toLowerCase()).join(', ')}.`));
  return wrap;
}

// ------------------------------------------------------------------ Comparer
function compare({ app, p, goal }) {
  const today = app.todayKey();
  compareState ||= { mode: 'periods', a: { from: addDays(today, -59), to: addDays(today, -30) }, b: { from: addDays(today, -29), to: today }, pivot: addDays(today, -20), span: 21 };
  const st = compareState;
  const wrap = h('div');
  const dateIn = (obj, key, label) => h('label', { class: 'field' }, h('span', null, label), h('input', { type: 'date', value: obj[key], max: today, onchange: e => { if (e.target.value) { obj[key] = e.target.value; app.rerender(); } } }));
  let A, B, titleA, titleB;
  if (st.mode === 'pivot') {
    A = { from: addDays(st.pivot, -st.span), to: addDays(st.pivot, -1) };
    B = { from: st.pivot, to: addDays(st.pivot, st.span - 1) };
    titleA = 'Avant'; titleB = 'Après';
  } else { A = st.a; B = st.b; titleA = 'Période A'; titleB = 'Période B'; }
  wrap.append(plate({ eyebrow: 'Paramètres', title: st.mode === 'pivot' ? 'Avant / après un changement d\'habitude' : 'Comparer deux périodes', children: [
    segmented([['periods', 'Deux périodes'], ['pivot', 'Avant / après']], st.mode, v => { st.mode = v; app.rerender(); }, 'Type de comparaison'),
    st.mode === 'pivot'
      ? h('div', { class: 'fields two section-sm' }, dateIn(st, 'pivot', 'Date du changement'), h('label', { class: 'field' }, h('span', null, 'Fenêtre de chaque côté'), h('select', { onchange: e => { st.span = +e.target.value; app.rerender(); } }, [7, 14, 21, 30, 60].map(v => h('option', { value: v, selected: v === st.span }, `${v} jours`)))))
      : h('div', { class: 'fields two section-sm' }, dateIn(st.a, 'from', 'A : du'), dateIn(st.a, 'to', 'A : au'), dateIn(st.b, 'from', 'B : du'), dateIn(st.b, 'to', 'B : au')),
  ] }));
  if (A.from > A.to || B.from > B.to) { wrap.append(insufficient('Chaque période doit commencer avant de finir.')); return wrap; }
  const cmp = comparePeriods(p.nights, A, B);
  const label = k => LABELS[k];
  const f = (k, v, signed) => fmtMetric(k, v, { signed });
  wrap.append(h('div', { class: 'section' }, plate({
    eyebrow: `${titleA} : ${fmtDateKey(A.from, { day: 'numeric', month: 'short' })} → ${fmtDateKey(A.to, { day: 'numeric', month: 'short' })} (${cmp.nA} nuits) · ${titleB} : ${fmtDateKey(B.from, { day: 'numeric', month: 'short' })} → ${fmtDateKey(B.to, { day: 'numeric', month: 'short' })} (${cmp.nB} nuits)`,
    title: 'Qu\'est-ce qui a changé ?', aside: evidenceBadge('personal'),
    children: [
      h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tableau de données' }, h('table', { class: 'data-table' },
        h('thead', null, h('tr', null, ['Indicateur', titleA, titleB, 'Écart', 'IC 95 %', 'p', 'n'].map(x => h('th', { scope: 'col' }, x)))),
        h('tbody', null, cmp.rows.map(row => h('tr', null, h('th', { scope: 'row' }, label(row.key)),
          ...(row.insufficient ? [h('td', { colspan: 5, class: 'faint' }, `insuffisant (min. ${THRESHOLDS.describe} nuits par période)`), h('td', null, `${row.nA}/${row.nB}`)] : [
            h('td', null, row.key.endsWith('Clock') ? fmtClock(row.ref + row.meanA) : f(row.key, row.meanA)),
            h('td', null, row.key.endsWith('Clock') ? fmtClock(row.ref + row.meanB) : f(row.key, row.meanB)),
            h('td', { class: deltaClass(row) }, f(row.key, row.diff, true)),
            h('td', null, `${f(row.key, row.ci[0], true)} à ${f(row.key, row.ci[1], true)}`),
            h('td', null, fmtP(row.p)), h('td', null, `${row.nA}/${row.nB}`)])))))),
      (() => {
        const rows = cmp.rows.filter(x => !x.insufficient && ['tst', 'tib', 'sol', 'waso', 'bedClock', 'wakeClock'].includes(x.key));
        return rows.length ? intervalChart({ rows: rows.map(x => ({ label: label(x.key), diff: x.diff, ci: x.ci, highlight: x.p < 0.05 })), unitFormat: v => fmtDuration(v, { signed: true }) }) : null;
      })(),
      h('p', { class: 'small faint' }, `Écart = ${titleB} − ${titleA}, test t de Welch. Avant / après ne prouve pas que le changement d'habitude est la cause : d'autres choses ont pu changer en même temps (saison, travail, santé).`),
    ],
  })));
  return wrap;
}
function deltaClass(row) {
  const dir = DIRECTION[row.key];
  if (row.p >= 0.05 || !dir) return 'delta neutral';
  return Math.sign(row.diff) === dir ? 'delta positive' : 'delta attention';
}

// ------------------------------------------------------------------ Données
function data({ app, p, r }) {
  const q = dataQuality(p, r.from, r.to);
  const { nights: list } = onePerNight(inRange(p.nights, r.from, r.to));
  const byKey = new Map(list.map(x => [x.m.nightKey, x]));
  const invalidKeys = new Set(p.invalid.map(x => (x.e.finalWake || x.e.outOfBed || x.e.bedtime || '').slice(0, 10)));
  const days = keyRange(r.days > 366 ? addDays(r.to, -365) : r.from, r.to).map(k => {
    const x = byKey.get(k);
    return { key: k, status: x ? (x.m.tst !== null ? 'full' : 'partial') : invalidKeys.has(k) ? 'invalid' : 'missing' };
  });
  const src = {};
  for (const x of list) src[x.e.source?.kind || 'manual'] = (src[x.e.source?.kind || 'manual'] || 0) + 1;
  const SRC = { manual: 'Saisie manuelle', session: 'Session Somnia', import: 'Import', 'legacy-v1': 'Somnia v1', demo: 'Démonstration' };
  const pct = (a, b) => (b ? fmtPct(a / b * 100) : '—');
  const wrap = h('div');
  wrap.append(plate({ eyebrow: r.label, title: 'Quelles données soutiennent ces analyses ?', children: [
    completenessStrip({ days }),
    legend([['', 'var(--moon)', 'Nuit complète (temps de sommeil calculable)'], ['', 'var(--bed)', 'Nuit incomplète'], ['hatch', '', 'Aucune saisie'], ['', 'var(--attention)', 'Saisie incohérente (exclue)']]),
  ] }));
  wrap.append(h('div', { class: 'grid2 section' },
    plate({ eyebrow: 'Couverture', title: 'Effectifs', children: h('dl', { class: 'kv' },
      ...[['Jours de la période', q.days], ['Nuits renseignées', `${q.recorded} (${pct(q.recorded, q.days)})`], ['Jours sans saisie', q.missingDays], ['Doublons fusionnés', q.duplicates], ['Saisies incohérentes exclues', q.invalid],
        ['Latence renseignée', `${q.solKnown}/${q.recorded}`], ['Éveils renseignés', `${q.wasoKnown}/${q.recorded}`], ['Temps de sommeil calculable', `${q.tstKnown}/${q.recorded}`], ['Efficacité calculable', `${q.seKnown}/${q.recorded}`], ['Qualité renseignée', `${q.qualityKnown}/${q.recorded}`]]
        .map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, String(v))))) }),
    plate({ eyebrow: 'Provenance', title: 'D\'où viennent les données ?', children: [
      h('dl', { class: 'kv' }, Object.entries(src).map(([k, v]) => h('div', null, h('dt', null, SRC[k] || k), h('dd', null, String(v))))),
      h('p', { class: 'small faint' }, `${q.measured} nuit(s) avec un temps de sommeil mesuré par un appareil ; toutes les autres valeurs sont déclarées.`),
      p.invalid.length ? h('div', { class: 'list' }, p.invalid.slice(0, 10).map(x => h('a', { href: `#/entry/${x.e.id}/edit` }, icon('warning'), h('span', { class: 'grow' }, h('span', null, (x.e.bedtime || '').slice(0, 10) || 'date inconnue'), h('span', { class: 'sub', style: { display: 'block' } }, x.m.errors[0])), icon('chevronRight', { class: 'chev' })))) : null,
    ] })));
  wrap.append(h('div', { class: 'section prose small' }, h('p', null, 'Règles : une valeur absente n\'est jamais remplacée par zéro ; une statistique n\'est publiée qu\'au-delà d\'un effectif minimal (3 nuits pour une moyenne, 5 pour une dispersion, 7 paires de jours pour le SRI, 14 nuits pour une tendance). '), h('a', { href: '#/science/metrics' }, 'Toutes les définitions')));
  return wrap;
}
