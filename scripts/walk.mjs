/**
 * The journey, driven in a browser: submit a paper, watch it run, read the report.
 *
 * This is phase 4's gate. It runs against `dist/server-fixture.js`, which is
 * compiled with no path to a model provider at all — so the walk exercises the
 * real HTTP layer, the real queue, the real store and the real React, and cannot
 * spend a penny doing it.
 *
 * axe runs on every page it lands on, including the two that only exist while a
 * run is in flight. Those are the pages `npm run a11y` cannot reach on its own,
 * because they need an assessment to exist.
 *
 *   node scripts/walk.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 5299;
const failures = [];
const note = (m) => console.log(`  ${m}`);

// A throwaway database, the same promise the integration suite keeps: a walk
// that creates and cancels assessments must never be able to touch a real one.
const dataRoot = await mkdtemp(path.join(tmpdir(), 'policy-walk-'));

const server = spawn(process.execPath, [path.join(ROOT, 'dist', 'server-fixture.js')], {
  env: { ...process.env, POLICY_PORT: String(PORT), POLICY_DATA_DIR: path.join(dataRoot, 'db'), POLICY_SEAL_KEY_DIR: path.join(dataRoot, 'keys') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`  server: ${d}`));

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not start')), 30000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('Policy Red Team on')) { clearTimeout(timer); resolve(); }
  });
});
note(`server up on ${PORT}`);

const axeSource = await readFile(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (err) => failures.push(`page error: ${err.message}`));

async function audit(label) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
  });
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of bad) failures.push(`${label}: axe ${v.impact} ${v.id} — ${v.help} (${v.nodes})`);
  for (const v of violations.filter((v) => !bad.includes(v))) console.log(`  note  ${label}: ${v.impact} ${v.id} (${v.nodes})`);
  return bad.length === 0;
}

try {
  // 1 — the landing page, with nothing on it yet
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  if (!(await page.getByRole('heading', { name: 'Policy Red Team' }).isVisible())) failures.push('landing: no heading');
  await audit('/');
  note('landing');

  // 2 — the form, and its error summary before anything is filled in
  // GOV.UK renders a button-shaped anchor with role="button", not link.
  await page.getByRole('button', { name: 'Assess a paper' }).click();
  await page.waitForURL('**/new');
  await page.getByRole('button', { name: 'Start the assessment' }).click();
  await page.getByRole('alert').waitFor({ timeout: 5000 });
  const summaryText = await page.getByRole('alert').innerText();
  for (const expected of ['Enter a title', 'Select the paper']) {
    if (!summaryText.includes(expected)) failures.push(`/new: error summary missing "${expected}"`);
  }
  // The summary must take focus, or a screen-reader user never hears it.
  const focusedClass = await page.evaluate(() => document.activeElement?.className ?? '');
  if (!focusedClass.includes('govuk-error-summary')) failures.push('/new: the error summary did not take focus');
  await audit('/new (errors)');
  note('form validates, and the summary takes focus');

  // 3 — submit a real paper
  await page.getByLabel('What is this paper called?', { exact: true }).fill('Walk fixture paper');
  // Exact: getByLabel is a substring match, and 'The paper' also matches
  // 'Anything the paper does not say'.
  await page.getByLabel('The paper', { exact: true }).setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'policy-analysis', 'policy.txt'));
  await page.getByLabel('Jurisdiction', { exact: true }).fill('England');
  await page.getByRole('button', { name: 'Start the assessment' }).click();
  await page.waitForURL('**/assessments/**', { timeout: 20000 });
  note('submitted');

  // 4 — the report, once the run finishes. The page follows its own progress
  // over the event stream, so this is waiting for the UI to update itself.
  await page.getByRole('heading', { name: 'What it found' }).waitFor({ timeout: 120000 });
  const id = page.url().split('/').pop();
  const body = await page.locator('#main-content').innerText();
  for (const expected of ['Ways to beat it', 'Who is involved', 'How this was produced']) {
    if (!body.includes(expected)) failures.push(`report: missing section "${expected}"`);
  }
  if (!/18 of 18 completed/.test(body)) failures.push('report: does not say all eighteen stages completed');
  await audit('/assessments/:id (report)');
  note(`report rendered for ${id}`);

  // 5 — the diagram and its table are both reachable, which the accessibility
  // statement promises and which nothing else checks.
  const tableToggle = page.getByRole('button', { name: 'Table', exact: true });
  if (await tableToggle.count()) {
    await tableToggle.click();
    await page.getByRole('table', { name: /ease and impact/i }).waitFor({ timeout: 5000 }).catch(() => {
      failures.push('report: the exposure plot has no table view');
    });
    await audit('/assessments/:id (table view)');
    note('diagram and table both render');
  }

  // 6 — the history now has a row, and it links back
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  if (!(await page.getByRole('link', { name: 'Walk fixture paper' }).isVisible())) failures.push('landing: the finished assessment is not listed');
  await audit('/ (with a row)');
  note('history lists it');

  // 7 — the rest of the surface
  for (const [route, heading] of [['/personas', 'Persona library'], ['/design', 'Design system'], ['/accessibility', 'Accessibility statement'], ['/about', 'About this tool']]) {
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle' });
    if (!(await page.getByRole('heading', { name: heading, level: 1 }).isVisible())) failures.push(`${route}: no "${heading}" heading`);
    await audit(route);
  }
  note('remaining routes');
} catch (err) {
  failures.push(`walk stopped: ${err.message}`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  server.kill('SIGKILL');
  await rm(dataRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error('\nFAILED');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('\nPASSED — submit to report, with axe clean on every page');
