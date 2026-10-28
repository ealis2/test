// Modèle de données d'un épisode de sommeil (nuit ou sieste) et validation stricte.
//
// Les champs suivent l'agenda du sommeil consensuel (Consensus Sleep Diary,
// Carney et al., Sleep 2012) :
//   bedtime     : heure de mise au lit
//   lightsOff   : heure à laquelle on a essayé de dormir (facultatif ; par défaut = bedtime)
//   solMin      : latence d'endormissement estimée (minutes)
//   awakenings  : nombre de réveils nocturnes
//   wasoMin     : durée totale des réveils après l'endormissement (minutes)
//   finalWake   : heure du réveil final
//   outOfBed    : heure du lever
// Toute valeur inconnue vaut null — jamais 0. Zéro signifie « déclaré nul ».

import { toMs, isValidTimeZone, minutesBetween } from './time.js';

export const SCHEMA_VERSION = 2;

export const EPISODE_TYPES = ['night', 'nap'];

/** Provenance d'une donnée : déclarée, issue d'une session de l'app, importée, ou démo. */
export const SOURCE_KINDS = ['manual', 'session', 'import', 'legacy-v1', 'demo'];

/**
 * Facteurs contextuels facultatifs. Ils servent uniquement à des comparaisons
 * exploratoires : leur présence n'implique jamais une cause.
 *   kind 'bool'  : oui / non
 *   kind 'count' : nombre entier (verres, tasses)
 *   kind 'scale' : échelle 1–5
 *   kind 'minutes' : durée
 *   kind 'time'  : heure "HH:MM"
 */
export const FACTORS = [
  { id: 'caffeine', label: 'Caféine', kind: 'count', unit: 'boisson(s)', hint: 'Café, thé, soda, boisson énergisante (sur la journée)', max: 20 },
  { id: 'caffeineLate', label: 'Caféine après 14 h', kind: 'bool', hint: 'Au moins une boisson caféinée l\'après-midi ou le soir' },
  { id: 'alcohol', label: 'Alcool', kind: 'count', unit: 'verre(s)', hint: 'Verres standard dans la soirée', max: 30 },
  { id: 'exercise', label: 'Activité physique', kind: 'minutes', unit: 'min', hint: 'Durée d\'activité modérée à intense dans la journée', max: 600 },
  { id: 'lateExercise', label: 'Sport en soirée', kind: 'bool', hint: 'Activité intense dans les 3 h avant le coucher' },
  { id: 'daylight', label: 'Lumière du jour', kind: 'minutes', unit: 'min', hint: 'Temps passé dehors à la lumière du jour', max: 900 },
  { id: 'screens', label: 'Écrans au lit', kind: 'bool', hint: 'Téléphone, tablette ou ordinateur dans l\'heure avant de dormir' },
  { id: 'stress', label: 'Stress', kind: 'scale', hint: '1 = très calme, 5 = très stressé' },
  { id: 'lateMeal', label: 'Repas tardif', kind: 'bool', hint: 'Repas copieux dans les 2 h avant le coucher' },
  { id: 'irregular', label: 'Horaires inhabituels', kind: 'bool', hint: 'Travail de nuit, voyage, sortie tardive…' },
  { id: 'medication', label: 'Médicament pour dormir', kind: 'bool', hint: 'À renseigner pour contextualiser ; l\'app ne donne aucun avis médical' },
];
export const FACTOR_BY_ID = Object.fromEntries(FACTORS.map(f => [f.id, f]));

export const QUALITY_LABELS = ['Très mauvaise', 'Mauvaise', 'Correcte', 'Bonne', 'Très bonne'];
export const EASE_LABELS = ['Très difficile', 'Difficile', 'Moyen', 'Facile', 'Très facile'];

export function uid() {
  const r = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 14);
  return Date.now().toString(36) + '-' + r;
}

