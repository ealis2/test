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

export function analyzeEpochs(epochs, seed, ctx = {}) {
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

  // 4) Phases : modèle de Markov caché (HMM) + algorithme de Viterbi.
  const out = hmmStages({ N, x, wake, gap, epochs, bounds, onset, ctx });
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
  // Confiance dans les phases : dépend surtout de la respiration captée
  const resp = respiration(epochs, stages);
  let phasePct = 45;
  if (resp.coverage >= 0.8) phasePct = 75; else if (resp.coverage >= 0.5) phasePct = 65; else if (resp.coverage >= 0.2) phasePct = 55;
  phasePct = Math.round(Math.min(phasePct, pct));
  reasons.push(resp.coverage >= 0.5
    ? `Respiration captée sur ${Math.round(resp.coverage * 100)} % du sommeil : phases affinées par la respiration.`
    : 'Respiration peu captée (micro coupé ou iPhone loin de toi) : phases estimées surtout par les mouvements et le modèle des cycles.');
  return { stages, quality: { level: pct >= 80 ? 'élevée' : pct >= 55 ? 'moyenne' : 'faible', pct, phasePct, reasons } };
}

// ---------------------------------------------------------------------------
// MODÈLE DE MARKOV CACHÉ POUR LES PHASES
// États : W (éveil), L (léger N1+N2), D (profond N3), R (paradoxal).
// - Éveil/sommeil imposé par Cole-Kripke + Webster (méthode validée).
// - Probabilités de transition minute par minute issues des hypnogrammes de
//   référence, modulées par :
//     • la pression de sommeil (Processus S de Borbély, 1982 ; décroissance
//       exponentielle τ ≈ 4,2 h pendant le sommeil, montée τ ≈ 18,2 h à l'éveil)
//       → plus de sommeil profond en début de nuit et après une longue journée ;
//     • la position dans le cycle ultradien (~90 min, découpé sur tes mouvements) ;
//     • la propension circadienne au paradoxal (maximale en fin de nuit) ;
//     • la latence minimale du paradoxal (~60 min après l'endormissement).
// - Observations : activité résiduelle + respiration (régularité, variabilité,
//   rythme relatif). Le sommeil profond a la respiration la plus lente et la plus
//   régulière ; le paradoxal une respiration plus rapide et irrégulière avec
//   atonie musculaire (Douglas et al., Thorax 1982 ; Penzel et al., 2003).
// ---------------------------------------------------------------------------
const ST = ['W', 'L', 'D', 'R'];
const LOG0 = -1e9;
const lg = v => (v > 0 ? Math.log(v) : LOG0);
const gauss = (v, mu, sd) => Math.exp(-((v - mu) ** 2) / (2 * sd * sd));

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
}

