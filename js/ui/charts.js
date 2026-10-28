// Graphiques SVG interactifs, sans dépendance.
// Principes : chaque graphique répond à une question ; unités et périodes
// explicites ; données manquantes visibles (hachures), jamais dessinées à zéro ;
// infobulles au survol, au toucher ET au clavier (flèches) ; tableau de données
// accessible en alternative.

import { h, s, icon, fill } from './dom.js';
import { fmtDuration, fmtClock, fmtDateKey, fmtNumber } from '../core/format.js';
import { unwrapClock } from '../core/stats.js';

let uidSeq = 0;
const nextId = p => `${p}-${++uidSeq}`;

/** Monte un graphique qui se redessine à la largeur de son conteneur. */
export function responsive(draw, { minWidth = 280 } = {}) {
  const wrap = h('div', { class: 'chart' });
  let lastW = 0;
  const render = () => {
    const w = Math.max(minWidth, Math.round(wrap.clientWidth || wrap.parentElement?.clientWidth || 340));
    if (w === lastW) return;
    lastW = w;
    fill(wrap, );
    draw(wrap, w);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => render()).observe(wrap);
  requestAnimationFrame(render);
  return wrap;
}

function scaleLinear([d0, d1], [r0, r1]) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = v => r0 + (v - d0) * k;
  f.invert = y => d0 + (y - r0) / (k || 1);
  return f;
}

