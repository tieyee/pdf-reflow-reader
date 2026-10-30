// Renders the Versal app icon (versal-512.png, versal-192.png) from the SVG below: a cream moon page with a folded
// oxblood dog-ear on graphite. Full bleed, artwork inside the maskable safe zone. New file names on purpose: iPhone
// caches a home-screen icon by its address.
// Usage: node test/icon.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>
<svg id="i" width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0"/></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="-3" dy="-3" stdDeviation="5" flood-color="#000" flood-opacity=".35"/></filter>
    <linearGradient id="silk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d2236"/><stop offset=".5" stop-color="#b43c53"/><stop offset="1" stop-color="#7d2236"/></linearGradient>
    <clipPath id="disc"><path d="M0 0H512V207.400L207.400 512H0Z"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="#29292c"/><rect width="512" height="512" filter="url(#grain)"/>
  <g clip-path="url(#disc)"><circle cx="256" cy="256" r="174" fill="#eeebe5"/>
    <circle cx="205" cy="195" r="31" fill="#d6d0c2"/><circle cx="297" cy="256" r="20" fill="#d6d0c2"/><circle cx="195" cy="297" r="18" fill="#d6d0c2"/></g>
  <path d="M307 412L412 307L307 307Z" fill="url(#silk)" filter="url(#soft)"/>
</svg>`;
const browser = await chromium.launch();
for (const size of [512, 192]) {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.locator('#i').screenshot({ path: path.join(ROOT, `versal-${size}.png`) });
  await page.close();
}
await browser.close();
console.log('versal-512.png, versal-192.png written');
