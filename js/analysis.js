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

// ---------------------------------------------------------------------------
// ANALYSE DES CAPTEURS
// 1) Éveil / sommeil : algorithme d'actigraphie de Cole-Kripke (Sleep, 1992),
//    pondération des minutes voisines, puis règles de correction de Webster
//    (validées face à la polysomnographie, ~85-90 % d'accord éveil/sommeil).
// 2) Endormissement : premier bloc d'au moins 10 min de sommeil continu.
// 3) Cycles : découpés sur TES mouvements (les changements de position marquent
//    souvent la fin d'un cycle), bornés entre 70 et 120 min.
// 4) Profondeur : position dans le cycle + niveau d'activité résiduelle.
// ---------------------------------------------------------------------------
const CK_W = [404, 598, 326, 441, 1408, 508, 350]; // poids des minutes i-4 … i+2
const CK_SCALE = 1600; // calibré pour qu'un simple retournement (< 1 min) ne soit pas compté comme un réveil
const COUNT_REF = 15; // nombre de « counts »/min correspondant à un mouvement net

function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function runs(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    let j = i;
    while (j < arr.length && arr[j] === arr[i]) j++;
    out.push({ v: arr[i], s: i, e: j, len: j - i });
    i = j;
  }
  return out;
}

// Règles de Webster et al. (1982) appliquées au tableau booléen « éveillé »
function websterRescore(wake) {
  const w = [...wake];
  const r = runs(w);
  for (let k = 1; k < r.length; k++) {
    const prev = r[k - 1], cur = r[k];
    if (!prev.v || cur.v) continue; // éveil suivi de sommeil
    const n = prev.len >= 15 ? 4 : prev.len >= 10 ? 3 : prev.len >= 4 ? 1 : 0;
    for (let i = cur.s; i < Math.min(cur.e, cur.s + n); i++) w[i] = true;
  }
  const r2 = runs(w);
  for (let k = 1; k < r2.length - 1; k++) {
    const a = r2[k - 1], cur = r2[k], b = r2[k + 1];
    if (cur.v) continue;
    if ((cur.len <= 6 && a.len >= 10 && b.len >= 10) || (cur.len <= 10 && a.len >= 20 && b.len >= 20)) {
      for (let i = cur.s; i < cur.e; i++) w[i] = true;
    }
  }
  return w;
}

export function analyzeEpochs(epochs, seed) {
  const N = epochs.length;
  const gap = epochs.map(e => !!e.g);
  const counts = epochs.map(e => (e.c != null ? e.c : Math.round((e.m || 0) * 100)));
  const valid = counts.filter((_, i) => !gap[i]);
  const reasons = [];

  if (N < 30 || valid.length < N * 0.5) {
    if (N < 30) reasons.push('Nuit trop courte pour une analyse fiable.');
    else reasons.push('Plus de la moitié de la nuit sans mesure (app mise en pause ou écran verrouillé).');
    return { stages: modelStages(N, seed, Math.min(12, N)), quality: { level: 'faible', pct: 30, reasons } };
  }

  // Bruit de fond du capteur retiré, puis mise à l'échelle absolue
  const base = Math.min(quantile(valid, 0.5), quantile(valid, 0.2) + 5);
  const x = counts.map((c, i) => (gap[i] ? 0 : Math.min(3, Math.max(0, c - base) / COUNT_REF)));

  // 1) Cole-Kripke
  let wake = x.map((_, i) => {
    let d = 0;
    for (let k = -4; k <= 2; k++) { const v = x[i + k]; if (v !== undefined) d += CK_W[k + 4] * v; }
    return d / CK_SCALE >= 1;
  });
  // Trous de mesure : on reprend l'état précédent (on n'invente pas de sommeil profond)
  for (let i = 0; i < N; i++) if (gap[i]) wake[i] = i > 0 ? wake[i - 1] : true;
  wake = websterRescore(wake);

  // 2) Endormissement et réveil final
  let onset = -1;
  for (const r of runs(wake)) if (!r.v && r.len >= 10) { onset = r.s; break; }
  if (onset < 0) {
    reasons.push('Aucune période de sommeil continu détectée.');
    return { stages: 'W'.repeat(N), quality: { level: 'moyenne', pct: 50, reasons } };
  }
  let finalWake = N;
  for (let i = N - 1; i >= onset; i--) if (!wake[i]) { finalWake = i + 1; break; }
  for (let i = 0; i < onset; i++) wake[i] = true;
  for (let i = finalWake; i < N; i++) wake[i] = true;

  // 3) Cycles personnalisés
  const bounds = [onset];
  let last = onset;
  for (let i = onset + 1; i < finalWake; i++) {
    const len = i - last;
    if ((len >= 70 && (x[i] >= 1 || wake[i])) || len >= 120) { bounds.push(i); last = i; }
  }
  bounds.push(finalWake);

  // Activité résiduelle lissée (±5 min) pour estimer la profondeur
  const act = x.map((_, i) => {
    let s = 0, c = 0;
    for (let k = -5; k <= 5; k++) { const v = x[i + k]; if (v !== undefined && !gap[i + k]) { const w = 1 / (1 + Math.abs(k)); s += v * w; c += w; } }
    return c ? s / c : 0;
  });

  // 4) Phases
  const out = new Array(N).fill('W');
  for (let k = 0; k < bounds.length - 1; k++) {
    const s0 = bounds[k], e0 = bounds[k + 1], len = e0 - s0;
    const deepFrac = Math.max(0.05, 0.45 - 0.12 * k);
    const remFrac = Math.min(0.4, 0.1 + 0.07 * k) * (len >= 45 ? 1 : 0.5);
    for (let i = s0; i < e0; i++) {
      if (wake[i]) continue;
      const p = (i - s0) / len;
      let st;
      if (p < 0.1) st = 'L';
      else if (p < 0.1 + deepFrac) st = act[i] < 0.12 ? 'D' : 'L';
      else if (p < 1 - remFrac) st = 'L';
      else st = act[i] < 0.4 ? 'R' : 'L';
      // Première heure : pas de paradoxal (latence REM normale ~70-90 min)
      if (st === 'R' && i - onset < 60) st = 'L';
      out[i] = st;
    }
  }
  // Mouvement bref (≤ 2 min) pendant le sommeil = changement de position / micro-éveil
  // → compté en sommeil léger, comme en polysomnographie où un éveil doit durer plus de la moitié de l'époque.
  const r = runs(out);
  for (let k = 1; k < r.length - 1; k++) {
    if (r[k].v === 'W' && r[k].len <= 2) for (let i = r[k].s; i < r[k].e; i++) out[i] = 'L';
  }
  const stages = mergeShortBouts(out, 3).join('');

  // Indice de fiabilité de la mesure
  let pct = 95;
  const gapFrac = gap.filter(Boolean).length / N;
  if (gapFrac > 0.02) { pct -= Math.round(gapFrac * 150); reasons.push(`${Math.round(gapFrac * 100)} % de la nuit sans mesure (app en pause).`); }
  const moves = x.filter(v => v >= 1).length;
  if (moves < Math.max(3, N / 120)) { pct -= 45; reasons.push('Très peu de mouvements captés : l\'iPhone était-il bien posé sur le matelas ?'); }
  if (N < 180) { pct -= 15; reasons.push('Nuit de moins de 3 h : estimation moins précise.'); }
  pct = Math.max(20, Math.min(95, pct));
  if (!reasons.length) reasons.push('Mesure complète et cohérente toute la nuit.');
  return { stages, quality: { level: pct >= 80 ? 'élevée' : pct >= 55 ? 'moyenne' : 'faible', pct, reasons } };
}