function niceStep(range, target = 5) {
  const raw = range / target, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

function hatchDefs(svg) {
  const id = nextId('hatch');
  svg.append(s('defs', null, s('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
    s('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: 'var(--line-strong)', 'stroke-width': 2 }))));
  return `url(#${id})`;
}

/**
 * Interaction commune : survol, toucher, clavier. `items` = [{ x, y, title, rows:[[label, value]] }].
 * Renvoie une fonction pour sélectionner un index par programme.
 */
function interact(wrap, svg, items, { onSelect, label } = {}) {
  const tip = h('div', { class: 'tooltip', role: 'presentation' });
  wrap.append(tip);
  const marker = s('line', { class: 'sel', y1: 0, y2: 0, stroke: 'var(--focus)', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
  svg.append(marker);
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  wrap.append(live);
  let idx = -1;
  const show = i => {
    if (i < 0 || i >= items.length) { tip.classList.remove('show'); marker.setAttribute('opacity', 0); idx = -1; return; }
    idx = i;
    const it = items[i];
    fill(tip, h('div', { class: 't' }, it.title), ...it.rows.map(([k, v]) => h('div', { class: 'v' }, h('span', null, k), h('b', null, v))));
    const vb = svg.viewBox.baseVal, scale = svg.getBoundingClientRect().width / vb.width || 1;
    const x = it.x * scale, y = (it.y ?? 20) * scale;
    const wrapW = wrap.clientWidth;
    tip.style.left = `${Math.min(Math.max(x, 80), wrapW - 80)}px`;
    tip.style.top = `${Math.max(y, 56)}px`;
    tip.classList.add('show');
    if (it.markerX !== undefined) {
      marker.setAttribute('x1', it.markerX); marker.setAttribute('x2', it.markerX);
      marker.setAttribute('y1', it.markerTop ?? 0); marker.setAttribute('y2', it.markerBottom ?? vb.height);
      marker.setAttribute('opacity', .7);
    }
    live.textContent = `${it.title} : ${it.rows.map(r => r.join(' ')).join(', ')}`;
    onSelect && onSelect(it, i);
  };
  const nearest = evt => {
    const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const x = (evt.clientX - r.left) * (vb.width / r.width), y = (evt.clientY - r.top) * (vb.height / r.height);
    let best = -1, bd = Infinity;
    items.forEach((it, i) => {
      const d = it.hitY !== undefined ? Math.abs(it.hitY - y) * 4 + Math.abs(it.x - x) * 0.05 : Math.abs(it.x - x);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  svg.addEventListener('pointermove', e => show(nearest(e)));
  svg.addEventListener('pointerdown', e => show(nearest(e)));
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') show(-1); });
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'img');
  if (label) svg.setAttribute('aria-label', label + ' Utilisez les flèches gauche et droite pour parcourir les valeurs.');
  svg.addEventListener('keydown', e => {
    if (!items.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { show(Math.min(items.length - 1, idx + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { show(Math.max(0, idx < 0 ? items.length - 1 : idx - 1)); e.preventDefault(); }
    else if (e.key === 'Home') { show(0); e.preventDefault(); }
    else if (e.key === 'End') { show(items.length - 1); e.preventDefault(); }
    else if (e.key === 'Escape') show(-1);
    else if (e.key === 'Enter' && idx >= 0 && items[idx].href) location.hash = items[idx].href;
  });
  svg.addEventListener('blur', () => show(-1));
  svg.addEventListener('click', () => { if (idx >= 0 && items[idx].href && matchMedia('(hover: hover)').matches) location.hash = items[idx].href; });
  return show;
}

/** Tableau de données repliable (alternative accessible au graphique). */
export function dataTable(headers, rows, caption = 'Voir les données') {
  const d = h('details', { class: 'method data-table-toggle' }, h('summary', null, caption));
  d.addEventListener('toggle', () => {
    if (!d.open || d.querySelector('table')) return;
    d.append(h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tableau de données' }, h('table', { class: 'data-table' },
      h('thead', null, h('tr', null, headers.map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map(r => h('tr', null, r.map(c => h('td', null, c))))))));
  });
  return d;
}

export function legend(entries) {
  return h('div', { class: 'chart-legend' }, entries.map(([kind, color, label]) =>
    h('span', null, h('i', { class: kind, style: kind === 'hatch' ? {} : kind === 'line' || kind === 'dash' ? { borderColor: color } : { background: color } }), label)));
}

function xLabelFor(key, n) {
  const [, m, d] = key.split('-').map(Number);
  if (n <= 14) return ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(key + 'T12:00:00Z').getUTCDay()] + ' ' + d;
  return `${d}/${m}`;
}

// =====================================================================
// 1. Durée par nuit : temps de sommeil (plein), temps au lit (fantôme),
//    objectif (pointillé), moyenne glissante (ligne), nuits manquantes (hachures).
// =====================================================================
export function durationChart({ series, rollingSeries, goal, height = 220, onPick }) {
  const n = series.length;
  return responsive((wrap, W) => {
    const M = { t: 14, r: 8, b: 26, l: 34 };
    const H = height;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'duration' });
    const hatch = hatchDefs(svg);
    const vals = series.flatMap(p => [p.tst, p.tib]).filter(v => v !== null && v !== undefined);
    const maxV = Math.max(goal + 60, ...vals, 9 * 60);
    const y = scaleLinear([0, Math.ceil(maxV / 60) * 60], [H - M.b, M.t]);
    const bw = (W - M.l - M.r) / Math.max(n, 1);
    const x = i => M.l + i * bw + bw / 2;
    // grille horaire
    const g = s('g', { class: 'grid' });
    for (let hr = 0; hr * 60 <= maxV + 60; hr += maxV > 720 ? 4 : 2) {
      g.append(s('line', { x1: M.l, x2: W - M.r, y1: y(hr * 60), y2: y(hr * 60) }));
      g.append(s('text', { class: 'axis', x: M.l - 6, y: y(hr * 60) + 3.5, 'text-anchor': 'end' }, `${hr}h`));
    }
    svg.append(g);
    const bars = s('g');
    const barW = Math.max(2, Math.min(18, bw * 0.62));
    series.forEach((p, i) => {
      const cx = x(i);
      if (p.tib === null && p.tst === null) {
        bars.append(s('rect', { x: cx - barW / 2, y: y(0) - 14, width: barW, height: 14, fill: hatch, rx: 2 }));
        return;
      }
      if (p.tib !== null) bars.append(s('rect', { x: cx - barW / 2, y: y(p.tib), width: barW, height: y(0) - y(p.tib), rx: Math.min(4, barW / 2), fill: 'var(--bed)', opacity: p.tst === null ? .55 : .35, stroke: p.tst === null ? 'var(--bed)' : 'none', 'stroke-dasharray': p.tst === null ? '2 2' : null }));
      if (p.tst !== null) bars.append(s('rect', { x: cx - barW / 2, y: y(p.tst), width: barW, height: y(0) - y(p.tst), rx: Math.min(4, barW / 2), fill: p.demo ? 'var(--moon)' : 'var(--moon)', opacity: .92 }));
    });
    svg.append(bars);
    svg.append(s('line', { class: 'goal', x1: M.l, x2: W - M.r, y1: y(goal), y2: y(goal) }));
    if (rollingSeries) {
      let d = '', pen = false;
      rollingSeries.forEach((p, i) => {
        if (p.value === null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`; pen = true;
      });
      if (d) svg.append(s('path', { d, fill: 'none', stroke: 'var(--fg-1)', 'stroke-width': 1.6, opacity: .75, 'stroke-linejoin': 'round' }));
    }
    // axe X
    const step = Math.ceil(n / Math.max(4, Math.floor((W - M.l) / 46)));
    series.forEach((p, i) => { if (i % step === 0 || (n <= 14)) svg.append(s('text', { class: 'axis', x: x(i), y: H - 8, 'text-anchor': 'middle' }, xLabelFor(p.key, n))); });
    wrap.append(svg);
    const items = series.map((p, i) => ({
      x: x(i), y: y(Math.max(p.tib ?? 0, p.tst ?? 0, goal)), markerX: x(i), markerTop: M.t, markerBottom: H - M.b,
      title: fmtDateKey(p.key, { weekday: 'short', day: 'numeric', month: 'short' }),
      rows: p.tib === null && p.tst === null ? [['Nuit', 'non renseignée']] : [
        ['Sommeil', p.tst === null ? 'non calculable' : fmtDuration(p.tst)],
        ['Au lit', fmtDuration(p.tib)],
        ...(rollingSeries && rollingSeries[i].value !== null ? [['Moyenne 7 j', fmtDuration(rollingSeries[i].value)]] : []),
      ],
      href: p.id ? `#/entry/${p.id}` : null,
    }));
    interact(wrap, svg, items, { label: `Durée de sommeil par nuit, ${n} jours. Objectif ${fmtDuration(goal)}.`, onSelect: onPick });
  });
}

// =====================================================================
// 2. Horaires (actogramme) : une ligne par nuit sur un axe midi → midi.
//    Bande pâle = au lit ; bande claire = sommeil ; repères coucher / réveil.
// =====================================================================
export function timingChart({ rows, rowH }) {
  // rows: [{ key, bed, onset, wake, out, naps:[{a,b}], id }] en minutes d'horloge (0–1440) ou null
  return responsive((wrap, W) => {
    const M = { t: 20, r: 10, b: 22, l: 44 };
    const rh = rowH || (rows.length > 120 ? 4 : rows.length > 60 ? 6 : rows.length > 31 ? 9 : 14);
    const H = M.t + M.b + rows.length * rh;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'timing' });
    const hatch = hatchDefs(svg);
    // Axe : 18:00 → 14:00 (+20 h) couvre l'essentiel des nuits ; valeurs hors axe rabattues.
    const START = 18 * 60, SPAN = 20 * 60;
    const toX = clock => {
      if (clock === null || clock === undefined) return null;
      let rel = clock - START; if (rel < 0) rel += 1440;
      return M.l + Math.min(SPAN, Math.max(0, rel)) / SPAN * (W - M.l - M.r);
    };
    const g = s('g', { class: 'grid' });
    for (let hr = 18; hr <= 38; hr += 2) {
      const xx = toX((hr * 60) % 1440) ?? M.l;
      const X = hr === 38 ? W - M.r : xx;
      g.append(s('line', { x1: X, x2: X, y1: M.t - 4, y2: H - M.b, opacity: hr % 6 === 0 ? 1 : .45 }));
      if (hr % 4 === 2 || rows.length < 1) g.append(s('text', { class: 'axis', x: X, y: M.t - 8, 'text-anchor': 'middle' }, String(hr % 24).padStart(2, '0') + 'h'));
    }
    svg.append(g);
    const items = [];
    rows.forEach((r, i) => {
      const yy = M.t + i * rh;
      const mid = yy + rh / 2;
      const band = Math.max(2, rh - (rh > 8 ? 4 : 1));
      if (r.bed === null) {
        svg.append(s('rect', { x: M.l, y: yy + (rh - band) / 2, width: W - M.l - M.r, height: band, fill: hatch, opacity: .5 }));
      } else {
        const xb = toX(r.bed), xo = toX(r.out ?? r.wake);
        if (xb !== null && xo !== null && xo > xb) svg.append(s('rect', { x: xb, y: yy + (rh - band) / 2, width: xo - xb, height: band, rx: band / 2, fill: 'var(--bed)', opacity: .5 }));
        const xs = toX(r.onset), xw = toX(r.wake);
        if (xs !== null && xw !== null && xw > xs) svg.append(s('rect', { x: xs, y: yy + (rh - band) / 2, width: xw - xs, height: band, rx: band / 2, fill: 'var(--moon)' }));
        if (rh >= 8) {
          if (xb !== null) svg.append(s('circle', { cx: xb, cy: mid, r: 2.4, fill: 'var(--dusk)' }));
          if (xw !== null) svg.append(s('circle', { cx: xw, cy: mid, r: 2.4, fill: 'var(--dawn)' }));
        }
      }
      for (const nap of r.naps || []) {
        const a = toX(nap.a), b = toX(nap.b);
        if (a !== null && b !== null && b > a) svg.append(s('rect', { x: a, y: yy + (rh - band) / 2, width: Math.max(2, b - a), height: band, rx: band / 2, fill: 'var(--nap)' }));
      }
      if (rows.length <= 31 || i % 7 === 0) svg.append(s('text', { class: 'axis', x: M.l - 6, y: mid + 3.5, 'text-anchor': 'end' }, r.key.slice(8, 10) + '/' + r.key.slice(5, 7)));
      items.push({
        x: toX(r.wake) ?? W / 2, y: yy, hitY: mid,
        title: `Nuit du ${fmtDateKey(r.key, { weekday: 'short', day: 'numeric', month: 'short' })}`,
        rows: r.bed === null ? [['Nuit', 'non renseignée']] : [['Coucher', fmtClock(r.bed)], ['Endormi', r.onset === null ? 'inconnu' : fmtClock(r.onset)], ['Réveil', r.wake === null ? 'inconnu' : fmtClock(r.wake)], ['Lever', r.out === null ? 'inconnu' : fmtClock(r.out)]],
        href: r.id ? `#/entry/${r.id}` : null,
      });
    });
    wrap.append(svg);
    interact(wrap, svg, items, { label: `Horaires de sommeil, une ligne par nuit sur ${rows.length} jours, axe de 18 h à 14 h.` });
  });
}

// =====================================================================
// 3. Courbe(s) : heures d'horloge (déroulées autour de minuit) ou valeurs.
// =====================================================================
export function lineChart({ series, keys, height = 180, clock = false, yFormat, band, refLine, labelText }) {
  // series: [{ name, color, points:[{key, value}] }]
  return responsive((wrap, W) => {
    const M = { t: 12, r: 10, b: 24, l: 44 };
    const H = height;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}` });
    let all = series.flatMap(sr => sr.points.map(p => p.value)).filter(v => v !== null && v !== undefined);
    let ref = 0;
    if (clock && all.length) {
      // référence = première valeur ; tout est déroulé autour d'elle
      ref = all[0];
      series.forEach(sr => sr.points.forEach(p => { if (p.value !== null) p._v = unwrapClock(p.value, ref); }));
    } else series.forEach(sr => sr.points.forEach(p => { p._v = p.value; }));
    const vs = series.flatMap(sr => sr.points.map(p => p._v)).filter(v => v !== null && v !== undefined);
    if (band) vs.push(band[0], band[1]);
    if (!vs.length) { wrap.append(h('p', { class: 'muted small' }, 'Aucune valeur sur la période.')); return; }
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (hi - lo < (clock ? 60 : 1)) { lo -= clock ? 30 : 0.5; hi += clock ? 30 : 0.5; }
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    const y = scaleLinear([lo, hi], [H - M.b, M.t]);
    const n = keys.length;
    const x = i => M.l + (n <= 1 ? 0.5 : i / (n - 1)) * (W - M.l - M.r);
    const g = s('g', { class: 'grid' });
    const step = clock ? (hi - lo > 360 ? 120 : hi - lo > 150 ? 60 : 30) : niceStep(hi - lo, 4);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      g.append(s('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v) }));
      g.append(s('text', { class: 'axis', x: M.l - 6, y: y(v) + 3.5, 'text-anchor': 'end' }, clock ? fmtClock(v) : (yFormat ? yFormat(v) : fmtNumber(v))));
    }
    svg.append(g);
    if (band) svg.append(s('rect', { x: M.l, y: y(band[1]), width: W - M.l - M.r, height: y(band[0]) - y(band[1]), fill: 'var(--positive)', opacity: .08 }));
    if (refLine !== undefined) svg.append(s('line', { class: 'goal', x1: M.l, x2: W - M.r, y1: y(refLine), y2: y(refLine) }));
    for (const sr of series) {
      let d = '', pen = false;
      sr.points.forEach((p, i) => {
        if (p._v === null || p._v === undefined) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p._v).toFixed(1)}`; pen = true;
      });
      svg.append(s('path', { d, fill: 'none', stroke: sr.color, 'stroke-width': sr.width || 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: sr.opacity ?? 1, 'stroke-dasharray': sr.dash || null }));
      if (sr.dots !== false && n <= 60) sr.points.forEach((p, i) => { if (p._v !== null && p._v !== undefined) svg.append(s('circle', { cx: x(i), cy: y(p._v), r: n > 31 ? 1.6 : 2.4, fill: sr.color })); });
    }
    const lstep = Math.ceil(n / Math.max(4, Math.floor((W - M.l) / 52)));
    keys.forEach((k, i) => { if (i % lstep === 0) svg.append(s('text', { class: 'axis', x: x(i), y: H - 7, 'text-anchor': 'middle' }, xLabelFor(k, n > 14 ? 99 : n))); });
    wrap.append(svg);
    const fmt = v => (v === null || v === undefined ? '—' : clock ? fmtClock(v) : yFormat ? yFormat(v) : fmtNumber(v, 1));
    interact(wrap, svg, keys.map((k, i) => ({
      x: x(i), y: M.t + 10, markerX: x(i), markerTop: M.t, markerBottom: H - M.b,
      title: k.length === 10 ? fmtDateKey(k, { weekday: 'short', day: 'numeric', month: 'short' }) : k,
      rows: series.map(sr => [sr.name, fmt(sr.points[i]?.value)]),
    })), { label: labelText });
  });
}

// =====================================================================
// 4. Comparaisons avec intervalle de confiance (associations, périodes).
// =====================================================================
export function intervalChart({ rows, unitFormat, zeroLabel = 'aucune différence' }) {
  // rows: [{ label, diff, ci:[lo,hi], meta, highlight }]
  return responsive((wrap, W) => {
    const rowH = 40, M = { t: 18, r: 14, b: 10, l: Math.min(150, W * 0.38) };
    const H = M.t + M.b + rows.length * rowH;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}` });
    const ext = Math.max(1, ...rows.flatMap(r => [Math.abs(r.ci[0]), Math.abs(r.ci[1])]));
    const x = scaleLinear([-ext * 1.1, ext * 1.1], [M.l, W - M.r]);
    svg.append(s('line', { x1: x(0), x2: x(0), y1: M.t - 6, y2: H - M.b, stroke: 'var(--line-strong)' }));
    svg.append(s('text', { class: 'axis', x: x(0), y: M.t - 8, 'text-anchor': 'middle' }, zeroLabel));
    const items = [];
    rows.forEach((r, i) => {
      const cy = M.t + i * rowH + rowH / 2;
      const col = r.highlight ? 'var(--dawn)' : 'var(--moon)';
      svg.append(s('text', { x: 0, y: cy - 3, fill: 'var(--fg-1)', 'font-size': 12.5 }, r.label));
      if (r.meta) svg.append(s('text', { class: 'axis', x: 0, y: cy + 11 }, r.meta));
      svg.append(s('line', { x1: x(r.ci[0]), x2: x(r.ci[1]), y1: cy, y2: cy, stroke: col, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .7 }));
      svg.append(s('circle', { cx: x(r.diff), cy, r: 5, fill: col }));
      items.push({ x: x(r.diff), y: cy - 6, hitY: cy, title: r.label, rows: [['Différence', unitFormat(r.diff)], ['IC 95 %', `${unitFormat(r.ci[0])} à ${unitFormat(r.ci[1])}`], ...(r.extra || [])] });
    });
    wrap.append(svg);
    interact(wrap, svg, items, { label: 'Différences estimées avec leur intervalle de confiance à 95 %.' });
  });
}

// =====================================================================
// 5. Histogramme (distribution des durées).
// =====================================================================
export function histogram({ values, binWidth = 30, format = fmtDuration, height = 160, goal }) {
  return responsive((wrap, W) => {
    const M = { t: 10, r: 8, b: 24, l: 28 };
    const H = height;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}` });
    const lo = Math.floor(Math.min(...values) / binWidth) * binWidth, hi = Math.ceil((Math.max(...values) + 1) / binWidth) * binWidth;
    const bins = [];
    for (let b = lo; b < hi; b += binWidth) bins.push({ a: b, b: b + binWidth, n: values.filter(v => v >= b && v < b + binWidth).length });
    const maxN = Math.max(...bins.map(b => b.n), 1);
    const x = scaleLinear([lo, hi], [M.l, W - M.r]), y = scaleLinear([0, maxN], [H - M.b, M.t]);
    bins.forEach(b => svg.append(s('rect', { x: x(b.a) + 1, y: y(b.n), width: Math.max(1, x(b.b) - x(b.a) - 2), height: y(0) - y(b.n), rx: 3, fill: 'var(--moon)', opacity: .85 })));
    if (goal !== undefined && goal >= lo && goal <= hi) svg.append(s('line', { class: 'goal', x1: x(goal), x2: x(goal), y1: M.t, y2: H - M.b }));
    const every = Math.ceil(bins.length / Math.max(3, Math.floor(W / 70)));
    bins.forEach((b, i) => { if (i % every === 0) svg.append(s('text', { class: 'axis', x: x(b.a), y: H - 8, 'text-anchor': 'middle' }, format(b.a, { compact: true }))); });
    svg.append(s('text', { class: 'axis', x: M.l - 6, y: y(maxN) + 4, 'text-anchor': 'end' }, String(maxN)));
    wrap.append(svg);
    interact(wrap, svg, bins.map(b => ({ x: (x(b.a) + x(b.b)) / 2, y: y(b.n), title: `${format(b.a)} – ${format(b.b)}`, rows: [['Nuits', String(b.n)]] })), { label: 'Distribution des durées de sommeil.' });
  });
}

// =====================================================================
// 6. Profil par jour de la semaine (moyenne + effectif).
// =====================================================================
export function weekdayChart({ groups, goal, height = 170 }) {
  // groups: 7 éléments (lundi → dimanche) { label, mean, n, free }
  return responsive((wrap, W) => {
    const M = { t: 14, r: 8, b: 34, l: 30 };
    const H = height;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}` });
    const vals = groups.map(g => g.mean).filter(v => v !== null);
    const y = scaleLinear([0, Math.max(goal + 60, ...vals, 540)], [H - M.b, M.t]);
    const bw = (W - M.l - M.r) / 7;
    groups.forEach((g, i) => {
      const cx = M.l + bw * i + bw / 2, w = Math.min(28, bw * 0.55);
      if (g.mean === null) svg.append(s('text', { class: 'axis', x: cx, y: y(0) - 6, 'text-anchor': 'middle' }, '—'));
      else svg.append(s('rect', { x: cx - w / 2, y: y(g.mean), width: w, height: y(0) - y(g.mean), rx: 4, fill: g.free ? 'var(--dusk)' : 'var(--moon)', opacity: .85 }));
      svg.append(s('text', { class: 'axis', x: cx, y: H - 19, 'text-anchor': 'middle' }, g.label));
      svg.append(s('text', { class: 'axis', x: cx, y: H - 6, 'text-anchor': 'middle', opacity: .8 }, `n=${g.n}`));
    });
    svg.append(s('line', { class: 'goal', x1: M.l, x2: W - M.r, y1: y(goal), y2: y(goal) }));
    wrap.append(svg);
    interact(wrap, svg, groups.map((g, i) => ({ x: M.l + bw * i + bw / 2, y: g.mean === null ? y(0) - 20 : y(g.mean), title: g.longLabel || g.label, rows: [['Sommeil moyen', g.mean === null ? 'données insuffisantes' : fmtDuration(g.mean)], ['Nuits', String(g.n)]] })), { label: 'Temps de sommeil moyen par jour de la semaine (jour du réveil).' });
  });
}

// =====================================================================
// 7. Bande de complétude : une case par jour.
// =====================================================================
export function completenessStrip({ days }) {
  // days: [{ key, status: 'full'|'partial'|'missing'|'invalid' }]
  return responsive((wrap, W) => {
    const cell = Math.max(4, Math.min(14, Math.floor((W - 4) / Math.max(days.length, 1)) - 2));
    const perRow = Math.max(1, Math.floor(W / (cell + 2)));
    const rows = Math.ceil(days.length / perRow);
    const H = rows * (cell + 2) + 2;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}` });
    const hatch = hatchDefs(svg);
    const fill = { full: 'var(--moon)', partial: 'var(--bed)', missing: hatch, invalid: 'var(--attention)' };
    const items = [];
    days.forEach((d, i) => {
      const xx = (i % perRow) * (cell + 2) + 1, yy = Math.floor(i / perRow) * (cell + 2) + 1;
      svg.append(s('rect', { x: xx, y: yy, width: cell, height: cell, rx: Math.min(3, cell / 3), fill: fill[d.status], opacity: d.status === 'partial' ? .8 : 1, stroke: d.status === 'missing' ? 'var(--line-strong)' : 'none' }));
      items.push({ x: xx + cell / 2, y: yy, hitY: yy + cell / 2, title: fmtDateKey(d.key, { weekday: 'short', day: 'numeric', month: 'short' }), rows: [['État', { full: 'complète', partial: 'incomplète', missing: 'non renseignée', invalid: 'incohérente (exclue)' }[d.status]]] });
    });
    wrap.append(svg);
    interact(wrap, svg, items, { label: 'Complétude des données jour par jour.' });
  });
}

