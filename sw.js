// Keeps the app usable offline. Books and reading positions live in IndexedDB, not in this cache.
const CACHE = 'folio-v5';                  // bump when the pdf.js or font files below change
const PDFJS = 'vendor/pdfjs-4.10.38/';
const FONTS = ['garamond-latin', 'garamond-latin-ext', 'literata-latin', 'literata-latin-ext', 'atkinson-next-latin', 'atkinson-next-latin-ext'].map(f => `vendor/fonts/${f}.woff2`);
const SHELL = ['./', 'manifest.json', 'folio-192.png', 'folio-512.png', PDFJS + 'pdf.min.mjs', PDFJS + 'pdf.worker.min.mjs', ...FONTS];

self.oninstall = e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
self.onactivate = e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim()));

self.onfetch = e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreVary: true });
    const net = () => fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; });
    // pdf.js files never change at a given version path; char maps and fonts are cached the first time they're used.
    if (url.pathname.includes('/' + PDFJS)) return hit || net();
    // App files: answer from the cache at once and refresh it for next time.
    if (hit) { e.waitUntil(net().catch(() => {})); return hit; }
    return net().catch(async () => (req.mode === 'navigate' && await c.match('./', { ignoreVary: true })) || Response.error());
  }));
};
