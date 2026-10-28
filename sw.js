// Service worker de Somnia : fonctionnement hors ligne, notifications de réveil.
// Après toute modification d'un fichier de l'app, incrémenter VERSION
// (`npm run check` vérifie que la liste SHELL couvre tous les fichiers).
const VERSION = 'somnia-v2.0.0';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'css/screens.css',
  'fonts/fraunces-opsz.woff2',
  'fonts/instrument-sans.woff2',
  'fonts/plex-mono-400.woff2',
  'fonts/plex-mono-500.woff2',
  'js/main.js',
  'js/alarm/engine.js',
  'js/alarm/ics.js',
  'js/alarm/push.js',
  'js/alarm/tones.js',
  'js/core/analysis.js',
  'js/core/format.js',
  'js/core/insights.js',
  'js/core/metrics.js',
  'js/core/model.js',
  'js/core/stats.js',
  'js/core/time.js',
  'js/data/db.js',
  'js/data/demo.js',
  'js/data/importexport.js',
  'js/data/migrate-v1.js',
  'js/data/repo.js',
  'js/science/knowledge.js',
  'js/science/references.js',
  'js/screens/alarms.js',
  'js/screens/episodeForm.js',
  'js/screens/home.js',
  'js/screens/journal.js',
  'js/screens/ring.js',
  'js/screens/science.js',
  'js/screens/settings.js',
  'js/screens/shared.js',
  'js/screens/sleep.js',
  'js/screens/stats.js',
  'js/ui/charts.js',
  'js/ui/components.js',
  'js/ui/dom.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
  // Pas de skipWaiting automatique : l'app propose « Recharger » pour ne pas
  // changer de version au milieu d'une nuit.
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('somnia-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // DOI, PubMed : réseau direct
  if (url.pathname.includes('/api/')) return;                                // service push : toujours le réseau
  // Cache d'abord (démarrage instantané, hors ligne), mise à jour en arrière-plan.
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      if (e.request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }),
  );
});

// --- Notifications push (réveil, rappel du coucher) ----------------------------
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Somnia', body: e.data?.text() }; }
  const title = data.title || '⏰ Réveil';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Ouvrez Somnia.',
    tag: data.tag || 'somnia',
    renotify: true,
    requireInteraction: data.kind === 'alarm',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || '#/sleep', tag: data.tag },
    vibrate: [500, 250, 500, 250, 500],
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '#/home';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.postMessage({ type: 'notification-click', url: target, tag: e.notification.data?.tag }); return c.focus(); }
    }
    return self.clients.openWindow(new URL(target, self.registration.scope).href);
  })());
});
