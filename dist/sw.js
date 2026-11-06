// Learnr service worker. It keeps the app itself on the device so it opens with no signal and starts fast on weak data.
// It never stores your private data: that is kept by the database library on the device. AI, tests and pods need a connection.
const BUILD = 'mw5cewon';
const APP = 'learnr-app-' + BUILD;
const LIBS = 'learnr-libs';
const SHELL = ['/', '/index.html', '/app.js?v=' + BUILD, '/app.css?v=' + BUILD, '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/logo-mark.webp', '/fonts/great-vibes.woff'];
// Cross-origin files the app needs to start: the database libraries and the fonts.
const LIB_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('learnr-app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('slow')), ms); p.then((v) => { clearTimeout(t); res(v); }, (er) => { clearTimeout(t); rej(er); }); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/.netlify/')) return; // functions are never cached
    if (req.mode === 'navigate') {
      // Try the network, but on a slow or missing connection open the saved app after a few seconds.
      e.respondWith((async () => {
        try { return await withTimeout(fetch(req), 4000); } catch { return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error(); }
      })());
      return;
    }
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') (await caches.open(APP)).put(req, res.clone());
        return res;
      } catch { return Response.error(); }
    })());
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    // Saved the first time they load, then reused. They are versioned, so this is safe.
    e.respondWith((async () => {
      const c = await caches.open(LIBS);
      const hit = await c.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await fresh) || Response.error();
    })());
  }
});
