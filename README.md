# Reflow PDF Reader

One static `index.html` that turns PDF books into resizable, scrolling text for phones. No account, no server, no build step.
PDFs, the reflowed text and your reading position stay in the browser (IndexedDB); nothing is uploaded.

## Run locally

It needs `http://`, not `file://` (IndexedDB and the pdf.js worker), and internet for pdf.js from cdnjs.

```
npx serve .                 # or: python -m http.server 8000
```

Open the printed URL, then add a PDF with **Add PDF** or by dropping it on the page.

## Test

The reflow functions carry their own assert-based check: open the page, then run `Reflow.selfTest()` in the browser console.
The Playwright end-to-end suite lives in the author's local project, not in this repo.

## Host it for free

Deploy only these four files: `index.html`, `manifest.json`, `icon-192.png`, `icon-512.png`.
Never deploy `test-pdfs/` (`.gitignore` keeps it out of git).

**GitHub Pages**: push the repo to GitHub, then *Settings → Pages → Deploy from a branch → main, / (root)*.
The app is at `https://<user>.github.io/<repo>/`.

**Cloudflare Pages**: *Workers & Pages → Create → Pages → Upload assets* and drop a folder holding the four files, or
connect the GitHub repo with no build command and output directory `/`. From the command line:
`npx wrangler pages deploy <folder> --project-name reflow`.

On the phone, open the URL, then *Share → Add to Home Screen* (iPhone Safari) or *⋮ → Add to Home screen* (Android Chrome).

## How the reflow works

All in the `<script id="reflow-core">` block of `index.html`, as pure functions:

1. **Lines**: pdf.js text items are grouped into lines by baseline; spaces come from gaps between items.
2. **Headers, footers, page numbers**: the top two and bottom two lines of each page are candidates. They are removed if
   they look like a page number, repeat (digits ignored) on 20% of pages, or sit apart from the body and repeat in text or position.
3. **Paragraphs**: a new paragraph starts at a first-line indent, an extra line gap, a short last line, centring or a font
   change. A lower-case line after an unfinished one always continues. Paragraphs carry across page breaks.
4. **Hyphens**: a line-end hyphen is dropped (`hap-/pened`) unless the book itself shows a compound (`snow-heavy` seen elsewhere,
   or both halves are words and the joined form is not).
5. **Headings**: lines at 1.18× the body size or larger.
6. **Pages with almost no text** that paint an image (cover, map, scan) appear as the page image. When most pages are images,
   each one is labelled "This page is a scan, so reflow isn't supported yet."

Known limits: multi-column layouts, tables, drop caps, and headings that are only bold at body size don't reflow well.
Use **Original** to see the page as printed.
pdf.js itself is pinned to 4.10.38 on cdnjs. Its CJK character maps and standard fonts load from jsdelivr, because cdnjs doesn't carry them.
