// Journal : liste, calendrier, fiche détaillée d'un épisode, formulaire.

import { h, icon, toast, confirmSheet, fill } from '../ui/dom.js';
import { dial } from '../ui/charts.js';
import { segmented, insufficient, methodDetails } from '../ui/components.js';
import { computeEpisode, completeness } from '../core/metrics.js';
import { onePerNight, inRange } from '../core/analysis.js';
import { describe } from '../core/stats.js';
import { newEpisode, FACTOR_BY_ID, QUALITY_LABELS, EASE_LABELS } from '../core/model.js';
import { addDays, zonedToMs, weekdayOfKey, toMs } from '../core/time.js';
import { fmtDuration, fmtClock, fmtDateKey, fmtPct, fmtInstant } from '../core/format.js';
import { episodeForm } from './episodeForm.js';
import { demoBanner } from './shared.js';

const SOURCE_LABEL = { manual: 'Saisie manuelle', session: 'Session Somnia', import: 'Importé', 'legacy-v1': 'Somnia v1', demo: 'Démonstration' };
let listFilter = 'all';
let listLimit = 60;
let calSelected = null;

function journalHead(app, active) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'grow' },
      h('p', { class: 'eyebrow' }, `${app.repo.episodes.length} épisode(s)`),
      h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, 'Journal')),
    h('div', { class: 'row-actions' },
      segmented([['list', 'Liste'], ['calendar', 'Calendrier']], active, v => app.navigate(v === 'list' ? '#/journal' : '#/journal/calendar'), 'Affichage du journal'),
      h('a', { class: 'btn small primary', href: '#/entry/new' }, icon('plus'), 'Nuit'),
      h('a', { class: 'btn small ghost', href: '#/entry/new/nap' }, icon('nap'), 'Sieste')));
}

/** Mini frise d'une nuit : axe 18 h → 14 h, au lit (pâle) et sommeil (clair). */
function miniBar(m) {
  const START = 18 * 60, SPAN = 20 * 60;
  const pos = c => { if (c === null) return null; let r = c - START; if (r < 0) r += 1440; return Math.min(100, Math.max(0, (r / SPAN) * 100)); };
  const bar = h('div', { class: 'minibar', 'aria-hidden': 'true' });
  const b = pos(m.bedClock), o = pos(m.outClock ?? m.wakeClock), s = pos(m.onsetClock), w = pos(m.wakeClock);
  if (b !== null && o !== null && o > b) bar.append(h('i', { class: 'inbed', style: { left: b + '%', width: (o - b) + '%' } }));
  if (s !== null && w !== null && w > s) bar.append(h('i', { class: 'asleep', style: { left: s + '%', width: (w - s) + '%' } }));
  return bar;
}

