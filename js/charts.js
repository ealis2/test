// Petits graphiques SVG faits maison (aucune librairie externe).
import { STAGES } from './analysis.js';
import { pad, fmtDur } from './store.js';

const ORDER = ['W', 'R', 'L', 'D'];

// Hypnogramme : escalier des phases au fil de la nuit
export function hypnogram(stages, start, { w = 340, h = 170, events = [] } = {}) {
  if (!stages?.length) return '';
  const left = 58, right = 6, top = 8, bottom = 22;
  const iw = w - left - right, ih = h - top - bottom;
  const row = ih / 4;
  const N = stages.length;
  const x = i => left + (i / N) * iw;
  const y = s => top + ORDER.indexOf(s) * row + row / 2;

  let rects = '', path = '';
  let i = 0;
  while (i < N) {
    const s = stages[i]; let j = i;
    while (j < N && stages[j] === s) j++;
    rects += `<rect x="${x(i).toFixed(1)}" y="${(y(s) - row * 0.36).toFixed(1)}" width="${Math.max(1, x(j) - x(i)).toFixed(1)}" height="${(row * 0.72).toFixed(1)}" rx="2" fill="${STAGES[s].hex}"/>`;
    path += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s).toFixed(1)} L${x(j).toFixed(1)},${y(s).toFixed(1)} `;
    i = j;
  }
  const labels = ORDER.map(s => `<text x="0" y="${y(s) + 3}">${STAGES[s].name.split(' ')[0]}</text>`).join('');
  // Graduations horaires
  let ticks = '';
  const startD = new Date(start);
  const firstHour = new Date(startD); firstHour.setMinutes(0, 0, 0); firstHour.setHours(firstHour.getHours() + 1);
  const step = N > 600 ? 2 : 1;
  for (let t = firstHour.getTime(); t < start + N * 60000; t += 3600e3 * step) {
    const idx = (t - start) / 60000;
    ticks += `<line x1="${x(idx)}" x2="${x(idx)}" y1="${top}" y2="${top + ih}" stroke="rgba(255,255,255,.06)"/>`;
    ticks += `<text x="${x(idx)}" y="${h - 6}" text-anchor="middle">${pad(new Date(t).getHours())}h</text>`;
  }
  const ev = events.map(e => {
    const idx = (e.t - start) / 60000;
    return idx >= 0 && idx <= N ? `<circle cx="${x(idx)}" cy="${top + 2}" r="2.5" fill="#fbbf24"/>` : '';
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}">${ticks}${labels}<path d="${path}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>${rects}${ev}</svg>`;
}