/** Crée un épisode vide avec toutes les valeurs « inconnues ». */
export function newEpisode(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    schema: SCHEMA_VERSION,
    type: 'night',
    tz: 'UTC',
    bedtime: null,
    lightsOff: null,
    solMin: null,
    awakenings: null,
    wasoMin: null,
    finalWake: null,
    outOfBed: null,
    quality: null,      // 1–5, qualité ressentie
    wakeEase: null,     // 1–5, facilité du réveil
    freeDay: null,      // true = jour libre le lendemain ; null = déduit (samedi/dimanche)
    factors: {},
    tags: [],
    notes: '',
    source: { kind: 'manual' },
    session: null,      // { startedAt, endedAt, plannedWake, events:[{t, kind}] }
    alarm: null,        // { plannedAt, rangAt, dismissedAt, snoozes, missed }
    measured: null,     // réservé aux données importées (montre, Santé…) : { tstMin, provider, method }
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isNullOr = (v, pred) => v === null || v === undefined || pred(v);

/**
 * Validation d'un épisode.
 * errors   : l'épisode est incohérent → il est exclu des statistiques (et l'exclusion est comptée).
 * warnings : valeur plausible mais inhabituelle → conservée, signalée.
 */
export function validateEpisode(e) {
  const errors = [], warnings = [];
  if (!e || typeof e !== 'object') return { errors: ['Épisode illisible.'], warnings, valid: false };
  if (!EPISODE_TYPES.includes(e.type)) errors.push('Type d\'épisode inconnu.');
  if (!isValidTimeZone(e.tz)) errors.push('Fuseau horaire invalide.');

  const bed = toMs(e.bedtime), off = toMs(e.lightsOff), fw = toMs(e.finalWake), out = toMs(e.outOfBed);
  if (bed === null) errors.push('Heure de coucher manquante.');
  if (fw === null && out === null) errors.push('Heure de réveil ou de lever manquante.');

  const start = off ?? bed;
  if (bed !== null && off !== null && off < bed) errors.push('L\'extinction des lumières précède le coucher.');
  if (start !== null && fw !== null && fw <= start) errors.push('Le réveil final précède le moment où vous avez essayé de dormir.');
  if (fw !== null && out !== null && out < fw) errors.push('Le lever précède le réveil final.');
  if (bed !== null && out !== null && out <= bed) errors.push('Le lever précède le coucher.');

  const tib = minutesBetween(e.bedtime, e.outOfBed ?? e.finalWake);
  const maxH = e.type === 'nap' ? 6 : 20;
  if (tib !== null && tib > maxH * 60) errors.push(`Durée au lit supérieure à ${maxH} h : vérifiez les dates.`);
  if (tib !== null && e.type === 'night' && tib < 60 && tib > 0) warnings.push('Nuit de moins d\'une heure : s\'agit-il d\'une sieste ?');

  for (const [k, max] of [['solMin', 600], ['wasoMin', 900]]) {
    if (!isNullOr(e[k], v => isNum(v) && v >= 0 && v <= max)) errors.push(`Valeur invalide pour ${k === 'solMin' ? 'la latence' : 'les réveils'}.`);
  }
  if (!isNullOr(e.awakenings, v => Number.isInteger(v) && v >= 0 && v <= 60)) errors.push('Nombre de réveils invalide.');
  if (isNum(e.awakenings) && e.awakenings === 0 && isNum(e.wasoMin) && e.wasoMin > 0) warnings.push('Durée d\'éveil renseignée sans réveil déclaré.');
  if (isNum(e.awakenings) && e.awakenings > 0 && e.wasoMin === 0) warnings.push('Réveils déclarés avec une durée nulle.');

  // La latence + l'éveil nocturne ne peuvent excéder la période entre extinction et réveil final.
  const window = minutesBetween(start, fw);
  if (window !== null && window > 0) {
    const used = (isNum(e.solMin) ? e.solMin : 0) + (isNum(e.wasoMin) ? e.wasoMin : 0);
    if (used > window) errors.push('Latence + éveils nocturnes dépassent le temps passé à essayer de dormir.');
  }
  for (const k of ['quality', 'wakeEase']) {
    if (!isNullOr(e[k], v => Number.isInteger(v) && v >= 1 && v <= 5)) errors.push('Échelle 1–5 invalide.');
  }
  if (isNum(e.solMin) && e.solMin > 120) warnings.push('Latence d\'endormissement supérieure à 2 h.');

  for (const [id, v] of Object.entries(e.factors || {})) {
    const f = FACTOR_BY_ID[id];
    if (!f || v === null || v === undefined) continue;
    const ok = f.kind === 'bool' ? typeof v === 'boolean'
      : f.kind === 'scale' ? Number.isInteger(v) && v >= 1 && v <= 5
      : (f.kind === 'count' || f.kind === 'minutes') ? isNum(v) && v >= 0 && v <= (f.max ?? 1e6)
      : true;
    if (!ok) errors.push(`Valeur invalide pour « ${f.label} ».`);
  }
  return { errors, warnings, valid: errors.length === 0 };
}

/** Normalise un épisode reçu (formulaire, import) : types, champs connus, dates ISO. */
export function normalizeEpisode(raw) {
  const e = newEpisode({ id: raw.id || uid() });
  for (const k of Object.keys(e)) if (raw[k] !== undefined) e[k] = raw[k];
  for (const k of ['bedtime', 'lightsOff', 'finalWake', 'outOfBed']) {
    const ms = toMs(e[k]);
    e[k] = ms === null ? null : new Date(ms).toISOString();
  }
  for (const k of ['solMin', 'wasoMin']) e[k] = e[k] === '' || e[k] === undefined || e[k] === null ? null : Number(e[k]);
  for (const k of ['awakenings', 'quality', 'wakeEase']) e[k] = e[k] === '' || e[k] === undefined || e[k] === null ? null : Math.round(Number(e[k]));
  e.factors = e.factors && typeof e.factors === 'object' ? { ...e.factors } : {};
  e.tags = Array.isArray(e.tags) ? e.tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim().slice(0, 40)) : [];
  e.notes = typeof e.notes === 'string' ? e.notes.slice(0, 4000) : '';
  e.schema = SCHEMA_VERSION;
  return e;
}