// ------------------------------------------------------------------ Liste
export function renderList(app) {
  const { repo } = app;
  const all = repo.episodes.map(e => ({ e, m: computeEpisode(e) }))
    .sort((a, b) => (toMs(b.e.bedtime) ?? 0) - (toMs(a.e.bedtime) ?? 0));
  const filtered = all.filter(x => listFilter === 'all' ? true
    : listFilter === 'night' ? x.e.type === 'night'
    : listFilter === 'nap' ? x.e.type === 'nap'
    : listFilter === 'incomplete' ? (x.m.valid && x.m.tst === null) || !x.m.valid : true);
  const root = h('div', { class: 'journal' });
  if (repo.hasDemo) root.append(demoBanner(app));
  root.append(journalHead(app, 'list'));
  root.append(h('div', { class: 'toolbar' }, segmented([['all', 'Tout'], ['night', 'Nuits'], ['nap', 'Siestes'], ['incomplete', 'À compléter']], listFilter, v => { listFilter = v; listLimit = 60; app.rerender(); }, 'Filtrer les épisodes')));

  if (!all.length) {
    root.append(h('div', { class: 'empty' }, h('h2', { class: 'h2' }, 'Aucune nuit pour l\'instant'), h('p', { class: 'prose' }, 'Ajoutez une nuit passée ou lancez une session ce soir.'), h('a', { class: 'btn primary', href: '#/entry/new' }, icon('plus'), 'Ajouter une nuit')));
    return root;
  }
  if (!filtered.length) { root.append(insufficient('Aucun épisode ne correspond à ce filtre.')); return root; }

  let month = null, list = null;
  for (const x of filtered.slice(0, listLimit)) {
    const key = x.m.nightKey || (x.e.bedtime || '').slice(0, 10);
    const mk = key.slice(0, 7);
    if (mk !== month) {
      month = mk;
      root.append(h('h2', { class: 'eyebrow month-label' }, fmtDateKey(mk + '-15', { month: 'long', year: 'numeric' })));
      list = h('div', { class: 'list plate journal-list' });
      root.append(list);
    }
    const c = completeness(x.e);
    list.append(h('a', { href: `#/entry/${x.e.id}`, class: ['entry-row', `type-${x.e.type}`] },
      h('div', { class: 'entry-date' }, h('span', { class: 'wd' }, fmtDateKey(key, { weekday: 'short' })), h('span', { class: 'dn' }, key.slice(8, 10).replace(/^0/, ''))),
      h('div', { class: 'grow' },
        h('div', { class: 'entry-line' },
          h('b', null, x.e.type === 'nap' ? 'Sieste' : x.m.tst !== null ? fmtDuration(x.m.tst) : x.m.tib !== null ? `${fmtDuration(x.m.tib)} au lit` : '—'),
          h('span', { class: 'sub' }, x.m.valid ? `${fmtClock(x.m.bedClock)} → ${fmtClock(x.m.outClock ?? x.m.wakeClock)}` : 'Incohérent : exclu des statistiques')),
        x.e.type === 'night' && x.m.valid ? miniBar(x.m) : null,
        h('div', { class: 'entry-tags' },
          x.m.quality !== null ? h('span', { class: 'tag' }, `Qualité ${x.m.quality}/5`) : null,
          x.m.valid && x.m.tst === null ? h('span', { class: 'tag warn' }, 'Temps de sommeil non calculable') : null,
          !x.m.valid ? h('span', { class: 'tag warn' }, 'À corriger') : null,
          c.missing.length && x.m.valid ? h('span', { class: 'tag faint' }, `${c.filled}/${c.total} champs`) : null,
          x.e.source?.kind === 'demo' ? h('span', { class: 'tag demo' }, 'démo') : null,
          x.e.source?.kind === 'session' ? h('span', { class: 'tag' }, 'session') : null)),
      icon('chevronRight', { class: 'chev' })));
  }
  if (filtered.length > listLimit) root.append(h('button', { class: 'btn ghost block', type: 'button', onclick: () => { listLimit += 90; app.rerender(); } }, `Afficher plus (${filtered.length - listLimit} restants)`));
  return root;
}

