// Service worker : l'app fonctionne hors ligne (sauf les données en temps réel).
const VERSION = 'somnia-v1.0.0';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/analysis.js',
  'js/charts.js',
  'js/tracker.js',
  'js/sounds.js',
  'js/science.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API externes : réseau direct
  if (url.pathname.includes('/api/')) return; // proxy PHP : toujours le réseau

  // Réseau d'abord (pour recevoir les mises à jour), cache en secours hors ligne
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});
