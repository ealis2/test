// Analyses sur plusieurs épisodes : agrégats, régularité, rythme, tendances,
// changements inhabituels, associations exploratoires et comparaisons de périodes.
//
// Principe : chaque fonction renvoie ses effectifs (n), les valeurs manquantes
// et un drapeau `insufficient` lorsque le minimum de données n'est pas atteint.

import { computeEpisode } from './metrics.js';
import { describe, circularDescribe, clockDiff, welch, theilSen, mannKendall, spearman, benjaminiHochberg, mean } from './stats.js';
import { toMs, daysBetweenKeys, addDays, keyRange, zonedToMs, MIN, DAY_MIN } from './time.js';
import { FACTORS } from './model.js';

/** Seuils minimaux de publication, documentés dans docs/METRICS.md. */
export const THRESHOLDS = {
  describe: 3,          // moyenne, médiane, min, max
  spread: 5,            // écarts-types et variabilité
  sriPairs: 7,          // paires de jours consécutifs pour l'indice de régularité
  jetlagFree: 2, jetlagWork: 3,
  trend: 14,            // nuits pour une tendance
  change: { recent: 5, baseline: 10 },
  association: 5,       // nuits par groupe (avec / sans facteur)
  spearman: 10,
};

/** Calcule les indicateurs de chaque épisode et sépare valides / invalides. */
export function prepare(episodes) {
  const computed = episodes.map(e => ({ e, m: computeEpisode(e) }));
  const valid = computed.filter(x => x.m.valid);
  const invalid = computed.filter(x => !x.m.valid);
  return {
    all: computed,
    nights: valid.filter(x => x.e.type === 'night').sort((a, b) => toMs(a.e.bedtime) - toMs(b.e.bedtime)),
    naps: valid.filter(x => x.e.type === 'nap').sort((a, b) => toMs(a.e.bedtime) - toMs(b.e.bedtime)),
    invalid,
  };
}

/** Filtre les nuits dont la date (jour du réveil) est dans [from, to] (clés AAAA-MM-JJ). */
export function inRange(items, from, to) {
  return items.filter(x => x.m.nightKey && (!from || x.m.nightKey >= from) && (!to || x.m.nightKey <= to));
}

/** Plage de dates correspondant aux N derniers jours se terminant à `todayKey`. */
export function periodRange(days, todayKey) {
  return { from: addDays(todayKey, -(days - 1)), to: todayKey, days };
}

/**
 * Plusieurs épisodes peuvent tomber le même jour (nuit fractionnée). Pour les
 * statistiques « par nuit », on retient la nuit la plus longue de chaque date
 * et on signale les doublons.
 */
export function onePerNight(nights) {
  const byKey = new Map();
  let duplicates = 0;
  for (const x of nights) {
    const cur = byKey.get(x.m.nightKey);
    if (!cur) byKey.set(x.m.nightKey, x);
    else {
      duplicates++;
      if ((x.m.tib ?? 0) > (cur.m.tib ?? 0)) byKey.set(x.m.nightKey, x);
    }
  }
  return { nights: [...byKey.values()].sort((a, b) => (a.m.nightKey < b.m.nightKey ? -1 : 1)), duplicates };
}

/** Synthèse complète d'une période. */
export function summarize(nights, { from, to } = {}) {
  const { nights: list, duplicates } = onePerNight(nights);
  const pick = k => list.map(x => x.m[k]);
  const expectedDays = from && to ? daysBetweenKeys(from, to) + 1 : null;
  return {
    n: list.length,
    duplicates,
    expectedDays,
    missingDays: expectedDays !== null ? Math.max(0, expectedDays - list.length) : null,
    tst: describe(pick('tst'), { minN: THRESHOLDS.describe }),
    tib: describe(pick('tib'), { minN: THRESHOLDS.describe }),
    sol: describe(pick('sol'), { minN: THRESHOLDS.describe }),
    waso: describe(pick('waso'), { minN: THRESHOLDS.describe }),
    awakenings: describe(pick('awakenings'), { minN: THRESHOLDS.describe }),
    se: describe(pick('se'), { minN: THRESHOLDS.describe }),
    quality: describe(pick('quality'), { minN: THRESHOLDS.describe }),
    wakeEase: describe(pick('wakeEase'), { minN: THRESHOLDS.describe }),
    bedClock: circularDescribe(pick('bedClock'), { minN: THRESHOLDS.describe }),
    wakeClock: circularDescribe(pick('wakeClock'), { minN: THRESHOLDS.describe }),
    outClock: circularDescribe(pick('outClock'), { minN: THRESHOLDS.describe }),
    midSleep: circularDescribe(pick('midSleepClock'), { minN: THRESHOLDS.describe }),
    tstSd: describe(pick('tst'), { minN: THRESHOLDS.spread }).sd,
    bedSd: circularDescribe(pick('bedClock'), { minN: THRESHOLDS.spread }).sd,
    wakeSd: circularDescribe(pick('wakeClock'), { minN: THRESHOLDS.spread }).sd,
  };
}