function hmmStages({ N, x, wake, gap, epochs, bounds, onset, ctx }) {
  // Pression de sommeil initiale (Processus S)
  const priorWakeH = Math.max(4, Math.min(24, ctx.priorWakeH ?? 16));
  const S0 = (1 - Math.exp(-priorWakeH / 18.2)) / (1 - Math.exp(-16 / 18.2));
  const startTs = ctx.startTs ?? Date.now();

  // Position dans les cycles
  const cycPos = new Array(N).fill(0);
  for (let k = 0; k < bounds.length - 1; k++) {
    const s0 = bounds[k], e0 = bounds[k + 1];
    for (let i = s0; i < e0; i++) cycPos[i] = (i - s0) / Math.max(1, e0 - s0);
  }

  // Respiration : caractéristiques lissées sur ±3 min puis exprimées en rang (percentile)
  // au sein de TA nuit → robuste aux différences de micro, de matelas et de position.
  const has = epochs.map((e, i) => !!(e.br && e.rr >= 0.3 && x[i] < 1 && !wake[i] && !gap[i]));
  const win = (i, f) => {
    const v = [];
    for (let k = Math.max(0, i - 3); k <= Math.min(N - 1, i + 3); k++) if (has[k]) v.push(f(k));
    return v;
  };
  const feat = epochs.map((_, i) => {
    if (!has[i]) return null;
    const rr = win(i, k => epochs[k].rr);
    const brs = win(i, k => epochs[k].br);
    if (brs.length < 3) return null;
    const mean = brs.reduce((p, q) => p + q, 0) / brs.length;
    const sd = Math.sqrt(brs.reduce((p, q) => p + (q - mean) ** 2, 0) / brs.length);
    return { reg: rr.reduce((p, q) => p + q, 0) / rr.length, cv: sd / mean, rate: mean };
  });
  const idx = feat.map((f, i) => (f ? i : -1)).filter(i => i >= 0);
  const rank = key => {
    const sorted = idx.map(i => feat[i][key]).sort((p, q) => p - q);
    const out = {};
    for (const i of idx) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < feat[i][key]) lo = m + 1; else hi = m; }
      out[i] = sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
    }
    return out;
  };
  const useBreath = idx.length >= 30;
  const qReg = useBreath ? rank('reg') : {}, qCv = useBreath ? rank('cv') : {}, qRate = useBreath ? rank('rate') : {};
  const BW = 0.7; // pondération de la respiration face au modèle physiologique

  // Émissions (log)
  const em = new Array(N);
  for (let i = 0; i < N; i++) {
    if (wake[i]) { em[i] = [0, LOG0, LOG0, LOG0]; continue; }
    const e = [LOG0, 0, 0, 0];
    if (!gap[i]) {
      const xi = x[i];
      e[1] += lg(9 * Math.exp(-9 * xi));
      e[2] += lg(11 * Math.exp(-11 * xi));
      e[3] += lg(10 * Math.exp(-10 * xi));
      if (useBreath && feat[i]) {
        const r = qReg[i], c = qCv[i], b = qRate[i];
        // Profond : respiration la plus régulière, stable et lente de la nuit
        e[2] += BW * (lg(gauss(r, 0.8, 0.25)) + lg(gauss(c, 0.2, 0.25)) + lg(gauss(b, 0.35, 0.3)));
        // Léger : intermédiaire
        e[1] += BW * (lg(gauss(r, 0.5, 0.3)) + lg(gauss(c, 0.5, 0.3)) + lg(gauss(b, 0.5, 0.3)));
        // Paradoxal : respiration irrégulière et plus rapide
        e[3] += BW * (lg(gauss(r, 0.2, 0.25)) + lg(gauss(c, 0.8, 0.25)) + lg(gauss(b, 0.7, 0.3)));
      }
    }
    em[i] = e;
  }

  // Transitions dépendantes du temps
  function trans(i) {
    const t = Math.max(0, i - onset);
    const p = cycPos[i];
    const S = S0 * Math.exp(-t / 250);
    const hour = new Date(startTs + i * 60000).getHours() + new Date(startTs + i * 60000).getMinutes() / 60;
    const circ = 1 + 0.4 * Math.cos((2 * Math.PI * (hour - 6)) / 24);
    const dF = S * (p >= 0.05 && p <= 0.55 ? 2 : 0.3);
    const rF = (t < 55 ? 0.02 : 1) * circ * (p > 0.6 ? 2.5 : 0.25);
    const T = [
      [0, 0.2, 0.001 * dF, 0.002 * rF],            // depuis W
      [0.01, 0, 0.02 * dF, 0.02 * rF],             // depuis L
      [0.003, 0.045 * (p > 0.55 ? 2 : 1), 0, 0.0005], // depuis D
      [0.015, 0.03 * (p < 0.2 ? 3 : 1), 0.0005, 0],  // depuis R
    ];
    for (let a = 0; a < 4; a++) {
      let sum = 0;
      for (let b = 0; b < 4; b++) if (a !== b) { T[a][b] = Math.min(T[a][b], 0.3); sum += T[a][b]; }
      T[a][a] = Math.max(0.4, 1 - sum);
    }
    return T.map(r => r.map(lg));
  }

  // Viterbi
  const V = [em[0].map((v, s) => v + (s === 0 ? 0 : lg(0.01)))];
  const back = [[0, 0, 0, 0]];
  for (let i = 1; i < N; i++) {
    const T = trans(i);
    const row = [], bk = [];
    for (let b = 0; b < 4; b++) {
      let best = -Infinity, arg = 0;
      for (let a = 0; a < 4; a++) {
        const v = V[i - 1][a] + T[a][b];
        if (v > best) { best = v; arg = a; }
      }
      row.push(best + em[i][b]); bk.push(arg);
    }
    V.push(row); back.push(bk);
  }
  let s = V[N - 1].indexOf(Math.max(...V[N - 1]));
  const out = new Array(N);
  for (let i = N - 1; i >= 0; i--) { out[i] = ST[s]; s = back[i][s]; }
  return out;
}

