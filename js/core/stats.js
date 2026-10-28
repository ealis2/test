// Statistiques génériques, sans dépendance. Toutes les fonctions ignorent les
// valeurs null / NaN et renvoient le nombre de valeurs écartées : une absence de
// donnée n'est jamais transformée en zéro.

import { DAY_MIN } from './time.js';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

export function clean(values) {
  const ok = [];
  let missing = 0;
  for (const v of values) (isNum(v) ? ok.push(v) : missing++);
  return { ok, missing };
}

export function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

/** Quantile par interpolation linéaire (méthode 7 de Hyndman & Fan, celle de R et Excel). */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Écart-type d'échantillon (dénominateur n − 1). */
export function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Statistiques descriptives.
 * minN : effectif minimal pour publier les statistiques (sinon `insufficient: true`).
 */
export function describe(values, { minN = 3 } = {}) {
  const { ok, missing } = clean(values);
  const n = ok.length;
  const base = { n, missing, insufficient: n < minN };
  if (n < minN) return { ...base, mean: null, median: null, min: null, max: null, sd: null, q1: null, q3: null };
  const s = [...ok].sort((a, b) => a - b);
  return {
    ...base,
    mean: mean(ok), median: quantile(s, 0.5), min: s[0], max: s[n - 1],
    sd: n >= 2 ? sd(ok) : null, q1: quantile(s, 0.25), q3: quantile(s, 0.75),
  };
}

// ---------------------------------------------------------------------------
// Statistiques circulaires pour les heures d'horloge (23:50 et 00:10 sont proches).
// Moyenne circulaire et écart-type circulaire σ = √(−2 ln R) (Mardia & Jupp, 2000),
// convertis en minutes sur une période de 24 h.

const TAU = 2 * Math.PI;

export function circularDescribe(clockMinutesList, { minN = 3 } = {}) {
  const { ok, missing } = clean(clockMinutesList);
  const n = ok.length;
  if (n < minN) return { n, missing, insufficient: true, mean: null, sd: null, R: null };
  let C = 0, S = 0;
  for (const m of ok) { const a = (m / DAY_MIN) * TAU; C += Math.cos(a); S += Math.sin(a); }
  C /= n; S /= n;
  const R = Math.min(1, Math.hypot(C, S));
  let a = Math.atan2(S, C); if (a < 0) a += TAU;
  const sdRad = R > 0 ? Math.sqrt(-2 * Math.log(R)) : Infinity;
  return { n, missing, insufficient: false, mean: (a / TAU) * DAY_MIN, sd: (sdRad / TAU) * DAY_MIN, R };
}

/** Différence signée la plus courte entre deux heures d'horloge (b − a), dans [−720, 720). */
export function clockDiff(a, b) {
  let d = (b - a) % DAY_MIN;
  if (d >= DAY_MIN / 2) d -= DAY_MIN;
  if (d < -DAY_MIN / 2) d += DAY_MIN;
  return d;
}

/**
 * « Déroule » une heure d'horloge autour d'une référence, pour tracer des heures
 * de coucher sans saut à minuit : renvoie une valeur dans [ref − 720, ref + 720).
 */
export function unwrapClock(m, ref) { return ref + clockDiff(ref, m); }

// ---------------------------------------------------------------------------
// Loi de Student (fonction bêta incomplète régularisée, Numerical Recipes §6.4).

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** P(|T| ≥ |t|) pour une loi de Student à df degrés de liberté (bilatéral). */
export function tTwoSidedP(t, df) {
  if (!isNum(t) || !(df > 0)) return null;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Quantile de Student : t tel que P(T ≤ t) = p (recherche par dichotomie). */
export function tQuantile(p, df) {
  let lo = 0, hi = 1000;
  const target = 2 * (1 - p); // p bilatéral correspondant
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Fonction de répartition de la loi normale centrée réduite (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Test t de Welch (variances inégales) : différence de moyennes B − A,
 * intervalle de confiance à 95 % et p bilatéral.
 */
export function welch(a, b, { minN = 3 } = {}) {
  const A = clean(a).ok, B = clean(b).ok;
  if (A.length < minN || B.length < minN) return { insufficient: true, nA: A.length, nB: B.length };
  const mA = mean(A), mB = mean(B), vA = sd(A) ** 2, vB = sd(B) ** 2;
  const se2 = vA / A.length + vB / B.length;
  const diff = mB - mA;
  if (se2 === 0) return { insufficient: false, nA: A.length, nB: B.length, meanA: mA, meanB: mB, diff, ci: [diff, diff], p: diff === 0 ? 1 : 0, df: null };
  const se = Math.sqrt(se2);
  const df = se2 ** 2 / ((vA / A.length) ** 2 / (A.length - 1) + (vB / B.length) ** 2 / (B.length - 1));
  const t = diff / se;
  const q = tQuantile(0.975, df);
  return { insufficient: false, nA: A.length, nB: B.length, meanA: mA, meanB: mB, diff, se, df, t, p: tTwoSidedP(t, df), ci: [diff - q * se, diff + q * se] };
}

// ---------------------------------------------------------------------------
// Tendances : pente de Theil–Sen (robuste aux valeurs extrêmes) + test de Mann–Kendall.

export function theilSen(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
  const n = pts.length;
  if (n < 2) return null;
  const slopes = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = pts[j][0] - pts[i][0];
    if (dx !== 0) slopes.push((pts[j][1] - pts[i][1]) / dx);
  }
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const slope = quantile(slopes, 0.5);
  const inter = quantile(pts.map(([x, y]) => y - slope * x).sort((a, b) => a - b), 0.5);
  return { slope, intercept: inter, n };
}

/** Test de Mann–Kendall (approximation normale, correction pour ex æquo et continuité). */
export function mannKendall(ys) {
  const y = clean(ys).ok;
  const n = y.length;
  if (n < 4) return null;
  let S = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
  const ties = new Map();
  for (const v of y) ties.set(v, (ties.get(v) || 0) + 1);
  let tieTerm = 0;
  for (const t of ties.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = varS > 0 ? (S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0) : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { S, z, p, n, tau: S / (n * (n - 1) / 2) };
}

// ---------------------------------------------------------------------------
// Corrélation de Spearman (rangs moyens pour les ex æquo) avec p via loi de Student.

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export function spearman(xs, ys, { minN = 10 } = {}) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
  const n = pts.length;
  if (n < minN) return { insufficient: true, n };
  const rho = pearson(ranks(pts.map(p => p[0])), ranks(pts.map(p => p[1])));
  if (rho === null) return { insufficient: true, n, constant: true };
  const t = Math.abs(rho) >= 1 ? Infinity : rho * Math.sqrt((n - 2) / (1 - rho * rho));
  return { insufficient: false, n, rho, p: Number.isFinite(t) ? tTwoSidedP(t, n - 2) : 0 };
}

/** Correction de Benjamini–Hochberg : renvoie les p ajustés (même ordre). */
export function benjaminiHochberg(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const adj = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    prev = Math.min(prev, (p * m) / (k + 1));
    adj[i] = prev;
  }
  return adj;
}
