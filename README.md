# Versal

One static `index.html` that turns PDF books into resizable, scrolling text for phones. No account, no server, no build step.
PDFs, the reflowed text, bookmarks and your reading position stay in the browser (IndexedDB); nothing is uploaded.

**Home** is one page: the book you're reading on top (stopped-at line, chapter, % left, page, one Resume
reading button), the other books in progress as small cards, then one shelf of covers per collection (an empty one has an
"Add books" slot), an Unsorted shelf for books in no collection, and a New collection link. The magnifier finds books by title or author;
hold a cover for its options. **Settings** (the sliders button) has theme, a live reading preview, text and page,
whether the reader's bars hide while scrolling, and the order of books on shelves.

The reader's bottom bar floats like an iPhone tab bar. It shows the chapter and page ("Ch. 7", "p. 42 of 186 · 77% left"), a drag scrubber and
four labelled buttons: Contents (chapters and bookmarks), Search (a hit jumps there, highlighted, with "Back to page N"),
Text (Reflow or Page view, size, typeface, spacing, margins, justify, sepia) and Bookmark, which hangs an oxblood ribbon on
the page. Leave the app and come back within 15 minutes to land exactly where you were; later, it opens on Home.

The look: book paper with a fine grain, oak shelves, white cards, near-black ink and one oxblood accent. Book titles and
headings are set in EB Garamond, the interface in the phone's own font (San Francisco on iPhone), and books in Literata (or
EB Garamond or Atkinson Hyperlegible Next). Light, dark and system themes.

## Run locally

It needs `http://`, not `file://` (IndexedDB, the pdf.js worker and the service worker). After the first visit it works offline.

```
npx serve .                 # or: python -m http.server 8000
```

Open the printed URL, then add a PDF with **Choose a PDF** (or the **+** button), or by dropping it on the page.

## Test

The reflow functions carry their own assert-based check: open the page, then run `Reflow.selfTest()` in the browser console.
The Playwright end-to-end suite lives in the author's local project, not in this repo.

## Host it for free

Deploy only the app: `index.html`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png` and the `vendor/` folder.
Never deploy `test-pdfs/` (`.gitignore` keeps it out of git).

**GitHub Pages**: push the repo to GitHub, then *Settings → Pages → Deploy from a branch → main, / (root)*.
The app is at `https://<user>.github.io/<repo>/`.

**Cloudflare Pages**: *Workers & Pages → Create → Pages → Upload assets* and drop a folder holding those files, or
connect the GitHub repo with no build command and output directory `/`. From the command line:
`npx wrangler pages deploy <folder> --project-name folio`.

On the phone, open the URL, then *Share → Add to Home Screen* (iPhone Safari) or *⋮ → Add to Home screen* (Android Chrome).

## How the reflow works

All in the `<script id="reflow-core">` block of `index.html`, as pure functions:

1. **Lines**: pdf.js text items are grouped into lines by baseline; spaces come from gaps between items. A drop cap (one
   big letter beside the first lines of a paragraph) is lifted out first and put back on the top line ("T" + "he" is
   "The", "I" + "was" is "I was"); letter-spaced capitals ("C H A P T E R") close up.
2. **Headers, footers, page numbers**: the top two and bottom two lines of each page are candidates. They are removed if
   they look like a page number, repeat (digits ignored) on 20% of pages, or sit apart from the body and repeat in text or position.
3. **Paragraphs**: a new paragraph starts at a first-line indent, an extra line gap, a short last line, centring or a font
   change. A lower-case line after an unfinished one always continues. Paragraphs carry across page breaks.
4. **Hyphens**: a line-end hyphen is dropped (`hap-/pened`) unless the book itself shows a compound (`snow-heavy` seen elsewhere,
   or both halves are words and the joined form is not).
5. **Headings**: lines at 1.18× the body size or larger. A first line set in smaller capitals stays with its paragraph.
6. **Pages with almost no text** that paint an image (cover, map, scan) appear as the page image. When most pages are images,
   each one is labelled "This page is a scan, so it can’t be reflowed."

Known limits: multi-column layouts, tables, drop caps drawn as pictures, and headings that are only bold at body size don't reflow well.
Switch to Page under Text in the reader to see the pages as printed.
pdf.js 4.10.38 (Apache-2.0) is copied from the `pdfjs-dist` package into `vendor/`, and the fonts (EB Garamond, Literata and Atkinson Hyperlegible Next,
SIL Open Font License, licences beside them) into `vendor/fonts/`, so nothing loads from other sites.
The one edit: a `Promise.withResolvers` polyfill line prepended to `pdf.worker.min.mjs` for iPhones older than iOS 17.4.
`sw.js` keeps the app on the device for offline use; when updating pdf.js or the fonts, use new file paths and bump `CACHE` in `sw.js`.
