/**
 * Screenshots of the built client, for looking at.
 *
 *   node scripts/shot.mjs [outDir] [--width 1280] [--route /]
 *
 * Serves `dist/client` the way `a11y.mjs` does — a single-page app's routes all
 * serve index.html — and captures a full-page shot at desktop and mobile widths,
 * because a GOV.UK layout is meant to be read on both and only one of them is
 * ever open while you work.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist', 'client');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json', '.svg': 'image/svg+xml' };

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'shots');
const routes = args.includes('--route') ? [args[args.indexOf('--route') + 1]] : ['/', '/accessibility'];
await mkdir(outDir, { recursive: true });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = path.extname(url.pathname) ? path.join(DIST, url.pathname) : path.join(DIST, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
for (const route of routes) {
  for (const [label, width] of [['desktop', 1280], ['mobile', 420]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle' });
    const name = `${route === '/' ? 'gallery' : route.replace(/\//g, '')}-${label}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
    console.log(path.join(outDir, name));
    await page.close();
  }
}
await browser.close();
server.close();
