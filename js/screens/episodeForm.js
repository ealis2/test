// Formulaire d'épisode (nuit ou sieste), partagé par le questionnaire du matin
// et le journal. Champs de l'agenda du sommeil consensuel ; tout est facultatif
// sauf le coucher et le réveil (ou le lever). Une réponse absente reste « inconnue ».

import { h, icon, fill } from '../ui/dom.js';
import { scaleInput, stepper, switchInput } from '../ui/components.js';
import { FACTORS, QUALITY_LABELS, EASE_LABELS, validateEpisode, normalizeEpisode } from '../core/model.js';
import { computeEpisode } from '../core/metrics.js';
import { zonedParts, zonedToMs, toMs, MIN } from '../core/time.js';
import { fmtDuration, fmtClock, fmtPct } from '../core/format.js';

/** ISO → valeur d'un <input type="datetime-local"> dans le fuseau de l'épisode. */
export function isoToLocalInput(iso, tz) {
  const p = zonedParts(iso, tz);
  if (!p) return '';
  return `${p.dateKey}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
export function localInputToIso(v, tz) {
  if (!v) return null;
  const [d, t] = v.split('T');
  if (!d || !t) return null;
  return new Date(zonedToMs(d, t.slice(0, 5), tz)).toISOString();
}

const LATENCY_PRESETS = [5, 10, 15, 20, 30, 45, 60];

/**
 * Construit le formulaire. Renvoie { el, getDraft, validate }.
 * mode : 'morning' (questionnaire guidé, horaires pré-remplis) | 'full' (journal).
 */
export function episodeForm(initial, { mode = 'full', onChange } = {}) {
  const d = structuredClone(initial);
  d.factors ||= {};
  const tz = d.tz;
  const changed = () => { renderSummary(); onChange && onChange(d); };

  // --- Horaires
  const timeField = (key, label, hint, required = false) => {
    const input = h('input', { type: 'datetime-local', value: isoToLocalInput(d[key], tz), required, 'aria-describedby': `${key}-hint`,
      oninput: e => { d[key] = localInputToIso(e.target.value, tz); changed(); } });
    return h('label', { class: 'field' }, h('span', null, label, required ? ' *' : ''), input, hint ? h('span', { class: 'hint', id: `${key}-hint` }, hint) : null);
  };
  let lightsSame = !d.lightsOff || d.lightsOff === d.bedtime;
  const lightsWrap = h('div');
  const renderLights = () => fill(lightsWrap, lightsSame ? h('span') : timeField('lightsOff', 'J\'ai essayé de dormir à', 'Si vous avez lu ou regardé un écran au lit avant d\'éteindre.'));
  renderLights();

  const timing = h('fieldset', { class: 'fields form-block' },
    h('legend', { class: 'eyebrow' }, 'Horaires'),
    h('div', { class: 'fields two' },
      timeField('bedtime', d.type === 'nap' ? 'Début de la sieste' : 'Coucher', 'Mise au lit', true),
      timeField('outOfBed', 'Lever', 'Sortie du lit')),
    switchInput({ label: 'J\'ai essayé de dormir dès le coucher', checked: lightsSame, onChange: v => { lightsSame = v; if (v) d.lightsOff = null; renderLights(); changed(); } }),
    lightsWrap,
    timeField('finalWake', 'Réveil final', 'Dernier réveil, avant de vous lever', true));

  // --- Latence
  const solOut = h('span', { class: 'hint' });
  const solChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Latence d\'endormissement' });
  const renderSol = () => {
    fill(solChips, ...LATENCY_PRESETS.map(v => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(d.solMin === v), onclick: () => { d.solMin = d.solMin === v ? null : v; renderSol(); changed(); } }, `${v} min`)),
      h('input', { class: 'input sol-custom', type: 'number', min: 0, max: 600, inputmode: 'numeric', placeholder: 'autre', 'aria-label': 'Autre durée en minutes', value: d.solMin !== null && !LATENCY_PRESETS.includes(d.solMin) ? d.solMin : '', onchange: e => { d.solMin = e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)); renderSol(); changed(); } }));
    const start = toMs(d.lightsOff || d.bedtime);
    solOut.textContent = d.solMin === null ? 'Non renseignée : le temps de sommeil ne pourra pas être calculé.' : start ? `Endormissement estimé vers ${fmtClock(zonedParts(start + d.solMin * MIN, tz).minutesOfDay)}.` : '';
  };
  renderSol();

  // --- Réveils nocturnes
  const wakeBlock = h('div', { class: 'fields' });
  const renderWake = () => {
    const none = d.awakenings === 0;
    fill(wakeBlock, 
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(none), onclick: () => { if (none) { d.awakenings = null; d.wasoMin = null; } else { d.awakenings = 0; d.wasoMin = 0; } renderWake(); changed(); } }, 'Aucun réveil'),
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(d.awakenings === null), onclick: () => { d.awakenings = null; d.wasoMin = null; renderWake(); changed(); } }, 'Je ne sais pas')),
      none ? null : h('div', { class: 'fields two' },
        h('div', { class: 'field' }, h('span', null, 'Nombre de réveils'), stepper({ value: d.awakenings, min: 0, max: 30, label: 'Nombre de réveils', onChange: v => { d.awakenings = v; if (v === 0) d.wasoMin = 0; changed(); } })),
        h('div', { class: 'field' }, h('span', null, 'Durée totale éveillé'), stepper({ value: d.wasoMin, min: 0, max: 600, step: 5, unit: 'min', label: 'Durée totale des réveils', onChange: v => { d.wasoMin = v; changed(); } }))));
  };
  renderWake();

  const continuity = h('fieldset', { class: 'fields form-block' },
    h('legend', { class: 'eyebrow' }, 'Endormissement et réveils'),
    h('div', { class: 'field' }, h('span', null, 'Temps pour vous endormir (estimation)'), solChips, solOut),
    h('div', { class: 'field' }, h('span', null, 'Réveils pendant la nuit'), wakeBlock,
      h('span', { class: 'hint' }, 'Estimation de mémoire. Les réveils très brefs passent souvent inaperçus.')));

  // --- Ressenti
  const feeling = h('fieldset', { class: 'fields form-block' },
    h('legend', { class: 'eyebrow' }, 'Ressenti'),
    h('div', { class: 'field' }, h('span', null, 'Qualité du sommeil'), scaleInput({ labels: QUALITY_LABELS, value: d.quality, name: 'Qualité du sommeil', onChange: v => { d.quality = v; changed(); } })),
    d.type === 'night' ? h('div', { class: 'field' }, h('span', null, 'Facilité du réveil'), scaleInput({ labels: EASE_LABELS, value: d.wakeEase, name: 'Facilité du réveil', onChange: v => { d.wakeEase = v; changed(); } })) : null);

  // --- Contexte (facultatif)
  const factorEl = f => {
    const v = d.factors[f.id];
    if (f.kind === 'bool') {
      return h('div', { class: 'factor' }, h('span', { class: 'factor-label' }, f.label, h('span', { class: 'hint' }, f.hint)),
        h('div', { class: 'seg', role: 'group', 'aria-label': f.label },
          ...[[true, 'Oui'], [false, 'Non'], [null, '—']].map(([val, t]) => h('button', { type: 'button', 'aria-pressed': String((v ?? null) === val), onclick: () => { if (val === null) delete d.factors[f.id]; else d.factors[f.id] = val; renderFactors(); changed(); } }, t))));
    }
    if (f.kind === 'scale') {
      return h('div', { class: 'factor col' }, h('span', { class: 'factor-label' }, f.label, h('span', { class: 'hint' }, f.hint)),
        scaleInput({ labels: ['', '', '', '', ''], value: v ?? null, name: f.label, onChange: nv => { if (nv === null) delete d.factors[f.id]; else d.factors[f.id] = nv; changed(); } }));
    }
    return h('div', { class: 'factor' }, h('span', { class: 'factor-label' }, f.label, h('span', { class: 'hint' }, f.hint)),
      stepper({ value: v ?? null, min: 0, max: f.max, step: f.kind === 'minutes' ? 10 : 1, unit: f.unit, label: f.label, onChange: nv => { if (nv === null) delete d.factors[f.id]; else d.factors[f.id] = nv; changed(); } }));
  };
  const factorsWrap = h('div', { class: 'factors' });
  const renderFactors = () => fill(factorsWrap, ...FACTORS.map(factorEl));
  renderFactors();
  const tagsInput = h('input', { class: 'input', type: 'text', placeholder: 'ex. voyage, bébé, chaleur', value: (d.tags || []).join(', '), onchange: e => { d.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 20); changed(); } });
  const context = h('details', { class: 'form-block context', open: mode === 'full' && Object.keys(d.factors).length > 0 },
    h('summary', { class: 'eyebrow' }, 'Contexte de la journée (facultatif)'),
    h('p', { class: 'hint' }, 'Ces informations servent à des comparaisons exploratoires. Elles ne prouvent jamais qu\'un facteur a causé une variation.'),
    factorsWrap,
    h('label', { class: 'field' }, h('span', null, 'Étiquettes personnelles'), tagsInput, h('span', { class: 'hint' }, 'Séparées par des virgules.')),
    d.type === 'night' ? h('div', { class: 'factor' }, h('span', { class: 'factor-label' }, 'Lendemain', h('span', { class: 'hint' }, 'Par défaut : jour libre si le réveil tombe un samedi ou un dimanche.')),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Type de lendemain' },
        ...[[null, 'Auto'], [false, 'Travaillé'], [true, 'Libre']].map(([val, t]) => {
          const b = h('button', { type: 'button', 'aria-pressed': String(d.freeDay === val), onclick: () => { d.freeDay = val; [...b.parentElement.children].forEach(x => x.setAttribute('aria-pressed', String(x === b))); changed(); } }, t);
          return b;
        }))) : null);

  const notes = h('label', { class: 'field form-block' }, h('span', { class: 'eyebrow' }, 'Notes'),
    h('textarea', { maxlength: 4000, placeholder: 'Rêves, bruit, température, événement…', oninput: e => { d.notes = e.target.value; } }, d.notes || ''));

  // --- Récapitulatif en direct + erreurs
  const summary = h('div', { class: 'form-summary', 'aria-live': 'polite' });
  function renderSummary() {
    const v = validateEpisode(normalizeEpisode(d));
    const m = computeEpisode(normalizeEpisode(d));
    fill(summary, 
      v.errors.length ? h('div', { class: 'form-errors', role: 'alert' }, icon('warning'), h('ul', null, v.errors.map(e => h('li', null, e)))) : null,
      v.warnings.length ? h('ul', { class: 'form-warnings' }, v.warnings.map(w => h('li', null, w))) : null,
      v.valid ? h('dl', { class: 'kv' },
        h('div', null, h('dt', null, 'Temps au lit'), h('dd', null, fmtDuration(m.tib), m.tibEstimated ? h('small', null, ' (jusqu\'au réveil)') : null)),
        h('div', null, h('dt', null, 'Temps de sommeil estimé'), h('dd', null, m.tst === null ? h('small', null, 'latence et réveils nécessaires') : fmtDuration(m.tst))),
        h('div', null, h('dt', null, 'Efficacité'), h('dd', null, m.se === null ? h('small', null, 'non calculable') : fmtPct(m.se)))) : null);
  }
  renderSummary();

  const el = h('div', { class: 'episode-form' }, timing, continuity, feeling, context, notes, summary);
  return {
    el,
    getDraft: () => normalizeEpisode(d),
    validate: () => validateEpisode(normalizeEpisode(d)),
  };
}