// ---------------------------------------------------------------------------
// Semaine / week-end et jet-lag social (Wittmann et al., 2006).
// Jet-lag social = |milieu du sommeil des jours libres − milieu du sommeil des jours travaillés|.

export function workFree(nights) {
  const { nights: list } = onePerNight(nights);
  const free = list.filter(x => x.m.freeDay), work = list.filter(x => !x.m.freeDay);
  const msf = circularDescribe(free.map(x => x.m.midSleepClock), { minN: THRESHOLDS.jetlagFree });
  const msw = circularDescribe(work.map(x => x.m.midSleepClock), { minN: THRESHOLDS.jetlagWork });
  const jetlag = !msf.insufficient && !msw.insufficient ? Math.abs(clockDiff(msw.mean, msf.mean)) : null;
  return {
    free: { n: free.length, tst: describe(free.map(x => x.m.tst), { minN: THRESHOLDS.jetlagFree }), bed: circularDescribe(free.map(x => x.m.bedClock), { minN: THRESHOLDS.jetlagFree }), wake: circularDescribe(free.map(x => x.m.wakeClock), { minN: THRESHOLDS.jetlagFree }), mid: msf },
    work: { n: work.length, tst: describe(work.map(x => x.m.tst), { minN: THRESHOLDS.jetlagWork }), bed: circularDescribe(work.map(x => x.m.bedClock), { minN: THRESHOLDS.jetlagWork }), wake: circularDescribe(work.map(x => x.m.wakeClock), { minN: THRESHOLDS.jetlagWork }), mid: msw },
    socialJetlag: jetlag,
    insufficient: jetlag === null,
  };
}

// ---------------------------------------------------------------------------
// Indice de régularité du sommeil (Sleep Regularity Index, Phillips et al., 2017).
//
// SRI = −100 + 200 × P(même état veille/sommeil aux instants t et t + 24 h),
// calculé minute par minute sur les paires de jours consécutifs où l'état est connu.
// État « sommeil » = entre l'endormissement estimé et le réveil final (nuits et siestes).
// Limite : à partir d'un journal, les éveils nocturnes ne sont pas localisés dans
// le temps ; ils sont donc comptés comme du sommeil (approximation documentée).
//
// Un jour « observé » = fenêtre de midi à midi (heure locale) contenant une nuit
// renseignée. Les fenêtres non renseignées sont exclues, jamais supposées éveillées.

export function sleepRegularityIndex(nights, naps = []) {
  const { nights: list } = onePerNight(nights);
  const windows = new Map(); // nightKey → { startMin, endMin } (minutes depuis l'époque Unix)
  for (const x of list) {
    if (x.m.onsetMs === null || !x.e.finalWake) continue;
    const startKey = addDays(x.m.nightKey, -1);
    const start = zonedToMs(startKey, '12:00', x.e.tz) / MIN;
    const end = zonedToMs(x.m.nightKey, '12:00', x.e.tz) / MIN;
    const onset = x.m.onsetMs / MIN, wake = toMs(x.e.finalWake) / MIN;
    if (onset < start || wake > end) continue; // nuit hors fenêtre midi–midi : non comparable
    windows.set(x.m.nightKey, { start: Math.round(start), end: Math.round(end), sleep: [[onset, wake]] });
  }
  for (const nap of naps) {
    if (nap.m.onsetMs === null || !nap.e.finalWake) continue;
    for (const w of windows.values()) {
      const a = nap.m.onsetMs / MIN, b = toMs(nap.e.finalWake) / MIN;
      if (a >= w.start && b <= w.end) w.sleep.push([a, b]);
    }
  }
  const keys = [...windows.keys()].sort();
  let match = 0, total = 0, pairs = 0;
  const asleep = (w, t) => w.sleep.some(([a, b]) => t >= a && t < b);
  for (const k of keys) {
    const next = windows.get(addDays(k, 1));
    if (!next) continue;
    const w = windows.get(k);
    pairs++;
    for (let t = w.start; t < w.end; t++) {
      const t2 = t + DAY_MIN;
      if (t2 < next.start || t2 >= next.end) continue;
      total++;
      if (asleep(w, t) === asleep(next, t2)) match++;
    }
  }
  if (pairs < THRESHOLDS.sriPairs || total === 0) return { insufficient: true, pairs, days: keys.length };
  return { insufficient: false, sri: -100 + 200 * (match / total), pairs, days: keys.length, minutesCompared: total };
}

