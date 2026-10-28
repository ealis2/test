// Import / export : JSON complet (sauvegarde fidèle) et CSV (tableur).
// Conçu pour accueillir plus tard d'autres sources (Apple Santé, Health Connect,
// montres) : chaque épisode importé garde sa provenance (`source`) et, s'il y a
// lieu, ses mesures (`measured`) distinctes des déclarations.

import { normalizeEpisode, validateEpisode, FACTORS } from '../core/model.js';
import { computeEpisode } from '../core/metrics.js';
import { convertV1Night } from './migrate-v1.js';
import { formatHHMM, isValidTimeZone } from '../core/time.js';

/** Analyse un fichier JSON Somnia (v2) ou une sauvegarde v1. */
export function parseJSONImport(text, fallbackTz) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Fichier JSON illisible.'); }
  const accepted = [], rejected = [];
  if (data && data.format === 'somnia-export' && Array.isArray(data.episodes)) {
    for (const raw of data.episodes) {
      const e = normalizeEpisode(raw);
      if (!isValidTimeZone(e.tz)) e.tz = fallbackTz;
      const v = validateEpisode(e);
      (v.valid ? accepted : rejected).push(v.valid ? e : { raw, errors: v.errors });
    }
    return { episodes: accepted, rejected, alarms: Array.isArray(data.alarms) ? data.alarms : [], settings: data.settings || null, format: 'somnia-v2' };
  }
  if (data && Array.isArray(data.nights)) {
    for (const n of data.nights) {
      const e = convertV1Night(n, fallbackTz);
      if (e && validateEpisode(e).valid) accepted.push(e); else rejected.push({ raw: n, errors: ['Nuit v1 incomplète.'] });
    }
    return { episodes: accepted, rejected, alarms: [], settings: null, format: 'somnia-v1' };
  }
  throw new Error('Format non reconnu : utilisez un export Somnia (JSON) ou un CSV.');
}

// --- CSV -------------------------------------------------------------------
// Colonnes (séparateur « ; » pour Excel en français, « , » accepté à l'import) :
const BASE_COLS = ['id', 'type', 'fuseau', 'coucher', 'extinction', 'latence_min', 'reveils', 'eveil_nocturne_min', 'reveil_final', 'lever', 'qualite_1_5', 'facilite_reveil_1_5', 'jour_libre', 'source', 'notes'];
const DERIVED_COLS = ['nuit_du', 'temps_au_lit_min', 'temps_sommeil_min', 'efficacite_pct', 'heure_coucher', 'heure_reveil'];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(episodes) {
  const factorCols = FACTORS.map(f => 'f_' + f.id);
  const head = [...BASE_COLS, ...factorCols, ...DERIVED_COLS];
  const rows = [head.join(';')];
  const round = v => (v === null ? '' : Math.round(v * 10) / 10);
  for (const e of [...episodes].sort((a, b) => (a.bedtime < b.bedtime ? -1 : 1))) {
    const m = computeEpisode(e);
    const vals = [
      e.id, e.type, e.tz, e.bedtime, e.lightsOff, e.solMin, e.awakenings, e.wasoMin, e.finalWake, e.outOfBed,
      e.quality, e.wakeEase, e.freeDay === null ? '' : e.freeDay ? 'oui' : 'non', e.source?.kind, e.notes,
      ...FACTORS.map(f => { const v = e.factors?.[f.id]; return v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : v; }),
      m.nightKey, round(m.tib), round(m.tst), round(m.se), m.bedClock === null ? '' : formatHHMM(m.bedClock), m.wakeClock === null ? '' : formatHHMM(m.wakeClock),
    ];
    rows.push(vals.map(csvCell).join(';'));
  }
  return '﻿' + rows.join('\r\n');
}

/** Découpe un CSV (gère guillemets, « ; » ou « , »). */
export function parseCSVText(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

export function parseCSVImport(text, fallbackTz) {
  const rows = parseCSVText(text);
  if (rows.length < 2) throw new Error('CSV vide.');
  const head = rows[0].map(h => h.trim());
  const idx = k => head.indexOf(k);
  if (idx('coucher') < 0 || (idx('reveil_final') < 0 && idx('lever') < 0)) {
    throw new Error('Colonnes obligatoires : coucher et reveil_final ou lever (dates ISO 8601).');
  }
  const get = (r, k) => { const i = idx(k); return i < 0 ? '' : (r[i] ?? '').trim(); };
  const num = s => (s === '' ? null : Number(s.replace(',', '.')));
  const bool = s => (s === '' ? null : /^(oui|true|1|yes)$/i.test(s));
  const accepted = [], rejected = [];
  rows.slice(1).forEach((r, line) => {
    const factors = {};
    for (const f of FACTORS) {
      const s = get(r, 'f_' + f.id);
      if (s !== '') factors[f.id] = f.kind === 'bool' ? bool(s) : num(s);
    }
    const tz = get(r, 'fuseau');
    const e = normalizeEpisode({
      id: get(r, 'id') || undefined,
      type: get(r, 'type') || 'night',
      tz: isValidTimeZone(tz) ? tz : fallbackTz,
      bedtime: get(r, 'coucher') || null, lightsOff: get(r, 'extinction') || null,
      solMin: num(get(r, 'latence_min')), awakenings: num(get(r, 'reveils')), wasoMin: num(get(r, 'eveil_nocturne_min')),
      finalWake: get(r, 'reveil_final') || null, outOfBed: get(r, 'lever') || null,
      quality: num(get(r, 'qualite_1_5')), wakeEase: num(get(r, 'facilite_reveil_1_5')),
      freeDay: bool(get(r, 'jour_libre')), notes: get(r, 'notes'), factors,
      source: { kind: 'import', format: 'csv' },
    });
    const v = validateEpisode(e);
    if (v.valid) accepted.push(e); else rejected.push({ line: line + 2, errors: v.errors });
  });
  return { episodes: accepted, rejected, alarms: [], settings: null, format: 'csv' };
}
