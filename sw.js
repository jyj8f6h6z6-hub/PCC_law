const CACHE = 'pcc-e-law-v6.14-20260922';
const CORE = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon.svg', './offline.html',
  './data/laws.json', './data/letters.json', './data/act_rules_map.json', './json/政府採購法.json', './json/政府採購法施行細則.json'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pcc-e-law-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (err) {
      if (event.request.mode === 'navigate') return (await caches.match('./index.html')) || (await caches.match('./offline.html'));
      throw err;
    }
  })());
});
