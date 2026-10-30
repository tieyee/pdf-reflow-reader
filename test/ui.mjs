// Fast checks for Home, Collections, the Text sheet, Contents and Pick, on three generated books (made-up text):
//   Harbour Lights — chapter headings in big type (found by size), no built-in contents
//   Quiet Ledger   — chapter headings at body size (not found by size), with the PDF's built-in contents (outline)
//   Plain Notes    — no headings, no contents
// Usage: node test/ui.mjs [webkit] [chromium]   (default both)   ONLY=<part of a check name>
import { chromium, webkit, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'test', 'out', 'ui');
fs.mkdirSync(GEN, { recursive: true });
const ENGINES = process.argv.length > 2 ? process.argv.slice(2) : ['webkit', 'chromium'];
const DEVICE = { chromium: 'Pixel 7', webkit: 'iPhone 13' };

// ---- static server for the app ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/manifest+json', '.png': 'image/png', '.mjs': 'text/javascript', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const APP = `http://127.0.0.1:${server.address().port}/`;

// ---- three books ----
let seed = 5;
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const W = ('the a of and to in was she he it that as with for on her his at by from they but not had lantern keeper river road ' +
  'village night stone houses wind rain streets candles window door light dark walked carried burned fell turned waited').split(' ');
const sentence = () => { const w = Array.from({ length: 6 + Math.floor(rnd() * 12) }, () => pick(W)).join(' '); return w[0].toUpperCase() + w.slice(1) + '.'; };
const para = () => Array.from({ length: 2 + Math.floor(rnd() * 4) }, sentence).join(' ');
const BODY = 'body{margin:0;font:11pt/1.45 Georgia,serif}p{margin:0 0 .4em;text-indent:1.4em;text-align:justify}';
const chapters = h1css => ['One', 'Two', 'Three'].map((c, i) => `<h1 style="${h1css}${i ? ';break-before:page' : ''}">Chapter ${c}</h1>` +
  Array.from({ length: 10 }, () => `<p>${para()}</p>`).join('')).join('');
const BOOKS = [
  { title: 'Harbour Lights', body: chapters('font-size:20pt;font-weight:normal;text-align:center;margin:.6in 0 .3in'), opts: {} },
  { title: 'Quiet Ledger', body: chapters('font:11pt/1.45 Georgia,serif;margin:0 0 .4em'), opts: { tagged: true, outline: true } },
  { title: 'Plain Notes', body: Array.from({ length: 24 }, () => `<p>${para()}</p>`).join(''), opts: {} },
];
// Added only by the check that needs it: chapters open with a long epigraph above a big title, and the PDF has its
// own contents list, which points at the top of each chapter's page (the epigraph), not at the title.
const EPI = { title: 'Epigraphs', body: ['One', 'Two', 'Three'].map((c, i) => `<div style="${i ? 'break-before:page;' : ''}margin:0 .4in 1in;font-style:italic">` +
  Array.from({ length: 3 }, () => `<p style="text-indent:0">${para()} ${para()}</p>`).join('') + `</div><h1 style="font-size:20pt;font-weight:normal;text-align:center;margin:0 0 .3in">Chapter ${c}</h1>` +
  Array.from({ length: 8 }, () => `<p>${para()}</p>`).join('')).join(''), opts: { tagged: true, outline: true } };
const gen = await chromium.launch(), gp = await gen.newPage(), FILES = [];
for (const b of BOOKS) {
  await gp.setContent(`<!doctype html><meta charset="utf-8"><title>${b.title}</title><style>${BODY}</style>${b.body}`);
  const f = path.join(GEN, b.title.toLowerCase().replace(/\W+/g, '-') + '.pdf');
  await gp.pdf({ path: f, width: '5in', height: '7.5in', margin: { top: '0.7in', bottom: '0.7in', left: '0.7in', right: '0.7in' }, ...b.opts });
  FILES.push(f);
}
await gp.setContent(`<!doctype html><meta charset="utf-8"><title>${EPI.title}</title><style>${BODY}</style>${EPI.body}`);
const EPI_FILE = path.join(GEN, 'epigraphs.pdf');
await gp.pdf({ path: EPI_FILE, width: '5in', height: '7.5in', margin: { top: '0.7in', bottom: '0.7in', left: '0.7in', right: '0.7in' }, ...EPI.opts });
await gen.close();
// The Quiet Ledger file must really carry a built-in contents list, or its checks prove nothing.
{
  const PJ = path.join(ROOT, 'vendor', 'pdfjs-4.10.38');
  const pdfjs = await import(pathToFileURL(path.join(PJ, 'pdf.min.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(PJ, 'pdf.worker.min.mjs')).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(FILES[1])) }).promise;
  const ol = await doc.getOutline();
  assert.equal(ol?.length, 3, 'Quiet Ledger should have 3 outline entries, has ' + (ol?.length ?? 0));
  doc.destroy();
}

// ---- helpers ----
const checks = [];
// opts: extra browser context options for one check (the cover checks block the service worker: WebKit only lets
// Playwright answer web requests itself when no service worker is in the way).
const check = (name, fn, opts = {}) => checks.push({ name, fn, opts });
const tap = (page, sel) => page.$eval(sel, e => e.click());
const shown = (page, sel) => page.$eval(sel, e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden').catch(() => false);
const texts = (page, sel) => page.$$eval(sel, es => es.map(e => e.textContent.trim()));
async function openTitle(page, title) {
  if (!await shown(page, '#v-library')) await home(page);
  if (!await shown(page, '#drawer')) { if (!await shown(page, '#v-library')) await home(page); await tap(page, '#libSearch'); }
  await page.fill('#lq', title);
  await page.waitForSelector('#lqList .brow');
  await page.$$eval('#lqList .brow .open', (bs, t) => bs.find(b => b.querySelector('.t').textContent === t).click(), title);
  await page.waitForSelector('#reader:not([hidden]) #text > *');
  await page.waitForTimeout(300);
}
async function home(page) {
  if (await shown(page, '#reader')) { await tap(page, '#back'); await page.waitForSelector('#reader', { state: 'hidden' }); }   // Home shows once it's ready
  for (let i = 0; i < 4 && !await shown(page, '#v-library'); i++) { await page.goBack(); await page.waitForTimeout(200); }
  if (await shown(page, '#drawer')) await tap(page, '#libClose');
  await page.waitForSelector('#v-library:not([hidden])');
}
// Runs fn(db, arg) in the page with the app's database open. fn is sent as source, so it can't use outer variables.
const idb = (page, fn, arg) => page.evaluate(async ([src, arg]) => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('reflow', 2); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  try { return await new Function('db', 'arg', `return (${src})(db, arg)`)(db, arg); } finally { db.close(); }
}, [fn.toString(), arg]);
// One store's records as [key, value] pairs, and a write.
const rows = (page, store) => idb(page, (db, s) => new Promise(res => {
  const o = db.transaction(s).objectStore(s), out = [];
  o.openCursor().onsuccess = e => { const c = e.target.result; if (!c) return res(out); out.push([c.key, c.value]); c.continue(); };
}), store);
const putRow = (page, store, key, value) => idb(page, (db, [s, k, v]) => new Promise((res, rej) => {
  const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error);
}), [store, key, value]);
const metaOf = async (page, title) => (await rows(page, 'meta')).find(([, m]) => m.title === title);

// ---- checks ----
check('no bounce at the edges', async ({ page }) => {
  // Playwright's Windows WebKit build lacks overscroll-behavior (iPhone Safari has it since iOS 16): there, check the rule is in the source.
  if (await page.evaluate(() => CSS.supports('overscroll-behavior-y', 'none'))) {
    const v = await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY]);
    assert.deepEqual(v, ['none', 'none']);
  } else {
    const src = await page.evaluate(async () => (await fetch(location.href)).text());
    assert.match(src, /\nhtml\{[^}]*overscroll-behavior-y:none/);
    assert.match(src, /\nbody\{[^}]*overscroll-behavior-y:none/);
  }
});

