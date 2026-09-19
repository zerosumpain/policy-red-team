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
  // Each toggle names its own figure — three of them on this page now, and
  // three buttons all announcing "Table" would tell a screen-reader user
  // nothing about which table.
  const tableToggle = page.getByRole('button', { name: 'Table of ease against impact' });
  if (await tableToggle.count()) {
    await tableToggle.click();
    await page.getByRole('table', { name: /ease and impact/i }).waitFor({ timeout: 5000 }).catch(() => {
      failures.push('report: the exposure plot has no table view');
    });
    // The pressed view must be visible and not merely announced: two identical
    // grey buttons over a chart leave a sighted reader no way to know which one
    // they are looking at.
    const pressed = await tableToggle.evaluate((el) => ({
      pressed: el.getAttribute('aria-pressed'),
      secondary: el.className.includes('govuk-button--secondary'),
    }));
    if (pressed.pressed !== 'true' || pressed.secondary) {
      failures.push('report: the selected view is not marked pressed, or does not look it');
    }
    await audit('/assessments/:id (table view)');
    note('diagram and table both render, and the pressed one looks pressed');
  }

  // 5b — THE RELATIONSHIP GRAPH. Present only when the paper states
  // relationships; the fixture states one, which is enough to prove the section
  // renders, counts and links.
  const connect = page.getByRole('heading', { name: 'How they connect' });
  if (await connect.count()) {
    await connect.scrollIntoViewIfNeeded();
    const netText = await page.locator('section[aria-labelledby="network"]').innerText();
    for (const expected of ['Where the relationships run', 'What kind of relationship', 'Bodies against bodies', 'What the connections show']) {
      if (!netText.includes(expected)) failures.push(`network: missing "${expected}"`);
    }
    // Either branch is a real answer, and the fixture takes the second: its one
    // stated relationship runs from a body to machinery, so there is no
    // body-to-body mesh — which is the shape of a real policy paper too, and the
    // reason the section says so in words rather than drawing an empty grid.
    if (!/(\d+ of the \d+ stated relationships run between two bodies|no relationship between two bodies at all)/.test(netText)) {
      failures.push('network: does not say how the bodies relate to each other');
    }
    await page.getByRole('button', { name: 'Table of where the relationships run' }).click();
    await page.getByRole('table', { name: /kind of thing at each end/i }).waitFor({ timeout: 5000 }).catch(() => {
      failures.push('network: the shape figure has no table view');
    });
    await audit('/assessments/:id (relationships)');
    note('the relationship section renders, with its tables');
  } else {
    failures.push('report: no "How they connect" section at all');
  }

  // 6 — THE DRILL: one artefact, opened out, with its chain back to the paper.
  //
  // Reached by clicking a name in the report, never by typing the URL. A link
  // that renders and does not navigate is the exact failure this step exists to
  // catch, and it is invisible to a type check.
  const playbook = page.getByRole('table', { name: /exploitation playbook/i });
  const firstPlay = playbook.getByRole('link').first();
  const playName = (await firstPlay.innerText()).trim();
  await firstPlay.click();
  await page.waitForURL('**/artefacts/**', { timeout: 10000 });
  const drillUrl = page.url();
  // WAIT FOR THE HEADING, don't just look for it. The drill fetches the
  // assessment on mount, so the URL changes a beat before the page has anything
  // on it — and reading the DOM in that beat reports an empty page, which is
  // indistinguishable from a broken one.
  await page.getByRole('heading', { level: 1, name: playName }).waitFor({ timeout: 10000 }).catch(() => {
    failures.push(`drill: opened ${page.url()} but its heading never became "${playName}"`);
  });
  // WHAT THE BROWSER USED TO DO FOR FREE. The playbook sits well down a long
  // report, so a client-side navigation that moves neither scroll nor focus
  // lands the reader partway down the new page, below its own heading, with
  // nothing announced. All three are asserted because all three were free until
  // the back link stopped being a document navigation.
  const landing = await page.evaluate(() => ({
    scrollY: window.scrollY,
    focused: document.activeElement?.id ?? null,
    title: document.title,
  }));
  if (landing.scrollY !== 0) failures.push(`drill: landed ${landing.scrollY}px down the page`);
  if (landing.focused !== 'main-content') failures.push(`drill: focus went to "${landing.focused}", not the main landmark`);
  if (!landing.title.startsWith(playName)) failures.push(`drill: the tab still says "${landing.title}"`);

  const drill = await page.locator('#main-content').innerText();
  for (const expected of ['How this would be run', 'Where this stands', 'What it rests on']) {
    if (!drill.includes(expected)) failures.push(`drill: missing section "${expected}"`);
  }
  // The chain is the whole point of the page. Stopping at the assessment's own
  // middle layers would leave a reader unable to argue with a finding, which is
  // the thing the drill is FOR.
  if (!/Followed back \d+ steps?/.test(drill)) failures.push('drill: the chain does not say how far back it went');
  if (!/Back at the paper/.test(drill)) failures.push('drill: the chain never reaches the paper');
  await audit('/assessments/:id/artefacts/:artefactId (a play)');
  note(`drill opens on "${playName}", with its chain`);

  // 7 — follow the chain one hop, then reverse out of it two ways.
  //
  // `__spa` is stamped on the window here and checked after the back link: if
  // either navigation reloaded the document the stamp is gone, which is how a
  // plain <a href> in a single-page app announces itself.
  const here = page.url();
  await page.evaluate(() => { window.__spa = true; });
  await page.locator('#main-content a[href*="/artefacts/"]').first().click();
  await page.waitForFunction((was) => location.href !== was, here, { timeout: 10000 });
  await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 10000 }).catch(() => {
    failures.push('drill: following the chain landed on a page that never rendered a heading');
  });
  await audit('/assessments/:id/artefacts/:artefactId (followed)');

  await page.goBack();
  await page.waitForURL(here, { timeout: 10000 });
  await page.getByRole('heading', { level: 1, name: playName }).waitFor({ timeout: 10000 });
  note('the chain is followable, and the browser back button reverses it');

  await page.getByRole('link', { name: 'Back to the assessment' }).click();
  await page.waitForURL((url) => /\/assessments\/[^/]+$/.test(url.pathname), { timeout: 10000 });
  await page.getByRole('heading', { name: 'What it found' }).waitFor({ timeout: 15000 }).catch(() => {
    failures.push('drill: the back link did not return to the report');
  });
  if (!(await page.evaluate(() => window.__spa === true))) {
    failures.push('drill: leaving the drill reloaded the whole app rather than routing');
  }
  note('the back link returns to the report without reloading');

  // 8 — REFLOW, at the narrowest width WCAG 2.2 asks about.
  //
  // 1.4.10 is about content reflowing to 320 CSS pixels without a second scroll
  // direction, and axe cannot see it: a table that pushes the page sideways is
  // valid markup. Both drill tables did, and so did the report's — the links
  // this change added to the actors and checks columns made cells wider than the
  // phone they have to fit on. `<Table scroll>` is the fix and this is what
  // notices the next one.
  await page.setViewportSize({ width: 320, height: 800 });
  for (const [label, url] of [['report', `http://127.0.0.1:${PORT}/assessments/${id}`], ['drill', drillUrl]]) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 0) failures.push(`${label}: at 320px the page scrolls ${wide}px sideways — a table needs <Table scroll>`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  note('nothing overflows at 320px');

  // 9 — the history now has a row, and it links back
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  if (!(await page.getByRole('link', { name: 'Walk fixture paper' }).isVisible())) failures.push('landing: the finished assessment is not listed');
  await audit('/ (with a row)');
  note('history lists it');

  // 10 — the rest of the surface
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