// ------------------------------------------------------------------ Calendrier
export function renderCalendar(app, monthKey) {
  const { repo } = app;
  const today = app.todayKey();
  const ym = monthKey || today.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${ym}-${String(daysIn).padStart(2, '0')}`;
  const goal = repo.settings.goalMin;
  const p = app.prepared();
  const { nights } = onePerNight(inRange(p.nights, addDays(first, -7), addDays(last, 7)));
  const byKey = new Map(nights.map(x => [x.m.nightKey, x]));
  const napsBy = new Map();
  for (const n of p.naps) { const k = n.m.nightKey; napsBy.set(k, [...(napsBy.get(k) || []), n]); }
  const invalidBy = new Set(p.invalid.map(x => (x.e.finalWake || x.e.outOfBed || x.e.bedtime || '').slice(0, 10)));
  const prevM = (() => { const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
  const nextM = (() => { const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();

  const cls = x => {
    if (!x) return 'none';
    const v = x.m.tst;
    if (v === null) return 'partial';
    if (v < goal - 60) return 'short';
    if (v > goal + 60) return 'long';
    return v < goal - 15 ? 'near-short' : 'ok';
  };

  // Grille du lundi au dimanche
  const lead = (weekdayOfKey(first) + 6) % 7;
  const start = addDays(first, -lead);
  const weeks = Math.ceil((lead + daysIn) / 7);
  if (!calSelected || calSelected.slice(0, 7) !== ym) calSelected = today.slice(0, 7) === ym ? today : first;

  const detail = h('div', { class: 'cal-detail', 'aria-live': 'polite' });
  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': `Calendrier de ${fmtDateKey(first, { month: 'long', year: 'numeric' })}` });
  grid.append(h('div', { class: 'cal-row head', role: 'row' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => h('span', { role: 'columnheader', 'aria-label': ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][i] }, d)), h('span', { class: 'wk', role: 'columnheader' }, 'Moy.')));
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    const row = h('div', { class: 'cal-row', role: 'row' });
    const wkVals = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, w * 7 + d);
      const x = byKey.get(key);
      if (x?.m.tst != null) wkVals.push(x.m.tst);
      const inMonth = key.slice(0, 7) === ym;
      const future = key > today;
      const c = h('button', {
        type: 'button', role: 'gridcell', class: ['cal-cell', cls(x), !inMonth && 'out', key === today && 'today', future && 'future'],
        'aria-selected': String(key === calSelected), tabindex: key === calSelected ? '0' : '-1', dataset: { key },
        'aria-label': `${fmtDateKey(key)} : ${x ? (x.m.tst !== null ? fmtDuration(x.m.tst) + ' de sommeil' : 'nuit incomplète') : 'aucune nuit'}${napsBy.has(key) ? ', sieste' : ''}`,
        onclick: () => select(key),
      },
        h('span', { class: 'cal-day' }, key.slice(8).replace(/^0/, '')),
        x ? h('span', { class: 'cal-val' }, x.m.tst !== null ? fmtDuration(x.m.tst, { compact: true }) : '…') : null,
        h('span', { class: 'cal-marks' }, napsBy.has(key) ? h('i', { class: 'nap-dot', title: 'Sieste' }) : null, invalidBy.has(key) ? h('i', { class: 'inv-dot', title: 'Saisie incohérente' }) : null));
      cells.push(c);
      row.append(c);
    }
    const wd = describe(wkVals, { minN: 3 });
    row.append(h('span', { class: 'wk', role: 'gridcell', 'aria-label': wd.insufficient ? 'Moyenne de la semaine : moins de 3 nuits' : `Moyenne de la semaine : ${fmtDuration(wd.mean)}` }, wd.insufficient ? '—' : fmtDuration(wd.mean, { compact: true })));
    grid.append(row);
  }

  // Navigation clavier dans la grille (flèches, semaine = ± 7)
  grid.addEventListener('keydown', e => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const nk = addDays(calSelected, delta);
    if (nk.slice(0, 7) !== ym) { calSelected = nk; app.navigate(`#/journal/calendar/${nk.slice(0, 7)}`); return; }
    select(nk, true);
  });

  function select(key, focus = false) {
    calSelected = key;
    for (const c of cells) {
      const on = c.dataset.key === key;
      c.setAttribute('aria-selected', String(on));
      c.tabIndex = on ? 0 : -1;
      if (on && focus) c.focus();
    }
    const x = byKey.get(key);
    const naps = napsBy.get(key) || [];
    fill(detail, 
      h('div', { class: 'plate-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Jour sélectionné'), h('h2', { class: 'h2' }, fmtDateKey(key)))),
      x ? h('a', { class: 'cal-night', href: `#/entry/${x.e.id}` },
        dial({ size: 120, bed: x.m.bedClock, onset: x.m.onsetClock, wake: x.m.wakeClock, out: x.m.outClock, label: 'Cadran de la nuit' }),
        h('div', { class: 'grow' },
          h('p', { class: 'cal-big' }, x.m.tst !== null ? fmtDuration(x.m.tst) : `${fmtDuration(x.m.tib)} au lit`),
          h('p', { class: 'small muted' }, `${fmtClock(x.m.bedClock)} → ${fmtClock(x.m.outClock ?? x.m.wakeClock)}`, x.m.quality !== null ? ` · qualité ${x.m.quality}/5` : ''),
          x.m.tst !== null ? h('p', { class: 'small faint' }, `${fmtDuration(x.m.tst - goal, { signed: true })} par rapport à l'objectif`) : h('p', { class: 'small faint' }, 'Temps de sommeil non calculable')),
        icon('chevronRight', { class: 'chev' }))
        : key <= today ? h('div', { class: 'insufficient' }, icon('info'), h('span', null, 'Aucune nuit enregistrée pour cette date. ', h('a', { href: `#/entry/new?date=${key}` }, 'L\'ajouter')))
        : h('p', { class: 'muted small' }, 'Date à venir.'),
      naps.length ? h('div', { class: 'list' }, naps.map(n => h('a', { href: `#/entry/${n.e.id}` }, icon('nap'), h('span', { class: 'grow' }, `Sieste ${fmtClock(n.m.bedClock)} → ${fmtClock(n.m.outClock ?? n.m.wakeClock)}`), icon('chevronRight', { class: 'chev' })))) : null);
  }
  select(calSelected);

  const monthNights = nights.filter(x => x.m.nightKey >= first && x.m.nightKey <= last);
  const ms = describe(monthNights.map(x => x.m.tst), { minN: 3 });
  const root = h('div', { class: 'journal' });
  if (repo.hasDemo) root.append(demoBanner(app));
  root.append(journalHead(app, 'calendar'),
    h('div', { class: 'cal-layout' },
      h('section', { class: 'plate cal' },
        h('div', { class: 'cal-nav' },
          h('a', { class: 'icon-btn', href: `#/journal/calendar/${prevM}`, 'aria-label': 'Mois précédent' }, icon('chevronLeft')),
          h('h2', { class: 'h2 grow center' }, fmtDateKey(first, { month: 'long', year: 'numeric' })),
          h('a', { class: 'icon-btn', href: `#/journal/calendar/${nextM}`, 'aria-label': 'Mois suivant' }, icon('chevronRight'))),
        grid,
        h('div', { class: 'chart-legend cal-legend' },
          h('span', null, h('i', { class: 'sw short' }), `< ${fmtDuration(goal - 60)}`),
          h('span', null, h('i', { class: 'sw near-short' }), 'un peu court'),
          h('span', null, h('i', { class: 'sw ok' }), `≈ objectif (${fmtDuration(goal)})`),
          h('span', null, h('i', { class: 'sw long' }), `> ${fmtDuration(goal + 60)}`),
          h('span', null, h('i', { class: 'sw partial' }), 'incomplète'),
          h('span', null, h('i', { class: 'nap-dot' }), 'sieste')),
        h('p', { class: 'small muted cal-month-sum' }, ms.insufficient ? `${monthNights.length} nuit(s) ce mois-ci.` : `${monthNights.length} nuits · moyenne ${fmtDuration(ms.mean)} · médiane ${fmtDuration(ms.median)} (${ms.n} avec temps de sommeil)`),
        ym !== today.slice(0, 7) ? h('a', { class: 'btn small ghost', href: '#/journal/calendar' }, 'Revenir à aujourd\'hui') : null),
      h('section', { class: 'plate' }, detail)));
  return root;
}