const sheetShare = page => page.evaluate(() => document.querySelector('#rset').offsetHeight / innerHeight);
check('text sheet has two short tabs', async ({ page }) => {
  await openTitle(page, 'Plain Notes');
  await tap(page, '#setBtn');
  assert.deepEqual(await texts(page, '#rset [role=tab]'), ['Text', 'Page']);
  assert.equal(await page.getAttribute('#tabText', 'aria-selected'), 'true');
  assert.ok(await shown(page, '#s-size'), 'size slider on the Text tab');
  assert.ok(!await shown(page, '#rset [data-k=mode]'), 'Reflow/Page not on the Text tab');
  let share = await sheetShare(page);
  assert.ok(share <= 0.62, `Text tab takes ${Math.round(share * 100)}% of the screen`);
  await tap(page, '#tabPage');
  assert.ok(await shown(page, '#rset [data-k=mode]'), 'Reflow/Page on the Page tab');
  assert.ok(!await shown(page, '#s-size'), 'size slider not on the Page tab');
  share = await sheetShare(page);
  assert.ok(share <= 0.62, `Page tab takes ${Math.round(share * 100)}% of the screen`);
  await tap(page, '#rsetClose');
  await tap(page, '#setBtn');
  assert.equal(await page.getAttribute('#tabPage', 'aria-selected'), 'true', 'reopens on the last tab');
});

