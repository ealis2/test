// Petite couche DOM sans framework : création d'éléments, icônes, feuilles modales, toasts.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * h('button', { class: 'btn', onclick: fn, 'aria-label': '…' }, 'Texte', autreNœud)
 * Les chaînes deviennent des nœuds texte (jamais interprétées comme du HTML).
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs, true);
  append(el, children);
  return el;
}

function applyAttrs(el, attrs, svg = false) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' && !svg) el.value = v;
    else if (k === 'checked' && !svg) el.checked = !!v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const frag = (...children) => { const f = document.createDocumentFragment(); append(f, children); return f; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- Icônes
// Trait 1,6 px sur grille 24, terminaisons arrondies : cohérentes entre elles.
const P = {
  logo: '<circle cx="12" cy="12" r="9.2" opacity=".35"/><path d="M15.8 15.6A6 6 0 1 1 9.2 6.9a4.8 4.8 0 0 0 6.6 8.7Z"/><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none"/>',
  home: '<path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1Z"/>',
  journal: '<path d="M6 3.8h11a1.2 1.2 0 0 1 1.2 1.2v14a1.2 1.2 0 0 1-1.2 1.2H6Z"/><path d="M6 3.8v16.4M9.5 8h5.5M9.5 11.5h5.5"/>',
  moon: '<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.2 6.2 0 0 0 10.1 10.1Z"/>',
  chart: '<path d="M4 19.5h16"/><path d="M7 16v-5M11 16V7M15 16v-3.5M19 16V9.5"/>',
  science: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4" transform="rotate(120 12 12)"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.3 1.6M4.5 5.5 7 3.5M19.5 5.5 17 3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  bed: '<path d="M3.5 18.5V7M3.5 14h17v4.5M20.5 14v-2.5a3 3 0 0 0-3-3H11V14"/><circle cx="7.3" cy="11" r="1.8"/>',
  sunrise: '<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 4.5V8M5.6 9.6l1.6 1.6M18.4 9.6l-1.6 1.6M9.5 6.5 12 4l2.5 2.5"/>',
  edit: '<path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-4-4l-10 10Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.2a1.2 1.2 0 0 0 1.2 1.1h7a1.2 1.2 0 0 0 1.2-1.1L17.5 7"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9M5 19.5h14"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r=".9" fill="currentColor"/><circle cx="5" cy="12" r=".9" fill="currentColor"/><circle cx="5" cy="17" r=".9" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  warning: '<path d="M12 4.5 21 19.5H3Z"/><path d="M12 10v4.5M12 17v.2"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  snooze: '<path d="M5 7h5l-5 6h5M13 11h6l-6 8h6"/>',
  volume: '<path d="M4.5 9.5h3.5L13 5.5v13L8 14.5H4.5Z"/><path d="M16.5 9a4 4 0 0 1 0 6M18.8 6.5a7.5 7.5 0 0 1 0 11"/>',
  nap: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  external: '<path d="M13.5 5.5h5v5M18.5 5.5l-8 8M16.5 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V9A1.5 1.5 0 0 1 6 7.5h4.5"/>',
  compare: '<path d="M7 4.5v15M17 4.5v15M3.5 8.5 7 4.5l3.5 4M13.5 15.5l3.5 4 3.5-4"/>',
  sparkle: '<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z"/>',
};

export function icon(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', attrs.sw || '1.6');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.setAttribute('class', attrs.class ? `ico ${attrs.class}` : 'ico');
  el.innerHTML = P[name] || P.info; // chaînes statiques internes, aucune donnée utilisateur
  return el;
}

// ---------------------------------------------------------------- Feuille modale (<dialog> natif : focus piégé, Échap)
export function openSheet({ title, body, foot, onClose, label }) {
  const dlg = h('dialog', { class: 'sheet', 'aria-label': label || title });
  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'h2' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onclick: close }, icon('close'))),
    h('div', { class: 'sheet-body' }, typeof body === 'function' ? body(close) : body),
  );
  if (foot) dlg.append(h('div', { class: 'sheet-foot' }, typeof foot === 'function' ? foot(close) : foot));
  dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); }); // clic sur le fond
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

/** Confirmation accessible (remplace window.confirm). */
export function confirmSheet({ title, text, confirm = 'Confirmer', danger = false }) {
  return new Promise(resolve => {
    let result = false;
    openSheet({
      title,
      body: h('p', { class: 'prose' }, text),
      foot: close => [
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Annuler'),
        h('button', { class: ['btn', danger ? 'danger' : 'primary'], type: 'button', onclick: () => { result = true; close(); } }, confirm),
      ],
      onClose: () => resolve(result),
    });
  });
}

// ---------------------------------------------------------------- Toasts (annoncés aux lecteurs d'écran)
export function toast(message, { action, onAction, timeout = 4200 } = {}) {
  let region = document.getElementById('toasts');
  if (!region) { region = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(region); }
  const t = h('div', { class: 'toast' }, h('span', { class: 'grow' }, message),
    action ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { onAction?.(); t.remove(); } }, action) : null);
  region.append(t);
  setTimeout(() => t.remove(), timeout);
}

/** Télécharge un fichier généré localement. */
export function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Remplace le contenu d'un élément en ignorant null / undefined / false (contrairement à replaceChildren). */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}
