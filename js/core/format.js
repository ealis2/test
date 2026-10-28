// Mise en forme (français) des valeurs. Fonctions pures, testées.

import { formatHHMM, zonedParts, toMs } from './time.js';

export const LOCALE = 'fr-FR';

/** 452 → « 7 h 32 » ; null → « — ». */
export function fmtDuration(min, { signed = false, compact = false } = {}) {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  const sign = min < 0 ? '−' : signed && min > 0 ? '+' : '';
  const v = Math.round(Math.abs(min));
  const h = Math.floor(v / 60), m = v % 60;
  if (!h) return `${sign}${m} min`;
  if (compact) return `${sign}${h}h${String(m).padStart(2, '0')}`;
  return m ? `${sign}${h} h ${String(m).padStart(2, '0')}` : `${sign}${h} h`;
}

export function fmtClock(min) { return formatHHMM(min); }

export function fmtNumber(v, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v, digits = 0) { return v === null || v === undefined ? '—' : `${fmtNumber(v, digits)} %`; }

/** p-valeur lisible. */
export function fmtP(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p < 0.001) return 'p < 0,001';
  return `p = ${fmtNumber(p, p < 0.01 ? 3 : 2)}`;
}

const dtfCache = new Map();
function dtf(opts, tz) {
  const k = JSON.stringify(opts) + tz;
  if (!dtfCache.has(k)) dtfCache.set(k, new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: tz }));
  return dtfCache.get(k);
}

/** Date d'une clé « AAAA-MM-JJ » (sans fuseau : midi UTC). */
export function fmtDateKey(key, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  return dtf(opts, 'UTC').format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Heure locale d'un instant dans le fuseau de l'épisode. */
export function fmtInstantClock(iso, tz) {
  const p = zonedParts(iso, tz);
  return p ? formatHHMM(p.minutesOfDay) : '—';
}

export function fmtInstant(iso, tz, opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) {
  const ms = toMs(iso);
  return ms === null ? '—' : dtf(opts, tz).format(new Date(ms));
}

/** « il y a 3 jours », « aujourd'hui »… à partir de clés de date. */
export function fmtRelativeDays(n) {
  if (n === 0) return 'aujourd\'hui';
  if (n === 1) return 'hier';
  if (n === -1) return 'demain';
  return n > 0 ? `il y a ${n} jours` : `dans ${-n} jours`;
}

export function plural(n, one, many) { return `${fmtNumber(n)} ${Math.abs(n) >= 2 ? many : one}`; }

export const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const WEEKDAYS_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const WEEKDAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