const cssVar = (page, v) => page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
const slide = (page, sel, v) => page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const pageTab = async page => { await tap(page, '#setBtn'); await tap(page, '#tabPage'); await page.waitForTimeout(50); };
check('warmth and dim', async ({ page }) => {
  await openTitle(page, 'Plain Notes');
  await pageTab(page);
  await slide(page, '#s-warm', 100); await page.waitForTimeout(100);
  assert.equal(await cssVar(page, '--page'), '#f3ead6');
  await slide(page, '#s-dim', 40); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body, '::after').opacity), '0.4');
  assert.equal((await page.textContent('#dimVal')).trim(), '40%');
  await page.reload();
  await page.waitForSelector('#reader:not([hidden]) #text > *');
  assert.equal(await page.$eval('#s-warm', e => e.value), '100');
  assert.equal(await cssVar(page, '--page'), '#f3ead6');
});
// An iPhone home-screen app paints the strip above it (time, battery) from the background colour of a full-width
// fixed layer at the top when one shows, else from the body's. So every such layer, and the body, carry the colour of
// what shows at the top: the dimmed page while reading, the top of the light on Home. See-through layers carry it
// at alpha 0 (an iPhone that ignores the alpha still gets the right colour).
const bg = (page, sel) => page.$eval(sel, e => getComputedStyle(e).backgroundColor);
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const rgb0 = hex => rgb(hex).replace('rgb', 'rgba').replace(')', ', 0)');
check('status strip matches the page', async ({ page }) => {
  await put(page, 'Harbour Lights', { pct: 40, page: 3, opened: Date.now() });
  await relaunch(page);
  await page.waitForFunction(() => document.querySelector('#field .fl[style*="opacity: 1"]'));
  const top = await page.$eval('#field .fl[style*="opacity: 1"]', l => getComputedStyle(l).getPropertyValue('--ft').trim());
  const want = await page.evaluate(c => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, top);
  assert.equal(await bg(page, 'body'), want, 'Home: the top of the light');
  assert.equal(await bg(page, '#field'), want, 'Home: the light, a fixed layer, carries it too');
  await openTitle(page, 'Plain Notes');
  await pageTab(page); await slide(page, '#s-warm', 100); await slide(page, '#s-dim', 20); await tap(page, '#rsetClose');
  await page.waitForTimeout(100);
  // #f3ead6 under black at 20%: each channel × 0.8
  assert.equal(await bg(page, 'body'), rgb('#c2bbab'), 'reading: the dimmed page');
  assert.equal(await page.$eval('meta[name=theme-color]', m => m.content), '#c2bbab');
  assert.equal(await bg(page, '.rtop'), rgb('#c2bbab'), 'the top bar, a fixed layer, carries the dimmed page');
  assert.equal(await page.$eval('.rtop', e => getComputedStyle(e, '::before').backgroundColor), rgb('#f3ead6'), 'what it shows is the page, dimmed by the layer above');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body, '::after').backgroundColor), rgb0('#c2bbab'), 'the dim layer carries it at alpha 0');
  assert.equal(await bg(page, '#reader'), rgb('#f3ead6'), 'the page itself stays undimmed under the dim layer');
});
// After a chapter jump, Back to page shows for a few seconds, then waits at the top of Contents.
check('back to page fades into contents', async ({ page }) => {
  await openTitle(page, 'Quiet Ledger');
  const y0 = await page.evaluate(() => scrollY);
  await openContents(page);
  await page.$$eval('#sheet .hit', bs => bs.filter(b => b.querySelector('.snip.ui'))[2].click());
  await page.waitForSelector('#retBtn:not([hidden])');
  assert.match(await page.textContent('#retBtn'), /^Back to page \d+$/);
  await page.waitForSelector('#retBtn', { state: 'hidden', timeout: 6000 });
  await openContents(page);
  assert.match(await page.$eval('#sheetBody > :first-child', e => e.className + ' ' + e.textContent), /retrow.*Back to page \d+/);
  await tap(page, '#sheetBody > .retrow');
  await page.waitForFunction(() => !document.querySelector('#sheet').open);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - y0) < 40, 'back where it was');
  await openContents(page);
  assert.equal(await page.$$eval('#sheetBody > .retrow', r => r.length), 0, 'used up');
});
// Gestures, driven with made-up touches (Chromium can build them; this WebKit build can't).
const touch = (page, sel, steps) => page.$eval(sel, (e, steps) => {
  const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 40);
  const t = dy => new Touch({ identifier: 1, target: e, clientX: x, clientY: y + dy });
  e.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(0)], changedTouches: [t(0)] }));
  for (const dy of steps) e.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(dy)], changedTouches: [t(dy)] }));
}, steps);
const lift = (page, sel, dy) => page.$eval(sel, (e, dy) => {
  const r = e.getBoundingClientRect(), t = new Touch({ identifier: 1, target: e, clientX: r.left + r.width / 2, clientY: r.top + Math.min(r.height / 2, 40) + dy });
  e.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t] }));
}, dy);
const slow = n => Array.from({ length: n / 10 }, (_, i) => (i + 1) * 10);
check('library tray covers', async ({ page }) => {
  // Big covers so the row scrolls: the Library opens at the first one showing.
  await page.addStyleTag({ content: '.cover.pk{width:300px}' });
  const ids = await page.$$eval('#peekRow .book', b => b.map(x => x.dataset.id));
  assert.ok(ids.length >= 2, 'tray books: ' + ids.length);
  await page.$eval('#peekRow', r => { r.scrollLeft = r.children[1].offsetLeft - r.children[0].offsetLeft; });
  await tap(page, '#libOpen');
  await page.waitForSelector('#drawer:not([hidden])');
  await page.waitForTimeout(500);
  const vis = await page.$eval(`#shelfRows .sitem[data-id="${ids[1]}"]`, it => {
    const r = it.getBoundingClientRect(), d = document.querySelector('#drawer').getBoundingClientRect();
    return r.top >= d.top && r.bottom <= d.bottom && r.left >= 0 && r.right <= innerWidth;
  });
  assert.ok(vis, 'the scrolled-to book shows in the Library');
  await home(page);
  // A tap on a cover opens that book.
  const title = await page.$eval('#peekRow .book', b => b.getAttribute('aria-label').split(',')[0]);
  await tap(page, '#peekRow .book');
  await page.waitForSelector('#reader:not([hidden])');
  assert.equal(await page.textContent('#rtitle'), title);
});
check('library and home follow the finger', async ({ page, engine }) => {
  if (!await page.evaluate(() => { try { return !!new Touch({ identifier: 1, target: document.body }); } catch { return false; } })) return console.log(`  (${engine} can't make test touches: skipped)`);
  // Home: pulls down a little, never past 120px, and springs back.
  await page.waitForFunction(() => document.documentElement.classList.contains('fit'), null, { timeout: 3000 });   // Home fits the screen
  assert.equal(await page.$eval('#v-library', v => getComputedStyle(v).touchAction), 'pan-x', 'no up-down panning on Home');
  await touch(page, '#nowT', slow(400));
  const pulled = await page.$eval('#views', v => new DOMMatrix(getComputedStyle(v).transform).m42);
  assert.ok(pulled > 60 && pulled < 120, 'Home pull: ' + pulled);
  await lift(page, '#nowT', 400);
  await page.waitForTimeout(600);
  assert.equal(await page.$eval('#views', v => getComputedStyle(v).transform), 'none', 'springs back');
  // The tray's covers don't pull (the iPhone's swipe home starts down there); its top row does.
  await touch(page, '#peekRow .book', [-10, ...slow(300).map(d => -d)]);
  await lift(page, '#peekRow .book', -300);
  await page.waitForTimeout(300);
  assert.ok(!await shown(page, '#drawer'), 'a pull on the covers leaves the Library shut');
  // The tray: a short pull up opens the Library and it stays.
  await touch(page, '#peekCount', [-10, ...slow(300).map(d => -d)]);
  await page.waitForTimeout(150);   // held still before letting go: no flick
  await lift(page, '#peekCount', -300);
  await page.waitForTimeout(600);
  assert.ok(await shown(page, '#drawer') && await page.evaluate(() => document.documentElement.classList.contains('lib')), 'pull up opens the Library');
  assert.equal(await page.$eval('#drawer', d => getComputedStyle(d).transform), 'none', 'settled open');
  // A short pull down on a shelf, halfway down the list, settles back; a long one closes it.
  await touch(page, '#shelfRows .srow', slow(60));
  await page.waitForTimeout(150);
  await lift(page, '#shelfRows .srow', 60);
  await page.waitForTimeout(600);
  assert.ok(await shown(page, '#drawer'), 'a short pull keeps it open');
  await page.$eval('#drawer', d => { const x = document.createElement('div'); x.id = 'zz'; x.style.height = '2000px'; d.append(x); d.scrollTop = 40; });
  assert.equal(await page.$eval('#drawer', d => d.scrollTop), 40);
  await touch(page, '#shelfRows .srow', slow(300));
  await lift(page, '#shelfRows .srow', 300);
  await page.waitForTimeout(300);
  assert.ok(await shown(page, '#drawer'), 'a list scrolled down scrolls, not closes');
  await page.$eval('#drawer', d => { d.scrollTop = 0; d.querySelector('#zz').remove(); });
  await touch(page, '#shelfRows .srow', slow(300));
  await page.waitForTimeout(150);
  await lift(page, '#shelfRows .srow', 300);
  await page.waitForSelector('#drawer', { state: 'hidden' });
  await page.waitForTimeout(500);
  assert.equal(await page.$eval('#views', v => getComputedStyle(v).transform), 'none', 'Home back to full size');
});
// Dim is for the eyes at night: Contents and the other sheets over the book dim with the page, not pop up at full brightness.
check('dim covers the reader sheets', async ({ page }) => {
  await openTitle(page, 'Plain Notes');
  const contents = async () => {
    await tap(page, '#gotoBtn'); await page.waitForSelector('#sheet[open]'); await page.waitForTimeout(400);
    const b = await page.locator('#sheet').boundingBox();   // inside the sheet: its rounded corners show the page
    const img = await page.screenshot({ clip: { x: b.x + 24, y: b.y + 24, width: b.width - 48, height: b.height - 48 } });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    return img;
  };
  const bright = await contents();
  await pageTab(page); await slide(page, '#s-dim', 40); await tap(page, '#rsetClose');
  assert.ok(!bright.equals(await contents()), 'Contents looks the same with Dim at 40%');
});
check('warmth in dark', async ({ page }) => {
  await tap(page, '#goSettings');
  await tap(page, '#v-settings [data-k=theme] [data-v=dark]');
  await openTitle(page, 'Plain Notes');
  await pageTab(page);
  await slide(page, '#s-warm', 100); await page.waitForTimeout(100);
  assert.equal(await cssVar(page, '--page'), '#1e1a14');
});
check('old sepia setting becomes warmth', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('reflow-settings', JSON.stringify({ v: 3, tint: 'sepia', theme: 'light' })));
  await page.reload();
  await page.waitForSelector('#v-library:not([hidden])');
  await openTitle(page, 'Plain Notes');
  assert.equal(await cssVar(page, '--page'), '#f3ead6');
  await pageTab(page);
  assert.equal((await page.textContent('#warmVal')).trim(), '100%');
});