// Compatibilité : ancienne signature
export function stagesFromEpochs(epochs, seed) { return analyzeEpochs(epochs, seed).stages; }

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
  for (const ch of stages) c[ch]++;
  const first = stages.search(/[LDR]/);
  const lastSleep = Math.max(stages.lastIndexOf('L'), stages.lastIndexOf('D'), stages.lastIndexOf('R'));
  const latency = first < 0 ? stages.length : first;
  // Réveils nocturnes : épisodes d'éveil d'au moins 3 min entre l'endormissement et le réveil final
  let awakenings = 0, waso = 0;
  if (first >= 0) {
    for (const r of runs([...stages.slice(first, lastSleep + 1)])) {
      if (r.v === 'W') { waso += r.len; if (r.len >= 3) awakenings++; }
    }
  }
  const inBed = stages.length;
  const asleep = c.R + c.L + c.D;
  return {
    inBed, asleep, latency, waso, awakenings,
    awake: c.W, rem: c.R, light: c.L, deep: c.D,
    efficiency: inBed ? asleep / inBed : 0,
  };
}

// Score de 0 à 100 basé sur les critères de qualité de la National Sleep Foundation
// (Ohayon et al., Sleep Health 2017) : durée, efficacité, latence, éveils, WASO.
// Les phases (estimées) ne pèsent que 10 points.
export function computeScore(sum, goalMin) {
  const durPts = 40 * Math.min(1, sum.asleep / goalMin) - (sum.asleep > goalMin + 120 ? 5 : 0);
  const effPts = 20 * Math.min(1, Math.max(0, (sum.efficiency - 0.65) / (0.9 - 0.65)));
  const latPts = 10 * (sum.latency <= 15 ? 1 : sum.latency <= 30 ? 0.75 : sum.latency <= 45 ? 0.35 : 0);
  const waso = sum.waso ?? 0;
  const wasoPts = 10 * (waso <= 20 ? 1 : Math.max(0, 1 - (waso - 20) / 70));
  const wakePts = 10 * (sum.awakenings <= 1 ? 1 : Math.max(0, 1 - (sum.awakenings - 1) / 4));
  const restor = sum.asleep ? (sum.deep + sum.rem) / sum.asleep : 0;
  const phasePts = 10 * Math.min(1, restor / 0.4);
  return Math.round(Math.max(0, Math.min(100, durPts + effPts + latPts + wasoPts + wakePts + phasePts)));
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
  let stages, quality;
  if (source === 'capteurs' && epochs.length) {
    ({ stages, quality } = analyzeEpochs(epochs, seed || id));
  } else {
    stages = modelStages(minutes, seed || id);
    quality = { level: 'estimation', pct: null, reasons: [source === 'manuel' ? 'Nuit saisie à la main : durée exacte, phases estimées par le modèle des cycles.' : 'Aucun capteur disponible : phases estimées par le modèle des cycles.'] };
  }
  const sum = summarize(stages);
  return {
    id, start, end, source, stages, events, quality,
    epochs: epochs.map(e => [Math.round((e.m || 0) * 1000) / 1000, Math.round((e.n || 0) * 1000) / 1000, e.c || 0, e.g ? 1 : 0]),
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
