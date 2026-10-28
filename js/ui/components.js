// Composants d'interface réutilisables.

import { h, icon, fill } from './dom.js';
import { REF_BY_ID, shortCite } from '../science/references.js';
import { EVIDENCE, METRIC_BY_ID } from '../science/knowledge.js';

export function pageHeader({ eyebrow, title, lead, actions }) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'grow' },
      eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
      h('h1', { class: 'h1', tabindex: '-1', id: 'page-title' }, title),
      lead ? h('p', { class: 'lead' }, lead) : null),
    actions ? h('div', { class: 'row-actions' }, actions) : null);
}

export function plate({ eyebrow, title, aside, children, cls }) {
  return h('section', { class: ['plate', cls] },
    (eyebrow || title || aside) ? h('div', { class: 'plate-head' },
      h('div', null, eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null, title ? h('h2', { class: 'h2' }, title) : null),
      aside || null) : null,
    children);
}

export function statTile({ label, value, meta, delta, deltaTone = 'neutral', na = false }) {
  return h('div', { class: 'stat' },
    h('span', { class: 'label' }, label),
    h('span', { class: ['value', na && 'na'] }, value),
    delta ? h('span', { class: ['delta', deltaTone] }, delta) : null,
    meta ? h('span', { class: 'meta' }, meta) : null);
}

export function evidenceBadge(level) {
  const e = EVIDENCE[level];
  return h('span', { class: ['evidence', level], title: e?.desc }, e?.label || level);
}

/** Lien(s) vers les références : « (Watson et al., 2015) ». */
export function cite(ids) {
  const list = (ids || []).filter(id => REF_BY_ID[id]);
  if (!list.length) return null;
  const parts = [];
  list.forEach((id, i) => {
    if (i) parts.push(' ; ');
    parts.push(h('a', { href: `#/science/ref/${id}` }, shortCite(id)));
  });
  return h('span', { class: 'cite' }, 'Sources : ', parts);
}

export function insufficient(text) {
  return h('div', { class: 'insufficient', role: 'note' }, icon('info'), h('span', null, text));
}

/** Panneau « Méthode de calcul » relié à la fiche de l'indicateur. */
export function methodDetails(metricId, extra) {
  const m = METRIC_BY_ID[metricId];
  if (!m) return null;
  return h('details', { class: 'method' },
    h('summary', null, 'Méthode de calcul'),
    h('div', { class: 'body' },
      h('p', null, h('b', null, 'Formule. '), m.formula),
      h('p', null, h('b', null, 'Données manquantes. '), m.missing),
      h('p', null, h('b', null, 'Limites. '), m.limits),
      extra || null,
      cite(m.refs)));
}

export function emptyState({ title, text, action }) {
  return h('div', { class: 'empty' }, nightIllustration(), h('h2', { class: 'h2' }, title), h('p', { class: 'prose' }, text), action || null);
}

/** Petite illustration vectorielle : horizon, lune, quelques étoiles. */
export function nightIllustration() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line-strong)"/>
    <circle cx="60" cy="60" r="38" fill="none" stroke="var(--line)" stroke-dasharray="2 4"/>
    <path d="M73 64a18 18 0 1 1-17-24 14 14 0 0 0 17 24Z" fill="var(--moon)" opacity=".9"/>
    <path d="M14 86h92" stroke="var(--dawn)" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
    <circle cx="30" cy="34" r="1.4" fill="var(--fg-2)"/><circle cx="88" cy="30" r="1" fill="var(--fg-2)"/><circle cx="94" cy="58" r="1.4" fill="var(--fg-3)"/>`;
  return svg;
}

/** Contrôle segmenté accessible (boutons à bascule). */
export function segmented(options, value, onChange, label) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, text)));
}

/** Échelle 1–5 avec libellés. */
export function scaleInput({ labels, value, onChange, name }) {
  const wrap = h('div', { class: 'scale', role: 'radiogroup', 'aria-label': name });
  const render = v => {
    fill(wrap, ...labels.map((lab, i) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(v === i + 1),
      onclick: () => { const nv = v === i + 1 ? null : i + 1; render(nv); onChange(nv); },
    }, h('b', null, String(i + 1)), lab)));
  };
  render(value);
  return wrap;
}

/** Compteur avec état « inconnu » distinct de zéro. */
export function stepper({ value, min = 0, max = 99, step = 1, unit = '', onChange, label }) {
  let v = value;
  const out = h('output', { 'aria-live': 'polite' });
  const wrap = h('div', { class: 'stepper', role: 'group', 'aria-label': label });
  const sync = () => { out.textContent = v === null ? 'non renseigné' : `${v}${unit ? ' ' + unit : ''}`; wrap.classList.toggle('unknown', v === null); };
  const set = nv => { v = nv; sync(); onChange(v); };
  wrap.append(
    h('button', { type: 'button', 'aria-label': 'Diminuer', onclick: () => set(v === null ? min : Math.max(min, v - step)) }, '−'),
    out,
    h('button', { type: 'button', 'aria-label': 'Augmenter', onclick: () => set(v === null ? min : Math.min(max, v + step)) }, '+'));
  sync();
  return wrap;
}

export function switchInput({ label, checked, onChange, hint }) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, onchange: e => onChange(e.target.checked) });
  return h('label', { class: 'switch' }, input, h('span', null, label, hint ? h('span', { class: 'hint faint small', style: { display: 'block' } }, hint) : null));
}