const chapterTitles = page => texts(page, '#sheet .hit .snip.ui');
const openContents = async page => { await tap(page, '#gotoBtn'); await page.waitForSelector('#sheet[open] .scroll'); await page.waitForTimeout(150); };
const noBookmarksNote = page => page.$eval('#sheet', s => s.textContent.includes('No bookmarks yet'));
check('contents uses the built-in list', async ({ page }) => {
  await openTitle(page, 'Quiet Ledger');
  await openContents(page);
  assert.deepEqual(await texts(page, '#sheet [role=tab]'), ['Chapters', 'Bookmarks']);
  assert.equal(await page.$eval('#sheet [role=tab]', t => t.getAttribute('aria-selected')), 'true');
  const ch = await chapterTitles(page);
  assert.equal(ch.length, 3, ch.join(' | '));
  for (const w of ['One', 'Two', 'Three']) assert.ok(ch.some(t => t.includes('Chapter ' + w)), 'missing Chapter ' + w);
  await page.$$eval('#sheet .hit', bs => bs.filter(b => b.querySelector('.snip.ui'))[1].click());
  await page.waitForTimeout(500);
  const at = await page.evaluate(() => {
    const e = [...document.querySelectorAll('#text > *')].find(e => e.textContent.includes('Chapter Two')), r = e?.getBoundingClientRect();
    return e && { top: Math.round(r.top), bar: document.querySelector('.rtop').offsetHeight, half: innerHeight / 2 };
  });
  assert.ok(at && at.top >= at.bar - 2 && at.top <= at.half, 'Chapter Two not under the top bar: ' + JSON.stringify(at));
  await openContents(page);
  await page.$$eval('#sheet [role=tab]', ts => ts[1].click());
  assert.ok(await noBookmarksNote(page), 'Bookmarks tab shows the empty note');
});
check('contents lands on the chapter title', async ({ page }) => {
  await page.setInputFiles('#file', EPI_FILE);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('is ready'), null, { timeout: 60000 });
  await openTitle(page, 'Epigraphs');
  await openContents(page);
  await page.$$eval('#sheet .hit', bs => bs.filter(b => b.querySelector('.snip.ui'))[1].click());
  await page.waitForTimeout(500);
  const at = await page.evaluate(() => {
    const e = [...document.querySelectorAll('#text h2,#text h3')].find(e => e.textContent.includes('Chapter Two')), r = e?.getBoundingClientRect();
    return e && { top: Math.round(r.top), bar: document.querySelector('.rtop').offsetHeight };
  });
  assert.ok(at && at.top >= at.bar - 2 && at.top <= at.bar + 60, 'Chapter Two title not just under the top bar: ' + JSON.stringify(at));
});
check('contents falls back to headings', async ({ page }) => {
  await openTitle(page, 'Harbour Lights');
  await openContents(page);
  assert.deepEqual(await texts(page, '#sheet [role=tab]'), ['Chapters', 'Bookmarks']);
  assert.equal((await chapterTitles(page)).length, 3);
});
check('contents without chapters is just bookmarks', async ({ page }) => {
  await openTitle(page, 'Plain Notes');
  await openContents(page);
  assert.equal((await page.$$('#sheet [role=tab]')).length, 0);
  assert.ok(await noBookmarksNote(page));
});
check('old books read their contents once', async ({ page }) => {
  const [id] = await metaOf(page, 'Quiet Ledger');
  const [, text] = (await rows(page, 'text')).find(([k]) => k === id);
  delete text.toc;
  await putRow(page, 'text', id, text);
  await page.reload();
  await page.waitForSelector('#v-library:not([hidden])');
  await openTitle(page, 'Quiet Ledger');
  await openContents(page);
  assert.equal((await chapterTitles(page)).length, 3);
  const [, again] = (await rows(page, 'text')).find(([k]) => k === id);
  assert.equal(again.toc?.length, 3, 'contents saved after the first read');
});

