// Point d'entrée : stockage, routeur, thème, service worker, moteur d'alarme.

import { openIDB, memoryAdapter, requestPersistence } from './data/db.js';
import { createRepo } from './data/repo.js';
import { readV1FromLocalStorage, markV1Migrated } from './data/migrate-v1.js';
import { prepare } from './core/analysis.js';
import { deviceTimeZone, dateKey } from './core/time.js';
import { createAlarmEngine } from './alarm/engine.js';
import { syncSchedule } from './alarm/push.js';
import { h, icon, toast, fill } from './ui/dom.js';

import * as home from './screens/home.js';
import * as sleep from './screens/sleep.js';
import * as journal from './screens/journal.js';
import * as stats from './screens/stats.js';
import * as science from './screens/science.js';
import * as alarms from './screens/alarms.js';
import * as settings from './screens/settings.js';
import { showRinging } from './screens/ring.js';

const TABS = [
  { href: '#/home', label: 'Accueil', icon: 'home', match: /^home/ },
  { href: '#/journal', label: 'Journal', icon: 'journal', match: /^(journal|entry)/ },
  { href: '#/sleep', label: 'Dormir', icon: 'moon', match: /^sleep/, cls: 'tab-sleep' },
  { href: '#/stats', label: 'Analyses', icon: 'chart', match: /^stats/ },
  { href: '#/science', label: 'Science', icon: 'science', match: /^science/ },
];

// Routes : motif → [module, nom de rendu]
const ROUTES = [
  [/^home$/, home.render],
  [/^sleep$/, sleep.render],
  [/^sleep\/morning$/, sleep.renderMorning],
  [/^journal$/, journal.renderList],
  [/^journal\/calendar(?:\/(\d{4}-\d{2}))?$/, journal.renderCalendar],
  [/^entry\/new(?:\/(nap|night))?$/, journal.renderForm],
  [/^entry\/([\w-]+)\/edit$/, journal.renderForm],
  [/^entry\/([\w-]+)$/, journal.renderDetail],
  [/^stats(?:\/(\w+))?$/, stats.render],
  [/^science(?:\/(\w+))?(?:\/([\w-]+))?$/, science.render],
  [/^alarms$/, alarms.render],
  [/^settings(?:\/(\w+))?$/, settings.render],
];

async function boot() {
  let adapter;
  try { adapter = await openIDB(); }
  catch { adapter = memoryAdapter(); }
  const repo = await createRepo(adapter).init();
  const tz = deviceTimeZone();

  // Reprise unique des nuits de Somnia v1
  const v1 = readV1FromLocalStorage(tz);
  if (v1.episodes.length) {
    await repo.bulkAddEpisodes(v1.episodes.filter(e => !repo.episode(e.id)));
    if (v1.goalMin && !repo.settings.onboarded) await repo.setSettings({ goalMin: v1.goalMin });
  }
  if (adapter.kind !== 'memory') markV1Migrated();

  let preparedCache = null;
  repo.on(what => { if (what === 'episodes' || what === 'all') preparedCache = null; });

  const app = {
    repo, tz,
    todayKey: () => dateKey(Date.now(), tz),
    prepared: () => (preparedCache ||= prepare(repo.episodes)),
    navigate: hash => { if (location.hash === hash) route(); else location.hash = hash; },
    rerender: () => route(),
    engine: null,
    v1Imported: v1.episodes.length,
  };
  app.engine = createAlarmEngine({
    repo,
    onRing: r => showRinging(app, r),
    onStateChange: () => {},
  });
  window.__somnia = app; // utile pour le débogage et les tests de bout en bout

  applyTheme(repo.settings);
  repo.on(what => { if (what === 'settings' || what === 'all') applyTheme(repo.settings); });

  // Programmation des notifications serveur à chaque changement pertinent
  let syncTimer = null;
  repo.on(what => {
    if (!['alarms', 'session', 'settings'].includes(what)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncSchedule(repo).catch(e => toast(`Notifications : ${e.message}`)), 800);
  });

  buildTabbar();
  window.addEventListener('hashchange', route);
  route();
  app.engine.start();
  if (!repo.persistent) toast('Stockage local indisponible (navigation privée ?) : les données ne seront pas conservées.', { timeout: 9000 });
  else requestPersistence();
  if (v1.episodes.length) toast(`${v1.episodes.length} nuit(s) reprise(s) de l'ancienne version de Somnia.`);

  registerSW();

  function route() {
    const path = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0] || 'home';
    // Session en cours : l'écran de nuit prend le dessus à l'ouverture
    if (repo.session && !/^sleep/.test(path) && !sessionStorage.getItem('somnia.leftNight')) {
      sessionStorage.setItem('somnia.leftNight', '1');
      location.replace('#/sleep');
      return;
    }
    let match = null, fn = null;
    for (const [re, render] of ROUTES) { const m = path.match(re); if (m) { match = m; fn = render; break; } }
    const view = document.getElementById('view');
    if (!fn) { location.replace('#/home'); return; }
    for (const a of document.querySelectorAll('#tabbar a')) {
      const t = TABS.find(x => x.href === a.getAttribute('href'));
      if (t.match.test(path)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    document.body.dataset.route = path.split('/')[0];
    try {
      const node = fn(app, ...match.slice(1));
      fill(view, node);
    } catch (e) {
      console.error(e);
      fill(view, h('div', { class: 'empty' }, h('h1', { class: 'h2' }, 'Cet écran a rencontré une erreur'), h('p', { class: 'prose' }, String(e.message || e)), h('a', { class: 'btn ghost', href: '#/home' }, 'Retour à l\'accueil')));
    }
    window.scrollTo(0, 0);
    const title = view.querySelector('#page-title');
    document.title = title ? `${title.textContent} · Somnia` : 'Somnia';
    if (document.activeElement && document.activeElement !== document.body) (title || view).focus({ preventScroll: true });
  }
}

function buildTabbar() {
  const nav = document.getElementById('tabbar');
  fill(nav, ...TABS.map(t => h('a', { href: t.href, class: t.cls },
    t.cls === 'tab-sleep' ? h('span', { class: 'dot' }, icon(t.icon)) : icon(t.icon),
    h('span', null, t.label))));
}

function applyTheme(s) {
  const root = document.documentElement;
  root.dataset.theme = s.theme || 'night';
  root.dataset.motion = s.reducedMotion === 'on' ? 'off' : 'system';
  const dark = s.theme === 'night' || (s.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#070912' : '#f4efe6');
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Une nouvelle version de Somnia est prête.', { action: 'Mettre à jour', timeout: 15000, onAction: () => {
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
            w.postMessage('skip-waiting');
          } });
        }
      });
    });
  }).catch(() => { /* hors HTTPS : l'app fonctionne sans mode hors ligne */ });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'notification-click' && e.data.url) location.hash = e.data.url;
  });
}

boot().catch(e => {
  console.error(e);
  document.getElementById('view').replaceChildren(h('div', { class: 'empty' }, h('h1', { class: 'h2' }, 'Somnia n\'a pas pu démarrer'), h('p', { class: 'prose' }, String(e.message || e))));
});
