// Traitement du signal : détection de la respiration par autocorrélation.
// Utilisé sur l'enveloppe sonore (micro) et sur les micro-vibrations du matelas
// (accéléromètre), échantillonnées à 4 Hz.

export const FS = 4; // Hz

function detrend(sig) {
  const n = sig.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += sig[i]; sxy += i * sig[i]; sxx += i * i; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const icpt = (sy - slope * sx) / n;
  return sig.map((v, i) => v - (icpt + slope * i));
}

// Renvoie { r: régularité 0-1, bpm: respirations/min } ou null.
// Plage physiologique : 6 à 30 respirations/min (périodes de 2 à 10 s).
export function breathing(sig, fs = FS) {
  if (!sig || sig.length < fs * 30) return null;
  const s = detrend(sig);
  let e = 0;
  for (const v of s) e += v * v;
  if (e < 1e-12) return null;
  const minLag = Math.round(fs * 2), maxLag = Math.round(fs * 10);
  const ac = [];
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let c = 0;
    for (let i = 0; i + lag < s.length; i++) c += s[i] * s[i + lag];
    ac.push(c / e);
  }
  // Premier pic significatif après le premier passage sous zéro
  let best = null;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > 0.15) {
      // Correction du biais de longueur (moins de termes aux grands décalages)
      const r = Math.min(1, ac[lag] * s.length / (s.length - lag));
      if (!best || r > best.r + 0.05) best = { r, lag };
      if (r > 0.5) break;
    }
  }
  if (!best) return { r: 0, bpm: 0 };
  // Interpolation parabolique pour un rythme plus précis
  const a = ac[best.lag - 1], b = ac[best.lag], c = ac[best.lag + 1];
  const off = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
  const bpm = 60 * fs / (best.lag + Math.max(-0.5, Math.min(0.5, off)));
  return { r: Math.round(best.r * 100) / 100, bpm: Math.round(bpm * 10) / 10 };
}

// Choisit la meilleure source de respiration parmi plusieurs signaux
export function bestBreathing(signals) {
  let best = null;
  for (const sig of signals) {
    const b = breathing(sig);
    if (b && b.bpm && (!best || b.r > best.r)) best = b;
  }
  return best;
}