// ---- Home and the Library drawer ----
const openLib = async page => { if (!await shown(page, '#drawer')) await tap(page, '#libOpen'); await page.waitForSelector('#drawer:not([hidden])'); };
const shelfNames = page => texts(page, '#shelfRows .srow .sn');
const put = async (page, title, patch) => { const [id, m] = await metaOf(page, title); await putRow(page, 'meta', id, { ...m, ...patch }); };
const relaunch = async page => { await page.reload(); await page.waitForSelector('#v-library:not([hidden])'); await page.waitForTimeout(300); };
async function newColl(page, name, side = 'Fiction') {
  await tap(page, `[aria-label="Add a ${side} collection"]`);
  await page.fill('#sheet input', name);
  await page.press('#sheet input', 'Enter');
  await page.waitForFunction(n => [...document.querySelectorAll('#shelfRows .sn')].some(e => e.textContent === n), name);
}
const openShelf = (page, name) => page.$$eval('#shelfRows .sname', (ns, n) => ns.find(x => x.querySelector('.sn').textContent === n).click(), name);
const heads = page => texts(page, '#shelfRows .lsec > .shead h3');
check('library: fiction and non-fiction', async ({ page }) => {
  await putRow(page, 'shelves', 'f', { id: 'f', name: 'Novels', order: 1, side: 'fiction' });
  await put(page, 'Harbour Lights', { shelf: 'f' });
  await put(page, 'Quiet Ledger', { side: 'nonfiction' });
  await relaunch(page);
  await openLib(page);
  assert.equal(await page.textContent('#libCount'), '3 books');
  assert.deepEqual(await heads(page), ['Fiction', 'Non-fiction'], 'two sections, no All');
  assert.deepEqual(await shelfNames(page), ['Novels', 'All non-fiction', 'Not in a collection'],
    'a Fiction collection, a Non-fiction book in no collection (All, while Non-fiction has no collections), a book with neither');
  assert.deepEqual(await texts(page, '#shelfRows .lsec > .shead .rn'), ['I', 'II'], 'sections numbered like chapters');
  assert.equal((await page.$$('#chips')).length + (await page.$$('#allGrid')).length, 0, 'no filter chips, no All books grid');
  // A Non-fiction collection made from its section's Add, a book put in it from its hold menu.
  await newColl(page, 'Notes', 'Non-fiction');
  await page.$$eval('#shelfRows .srow', rs => rs.find(r => r.querySelector('.sn').textContent === 'Not in a collection').querySelector('.book')
    .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  await page.locator('#sheet .act', { hasText: /^Notes$/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('#shelfRows .srow')].some(r => r.querySelector('.sn').textContent === 'Notes' && r.querySelectorAll('.book').length === 1));
  assert.deepEqual(await shelfNames(page), ['Novels', 'Notes', 'Other non-fiction'], 'Notes sits under Non-fiction');
  // New collection from a book's menu asks Fiction or Non-fiction.
  await page.$$eval('#shelfRows .srow', rs => rs.find(r => r.querySelector('.sn').textContent === 'Novels').querySelector('.book')
    .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  await page.locator('#sheet .act', { hasText: 'New collection' }).click();
  assert.deepEqual(await texts(page, '#sheet .seg button[aria-pressed=true]'), ['Fiction'], 'starts on the book\'s side');
  await page.keyboard.press('Escape');
  // A collection's page, a relaunch inside it, and back out.
  await openShelf(page, 'Notes');
  await page.waitForSelector('#v-shelf:not([hidden]) #grid .book');
  assert.equal(await page.textContent('#shelfName'), 'Notes');
  assert.ok(await shown(page, '#shelfBack') && !await shown(page, '#h-lib'), 'Back in the drawer header');
  // Opening the app again never lands in the Library or a collection: Home (or the book you were reading).
  await relaunch(page);
  assert.ok(!await shown(page, '#drawer') && await shown(page, '#nowCard'), 'a relaunch inside a collection opens Home');
  await openLib(page);
  await page.waitForSelector('#dLib:not([hidden]) #shelfRows .srow');
  // Leaving the app from the Library: back on Home when it comes back.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForSelector('#drawer', { state: 'hidden' });
  assert.ok(await shown(page, '#nowCard'), 'leaving the app from the Library comes back on Home');
  await openLib(page);
  await page.waitForSelector('#dLib:not([hidden]) #shelfRows .srow');
  // The shelf of books in no collection opens too, without collection options.
  await openShelf(page, 'Other non-fiction');
  await page.waitForSelector('#v-shelf:not([hidden]) #grid .book');
  assert.ok(!await shown(page, '#shelfMore') && !await shown(page, '#shelfAdd'), 'no options on a shelf that is not a collection');
  await tap(page, '#libClose');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  assert.ok(await shown(page, '#nowCard'), 'Home again');
});
check('arrange collections and books', async ({ page }) => {
  for (const [id, name, order] of [['a', 'Alpha', 1], ['b', 'Beta', 2], ['c', 'Gamma', 3]]) await putRow(page, 'shelves', id, { id, name, order, side: 'fiction' });
  for (const t of ['Harbour Lights', 'Quiet Ledger', 'Plain Notes']) await put(page, t, { shelf: 'a' });
  await relaunch(page);
  await openLib(page);
  assert.deepEqual(await shelfNames(page), ['Alpha', 'Beta', 'Gamma']);
  await tap(page, '[aria-label="Arrange Fiction collections"]');
  await page.waitForFunction(() => !document.querySelector('#drawer').getAnimations().length);   // the Library has finished sliding up
  const grip = n => page.locator('#shelfRows .arow', { hasText: n }).locator('.grip');
  const a = await grip('Gamma').boundingBox(), b = await grip('Alpha').boundingBox(), x = a.x + a.width / 2;
  await page.mouse.move(x, a.y + a.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x, a.y + a.height / 2 + (b.y - a.y) * i / 8 - 6); await page.waitForTimeout(30); }
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.deepEqual(await texts(page, '#shelfRows .arow .an'), ['Gamma', 'Alpha', 'Beta'], 'dragged to the top');
  await grip('Beta').focus(); await page.keyboard.press('ArrowUp');
  assert.deepEqual(await texts(page, '#shelfRows .arow .an'), ['Gamma', 'Beta', 'Alpha'], 'arrow key moves a row');
  await tap(page, '[aria-label="Done arranging"]');
  await page.waitForTimeout(200);
  await relaunch(page);
  await openLib(page);
  await page.waitForSelector('#shelfRows .srow');
  assert.deepEqual(await shelfNames(page), ['Gamma', 'Beta', 'Alpha'], 'order kept after a relaunch');
  await openShelf(page, 'Alpha');
  await page.waitForSelector('#v-shelf:not([hidden]) #grid .book');
  const before = await texts(page, '#grid .glabel2 .t');
  await tap(page, '#arrBooks');
  await page.locator('#grid .arow').last().locator('.grip').focus();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  const moved = await texts(page, '#grid .arow .an');
  assert.equal(moved[0], before.at(-1), 'last book moved to the front');
  await tap(page, '#arrBooks');
  await page.waitForTimeout(200);
  await relaunch(page);
  await openLib(page);
  await openShelf(page, 'Alpha');
  await page.waitForSelector('#v-shelf:not([hidden]) #grid .book');
  assert.deepEqual(await texts(page, '#grid .glabel2 .t'), moved, 'book order kept after a relaunch');
});
check('home layout', async ({ page, engine }) => {
  if (engine === 'webkit') await page.setViewportSize({ width: 390, height: 763 });   // an iPhone 13 home-screen app
  await put(page, 'Harbour Lights', { pct: 40, page: 3, opened: Date.now(), chap: 'PREFACE AND THANKS' });
  await put(page, 'Quiet Ledger', { pct: 5, page: 1, opened: Date.now() - 1000, chap: 'Click here to sign up' });
  await relaunch(page);
  assert.match(await page.textContent('#h-library'), /^Good (morning|afternoon|evening)$/, 'time-of-day greeting');
  assert.equal(await page.textContent('#nowT'), 'Harbour Lights');
  assert.equal(await page.textContent('#nowGo b'), 'Resume reading');
  assert.equal(await page.textContent('#nowWhere'), 'Preface and thanks · 60% left', 'capitals read in sentence case');
  assert.equal(await page.$$eval('#pager .slide', s => s.length), 2, 'both books in progress are covers to swipe between');
  assert.equal(await page.textContent('#peekCount'), '3 books');
  await page.waitForFunction(() => document.querySelector('#field .fl[style*="opacity: 1"]'));
  assert.ok(await page.$eval('#nowCard', c => getComputedStyle(c).getPropertyValue('--c').trim() !== ''), 'Resume takes a colour from the cover');
  // Swipe to the other book: the title, where you are and the light follow it.
  const lit = () => page.evaluate(() => [...document.querySelectorAll('#field .fl')].map(l => +l.style.opacity));
  assert.equal((await lit()).length, 2, 'one layer of light per book');
  assert.deepEqual(await lit(), [1, 0], 'the front book is lit');
  // Half way through a swipe the next light is half in: the glow goes with the finger, it doesn't wait for the landing.
  await page.$eval('#pager', p => { p.style.scrollSnapType = 'none'; p.scrollTo({ left: (p.children[1].offsetLeft - p.children[0].offsetLeft) / 2 }); });
  await page.waitForFunction(() => { const l = document.querySelectorAll('#field .fl'); return l[1] && Math.abs(l[1].style.opacity - .5) < .08; });
  assert.equal((await lit())[0], 1, 'the one behind stays solid');
  await page.$eval('#pager', p => { p.style.scrollSnapType = ''; });
  await page.$eval('#pager', p => p.scrollTo({ left: p.children[1].offsetLeft - p.children[0].offsetLeft }));
  await page.waitForFunction(() => document.querySelector('#nowT').textContent === 'Quiet Ledger');
  assert.equal(await page.textContent('#nowWhere'), '95% left', 'a publisher ad is never the chapter');
  await page.waitForFunction(() => { const l = document.querySelectorAll('#field .fl'); return l[1]?.style.opacity === '1'; });
  await page.evaluate(() => scrollTo(0, 1e5));
  const fit = await page.evaluate(() => ({ go: Math.round(document.querySelector('#nowGo').getBoundingClientRect().bottom),
    peek: Math.round(document.querySelector('#peek').getBoundingClientRect().top), w: document.documentElement.scrollWidth, vw: innerWidth }));
  assert.ok(fit.go <= fit.peek, 'Resume hidden under the Library tray: ' + JSON.stringify(fit));
  assert.ok(fit.w <= fit.vw, 'Home scrolls sideways: ' + JSON.stringify(fit));
});
// Home's covers are the three books opened last, and the one you just read comes back in front, even after a swipe.
check('home leaves no gap above the tray', async ({ page }) => {
  await put(page, 'Harbour Lights', { pct: 40, page: 3, opened: Date.now() });
  for (const [w, h] of [[430, 932], [393, 852], [390, 763]]) {
    await page.setViewportSize({ width: w, height: h });
    await relaunch(page);
    await page.waitForSelector('#pager .slide');
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ go: document.querySelector('#nowGo').getBoundingClientRect().bottom, peek: document.querySelector('#peek').getBoundingClientRect().top }));
    const gap = m.peek - m.go;
    assert.ok(gap >= 0 && gap <= 40, `${w}x${h}: Resume to the tray is ${Math.round(gap)}px`);
  }
  // One template: a short title and one that wraps across several lines leave the cover, the title block and Resume exactly where they were.
  const spots = () => page.evaluate(() => Object.fromEntries(['#pager .slide', '.ninfo .tb', '#nowBy', '#nowGo'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return [q, [r.x, r.y, r.width, r.height].map(Math.round)]; })));
  const short = await spots();
  await put(page, 'Harbour Lights', { title: 'The Very Long Title of a Book That Wraps Across Several Lines on a Phone: A Novel' });
  await relaunch(page);
  await page.waitForSelector('#pager .slide'); await page.waitForTimeout(300);
  assert.deepEqual(await spots(), short, 'cover, title block and Resume stay put whatever the title');
  const m = await page.evaluate(() => ({ go: document.querySelector('#nowGo').getBoundingClientRect().bottom, peek: document.querySelector('#peek').getBoundingClientRect().top, t: document.querySelector('#nowT').offsetHeight }));
  assert.ok(m.t <= 80 && m.peek - m.go >= 0, `long title: ${m.t}px tall, ${Math.round(m.peek - m.go)}px above the tray`);
});
check('home shows the last three read', async ({ page }) => {
  await page.setInputFiles('#file', EPI_FILE);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('is ready'), null, { timeout: 60000 });
  const now = Date.now();
  await put(page, 'Epigraphs', { pct: 5, page: 1, opened: now - 4000 });
  await put(page, 'Harbour Lights', { pct: 10, page: 1, opened: now - 3000 });
  await put(page, 'Quiet Ledger', { pct: 20, page: 1, opened: now - 2000 });
  await put(page, 'Plain Notes', { pct: 30, page: 1, opened: now - 1000 });
  await relaunch(page);
  const covers = () => page.$$eval('#pager .slide', s => s.map(b => b.getAttribute('aria-label').split(',')[0]));
  assert.deepEqual(await covers(), ['Plain Notes', 'Quiet Ledger', 'Harbour Lights'], 'three, opened last first');
  const swipe = i => page.$eval('#pager', (p, i) => p.scrollTo({ left: i * (p.children[1].offsetLeft - p.children[0].offsetLeft) }), i);
  await swipe(1);
  await page.waitForFunction(() => document.querySelector('#nowT').textContent === 'Quiet Ledger');
  await openTitle(page, 'Epigraphs');   // from the Library
  await home(page);
  await page.waitForFunction(() => document.querySelector('#nowT').textContent === 'Epigraphs');
  assert.deepEqual(await covers(), ['Epigraphs', 'Plain Notes', 'Quiet Ledger']);
  // The book already in front, read again after swiping away from it, comes back in front too.
  await swipe(2);
  await page.waitForFunction(() => document.querySelector('#nowT').textContent === 'Quiet Ledger');
  await openTitle(page, 'Epigraphs');
  await home(page);
  await page.waitForFunction(() => document.querySelector('#nowT').textContent === 'Epigraphs');
});
// Leaving a book, Home is ready before it shows: iPhone takes the strip's colour as Home appears and keeps it, so
// the book just read must already be in front, in its light, with the strip in that light's colour.
check('home is ready as it appears', async ({ page }) => {
  await put(page, 'Harbour Lights', { pct: 10, page: 1, opened: Date.now() });
  // Quiet Ledger gets a cover picture (the app icon), so its light is a picture.
  const [qid] = await metaOf(page, 'Quiet Ledger');
  await idb(page, (db, id) => fetch('versal-192.png').then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => {
    const t = db.transaction('covers', 'readwrite'); t.objectStore('covers').put(b, id); t.oncomplete = res; t.onerror = () => rej(t.error); })), qid);
  await put(page, 'Quiet Ledger', { art: true });
  await relaunch(page);
  await openTitle(page, 'Quiet Ledger');   // from the Library: not on Home before
  const seen = await page.evaluate(() => new Promise(res => {
    const app = document.querySelector('#app');
    new MutationObserver((_, o) => {
      if (app.hidden) return;
      o.disconnect();
      const r = document.documentElement, fl = document.querySelector('#field .fl[style*="opacity: 1"]');
      res({ front: document.querySelector('#nowT').textContent, light: fl && [...document.querySelectorAll('#pager .slide')][0]?.getAttribute('aria-label').split(',')[0],
        strip: r.style.getPropertyValue('--strip'),
        reader: !document.querySelector('#reader').hidden });
    }).observe(app, { attributes: true, attributeFilter: ['hidden'] });
    document.querySelector('#back').click();
  }));
  assert.equal(seen.front, 'Quiet Ledger', 'the book just read is in front as Home appears');
  assert.equal(seen.light, 'Quiet Ledger');
  assert.ok(!seen.reader, 'the book is gone as Home appears');
  // Opened from the Library, it comes back to the Library: the strip is Home dimmed under it; closed, Home's light.
  assert.equal(seen.strip, await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bar-dim').trim()), 'Library: Home dimmed');
  await tap(page, '#libClose');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  const after = await page.evaluate(() => { const r = document.documentElement, fl = document.querySelector('#field .fl[style*="opacity: 1"]'); return [r.style.getPropertyValue('--strip'), fl.style.getPropertyValue(r.dataset.theme === 'dark' ? '--ftd' : '--ftl')]; });
  assert.equal(after[0], after[1], 'Home: the strip is the colour of its light');
  // The light is a small picture blurred once, not a live blur: that took the phone a third of a second a frame.
  await page.waitForSelector('#field .fl img');
  assert.equal(await page.$eval('#field .fl[style*="opacity: 1"] img', i => getComputedStyle(i).filter + ' ' + i.src.slice(0, 14)), 'none data:image/png');
  // A see-through marker at the very top carries the strip's colour; it shows again when the colour changes.
  assert.equal(await bg(page, '#tint'), await page.evaluate(() => { const d = document.createElement('i'); d.style.color = document.documentElement.style.getPropertyValue('--strip'); document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }));
});
// A tap on a search result while the field has focus: the tap blurs the field, and a redraw on blur used to replace
// the row between press and release, so the tap was lost (about half the time).
check('search result taps are not lost', async ({ page }) => {
  await tap(page, '#libSearch');
  await page.fill('#lq', 'Plain');
  await page.waitForTimeout(600);   // the Library has finished sliding up
  const b = await page.locator('#lqList [aria-label="Options for Plain Notes"]').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
  await page.waitForSelector('#sheet[open]', { timeout: 2000 });
  assert.equal(await page.textContent('#sheetTitle'), 'Plain Notes');
});
// Motion that doesn't wait: closing the Library
// moves before the step back in history lands, sheets slide away, and the phone's own back gets no second animation.
check('motion does not wait', async ({ page }) => {
  await put(page, 'Harbour Lights', { pct: 10, page: 1, opened: Date.now() });
  await put(page, 'Quiet Ledger', { pct: 10, page: 1, opened: Date.now() - 1000 });
  await relaunch(page);
  await tap(page, '#libOpen'); await page.waitForSelector('#drawer:not([hidden])'); await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => { document.querySelector('#libClose').click(); return document.querySelector('#drawer').classList.contains('leaving'); }), 'the Library starts sliding down at once');
  await page.waitForSelector('#drawer', { state: 'hidden' }); await page.waitForTimeout(500);
  // The phone's back (here the browser's): the Library goes without a slide of its own.
  await tap(page, '#libOpen'); await page.waitForSelector('#drawer:not([hidden])'); await page.waitForTimeout(500);
  const went = page.evaluate(() => new Promise(r => addEventListener('popstate', () => setTimeout(() => r(document.querySelector('#drawer').classList.contains('leaving')), 0), { once: true })));
  await page.goBack();
  assert.equal(await went, false, 'no second animation after the phone has animated');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  // A sheet slides down before it closes.
  await openTitle(page, 'Plain Notes');
  await tap(page, '#gotoBtn'); await page.waitForSelector('#sheet[open]'); await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => { document.querySelector('#sheetClose').click(); return document.querySelector('#sheet').open && document.querySelector('#sheet').getAnimations().length > 0; }), 'still on screen, sliding');
  await page.waitForFunction(() => !document.querySelector('#sheet').open, null, { timeout: 1000 });
  // Leaving the book shows Home at once.
  const t0 = Date.now(); await tap(page, '#back'); await page.waitForSelector('#reader', { state: 'hidden' });
  assert.ok(Date.now() - t0 < 400, 'Home took ' + (Date.now() - t0) + ' ms');
});
// In the iPhone home-screen app (navigator.standalone) screens aren't history steps (the phone's own swipe back showed
// black there); the reader's own swipe back from the left edge goes back over the real screen under it.
check('home-screen app swipe back', async ({ page, engine }) => {
  if (!await page.evaluate(() => { try { return !!new Touch({ identifier: 1, target: document.body }); } catch { return false; } })) return console.log(`  (${engine} can't make test touches: skipped)`);
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await relaunch(page);
  const n0 = await page.evaluate(() => history.length);
  await openTitle(page, 'Plain Notes');   // from the Library
  assert.equal(await page.evaluate(() => history.length), n0, 'no history step for the Library or the book');
  const pull = (steps, wait) => page.evaluate(async ([steps, wait]) => {
    const t = (x) => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 });
    dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(4)], changedTouches: [t(4)] }));
    for (const x of steps) dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(x)], changedTouches: [t(x)] }));
    const under = document.body.classList.contains('swipe') && getComputedStyle(document.querySelector('#drawer')).display !== 'none';
    await new Promise(r => setTimeout(r, wait));
    dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t(steps.at(-1))] }));
    return under;
  }, [steps, wait]);
  assert.ok(await pull([20, 40, 60], 150), 'the Library shows under the book while it is pulled');
  await page.waitForTimeout(500);
  assert.ok(await shown(page, '#reader'), 'a short pull slides the book back');
  await pull([20, 60, 120, 200, 260, 300], 150);
  await page.waitForSelector('#reader', { state: 'hidden' });
  assert.ok(await shown(page, '#drawer'), 'back to the Library it was opened from');
  assert.ok(!await page.evaluate(() => document.body.classList.contains('swipe')));
  assert.equal(await page.evaluate(() => history.length), n0);
});
// Backup and restore: every book's PDF, details and cover come back after the library is emptied (as when Folio is
// added to the Home Screen again).
check('backup and restore', async ({ page, engine }) => {
  if (engine !== 'chromium') return;   // the download half needs Chromium's downloads here
  const snap = async () => { const [m, f, c] = [await rows(page, 'meta'), await rows(page, 'files'), await rows(page, 'covers')];
    return { titles: m.map(([, x]) => x.title).sort(), bytes: f.map(([, x]) => x.byteLength).sort(), covers: c.length }; };
  await page.waitForTimeout(2000);   // covers made
  const before = await snap();
  await page.evaluate(() => { navigator.canShare = undefined; });   // a download instead of the share sheet
  await tap(page, '#goSettings'); await page.waitForSelector('#v-settings:not([hidden])');
  const [dl] = await Promise.all([page.waitForEvent('download'), tap(page, '#backupSave')]);
  const file = path.join(GEN, 'backup.folio'); await dl.saveAs(file);
  await idb(page, db => new Promise(r => { const t = db.transaction(['meta', 'files', 'covers', 'text'], 'readwrite'); for (const s of ['meta', 'files', 'covers', 'text']) t.objectStore(s).clear(); t.oncomplete = r; }));
  await page.reload(); await page.waitForFunction(() => document.querySelector('#first')?.hidden === false);   // empty
  if (!await shown(page, '#v-settings')) { await tap(page, '#goSettings'); await page.waitForSelector('#v-settings:not([hidden])'); }
  await Promise.all([page.waitForEvent('load', { timeout: 20000 }), page.setInputFiles('#backupFile', file)]);
  await page.waitForTimeout(500);
  assert.deepEqual(await snap(), before);
  await openTitle(page, 'Quiet Ledger');   // its text is rebuilt from the PDF
  assert.ok(await page.$$eval('#text > *', e => e.length) > 5);
  fs.unlinkSync(file);
});
check('home buttons', async ({ page }) => {
  await tap(page, '#libSearch');
  await page.waitForSelector('#drawer:not([hidden])');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'lq', 'the search field is ready to type in');
  await page.fill('#lq', 'quiet');
  await page.waitForSelector('#lqList .brow');
  assert.deepEqual(await texts(page, '#lqList .brow .t'), ['Quiet Ledger']);
  await tap(page, '#lqCancel');
  assert.ok(await shown(page, '#libMain'), 'Cancel brings the shelves back');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  await tap(page, '#goSettings');
  await page.waitForSelector('#v-settings:not([hidden])');
  assert.ok(!await shown(page, '#peek'), 'no Library edge on Settings');
  await openTitle(page, 'Plain Notes');
  assert.ok(!await shown(page, '#peek') && !await shown(page, '#drawer'), 'no Library in the reader');
});
// A book opened from the Library must scroll by finger: the Library's scroll lock (html.lib) can't stay on under it.
// Scripts can still scroll a locked page, so this reads the lock itself.
check('book from the library scrolls', async ({ page }) => {
  await openTitle(page, 'Plain Notes');
  const lock = () => page.evaluate(() => [document.documentElement.classList.contains('lib'), getComputedStyle(document.documentElement).overflowY]);
  assert.deepEqual(await lock(), [false, 'visible'], 'reader is scroll-locked');
  await tap(page, '#back');
  await page.waitForSelector('#drawer:not([hidden])');
  assert.deepEqual(await lock(), [true, 'hidden'], 'Back returns to the Library, locked again under it');
});
const pickTitle = page => page.$eval('#sheet .rhead .card-title', e => e.textContent);
const pickAgain = async page => { await page.locator('#sheet .pill', { hasText: 'Pick another' }).click(); await page.waitForTimeout(50); };
const openPick = async page => { await tap(page, '#pickBtn'); await page.waitForSelector('#sheet[open]'); await page.waitForTimeout(50); };
check('pick a book', async ({ page }) => {
  await openPick(page);
  assert.equal(await page.textContent('#sheetTitle'), 'Read next');
  let t = await pickTitle(page);
  assert.ok(['Harbour Lights', 'Quiet Ledger', 'Plain Notes'].includes(t), t);
  for (let i = 0; i < 6; i++) { await pickAgain(page); const u = await pickTitle(page); assert.notEqual(u, t, 'the same book twice in a row'); t = u; }
  await page.locator('#sheet .pill', { hasText: 'Start reading' }).click();
  await page.waitForSelector('#reader:not([hidden]) #text > *');
  assert.equal(await page.textContent('#rtitle'), t);
});