// Respiration et ronflement sur la nuit
export function respiration(epochs, stages) {
  const sleepIdx = [];
  for (let i = 0; i < stages.length; i++) if (stages[i] !== 'W') sleepIdx.push(i);
  const withBr = sleepIdx.filter(i => epochs[i]?.br && epochs[i].rr >= 0.3);
  const sa = epochs.map(e => e?.sa).filter(v => v != null);
  const saMed = median(sa);
  const snore = sleepIdx.filter(i => {
    const e = epochs[i];
    return e && e.sr >= 0.45 && e.sa > Math.max(0.1, saMed + 0.08);
  }).length;
  return {
    bpm: withBr.length ? Math.round(median(withBr.map(i => epochs[i].br)) * 10) / 10 : null,
    coverage: sleepIdx.length ? withBr.length / sleepIdx.length : 0,
    snoreMin: sa.length ? snore : null,
  };
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
export function buildNight({ id, start, end, epochs = [], events = [], source, seed, prevEnd }, goalMin) {
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  let stages, quality;
  // Heures d'éveil avant le coucher (pression de sommeil), si la nuit précédente est connue
  const priorWakeH = prevEnd && start - prevEnd > 2 * 3600e3 && start - prevEnd < 30 * 3600e3 ? (start - prevEnd) / 3600e3 : undefined;
  if (source === 'capteurs' && epochs.length) {
    ({ stages, quality } = analyzeEpochs(epochs, seed || id, { priorWakeH, startTs: start }));
  } else {
    stages = modelStages(minutes, seed || id);
    quality = { level: 'estimation', pct: null, reasons: [source === 'manuel' ? 'Nuit saisie à la main : durée exacte, phases estimées par le modèle des cycles.' : 'Aucun capteur disponible : phases estimées par le modèle des cycles.'] };
  }
  const sum = summarize(stages);
  const resp = source === 'capteurs' && epochs.length ? respiration(epochs, stages) : null;
  return {
    id, start, end, source, stages, events, quality, resp,
    // Données brutes compactes : [mouvement, son, counts, trou, respirations/min, régularité]
    epochs: epochs.map(e => [Math.round((e.m || 0) * 1000) / 1000, Math.round((e.n || 0) * 1000) / 1000, e.c || 0, e.g ? 1 : 0, e.br || 0, e.rr || 0]),
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

// ---------------------------------------------------------------------------
// RÉGULARITÉ ET CHRONOTYPE
// ---------------------------------------------------------------------------
function sleepBounds(n) {
  const first = n.stages.search(/[LDR]/);
  const last = Math.max(n.stages.lastIndexOf('L'), n.stages.lastIndexOf('D'), n.stages.lastIndexOf('R'));
  if (first < 0) return null;
  return { on: n.start + first * 60000, off: n.start + (last + 1) * 60000 };
}

// Sleep Regularity Index (Phillips et al., Sci Rep 2017) : probabilité d'être dans le même
// état (endormi/éveillé) à 24 h d'intervalle, de -100 à 100. Calculé sur les nuits consécutives.
export function sleepRegularityIndex(nights) {
  const byKey = {};
  for (const n of nights) byKey[nightKeyOf(n.start)] = n;
  const keys = Object.keys(byKey).sort();
  let same = 0, total = 0, pairs = 0;
  for (const k of keys) {
    const d = new Date(k + 'T12:00:00');
    const next = new Date(d.getTime() + 86400e3);
    const k2 = nightKeyOf(next.getTime() + 12 * 3600e3);
    const a = byKey[k], b = byKey[k2];
    if (!b) continue;
    pairs++;
    const t0 = d.getTime();
    for (let m = 0; m < 1440; m++) {
      const ta = t0 + m * 60000, tb = ta + 86400e3;
      if (asleepAt(a, ta) === asleepAt(b, tb)) same++;
      total++;
    }
  }
  if (pairs < 3) return null;
  return { sri: Math.round(200 * same / total - 100), pairs };
}
function asleepAt(n, t) {
  if (t < n.start || t >= n.end) return false;
  return n.stages[Math.floor((t - n.start) / 60000)] !== 'W';
}
function nightKeyOf(ts) {
  const d = new Date(ts - 12 * 3600e3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Chronotype (Munich ChronoType Questionnaire, Roenneberg et al. 2004/2012) :
// milieu du sommeil les jours libres corrigé de la dette (MSFsc) + jet-lag social.
export function chronotype(nights) {
  const work = [], free = [];
  for (const n of nights) {
    const b = sleepBounds(n);
    if (!b) continue;
    const day = new Date(n.start - 12 * 3600e3).getDay(); // jour du coucher
    const mid = (b.on + b.off) / 2;
    const d = new Date(mid);
    let midH = d.getHours() + d.getMinutes() / 60;
    if (midH > 14) midH -= 24;
    const dur = (b.off - b.on) / 3600e3;
    (day === 5 || day === 6 ? free : work).push({ midH, dur });
  }
  if (work.length < 2 || free.length < 1) return null;
  const avg = (a, f) => a.reduce((s, v) => s + f(v), 0) / a.length;
  const MSW = avg(work, v => v.midH), MSF = avg(free, v => v.midH);
  const SDw = avg(work, v => v.dur), SDf = avg(free, v => v.dur);
  const SDweek = (5 * SDw + 2 * SDf) / 7;
  const MSFsc = SDf > SDw ? MSF - (SDf - SDweek) / 2 : MSF;
  const jetlag = Math.abs(MSF - MSW);
  const type = MSFsc < 3 ? '🐦 Matinal' : MSFsc < 4 ? 'Plutôt matinal' : MSFsc < 5 ? 'Intermédiaire' : MSFsc < 6 ? 'Plutôt tardif' : '🦉 Tardif';
  return { MSW, MSF, MSFsc, jetlag, type, nWork: work.length, nFree: free.length };
}
