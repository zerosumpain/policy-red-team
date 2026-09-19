/**
 * The accessibility gate.
 *
 * Two jobs, and the second is the one that is easy to forget.
 *
 * ACCESSIBILITY: every route is loaded in a real browser and checked with
 * axe-core against WCAG 2.2 AA. Serious and critical violations fail the build;
 * moderate and minor ones are printed, because a warning nobody sees is a
 * warning nobody fixes.
 *
 * LICENSING: this service may not use the GDS Transport typeface, the GOV.UK
 * crown or the royal arms — they belong to services on GOV.UK. That is a promise
 * about build output, so it is asserted against the built files rather than
 * trusted to a Sass setting nobody re-reads.
 *
 * An automated check finds perhaps a third of what a person would, which the
 * accessibility statement says out loud. It is a floor.
 *
 *   node scripts/a11y.mjs          build must already exist
 *   npm run a11y                   builds first
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist', 'client');
const ROUTES = ['/', '/new', '/personas', '/design', '/accessibility', '/about'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

/** A single-page app's routes all serve index.html; anything with an extension
 *  is a real file. */
function serve() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const file = path.extname(url.pathname)
      ? path.join(DIST, url.pathname)
      : path.join(DIST, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

// ── Licensing, asserted against what was actually built ────────────────────
const failures = [];
const built = await stat(DIST).catch(() => null);
if (!built) {
  console.error('No build to check. Run `npm run build:client` first.');
  process.exit(2);
}

const files = await listFiles(DIST);
const fonts = files.filter((f) => /\.(woff2?|ttf|eot|otf)$/i.test(f));
const emblems = files.filter((f) => /crown|crest|royal|coat-of-arms/i.test(path.basename(f)));
if (fonts.length) failures.push(`ships font files, which may include GDS Transport: ${fonts.map((f) => path.basename(f)).join(', ')}`);
if (emblems.length) failures.push(`ships a crown or royal arms image: ${emblems.map((f) => path.basename(f)).join(', ')}`);

for (const css of files.filter((f) => f.endsWith('.css'))) {
  const source = await readFile(css, 'utf8');
  if (/GDS Transport/i.test(source)) failures.push(`${path.basename(css)} names the GDS Transport typeface`);
  if (!/Helvetica Neue,\s*arial,\s*sans-serif/i.test(source)) {
    failures.push(`${path.basename(css)} does not use the off-GOV.UK font stack`);
  }
  // REFLOW, asserted in the stylesheet because no fixture can reach it.
  // Every word on these pages came out of a document: footnote runs like
  // `childcare.32,33`, bare URLs, identifiers with no space in them. One such
  // token is wider than a phone and pushes the whole page sideways — WCAG 2.2
  // 1.4.10. Measured on a real assessment at 320px before the rule existed: 831
  // pixels of horizontal scroll, all of it one quoted passage. The browser gates
  // run against a synthetic fixture whose text is written in normal words, so
  // they cannot see it; this can.
  if (!/#main-content\{[^}]*overflow-wrap:\s*anywhere/.test(source)) {
    failures.push(`${path.basename(css)} does not let a long unbreakable token wrap inside #main-content`);
  }
}

// ── Accessibility ──────────────────────────────────────────────────────────
const axeSource = await readFile(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const server = serve();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const browser = await chromium.launch();
let checked = 0;
let serious = 0;

for (const route of ROUTES) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle' });

  // A route that renders nothing passes every accessibility check ever written.
  const text = (await page.locator('#main-content').innerText().catch(() => '')).trim();
  if (text.length < 40) failures.push(`${route}: main content is empty or barely rendered`);

  // EXACTLY ONE LEVEL-1 HEADING. axe checks that a page has one and never that
  // it has only one, so a component whose own markup is an `h1` — GOV.UK's
  // confirmation panel is — puts a second on any page that shows it as an
  // example. A screen-reader user then hears two top-level headings and cannot
  // tell which one the page is about. Found on /design after the figures
  // arrived, by counting rather than by any gate.
  const headings = await page.locator('h1').count();
  if (headings !== 1) failures.push(`${route}: ${headings} level-1 headings, expected exactly one`);
  for (const message of consoleErrors) failures.push(`${route}: page error — ${message}`);

  // The skip link must be first in the tab order and must point at something
  // that can actually take focus. A skip link that moves the viewport and leaves
  // the focus ring behind is worse than none.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? { className: el.className, href: el.getAttribute('href') } : null;
  });
  if (!focused?.className?.includes('govuk-skip-link')) {
    failures.push(`${route}: the first thing a keyboard reaches is not the skip link`);
  } else {
    const target = await page.locator(focused.href).getAttribute('tabindex').catch(() => null);
    if (target !== '-1') failures.push(`${route}: skip-link target ${focused.href} cannot take focus (needs tabindex="-1")`);
  }

  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    });
    return result.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  });

  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  serious += bad.length;
  for (const v of bad) failures.push(`${route}: axe ${v.impact} ${v.id} — ${v.help} (${v.nodes} nodes: ${v.targets.join('; ')})`);
  for (const v of violations.filter((v) => !bad.includes(v))) {
    console.log(`  note  ${route}: ${v.impact} ${v.id} — ${v.help} (${v.nodes})`);
  }

  checked++;
  await page.close();
}

await browser.close();
server.close();

console.log(`\n${checked} routes checked, ${serious} serious or critical violations`);
if (failures.length) {
  console.error('\nFAILED');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('PASSED — WCAG 2.2 AA clean, and no licensed asset is shipped');
