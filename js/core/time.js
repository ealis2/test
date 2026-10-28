// Gestion des dates, heures et fuseaux horaires.
//
// Règles :
// - Un instant est toujours stocké en ISO 8601 UTC (« 2026-10-28T06:42:00.000Z »).
// - Chaque épisode de sommeil mémorise le fuseau IANA dans lequel il a été vécu
//   (« Europe/Paris »). Les heures « d'horloge » (coucher à 23:10…) sont calculées
//   dans CE fuseau, pas dans celui de l'appareil au moment de l'analyse.
// - Les durées sont calculées entre instants absolus : elles restent justes
//   lors des changements d'heure (nuit de 23 h ou de 25 h) et des voyages.

export const MIN = 60000;
export const DAY_MIN = 1440;

const fmtCache = new Map();
function partsFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Fuseau horaire de l'appareil. */
export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/** Vérifie qu'un identifiant de fuseau IANA est utilisable. */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try { partsFormatter(tz); return true; } catch { return false; }
}

/** Convertit ISO / Date / nombre en millisecondes ; null si invalide. */
export function toMs(v) {
  if (v === null || v === undefined || v === '') return null;
  const ms = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export function toISO(v) {
  const ms = toMs(v);
  return ms === null ? null : new Date(ms).toISOString();
}

/** Composantes de l'heure locale d'un instant dans un fuseau donné. */
export function zonedParts(v, tz) {
  const ms = toMs(v);
  if (ms === null) return null;
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value;
  const y = +p.year, mo = +p.month, d = +p.day, h = +p.hour, mi = +p.minute;
  return {
    year: y, month: mo, day: d, hour: h, minute: mi, second: +p.second,
    weekday: WD[p.weekday],
    minutesOfDay: h * 60 + mi,
    dateKey: `${y}-${pad2(mo)}-${pad2(d)}`,
  };
}

/** Décalage UTC (minutes) d'un fuseau à un instant donné (ex. +60 pour Paris en hiver). */
export function tzOffsetMinutes(v, tz) {
  const ms = toMs(v);
  const p = zonedParts(ms, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / MIN);
}

/**
 * Instant correspondant à une date et une heure d'horloge dans un fuseau.
 * Heure inexistante (passage à l'heure d'été, ex. 02:30) : on avance au premier instant valide.
 * Heure ambiguë (passage à l'heure d'hiver, ex. 02:30 vécu deux fois) : on prend la première occurrence.
 */
export function zonedToMs(dateKey, hhmm, tz) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wallAsUTC = Date.UTC(y, mo - 1, d, h, mi);
  // Deux essais suffisent : décalage avant / après la transition éventuelle.
  const candidates = new Set();
  for (const guessOffset of [tzOffsetMinutes(wallAsUTC - 18 * 3600e3, tz), tzOffsetMinutes(wallAsUTC + 18 * 3600e3, tz)]) {
    const ms = wallAsUTC - guessOffset * MIN;
    const p = zonedParts(ms, tz);
    if (p.dateKey === dateKey && p.minutesOfDay === h * 60 + mi) candidates.add(ms);
  }
  if (candidates.size) return Math.min(...candidates);
  // Heure sautée : on applique le décalage d'avant la transition (02:30 → 03:30 à Paris).
  const before = wallAsUTC - tzOffsetMinutes(wallAsUTC - 18 * 3600e3, tz) * MIN;
  return before;
}

export function pad2(n) { return String(n).padStart(2, '0'); }

/** Minutes (décimales) entre deux instants ; null si l'un manque. */
export function minutesBetween(a, b) {
  const x = toMs(a), y = toMs(b);
  if (x === null || y === null) return null;
  return (y - x) / MIN;
}

/** Heure d'horloge locale (0–1439) d'un instant, dans le fuseau donné. */
export function clockMinutes(v, tz) {
  const p = zonedParts(v, tz);
  return p ? p.minutesOfDay + p.second / 60 : null;
}

/** Clé de date locale « AAAA-MM-JJ ». */
export function dateKey(v, tz) {
  const p = zonedParts(v, tz);
  return p ? p.dateKey : null;
}

/** Ajoute n jours à une clé de date (arithmétique calendaire, sans fuseau). */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** Nombre de jours entre deux clés de date (b − a). */
export function daysBetweenKeys(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400e3);
}

/** Jour de la semaine (0 = dimanche) d'une clé de date. */
export function weekdayOfKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Liste des clés de date de a à b inclus. */
export function keyRange(a, b) {
  const out = [];
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k);
  return out;
}

/** "HH:MM" → minutes ; null si invalide. */
export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** minutes → "HH:MM" (modulo 24 h). */
export function formatHHMM(min) {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  const v = ((Math.round(min) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

/**
 * Prochaine occurrence d'une heure d'horloge, strictement après `fromMs`,
 * sur l'un des jours autorisés (0 = dimanche … 6 = samedi ; liste vide = tous les jours).
 */
export function nextOccurrence(hhmm, fromMs, tz, days = []) {
  const allowed = days && days.length ? new Set(days) : null;
  let key = dateKey(fromMs, tz);
  for (let i = 0; i < 9; i++) {
    if (!allowed || allowed.has(weekdayOfKey(key))) {
      const ms = zonedToMs(key, hhmm, tz);
      if (ms > fromMs) return ms;
    }
    key = addDays(key, 1);
  }
  return null;
}
