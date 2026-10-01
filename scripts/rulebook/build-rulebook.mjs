#!/usr/bin/env node
/**
 * Build the in-app Rule Book reader from the community rulebook PDF.
 *
 *   node scripts/rulebook/build-rulebook.mjs [--pdf local.pdf] [--width 1400] [--quality 74]
 *
 * The source PDF (~45 MB) cannot be framed (GitHub raw serves it as a download
 * with X-Frame-Options: deny), so the reader ships it as lazy-loaded page
 * images plus the PDF's own outline and extracted text for search:
 *
 *   public/assets/rulebook/page-NNN.webp   one image per page (media, R2)
 *   src/data/rulebook/rulebook-index.json   source, page sizes, outline (tracked)
 *   src/data/rulebook/rulebook-text.json    per-page text, loaded only on search
 *
 * Pages are rendered by pdf.js (from cdnjs) inside Playwright's Chromium, so
 * the repo needs no PDF dependency. Re-run whenever the rulebook is updated,
 * then `npm run media:publish` and commit the two JSON files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RULEBOOK_SOURCE_URL =
  "https://raw.githubusercontent.com/qwrtln/Homm3BG-build-artifacts/en/main_en.pdf";
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const width = Number(arg("width", "1400"));
const quality = Number(arg("quality", "74"));
const localPdf = arg("pdf", null);

const outImages = path.join(ROOT, "public", "assets", "rulebook");
const outData = path.join(ROOT, "src", "data", "rulebook");
fs.mkdirSync(outImages, { recursive: true });
fs.mkdirSync(outData, { recursive: true });

async function loadPdf() {
  if (localPdf) return { bytes: fs.readFileSync(localPdf), etag: null };
  const response = await fetch(RULEBOOK_SOURCE_URL);
  if (!response.ok) throw new Error(`Rulebook download failed: HTTP ${response.status}`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    etag: response.headers.get("etag"),
  };
}

const { bytes, etag } = await loadPdf();
console.log(`PDF: ${(bytes.length / 1048576).toFixed(1)} MB`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Serve the PDF bytes and a blank host page from one fake origin so pdf.js
  // can fetch it without CORS.
  await page.route("https://rulebook.local/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/book.pdf")) {
      return route.fulfill({ status: 200, contentType: "application/pdf", body: bytes });
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" });
  });
  await page.goto("https://rulebook.local/");
  const meta = await page.evaluate(async (pdfjsBase) => {
    const pdfjs = await import(`${pdfjsBase}/pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${pdfjsBase}/pdf.worker.min.mjs`;
    const doc = await pdfjs.getDocument({ url: "https://rulebook.local/book.pdf" }).promise;
    window.__doc = doc;
    const outline = (await doc.getOutline()) ?? [];
    const resolve = async (items) => {
      const result = [];
      for (const item of items) {
        let pageNumber = null;
        try {
          const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
          if (dest && dest[0]) pageNumber = (await doc.getPageIndex(dest[0])) + 1;
        } catch {
          pageNumber = null;
        }
        result.push({
          title: String(item.title ?? "").trim(),
          page: pageNumber,
          children: item.items?.length ? await resolve(item.items) : [],
        });
      }
      return result;
    };
    return { pageCount: doc.numPages, outline: await resolve(outline) };
  }, PDFJS);
  console.log(`Pages: ${meta.pageCount}`);

  const pages = [];
  const text = [];
  for (let n = 1; n <= meta.pageCount; n += 1) {
    const rendered = await page.evaluate(
      async ({ n, width }) => {
        const doc = window.__doc;
        const pdfPage = await doc.getPage(n);
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({ canvasContext: context, viewport }).promise;
        // Link annotations become clickable hotspots: rect as fractions of the
        // page, target either an internal page number or an external URL.
        const links = [];
        for (const annotation of await pdfPage.getAnnotations()) {
          if (annotation.subtype !== "Link" || !annotation.rect) continue;
          let page = null;
          try {
            const dest = typeof annotation.dest === "string" ? await doc.getDestination(annotation.dest) : annotation.dest;
            if (dest && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1;
          } catch {
            page = null;
          }
          const url = typeof annotation.url === "string" ? annotation.url : null;
          if (!page && !url) continue;
          const [x1, y1, x2, y2] = annotation.rect;
          const round = (value) => Math.round(value * 10000) / 10000;
          links.push({
            x: round(Math.min(x1, x2) / base.width),
            y: round(1 - Math.max(y1, y2) / base.height),
            w: round(Math.abs(x2 - x1) / base.width),
            h: round(Math.abs(y2 - y1) / base.height),
            ...(page ? { page } : { url }),
          });
        }
        const content = await pdfPage.getTextContent();
        let line = "";
        const parts = [];
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += item.str;
          if (item.hasEOL) {
            parts.push(line);
            line = "";
          }
        }
        if (line) parts.push(line);
        const pageText = parts.join("\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
        return { png: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height, text: pageText, links };
      },
      { n, width },
    );
    const name = `page-${String(n).padStart(3, "0")}.webp`;
    const png = Buffer.from(rendered.png.split(",")[1], "base64");
    const info = await sharp(png).webp({ quality, effort: 6 }).toFile(path.join(outImages, name));
    pages.push({
      n,
      w: rendered.w,
      h: rendered.h,
      src: `/assets/rulebook/${name}`,
      ...(rendered.links.length ? { links: rendered.links } : {}),
    });
    text.push(rendered.text);
    console.log(`  ${name} ${(info.size / 1024).toFixed(0)} KB`);
  }

  const index = {
    source: RULEBOOK_SOURCE_URL,
    etag,
    builtAt: new Date().toISOString().slice(0, 10),
    pageCount: meta.pageCount,
    pages,
    outline: meta.outline,
  };
  fs.writeFileSync(path.join(outData, "rulebook-index.json"), `${JSON.stringify(index, null, 1)}\n`);
  fs.writeFileSync(path.join(outData, "rulebook-text.json"), `${JSON.stringify(text)}\n`);
  console.log("Wrote src/data/rulebook/rulebook-index.json + rulebook-text.json");
} finally {
  await browser.close();
}
