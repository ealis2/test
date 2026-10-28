// Fabrique d'épisodes pour les tests : heures locales dans un fuseau explicite.
import { zonedToMs, addDays } from '../js/core/time.js';
import { newEpisode } from '../js/core/model.js';

export const TZ = 'Europe/Paris';
const iso = (key, hhmm, tz = TZ) => new Date(zonedToMs(key, hhmm, tz)).toISOString();

/**
 * night('2026-03-11', { bed: '22:30', off: '22:45', sol: 15, waso: 20, awk: 2, wake: '06:30', out: '06:50' })
 * La date est celle du RÉVEIL ; une heure de coucher ≥ 12:00 est placée la veille.
 */
export function night(wakeKey, o = {}, tz = TZ) {
  const dayOf = hhmm => (parseInt(hhmm, 10) >= 12 ? addDays(wakeKey, -1) : wakeKey);
  return newEpisode({
    tz,
    type: o.type || 'night',
    bedtime: o.bed ? iso(dayOf(o.bed), o.bed, tz) : null,
    lightsOff: o.off ? iso(dayOf(o.off), o.off, tz) : null,
    solMin: o.sol ?? null,
    wasoMin: o.waso ?? null,
    awakenings: o.awk ?? null,
    finalWake: o.wake ? iso(wakeKey, o.wake, tz) : null,
    outOfBed: o.out ? iso(wakeKey, o.out, tz) : null,
    quality: o.q ?? null,
    freeDay: o.free ?? null,
    factors: o.factors || {},
  });
}

export const close = (t, a, b, eps = 1e-6, msg) => t.ok(Math.abs(a - b) <= eps, msg || `${a} ≉ ${b} (±${eps})`);
