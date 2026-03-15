const CACHE = 'overtime-pro-v3';
const ASSETS = [
  '/',
  '/index.html',
  'https://unpkg.com/react@18.2.0/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://unpkg.com/lunar-javascript@1.6.12/lunar.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(ASSETS.map(u => c.add(u).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.protocol === 'chrome-extension:') return;
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(r => { caches.open(CACHE).then(c => c.put(req, r.clone())); return r; })
        .catch(() => caches.match(req))
    );
  } else {
    e.respondWith(
      caches.match(req).then(c =>
        c || fetch(req).then(r => {
          caches.open(CACHE).then(cc => cc.put(req, r.clone()));
          return r;
        })
      )
    );
  }
});