export function miniHypno(stages, w = 90, h = 28) {
  if (!stages?.length) return '';
  const N = stages.length, row = h / 4;
  let r = '', i = 0;
  while (i < N) {
    const s = stages[i]; let j = i;
    while (j < N && stages[j] === s) j++;
    r += `<rect x="${(i / N * w).toFixed(1)}" y="${(ORDER.indexOf(s) * row).toFixed(1)}" width="${Math.max(0.8, (j - i) / N * w).toFixed(1)}" height="${row - 1}" rx="1" fill="${STAGES[s].hex}"/>`;
    i = j;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${r}</svg>`;
}

export function phaseBar(sum) {
  const tot = sum.inBed || 1;
  return `<div class="phase-bar">${['D', 'L', 'R', 'W'].map(k => {
    const v = { D: sum.deep, L: sum.light, R: sum.rem, W: sum.awake }[k];
    return `<div style="width:${(v / tot * 100).toFixed(1)}%;background:${STAGES[k].hex}"></div>`;
  }).join('')}</div>`;
}

export function legend(keys = ['D', 'L', 'R', 'W']) {
  return `<div class="legend">${keys.map(k => `<span><i style="background:${STAGES[k].hex}"></i>${STAGES[k].name}</span>`).join('')}</div>`;
}

export function scoreRing(score, size = 120, label = 'score') {
  const r = size / 2 - 9, c = 2 * Math.PI * r;
  const col = score >= 70 ? '#4ade80' : score >= 55 ? '#fbbf24' : '#f87171';
  return `<div class="score-ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - score / 100)}"/>
    </svg>
    <div class="num"><div>${score}<small>${label}</small></div></div>
  </div>`;
}

// Barres de durée de sommeil avec ligne d'objectif
export function durationBars(items, goalMin, { w = 340, h = 170 } = {}) {
  if (!items.length) return '';
  const left = 26, bottom = 20, top = 8;
  const max = Math.max(goalMin + 60, ...items.map(d => d.v));
  const ih = h - top - bottom, iw = w - left;
  const bw = iw / items.length;
  const y = v => top + ih - (v / max) * ih;
  let out = '';
  for (let hr = 2; hr * 60 <= max; hr += 2) {
    out += `<line x1="${left}" x2="${w}" y1="${y(hr * 60)}" y2="${y(hr * 60)}" stroke="rgba(255,255,255,.06)"/><text x="0" y="${y(hr * 60) + 3}">${hr}h</text>`;
  }
  items.forEach((d, i) => {
    const bh = Math.max(0, top + ih - y(d.v));
    const col = d.v >= goalMin ? '#8b7bff' : d.v >= goalMin - 60 ? '#6d63c9' : '#4b4690';
    if (d.v) out += `<rect x="${left + i * bw + bw * 0.18}" y="${y(d.v)}" width="${bw * 0.64}" height="${bh}" rx="${Math.min(5, bw * 0.3)}" fill="${col}"/>`;
    if (d.label) out += `<text x="${left + i * bw + bw / 2}" y="${h - 5}" text-anchor="middle">${d.label}</text>`;
  });
  out += `<line x1="${left}" x2="${w}" y1="${y(goalMin)}" y2="${y(goalMin)}" stroke="#5fd4ff" stroke-dasharray="4 4"/>`;
  out += `<text x="${w}" y="${y(goalMin) - 4}" text-anchor="end" style="fill:#5fd4ff">objectif ${fmtDur(goalMin)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}">${out}</svg>`;
}

// Courbe (score)
export function lineChart(items, { w = 340, h = 130, min = 0, max = 100, color = '#4ade80' } = {}) {
  const pts = items.filter(d => d.v != null);
  if (pts.length < 2) return '<p class="muted small">Il faut au moins 2 nuits pour afficher la courbe.</p>';
  const left = 24, bottom = 18, top = 8;
  const ih = h - top - bottom, iw = w - left - 6;
  const x = i => left + (i / (items.length - 1)) * iw;
  const y = v => top + ih - ((v - min) / (max - min)) * ih;
  let grid = '';
  for (let v = min; v <= max; v += 25) grid += `<line x1="${left}" x2="${w}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/><text x="0" y="${y(v) + 3}">${v}</text>`;
  let d = '';
  items.forEach((it, i) => { if (it.v != null) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(it.v).toFixed(1)} `; });
  const dots = items.map((it, i) => it.v != null ? `<circle cx="${x(i)}" cy="${y(it.v)}" r="3" fill="${color}"/>` : '').join('');
  const labels = items.map((it, i) => it.label ? `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${it.label}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}">${grid}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

// Horaires : une barre par nuit, du coucher au lever (axe de 20h à 12h)
export function scheduleChart(nights, { w = 340 } = {}) {
  if (!nights.length) return '';
  const rowH = 18, top = 16, left = 46;
  const h = top + nights.length * rowH + 4;
  const iw = w - left - 4;
  const toX = ts => {
    const d = new Date(ts); let m = d.getHours() * 60 + d.getMinutes();
    if (m < 720) m += 1440; // après minuit
    return left + ((m - 1200) / (16 * 60)) * iw; // 20:00 → 12:00
  };
  let out = '';
  for (let hr = 20; hr <= 36; hr += 4) {
    const xx = left + ((hr * 60 - 1200) / (16 * 60)) * iw;
    out += `<line x1="${xx}" x2="${xx}" y1="${top - 4}" y2="${h}" stroke="rgba(255,255,255,.06)"/><text x="${xx}" y="10" text-anchor="middle">${pad(hr % 24)}h</text>`;
  }
  nights.forEach((n, i) => {
    const yy = top + i * rowH;
    const x1 = Math.max(left, toX(n.start)), x2 = Math.min(w, toX(n.end));
    const lbl = new Date(n.start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    out += `<text x="0" y="${yy + 11}">${lbl}</text>`;
    if (x2 > x1) out += `<rect x="${x1}" y="${yy + 3}" width="${x2 - x1}" height="${rowH - 7}" rx="5" fill="url(#gs)"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="gs"><stop offset="0" stop-color="#6a5cff"/><stop offset="1" stop-color="#5fd4ff"/></linearGradient></defs>${out}</svg>`;
}