// ---------------------------------------------------------------------------
// Séries temporelles et moyennes glissantes (sans combler les trous).

/** Série quotidienne de `from` à `to` : une entrée par jour, valeur null si absente. */
export function dailySeries(nights, from, to, key = 'tst') {
  const { nights: list } = onePerNight(nights);
  const byKey = new Map(list.map(x => [x.m.nightKey, x]));
  return keyRange(from, to).map(k => {
    const x = byKey.get(k);
    return { key: k, value: x ? x.m[key] : null, item: x || null };
  });
}

/** Moyenne glissante centrée sur la fin de fenêtre ; null si moins de minN valeurs. */
export function rolling(series, window = 7, minN = 4) {
  return series.map((p, i) => {
    const vals = series.slice(Math.max(0, i - window + 1), i + 1).map(s => s.value).filter(v => v !== null && v !== undefined);
    return { key: p.key, value: vals.length >= minN ? mean(vals) : null, n: vals.length };
  });
}

/** Agrège une série quotidienne par semaine ISO (lundi) ou par mois. */
export function aggregate(series, unit = 'week', minN = 3) {
  const groups = new Map();
  for (const p of series) {
    const [y, m, d] = p.key.split('-').map(Number);
    let g;
    if (unit === 'month') g = `${y}-${String(m).padStart(2, '0')}`;
    else {
      const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lundi
      g = addDays(p.key, -wd);
    }
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p.value);
  }
  return [...groups].map(([key, vals]) => ({ key, ...describe(vals, { minN }) }));
}

/** Bilan cumulé sur les N dernières nuits par rapport à un objectif (interprétation prudente). */
export function cumulativeBalance(series, goalMin, days = 7) {
  const last = series.slice(-days);
  const known = last.filter(p => p.value !== null && p.value !== undefined);
  if (known.length < Math.ceil(days * 0.7)) return { insufficient: true, known: known.length, days };
  const balance = known.reduce((s, p) => s + (p.value - goalMin), 0);
  return { insufficient: false, balance, known: known.length, days, complete: known.length === days };
}

// ---------------------------------------------------------------------------
// Tendance persistante : pente de Theil–Sen (min/semaine) + test de Mann–Kendall.

export function trend(series) {
  const pts = series.map((p, i) => ({ x: i, y: p.value })).filter(p => p.y !== null && p.y !== undefined);
  if (pts.length < THRESHOLDS.trend) return { insufficient: true, n: pts.length };
  const ts = theilSen(pts.map(p => p.x), pts.map(p => p.y));
  const mk = mannKendall(pts.map(p => p.y));
  return { insufficient: false, n: pts.length, slopePerDay: ts.slope, slopePerWeek: ts.slope * 7, intercept: ts.intercept, p: mk.p, tau: mk.tau };
}

// ---------------------------------------------------------------------------
// Changement inhabituel : les `recent` dernières nuits comparées aux `baseline`
// nuits précédentes (test de Welch). Un changement est signalé seulement s'il est
// à la fois statistiquement net (p < 0,05) et assez grand pour compter (seuil
// pratique propre à chaque indicateur).

export const PRACTICAL = { tst: 20, sol: 10, waso: 10, se: 5, quality: 0.5, bedClock: 30, wakeClock: 30 };

