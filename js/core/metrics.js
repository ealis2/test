// Indicateurs calculés pour UN épisode de sommeil.
// Définitions : voir docs/METRICS.md (chaque formule y est documentée et testée).

import { toMs, minutesBetween, clockMinutes, dateKey, weekdayOfKey, MIN } from './time.js';
import { validateEpisode } from './model.js';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Calcule les indicateurs d'un épisode. Une valeur non calculable vaut null.
 *
 *  tib        Temps au lit = lever − coucher (min). Sans lever : réveil final − coucher, signalé.
 *  sol        Latence d'endormissement déclarée (min).
 *  waso       Éveil après endormissement déclaré (min).
 *  onset      Endormissement estimé = (extinction ou coucher) + latence.
 *  spt        Période de sommeil = réveil final − endormissement (min) : inclut les éveils nocturnes.
 *  tst        Temps de sommeil total = période de sommeil − éveils nocturnes (min).
 *             Uniquement si la latence ET les éveils nocturnes sont connus.
 *             Si une source mesurée existe (montre importée), elle est utilisée et marquée.
 *  se         Efficacité = tst / tib × 100, si tst et tib sont connus et tib ≥ 60 min.
 *  linger     Temps au lit après le réveil final = lever − réveil final (min).
 *  midSleep   Milieu du sommeil (heure d'horloge, min) = endormissement + période / 2.
 */
export function computeEpisode(e) {
  const v = validateEpisode(e);
  const out = {
    id: e.id, type: e.type, tz: e.tz, valid: v.valid, errors: v.errors, warnings: v.warnings,
    tib: null, tibEstimated: false, sol: null, waso: null, awakenings: null,
    onsetMs: null, spt: null, tst: null, tstSource: null, se: null, linger: null,
    bedClock: null, onsetClock: null, wakeClock: null, outClock: null, midSleepClock: null,
    nightKey: null, weekday: null, freeDay: null,
    quality: e.quality ?? null, wakeEase: e.wakeEase ?? null,
    demo: e.source?.kind === 'demo',
  };
  if (!v.valid) return out;

  const bed = toMs(e.bedtime), off = toMs(e.lightsOff) ?? bed;
  const fw = toMs(e.finalWake), outB = toMs(e.outOfBed);

  if (outB !== null) out.tib = minutesBetween(bed, outB);
  else if (fw !== null) { out.tib = minutesBetween(bed, fw); out.tibEstimated = true; }

  out.sol = isNum(e.solMin) ? e.solMin : null;
  out.waso = isNum(e.wasoMin) ? e.wasoMin : null;
  out.awakenings = Number.isInteger(e.awakenings) ? e.awakenings : null;

  if (out.sol !== null) out.onsetMs = off + out.sol * MIN;
  if (out.onsetMs !== null && fw !== null) out.spt = Math.max(0, (fw - out.onsetMs) / MIN);
  if (out.spt !== null && out.waso !== null) {
    out.tst = Math.max(0, out.spt - out.waso);
    out.tstSource = 'declared';
  }
  if (e.measured && isNum(e.measured.tstMin) && e.measured.tstMin >= 0) {
    out.tst = e.measured.tstMin;
    out.tstSource = 'measured';
  }
  if (out.tst !== null && out.tib !== null && out.tib >= 60 && !out.tibEstimated) {
    out.se = Math.min(100, (out.tst / out.tib) * 100);
  }
  if (fw !== null && outB !== null) out.linger = minutesBetween(fw, outB);

  out.bedClock = clockMinutes(bed, e.tz);
  out.onsetClock = out.onsetMs !== null ? clockMinutes(out.onsetMs, e.tz) : null;
  out.wakeClock = fw !== null ? clockMinutes(fw, e.tz) : null;
  out.outClock = outB !== null ? clockMinutes(outB, e.tz) : null;
  if (out.onsetMs !== null && fw !== null) out.midSleepClock = clockMinutes(out.onsetMs + (fw - out.onsetMs) / 2, e.tz);

  // Une nuit appartient au jour du réveil (« nuit du 27 au 28 » → 28).
  const endMs = fw ?? outB;
  out.nightKey = dateKey(endMs, e.tz);
  out.weekday = weekdayOfKey(out.nightKey);
  // Jour libre : choix de l'utilisateur, sinon réveil un samedi ou un dimanche.
  out.freeDay = typeof e.freeDay === 'boolean' ? e.freeDay : (out.weekday === 0 || out.weekday === 6);
  return out;
}

/** Durée « de référence » pour les graphiques : le temps de sommeil s'il est connu. */
export function bestSleepMinutes(m) {
  return m.tst ?? null;
}

/** Liste des champs renseignés / manquants (pour la visualisation de la complétude). */
export const TRACKED_FIELDS = [
  ['bedtime', 'Coucher'], ['solMin', 'Latence'], ['awakenings', 'Réveils'], ['wasoMin', 'Durée des réveils'],
  ['finalWake', 'Réveil final'], ['outOfBed', 'Lever'], ['quality', 'Qualité'], ['wakeEase', 'Facilité du réveil'],
];

export function completeness(e) {
  const present = TRACKED_FIELDS.filter(([k]) => e[k] !== null && e[k] !== undefined && e[k] !== '');
  return { filled: present.length, total: TRACKED_FIELDS.length, missing: TRACKED_FIELDS.filter(f => !present.includes(f)).map(f => f[1]) };
}