// ------------------------------------------------------------------ Fiche détaillée
export function renderDetail(app, id) {
  const { repo } = app;
  const e = repo.episode(id);
  if (!e) return h('div', { class: 'empty' }, h('h1', { class: 'h2', id: 'page-title', tabindex: '-1' }, 'Épisode introuvable'), h('a', { class: 'btn ghost', href: '#/journal' }, 'Retour au journal'));
  const m = computeEpisode(e);
  const goal = repo.settings.goalMin;
  const sorted = [...repo.episodes].filter(x => x.type === e.type).sort((a, b) => (a.bedtime < b.bedtime ? -1 : 1));
  const i = sorted.findIndex(x => x.id === id);
  const prev = sorted[i - 1], next = sorted[i + 1];
  const tz = e.tz;
  const startKey = m.nightKey ? addDays(m.nightKey, -1) : null;
  const title = e.type === 'nap' ? `Sieste du ${fmtDateKey(m.nightKey || e.bedtime.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })}`
    : m.nightKey ? `Nuit du ${fmtDateKey(startKey, { weekday: 'short', day: 'numeric' })} au ${fmtDateKey(m.nightKey, { weekday: 'short', day: 'numeric', month: 'long' })}` : 'Nuit';
  const row = (label, value, note) => h('div', null, h('dt', null, label), h('dd', null, value, note ? h('small', null, ' ', note) : null));
  const na = 'non renseigné';
  const ref = app.prepared();
  const { nights: last30 } = onePerNight(inRange(ref.nights, m.nightKey ? addDays(m.nightKey, -30) : '0000', m.nightKey ? addDays(m.nightKey, -1) : '0000'));
  const base = describe(last30.map(x => x.m.tst), { minN: 5 });

  const root = h('div', { class: 'entry-detail' },
    e.source?.kind === 'demo' ? h('p', { class: 'banner' }, icon('sparkle'), h('span', { class: 'grow' }, 'Épisode de démonstration (synthétique).')) : null,
    h('header', { class: 'page-head' },
      h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, `${SOURCE_LABEL[e.source?.kind] || 'Saisie'} · fuseau ${tz}`), h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, title)),
      h('div', { class: 'row-actions' },
        prev ? h('a', { class: 'icon-btn', href: `#/entry/${prev.id}`, 'aria-label': 'Épisode précédent' }, icon('chevronLeft')) : null,
        next ? h('a', { class: 'icon-btn', href: `#/entry/${next.id}`, 'aria-label': 'Épisode suivant' }, icon('chevronRight')) : null,
        h('a', { class: 'btn small ghost', href: `#/entry/${id}/edit` }, icon('edit'), 'Modifier'))),
    !m.valid ? h('div', { class: 'form-errors', role: 'alert' }, icon('warning'), h('div', null, h('p', null, 'Cet épisode est incohérent et exclu des statistiques :'), h('ul', null, m.errors.map(x => h('li', null, x))), h('a', { href: `#/entry/${id}/edit` }, 'Corriger'))) : null,
    m.warnings.length ? h('ul', { class: 'form-warnings' }, m.warnings.map(w => h('li', null, w))) : null);

  if (m.valid) {
    root.append(h('section', { class: 'plate detail-hero' },
      dial({ size: 220, bed: m.bedClock, onset: m.onsetClock, wake: m.wakeClock, out: m.outClock, label: 'Cadran de la nuit' }),
      h('div', { class: 'grow' },
        h('p', { class: 'eyebrow' }, m.tst !== null ? (m.tstSource === 'measured' ? 'Temps de sommeil mesuré' : 'Temps de sommeil estimé') : 'Temps au lit'),
        h('p', { class: 'display' }, fmtDuration(m.tst ?? m.tib)),
        m.tst !== null && e.type === 'night' ? h('p', { class: 'muted' }, `${fmtDuration(m.tst - goal, { signed: true })} par rapport à l'objectif`, !base.insufficient ? ` · ${fmtDuration(m.tst - base.median, { signed: true })} par rapport à votre médiane des 30 jours précédents (${base.n} nuits)` : '') : null,
        m.tst === null ? h('p', { class: 'small muted' }, 'Renseignez la latence et les réveils pour estimer le temps de sommeil.') : null)));

    root.append(h('div', { class: 'grid2 section' },
      h('section', { class: 'plate' },
        h('p', { class: 'eyebrow' }, 'Horaires'),
        h('dl', { class: 'kv' },
          row('Coucher', fmtInstant(e.bedtime, tz)),
          row('Extinction', e.lightsOff ? fmtInstant(e.lightsOff, tz) : 'au coucher'),
          row('Endormissement estimé', m.onsetMs !== null ? fmtInstant(new Date(m.onsetMs).toISOString(), tz) : na),
          row('Réveil final', e.finalWake ? fmtInstant(e.finalWake, tz) : na),
          row('Lever', e.outOfBed ? fmtInstant(e.outOfBed, tz) : na),
          row('Milieu du sommeil', m.midSleepClock !== null ? fmtClock(m.midSleepClock) : na),
          row('Lendemain', m.freeDay ? 'jour libre' : 'jour travaillé', e.freeDay === null ? '(déduit)' : ''))),
      h('section', { class: 'plate' },
        h('p', { class: 'eyebrow' }, 'Indicateurs'),
        h('dl', { class: 'kv' },
          row('Temps au lit', fmtDuration(m.tib), m.tibEstimated ? '(jusqu\'au réveil)' : ''),
          row('Latence', m.sol !== null ? `${Math.round(m.sol)} min` : na),
          row('Réveils', m.awakenings !== null ? String(m.awakenings) : na),
          row('Éveil nocturne', m.waso !== null ? `${Math.round(m.waso)} min` : na),
          row('Période de sommeil', fmtDuration(m.spt)),
          row('Temps de sommeil', m.tst !== null ? fmtDuration(m.tst) : 'non calculable'),
          row('Efficacité', m.se !== null ? fmtPct(m.se) : 'non calculable'),
          row('Au lit après le réveil', m.linger !== null ? `${Math.round(m.linger)} min` : na)),
        methodDetails('tst'), methodDetails('se'))));

    root.append(h('div', { class: 'grid2 section' },
      h('section', { class: 'plate' },
        h('p', { class: 'eyebrow' }, 'Ressenti et contexte'),
        h('dl', { class: 'kv' },
          row('Qualité ressentie', e.quality ? `${e.quality}/5 · ${QUALITY_LABELS[e.quality - 1]}` : na),
          e.type === 'night' ? row('Facilité du réveil', e.wakeEase ? `${e.wakeEase}/5 · ${EASE_LABELS[e.wakeEase - 1]}` : na) : null,
          ...Object.entries(e.factors || {}).filter(([k, v]) => FACTOR_BY_ID[k] && v !== null).map(([k, v]) => {
            const f = FACTOR_BY_ID[k];
            return row(f.label, typeof v === 'boolean' ? (v ? 'oui' : 'non') : `${v}${f.unit ? ' ' + f.unit : f.kind === 'scale' ? '/5' : ''}`);
          }),
          e.tags?.length ? row('Étiquettes', e.tags.join(', ')) : null),
        e.notes ? h('p', { class: 'prose notes' }, e.notes) : null,
        !Object.keys(e.factors || {}).length && !e.notes ? h('p', { class: 'small faint' }, 'Aucun contexte renseigné.') : null),
      sessionPanel(e)));
  }

  root.append(h('div', { class: 'section row-actions' },
    h('a', { class: 'btn ghost', href: `#/entry/${id}/edit` }, icon('edit'), 'Modifier'),
    h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!(await confirmSheet({ title: 'Supprimer cet épisode ?', text: 'Cette action est définitive. Les statistiques seront recalculées.', confirm: 'Supprimer', danger: true }))) return;
      const backup = structuredClone(e);
      await repo.deleteEpisode(id);
      toast('Épisode supprimé.', { action: 'Annuler', onAction: async () => { await repo.saveEpisode(backup); app.navigate(`#/entry/${id}`); } });
      app.navigate('#/journal');
    } }, icon('trash'), 'Supprimer')));
  return root;
}