export function unusualChanges(nights, { recent = 7, baseline = 28 } = {}) {
  const { nights: list } = onePerNight(nights);
  const rec = list.slice(-recent), base = list.slice(-(recent + baseline), -recent);
  const out = [];
  for (const key of Object.keys(PRACTICAL)) {
    const isClock = key.endsWith('Clock');
    let a = base.map(x => x.m[key]), b = rec.map(x => x.m[key]);
    if (isClock) {
      const ref = circularDescribe(a, { minN: 1 }).mean;
      if (ref === null) continue;
      a = a.map(v => (v === null ? null : clockDiff(ref, v)));
      b = b.map(v => (v === null ? null : clockDiff(ref, v)));
    }
    const w = welch(a, b, { minN: 1 });
    const na = a.filter(v => v !== null).length, nb = b.filter(v => v !== null).length;
    if (w.insufficient || na < THRESHOLDS.change.baseline || nb < THRESHOLDS.change.recent) continue;
    const notable = w.p < 0.05 && Math.abs(w.diff) >= PRACTICAL[key];
    out.push({ key, ...w, notable });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Associations exploratoires entre facteurs déclarés et indicateurs.
// Facteurs oui/non : différence de moyennes (Welch, IC 95 %).
// Facteurs numériques : corrélation de Spearman.
// Les p sont corrigés pour comparaisons multiples (Benjamini–Hochberg).
// Une association n'est JAMAIS présentée comme une cause.

export const OUTCOMES = [
  { key: 'tst', label: 'Temps de sommeil', unit: 'min' },
  { key: 'sol', label: 'Latence d\'endormissement', unit: 'min' },
  { key: 'waso', label: 'Éveils nocturnes', unit: 'min' },
  { key: 'quality', label: 'Qualité ressentie', unit: '/5' },
];

export function associations(nights, outcomeKey = 'tst') {
  const { nights: list } = onePerNight(nights);
  const results = [];
  for (const f of FACTORS) {
    const rows = list.filter(x => x.e.factors && x.e.factors[f.id] !== undefined && x.e.factors[f.id] !== null && x.m[outcomeKey] !== null);
    if (f.kind === 'bool') {
      const yes = rows.filter(x => x.e.factors[f.id] === true).map(x => x.m[outcomeKey]);
      const no = rows.filter(x => x.e.factors[f.id] === false).map(x => x.m[outcomeKey]);
      const w = welch(no, yes, { minN: THRESHOLDS.association });
      results.push({ factor: f, method: 'welch', ...w, nYes: yes.length, nNo: no.length });
    } else {
      const s = spearman(rows.map(x => Number(x.e.factors[f.id])), rows.map(x => x.m[outcomeKey]), { minN: THRESHOLDS.spearman });
      results.push({ factor: f, method: 'spearman', ...s });
    }
  }
  const tested = results.filter(r => !r.insufficient && typeof r.p === 'number');
  const adj = benjaminiHochberg(tested.map(r => r.p));
  tested.forEach((r, i) => { r.pAdj = adj[i]; r.robust = adj[i] < 0.05; });
  return results;
}

// ---------------------------------------------------------------------------
// Comparaison de deux périodes (ou avant / après un changement d'habitude).

export function comparePeriods(nights, a, b) {
  const A = onePerNight(inRange(nights, a.from, a.to)).nights;
  const B = onePerNight(inRange(nights, b.from, b.to)).nights;
  const rows = [];
  for (const key of ['tst', 'tib', 'sol', 'waso', 'se', 'quality', 'bedClock', 'wakeClock']) {
    let va = A.map(x => x.m[key]), vb = B.map(x => x.m[key]);
    let ref = null;
    if (key.endsWith('Clock')) {
      ref = circularDescribe(va.concat(vb), { minN: 1 }).mean;
      if (ref !== null) {
        va = va.map(v => (v === null ? null : clockDiff(ref, v)));
        vb = vb.map(v => (v === null ? null : clockDiff(ref, v)));
      }
    }
    rows.push({ key, ref, ...welch(va, vb, { minN: THRESHOLDS.describe }) });
  }
  return { nA: A.length, nB: B.length, rows };
}

// ---------------------------------------------------------------------------
// Qualité des données sur une période : jours sans saisie, champs manquants, exclusions.

export function dataQuality(prepared, from, to) {
  const nights = inRange(prepared.nights, from, to);
  const days = daysBetweenKeys(from, to) + 1;
  const { nights: list, duplicates } = onePerNight(nights);
  const field = k => list.filter(x => x.m[k] !== null && x.m[k] !== undefined).length;
  const invalid = prepared.invalid.filter(x => {
    const k = x.e.finalWake || x.e.outOfBed || x.e.bedtime;
    return k && k.slice(0, 10) >= from && k.slice(0, 10) <= to;
  });
  return {
    days, recorded: list.length, missingDays: days - list.length, duplicates,
    invalid: invalid.length,
    tstKnown: field('tst'), solKnown: field('sol'), wasoKnown: field('waso'), qualityKnown: field('quality'),
    seKnown: field('se'), measured: list.filter(x => x.m.tstSource === 'measured').length,
    demo: list.filter(x => x.m.demo).length,
  };
}
