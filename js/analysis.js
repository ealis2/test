// Analyse du sommeil : estimation des phases (hypnogramme), score et statistiques.
// Méthode : actigraphie (mouvements de l'iPhone posé sur le matelas) + niveau sonore,
// par époques d'1 minute, combinée au modèle des cycles de ~90 min (Carskadon & Dement).
// C'est une ESTIMATION, comme les applis grand public — pas un diagnostic médical.

export const STAGES = {
  W: { name: 'Éveil', color: 'var(--st-w)', hex: '#f59e9e', level: 0 },
  R: { name: 'Paradoxal (REM)', color: 'var(--st-r)', hex: '#5fd4ff', level: 1 },
  L: { name: 'Léger', color: 'var(--st-l)', hex: '#8b7bff', level: 2 },
  D: { name: 'Profond', color: 'var(--st-d)', hex: '#3b3fb6', level: 3 },
};

const CYCLE = 90;

// Générateur pseudo-aléatoire déterministe (pour que la même nuit donne toujours le même résultat)
function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Modèle théorique de phases (utilisé pour les nuits saisies manuellement
// ou quand aucun capteur n'était disponible).
export function modelStages(durationMin, seed = 'x', latency = 12) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < durationMin; i++) {
    if (i < latency) { out.push(i < latency - 4 ? 'W' : 'L'); continue; }
    const t = i - latency;
    const cycle = Math.floor(t / CYCLE);
    const p = t % CYCLE;
    // Le sommeil profond domine en début de nuit, le paradoxal en fin de nuit.
    const deep = Math.max(0, 40 - cycle * 11);
    const rem = Math.min(38, 10 + cycle * 7);
    let st;
    if (p < 10) st = 'L';
    else if (p < 10 + deep) st = 'D';
    else if (p < CYCLE - rem) st = 'L';
    else st = 'R';
    // Micro-réveils en fin de cycle
    if (p >= CYCLE - 3 && rand() < 0.35) st = 'W';
    if (st === 'D' && rand() < 0.06) st = 'L';
    out.push(st);
  }
  if (out.length > 3) out[out.length - 1] = 'W';
  return out.join('');
}

function percentileRanks(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  return arr.map(v => {
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
    return n > 1 ? lo / (n - 1) : 0;
  });
}

function smooth(arr, w = 2) {
  return arr.map((_, i) => {
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) {
      const v = arr[i + k];
      if (v !== undefined) { const wt = 1 / (1 + Math.abs(k)); s += v * wt; c += wt; }
    }
    return s / c;
  });
}

// Estimation des phases à partir des époques mesurées : [{m: mouvement, n: bruit}]
export function stagesFromEpochs(epochs, seed) {
  const N = epochs.length;
  if (N < 20) return modelStages(N, seed, Math.min(12, N));

  const motion = epochs.map(e => e.m || 0);
  const noise = epochs.map(e => e.n || 0);
  const hasMotion = motion.some(v => v > 0.002);
  const hasNoise = noise.some(v => v > 0.002);
  if (!hasMotion && !hasNoise) return modelStages(N, seed);

  const act = motion.map((m, i) => (hasMotion ? m : 0) * 0.75 + (hasNoise ? noise[i] : 0) * 0.25);
  const s = smooth(act, 2);
  const rank = percentileRanks(s);
  const model = modelStages(N, seed);
  const maxAct = Math.max(...act) || 1;

  const out = [];
  for (let i = 0; i < N; i++) {
    const r = rank[i];
    const strong = act[i] / maxAct > 0.35;
    const half = i < N / 2;
    let st;
    if (r > 0.9 || strong) st = 'W';
    else if (r > 0.6) st = 'L';
    else if (r < (half ? 0.3 : 0.15)) st = 'D';
    else st = 'L';
    // Le paradoxal : corps immobile (atonie) mais pas en sommeil profond,
    // plutôt en fin de cycle et en seconde partie de nuit → on s'aide du modèle.
    if (st !== 'W' && model[i] === 'R' && r < 0.7) st = 'R';
    if (st === 'D' && model[i] === 'R') st = 'R';
    out.push(st);
  }
  // Latence d'endormissement : début de nuit agité = éveil
  for (let i = 0; i < Math.min(N, 30); i++) {
    if (rank[i] > 0.5) out[i] = 'W'; else break;
  }
  out[N - 1] = 'W';
  return mergeShortBouts(out, 3).join('');
}

// Une phase de moins de `min` minutes est absorbée par la phase précédente
// (les vraies phases durent plusieurs minutes ; ça évite un hypnogramme haché).
function mergeShortBouts(arr, min) {
  const out = [...arr];
  for (let pass = 0; pass < 2; pass++) {
    let i = 0;
    while (i < out.length) {
      let j = i;
      while (j < out.length && out[j] === out[i]) j++;
      const keepWake = out[i] === 'W' && (i === 0 || j === out.length || j - i >= 2);
      if (j - i < min && i > 0 && !keepWake) for (let k = i; k < j; k++) out[k] = out[i - 1];
      i = j;
    }
  }
  return out;
}

