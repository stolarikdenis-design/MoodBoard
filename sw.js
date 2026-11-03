// Offline režim: aplikace jde otevřít i bez signálu, prohlédnuté dlaždice mapy zůstanou v mezipaměti.
const VERSION = 'foceni-v3';
const TILES = 'foceni-tiles';
const SHELL = [
  './', 'index.html', 'app.css', 'fonts.css', 'app.js', 'db.js', 'board.js', 'layout.js', 'autocrop.js', 'ai.js', 'lib/anthropic/sdk.js', 'manifest.json', 'icon.svg', 'icon-192.png',
  'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css',
  'lib/special-elite/special-elite-latin-400-normal.woff2', 'lib/special-elite/special-elite-latin-ext-400-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit ?? net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Aplikace: nejdřív síť (ať se nová verze projeví hned), bez signálu mezipaměť.
  e.respondWith(fetch(e.request)
    .then((r) => { if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone())); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