// =====================================================================
// 8. Cadran de 24 h : la nuit comme un arc de lumière.
// =====================================================================
export function dial({ size = 240, bed, onset, wake, out, now, planned = false, label }) {
  const R = size / 2 - 14, c = size / 2;
  const ang = m => ((m / 1440) * 360 - 90) * Math.PI / 180;           // 00:00 en haut
  const pt = (m, r = R) => [c + r * Math.cos(ang(m)), c + r * Math.sin(ang(m))];
  const arc = (a, b, r = R) => {
    if (a === null || b === null) return '';
    let span = b - a; if (span <= 0) span += 1440;
    const [x1, y1] = pt(a, r), [x2, y2] = pt(a + span, r);
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${span > 720 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'dial', role: 'img', 'aria-label': label || 'Cadran de 24 heures' });
  svg.append(s('circle', { cx: c, cy: c, r: R, fill: 'none', stroke: 'var(--line)', 'stroke-width': 10 }));
  for (let hr = 0; hr < 24; hr++) {
    const major = hr % 6 === 0;
    const [x1, y1] = pt(hr * 60, R + 9), [x2, y2] = pt(hr * 60, R + (major ? 3 : 6));
    svg.append(s('line', { x1, y1, x2, y2, stroke: major ? 'var(--fg-3)' : 'var(--line-strong)', 'stroke-width': 1 }));
  }
  for (const [hr, txt] of [[0, '0'], [6, '6'], [12, '12'], [18, '18']]) {
    const [tx, ty] = pt(hr * 60, R - 22);
    svg.append(s('text', { x: tx, y: ty + 3.5, 'text-anchor': 'middle', class: 'axis', 'font-size': 10, fill: 'var(--fg-3)', 'font-family': 'var(--font-mono)' }, txt));
  }
  if (bed !== null && (out ?? wake) !== null) svg.append(s('path', { d: arc(bed, out ?? wake), fill: 'none', stroke: 'var(--bed)', 'stroke-width': 10, 'stroke-linecap': 'round', opacity: .55 }));
  if (onset !== null && wake !== null) svg.append(s('path', { d: arc(onset, wake), fill: 'none', stroke: 'var(--moon)', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': planned ? '2 5' : null, class: 'dial-sleep' }));
  if (bed !== null) { const [x, y] = pt(bed); svg.append(s('circle', { cx: x, cy: y, r: 5, fill: 'var(--dusk)', stroke: 'var(--surface-1)', 'stroke-width': 2 })); }
  if (wake !== null) { const [x, y] = pt(wake); svg.append(s('circle', { cx: x, cy: y, r: 6, fill: 'var(--dawn)', stroke: 'var(--surface-1)', 'stroke-width': 2 })); }
  if (now !== null && now !== undefined) {
    const [x1, y1] = pt(now, R - 12), [x2, y2] = pt(now, R + 12);
    svg.append(s('line', { x1, y1, x2, y2, stroke: 'var(--fg-1)', 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
  }
  return svg;
}

export { icon };