function sessionPanel(e) {
  const tz = e.tz;
  const label = { start: 'Début de la session', background: 'App en arrière-plan', resume: 'Retour dans l\'app', 'alarm-ring': 'Alarme', snooze: 'Répétition', 'alarm-dismiss': 'Alarme arrêtée', end: 'Fin de la session' };
  if (!e.session && !e.alarm) return h('section', { class: 'plate' }, h('p', { class: 'eyebrow' }, 'Provenance'), h('p', { class: 'small muted' }, e.source?.note || (e.source?.kind === 'manual' ? 'Nuit saisie à la main.' : 'Aucune session associée.')));
  const ev = (e.session?.events || []).filter(x => label[x.kind]);
  const bg = ev.filter(x => x.kind === 'background').length;
  return h('section', { class: 'plate' },
    h('p', { class: 'eyebrow' }, 'Session et alarme'),
    e.alarm ? h('dl', { class: 'kv' },
      h('div', null, h('dt', null, 'Réveil prévu'), h('dd', null, fmtInstant(e.alarm.plannedAt, tz))),
      h('div', null, h('dt', null, 'A sonné'), h('dd', null, e.alarm.rangAt ? fmtInstant(e.alarm.rangAt, tz) : 'non (session terminée avant)', e.alarm.lateSec > 90 ? h('small', null, ` · ${fmtDuration(e.alarm.lateSec / 60)} de retard`) : null)),
      h('div', null, h('dt', null, 'Répétitions'), h('dd', null, String(e.alarm.snoozes || 0)))) : null,
    bg ? h('p', { class: 'small muted' }, `L'app est passée ${bg} fois en arrière-plan pendant la nuit.`) : null,
    ev.length ? h('ol', { class: 'timeline' }, ev.slice(0, 30).map(x => h('li', null, h('span', { class: 'mono small' }, fmtInstant(x.t, tz, { hour: '2-digit', minute: '2-digit' })), ' ', label[x.kind], x.kind === 'alarm-ring' && x.lateSec > 90 ? ` (retard ${fmtDuration(x.lateSec / 60)})` : ''))) : null);
}