// Apple Books and Open Library answered with made-up results; every cover picture is the app icon.
async function fakeCoverSites(ctx, { down = false } = {}) {
  const png = fs.readFileSync(path.join(ROOT, 'versal-512.png')), hits = [];
  const json = (route, body) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  await ctx.route(/itunes\.apple\.com|openlibrary\.org|mzstatic\.com/, route => {
    const u = route.request().url(); hits.push(u);
    if (down) return route.abort();
    if (u.includes('itunes.apple.com')) return json(route, { results: ['A', 'B'].map(k => ({ trackName: 'Fake ' + k, artistName: 'Someone', genres: k === 'A' ? ['Sci-Fi & Fantasy', 'Books'] : ['Business & Personal Finance', 'Books'], artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/${k}.jpg/100x100bb.jpg` })) });
    if (u.includes('/search.json')) return json(route, { docs: [{ title: 'Fake C', cover_i: 7 }, { title: 'Same cover', cover_i: 7 }, { title: 'No cover' }] });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/png', body: png });
  });
  return hits;
}
async function openEdit(page, title) {
  if (!await shown(page, '#drawer')) await tap(page, '#libSearch');
  await page.fill('#lq', title);
  await page.click(`#lqList [aria-label="Options for ${title}"]`);
  await page.locator('#sheet .act', { hasText: 'Edit title and cover' }).click();
  await page.waitForSelector('#sheet .editform');
}
const save = async page => { await page.click('#sheet .savebar .pill'); await page.waitForFunction(() => !document.querySelector('#sheet').open); };
const coverOf = (page, id) => idb(page, (db, id) => new Promise(res => { const r = db.transaction('covers').objectStore('covers').get(id); r.onsuccess = () => res(r.result ? [...new Uint8Array(r.result.slice(0, 2))] : null); }), id);
const NOSW = { serviceWorkers: 'block' };
check('edit title and cover', async ({ page, ctx, engine }) => {
  const hits = await fakeCoverSites(ctx);
  await openEdit(page, 'Plain Notes');
  await page.waitForSelector('#sheet .web .tile');
  assert.deepEqual(await page.$$eval('#sheet .tile', ts => ts.map(t => t.getAttribute('aria-label').split(':')[0])),
    ['Keep the cover it has now', 'Page 1 of the PDF', 'Plain cover with the title', 'Your own photo', 'Cover from Apple Books', 'Cover from Apple Books', 'Cover from Open Library'],
    'Now, Page 1, Plain, Photo, then 2 Apple covers and 1 Open Library cover (duplicates and coverless results dropped)');
  assert.ok(hits.some(u => u.includes('term=Plain%20Notes')), 'searched for the title');
  assert.equal(await page.$eval('#sheet .tile[aria-pressed=true]', t => t.getAttribute('aria-label')), 'Keep the cover it has now', 'keeps the cover until another is picked');
  await page.screenshot({ path: path.join(GEN, `edit-sheet-${engine}.png`) });
  // A new title searches again (Return runs the search and does not save) and is set on the Plain cover at once.
  await page.fill('#sheet input[aria-label=Title]', 'Plain Notes Revised');
  await page.fill('#sheet input[aria-label=Author]', 'A. Writer');
  await page.press('#sheet input[aria-label=Author]', 'Enter');
  assert.ok(await page.$eval('#sheet', s => s.open), 'Return did not close the sheet');
  await page.waitForFunction(() => document.querySelectorAll('#sheet .web .tile').length === 3);
  assert.ok(hits.some(u => u.includes('term=Plain%20Notes%20Revised%20A.%20Writer')), 'searched again for the new title and author');
  assert.equal(await page.textContent('#sheet .tile[aria-label^=Plain] .ct'), 'Plain Notes Revised');
  await page.click('#sheet .tile[aria-label^="Cover from Apple Books"]');
  await save(page);
  let [id, m] = await metaOf(page, 'Plain Notes Revised');
  assert.equal(m.author, 'A. Writer'); assert.equal(m.art, true);
  assert.equal(m.side, 'fiction', 'category filled in from the Apple genre');
  assert.ok(hits.some(u => u.endsWith('/A.jpg/600x900bb.jpg')), 'downloaded the big Apple picture');
  assert.deepEqual(await coverOf(page, id), [0xff, 0xd8], 'the cover is saved on the device as a JPEG');
  await tap(page, '#lqCancel');
  assert.ok(await page.$eval('#nowCard', r => r.textContent.includes('Plain Notes Revised') && !!r.querySelector('.cover img')), 'Home shows the picked picture');
  // Plain, then Page 1.
  await openEdit(page, 'Plain Notes Revised');
  await page.click('#sheet .tile[aria-label^=Plain]'); await save(page);
  [, m] = await metaOf(page, 'Plain Notes Revised'); assert.equal(m.art, false);
  await tap(page, '#lqCancel');
  assert.ok(await page.$eval('#nowCard', r => r.querySelector('.cover.gen .ct')?.textContent === 'Plain Notes Revised'), 'Home shows the plain cover');
  await openEdit(page, 'Plain Notes Revised');
  await page.waitForSelector('#sheet .tile[aria-label^="Page 1"]:not([disabled]) img');
  await page.click('#sheet .tile[aria-label^="Page 1"]'); await save(page);
  [, m] = await metaOf(page, 'Plain Notes Revised'); assert.equal(m.art, true);
  assert.deepEqual(await coverOf(page, id), [0xff, 0xd8]);
}, NOSW);
check('edit cover offline', async ({ page, ctx }) => {
  await fakeCoverSites(ctx, { down: true });
  await openEdit(page, 'Harbour Lights');
  await page.waitForFunction(() => document.querySelector('#sheet .editform .meta')?.textContent.includes('need a connection'));
  await page.fill('#sheet input[aria-label=Title]', 'Harbour Lights II'); await save(page);
  assert.ok(await metaOf(page, 'Harbour Lights II'), 'the title still saves offline');
}, NOSW);

const statusHas = (page, s) => page.waitForFunction(s => document.querySelector('#status')?.textContent.includes(s), s, { timeout: 60000 });
const bookCount = async page => (await rows(page, 'meta')).length;
check('the same pdf twice is turned away', async ({ page }) => {
  const copy = path.join(GEN, 'notes-copy.pdf');
  fs.copyFileSync(FILES[2], copy);
  await page.setInputFiles('#file', copy);
  await statusHas(page, '“notes-copy.pdf” is already in your library as “Plain Notes”.');
  await page.setInputFiles('#file', [FILES[0], copy]);   // its own name too, and in a batch
  await statusHas(page, '2 books were already in your library.');
  assert.equal(await bookCount(page), 3);
  assert.equal(await page.evaluate(() => localStorage.getItem('folio-queue')), null, 'nothing left on the list');
});
check('adding carries on after the app closes', async ({ page }) => {
  await page.setInputFiles('#file', EPI_FILE);
  await statusHas(page, 'Adding “epigraphs.pdf”');
  // Closed part way (as iPhone does to a page left in the background): reload while the book is still on the list.
  assert.ok(await page.evaluate(() => { const q = localStorage.getItem('folio-queue'); if (q) location.reload(); return !!q; }), 'reloaded before it finished');
  await page.waitForSelector('#v-library:not([hidden])');
  await statusHas(page, '“Epigraphs” is ready.');
  assert.equal(await bookCount(page), 4);
  assert.equal(await page.evaluate(() => localStorage.getItem('folio-queue')), null);
});

// ---- run ----
const only = process.env.ONLY, todo = checks.filter(c => !only || c.name.includes(only));
let failed = 0;
for (const engine of ENGINES) {
  const browser = await { chromium, webkit }[engine].launch();
  for (const c of todo) {
    const ctx = await browser.newContext({ ...devices[DEVICE[engine]], ...c.opts }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    // Book lookups (Sort my books, new-book offers) never reach the real sites; checks that need them answer them.
    await ctx.route(/itunes\.apple\.com|openlibrary\.org/, r => r.abort());
    // WebKit routes can't see past the service worker, so with it running the lookups fail in the page instead.
    if (!c.opts.serviceWorkers) await ctx.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) => /itunes\.apple\.com|openlibrary\.org/.test(String(u?.url || u)) ? Promise.reject(new TypeError('no lookups in tests')) : f(u, o); });
    try {
      await page.goto(APP);
      await page.setInputFiles('#file', FILES);
      await page.waitForFunction(n => document.querySelector('#status')?.textContent.includes(n + ' books added'), FILES.length, { timeout: 120000 });
      await page.$eval('#status [aria-label=Dismiss]', b => b.click()).catch(() => {});
      await c.fn({ page, ctx, engine });
      if (errors.length) throw new Error('page error: ' + errors[0]);
      console.log(`PASS ${engine} ${c.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${engine} ${c.name}: ${process.env.FULL ? String(e.stack || e) : String(e.message || e).split('\n')[0]}`);   // FULL=1 shows the whole error
      await page.screenshot({ path: path.join(GEN, `FAIL-${engine}-${c.name.replace(/\W+/g, '-')}.png`) }).catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
}
server.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exitCode = failed ? 1 : 0;