export function summarize(stages) {
  const c = { W: 0, R: 0, L: 0, D: 0 };
  let awakenings = 0;
  for (let i = 0; i < stages.length; i++) {
    c[stages[i]]++;
    if (stages[i] === 'W' && i > 0 && stages[i - 1] !== 'W') awakenings++;
  }
  const first = stages.search(/[LDR]/);
  const latency = first < 0 ? stages.length : first;
  const inBed = stages.length;
  const asleep = c.R + c.L + c.D;
  return {
    inBed, asleep, latency,
    awake: c.W, rem: c.R, light: c.L, deep: c.D,
    awakenings: Math.max(0, awakenings - 1), // le réveil final ne compte pas
    efficiency: inBed ? asleep / inBed : 0,
  };
}

// Score de 0 à 100 inspiré des critères de la National Sleep Foundation (Ohayon et al., 2017)
export function computeScore(sum, goalMin) {
  const durPts = 40 * Math.min(1, sum.asleep / goalMin) - (sum.asleep > goalMin + 120 ? 5 : 0);
  const effPts = 25 * Math.min(1, Math.max(0, (sum.efficiency - 0.65) / (0.9 - 0.65)));
  const restor = sum.asleep ? (sum.deep + sum.rem) / sum.asleep : 0;
  const phasePts = 20 * Math.min(1, restor / 0.4);
  const latPts = 7 * (sum.latency <= 20 ? 1 : sum.latency <= 45 ? 0.5 : 0);
  const wakePts = 8 * Math.max(0, 1 - sum.awakenings / 6);
  return Math.round(Math.max(0, Math.min(100, durPts + effPts + phasePts + latPts + wakePts)));
}

export function scoreLabel(score) {
  if (score >= 85) return { txt: 'Excellente', cls: 'good' };
  if (score >= 70) return { txt: 'Bonne', cls: 'good' };
  if (score >= 55) return { txt: 'Moyenne', cls: 'warn' };
  return { txt: 'Difficile', cls: 'bad' };
}

// Construit l'objet "nuit" complet
export function buildNight({ id, start, end, epochs = [], events = [], source, seed }, goalMin) {
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  const stages = source === 'capteurs' && epochs.length
    ? stagesFromEpochs(epochs, seed || id)
    : modelStages(minutes, seed || id);
  const sum = summarize(stages);
  return {
    id, start, end, source, stages, events,
    epochs: epochs.map(e => [Math.round(e.m * 1000) / 1000, Math.round(e.n * 1000) / 1000]),
    summary: sum,
    score: computeScore(sum, goalMin),
    mood: null, tags: [], note: '',
  };
}

// ---------- Statistiques sur plusieurs nuits ----------
export function statsFor(nights, days, goalMin) {
  const since = Date.now() - days * 86400e3;
  const list = nights.filter(n => n.start >= since).sort((a, b) => a.start - b.start);
  if (!list.length) return null;
  const avg = f => list.reduce((s, n) => s + f(n), 0) / list.length;

  // Régularité : écart-type de l'heure du coucher (minutes, centré sur minuit)
  const bed = list.map(n => { const d = new Date(n.start); let m = d.getHours() * 60 + d.getMinutes(); if (m < 720) m += 1440; return m; });
  const bedMean = bed.reduce((a, b) => a + b, 0) / bed.length;
  const bedSd = Math.sqrt(bed.reduce((s, m) => s + (m - bedMean) ** 2, 0) / bed.length);
  const wake = list.map(n => { const d = new Date(n.end); return d.getHours() * 60 + d.getMinutes(); });
  const wakeMean = wake.reduce((a, b) => a + b, 0) / wake.length;

  const debt = list.slice(-7).reduce((s, n) => s + (goalMin - n.summary.asleep), 0);

  return {
    list,
    count: list.length,
    avgAsleep: avg(n => n.summary.asleep),
    avgScore: avg(n => n.score),
    avgEff: avg(n => n.summary.efficiency),
    avgDeep: avg(n => n.summary.deep),
    avgRem: avg(n => n.summary.rem),
    avgLight: avg(n => n.summary.light),
    avgAwake: avg(n => n.summary.awake),
    avgLatency: avg(n => n.summary.latency),
    bedMean, bedSd, wakeMean,
    debt,
  };
}

// Impact des habitudes (tags) sur le score
export function tagImpact(nights) {
  const all = nights.filter(n => typeof n.score === 'number');
  if (all.length < 4) return [];
  const tags = new Set(all.flatMap(n => n.tags || []));
  const res = [];
  for (const t of tags) {
    const w = all.filter(n => (n.tags || []).includes(t));
    const wo = all.filter(n => !(n.tags || []).includes(t));
    if (w.length < 2 || wo.length < 2) continue;
    const m = a => a.reduce((s, n) => s + n.score, 0) / a.length;
    res.push({ tag: t, n: w.length, diff: m(w) - m(wo) });
  }
  return res.sort((a, b) => a.diff - b.diff);
}

// Heures de coucher conseillées pour se réveiller en fin de cycle
export function bedtimesFor(wakeMin, fallAsleep = 15) {
  return [6, 5, 4].map(c => ({ cycles: c, min: wakeMin - c * CYCLE - fallAsleep, sleep: c * CYCLE }));
}
export function wakeTimesFrom(nowMin, fallAsleep = 15) {
  return [4, 5, 6].map(c => ({ cycles: c, min: nowMin + fallAsleep + c * CYCLE, sleep: c * CYCLE }));
}