// ------------------------------------------------------------------ Formulaire
export function renderForm(app, arg) {
  const { repo, tz } = app;
  const editing = arg && arg !== 'nap' && arg !== 'night' ? repo.episode(arg) : null;
  if (arg && arg !== 'nap' && arg !== 'night' && !editing) return h('div', { class: 'empty' }, h('h1', { class: 'h2', id: 'page-title', tabindex: '-1' }, 'Épisode introuvable'));
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let draft;
  if (editing) draft = structuredClone(editing);
  else {
    const today = app.todayKey();
    const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : today;
    if (arg === 'nap') {
      draft = newEpisode({ tz, type: 'nap', bedtime: iso(day, '14:00', tz), finalWake: iso(day, '14:30', tz), outOfBed: iso(day, '14:35', tz) });
    } else {
      draft = newEpisode({ tz, type: 'night', bedtime: iso(addDays(day, -1), '23:00', tz), finalWake: iso(day, '07:00', tz), outOfBed: iso(day, '07:10', tz) });
    }
  }
  const form = episodeForm(draft, { mode: 'full' });
  const save = async () => {
    const out = form.getDraft();
    if (editing && editing.source?.kind === 'demo') out.source = editing.source;
    else if (editing) out.source = { ...editing.source, edited: true };
    const r = await repo.saveEpisode(out);
    if (!r.ok) { toast('Vérifiez les champs signalés.'); form.el.querySelector('.form-errors')?.scrollIntoView({ block: 'center' }); return; }
    toast(editing ? 'Modifications enregistrées.' : 'Épisode ajouté.');
    app.navigate(`#/entry/${r.episode.id}`);
  };
  return h('div', { class: 'entry-form' },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' },
      h('p', { class: 'eyebrow' }, editing ? 'Modifier' : 'Ajouter au journal'),
      h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, draft.type === 'nap' ? 'Sieste' : 'Nuit'),
      h('p', { class: 'lead' }, 'Seuls le coucher et le réveil sont indispensables. Les autres champs affinent les calculs.'))),
    h('div', { class: 'plate' }, form.el),
    h('div', { class: 'sticky-actions' },
      h('a', { class: 'btn ghost', href: editing ? `#/entry/${editing.id}` : '#/journal' }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('check'), 'Enregistrer')));
}

const iso = (key, hhmm, tz) => new Date(zonedToMs(key, hhmm, tz)).toISOString();
