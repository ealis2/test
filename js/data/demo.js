// Jeu de démonstration EXPLICITEMENT identifié (source.kind = 'demo').
// Données synthétiques générées de façon déterministe : elles ne proviennent
// d'aucune personne réelle et servent uniquement à explorer l'interface.
// Une bannière les signale partout ; elles se suppriment en un geste.

import { newEpisode } from '../core/model.js';
import { addDays, zonedToMs, weekdayOfKey } from '../core/time.js';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemo({ todayKey, tz, nights = 120, seed = 42 }) {
  const rnd = mulberry32(seed);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const at = (key, minutes) => {
    const r = Math.round(minutes);
    const dayShift = Math.floor(r / 1440);
    const m = ((r % 1440) + 1440) % 1440;
    const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0');
    return new Date(zonedToMs(addDays(key, dayShift), `${hh}:${mm}`, tz)).toISOString();
  };
  const out = [];
  for (let i = nights; i >= 1; i--) {
    const wakeKey = addDays(todayKey, -i + 1);
    if (rnd() < 0.07) continue; // nuits non renseignées (oublis)
    const wd = weekdayOfKey(wakeKey);
    const free = wd === 0 || wd === 6;
    const improved = i <= 35; // changement d'habitude simulé il y a 5 semaines
    const caffeineLate = rnd() < (improved ? 0.12 : 0.35);
    const alcohol = free ? (rnd() < 0.5 ? Math.round(1 + rnd() * 2) : 0) : (rnd() < 0.1 ? 1 : 0);
    const stress = clamp(Math.round(2.5 + gauss() * 1.0 + (wd === 1 ? 0.6 : 0)), 1, 5);
    const exercise = rnd() < 0.45 ? Math.round(20 + rnd() * 60) : 0;
    const screens = rnd() < (improved ? 0.3 : 0.6);

    // Horaires en minutes relatives à minuit du jour du réveil (négatif = la veille).
    const bedBase = free ? 30 : improved ? -55 : -30;
    const bed = bedBase + gauss() * (free ? 35 : 22);
    const lightsOff = bed + clamp(10 + gauss() * 8 + (screens ? 15 : 0), 0, 60);
    const sol = Math.round(clamp(Math.exp(2.5 + gauss() * 0.45) + (caffeineLate ? 12 : 0) + (stress - 3) * 4, 2, 90));
    const awakenings = clamp(Math.round(1 + gauss() * 0.9 + alcohol * 0.5), 0, 6);
    const waso = awakenings ? Math.round(clamp(awakenings * (5 + rnd() * 8) + alcohol * 6, 2, 120)) : 0;
    const wake = free ? 8 * 60 + 40 + gauss() * 40 : 6 * 60 + 50 + gauss() * 6;
    const out_ = wake + clamp(5 + Math.abs(gauss()) * (free ? 25 : 8), 0, 80);
    const tst = (wake - lightsOff) - sol - waso;
    const quality = clamp(Math.round(3 + (tst - 420) / 60 - waso / 40 - (sol > 30 ? 0.5 : 0) + gauss() * 0.6), 1, 5);
    const ease = clamp(Math.round(3 + (free ? 0.8 : -0.2) + (tst - 420) / 70 + gauss() * 0.7), 1, 5);
    const incomplete = rnd() < 0.08;

    out.push(newEpisode({
      id: `demo-${wakeKey}`,
      tz, type: 'night',
      bedtime: at(wakeKey, bed), lightsOff: at(wakeKey, lightsOff),
      solMin: sol, awakenings: incomplete ? null : awakenings, wasoMin: incomplete ? null : waso,
      finalWake: at(wakeKey, wake), outOfBed: at(wakeKey, out_),
      quality, wakeEase: incomplete ? null : ease,
      factors: { caffeineLate, alcohol, stress, exercise, screens, caffeine: Math.round(1 + rnd() * 3) },
      source: { kind: 'demo' },
      notes: '',
    }));
    // Quelques siestes le week-end
    if (free && rnd() < 0.25) {
      const napStart = 14 * 60 + rnd() * 60;
      const napEnd = napStart + 25 + rnd() * 20;
      out.push(newEpisode({
        id: `demo-nap-${wakeKey}`, tz, type: 'nap',
        bedtime: at(wakeKey, napStart), lightsOff: at(wakeKey, napStart), solMin: 5, awakenings: 0, wasoMin: 0,
        finalWake: at(wakeKey, napEnd), outOfBed: at(wakeKey, napEnd + 4),
        source: { kind: 'demo' },
      }));
    }
  }
  return out;
}
