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
import JSZip from 'jszip';
import { spawn } from 'node:child_process';
import { readFile, rm, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.WALK_PORT ?? 5299); // overridable so parallel worktrees can walk at once
const failures = [];
const note = (m) => console.log(`  ${m}`);

// A throwaway database, the same promise the integration suite keeps: a walk
// that creates and cancels assessments must never be able to touch a real one.
const dataRoot = await mkdtemp(path.join(tmpdir(), 'policy-walk-'));
const ADMIN_PASSWORD = 'walk-admin-password';

const server = spawn(process.execPath, [path.join(ROOT, 'dist', 'server-fixture.js')], {
  env: {
    ...process.env,
    POLICY_PORT: String(PORT),
    POLICY_DATA_DIR: path.join(dataRoot, 'db'),
    POLICY_SEAL_KEY_DIR: path.join(dataRoot, 'keys'),
    // The panel is CLOSED without one, which is itself a thing worth testing —
    // but the walk needs it open to test the rest, so it sets its own.
    POLICY_ADMIN_PASSWORD: ADMIN_PASSWORD,
  },
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
    // THE SELECTOR, NOT JUST THE COUNT. A note reading "moderate landmark-unique
    // (1)" is a note nobody can act on: it says something is wrong once,
    // somewhere, on a page with eighteen sections. Carrying the first few
    // targets turns it into a thing that can be looked at.
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
      where: v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | '),
    }));
  });
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of bad) failures.push(`${label}: axe ${v.impact} ${v.id} — ${v.help} (${v.nodes}) ${v.where}`);
  for (const v of violations.filter((v) => !bad.includes(v))) console.log(`  note  ${label}: ${v.impact} ${v.id} (${v.nodes}) ${v.where}`);
  return bad.length === 0;
}

try {
  // 1 — the landing page, with nothing on it yet
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  if (!(await page.getByRole('heading', { name: 'Policy Red Team' }).isVisible())) failures.push('landing: no heading');
  // An empty "Bodies that turn up again" says why it is empty, rather than vanishing (phase 24).
  await page.locator('.prt-recurring').waitFor({ timeout: 20000 });
  if (!/No paper has been assessed yet/.test(await page.locator('.prt-recurring').innerText())) failures.push('landing: the empty bodies panel does not say why it is empty');
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
  /*
   * A SOURCE AND A LOOK-UP OF THE READER'S OWN (phase 22 part 2). The fixture
   * server's page reader answers any public address with a capacity review,
   * so the source travels through stage 5, the evidence matrix and the report;
   * the look-up reaches the (stubbed) search, finds nothing and is still
   * listed as the reader's question. Add another is exercised on the way.
   */
  await page.locator('#source-url-0').fill('https://www.example.org/capacity-review');
  await page.locator('#source-about-0').fill('council capacity');
  await page.locator('#source-note-0').fill('The 2025 review.');
  await page.getByRole('button', { name: 'Add another thing to look up' }).click();
  if (await page.evaluate(() => document.activeElement?.id) !== 'look-up-1') failures.push('/new: Add another did not move focus to the new entry');
  await page.getByRole('button', { name: 'Remove thing to look up 2' }).click();
  await page.locator('#look-up-0').fill('council delivery capacity evaluation');
  // The lanes question arrives answered. Every browser run before phase 19 went
  // one call at a time because the form had no field and the default was one.
  if (!(await page.getByLabel('Six at once', { exact: true }).isChecked())) failures.push('/new: the lanes question is not answered "Six at once" by default');
  /*
   * THE SEALED BOX MUST SEAL (phase 23). From phase 4 the form sent
   * `sealed=sealed` and the server, correctly strict, read it as unsealed. So
   * tick it, catch the real request in flight, read the field, refuse the
   * request, and untick: the walk's own run stays unsealed because later steps
   * read its personas, which a sealed run never writes.
   */
  await page.getByLabel('Seal this assessment', { exact: true }).check();
  let sealedSent = null;
  const catchSubmit = async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    sealedSent = body.match(/name="sealed"\r\n\r\n([^\r]*)/)?.[1] ?? '(absent)';
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Held by the walk.' }) });
  };
  await page.route('**/api/policy-analysis', catchSubmit);
  await page.getByRole('button', { name: 'Start the assessment' }).click();
  await page.getByRole('alert').filter({ hasText: 'Held by the walk.' }).waitFor({ timeout: 5000 });
  await page.unroute('**/api/policy-analysis', catchSubmit);
  if (sealedSent !== 'true') failures.push(`/new: a ticked "Seal this assessment" sent sealed=${sealedSent}, not sealed=true`);
  await page.getByLabel('Seal this assessment', { exact: true }).uncheck();
  note('a ticked sealed box sends sealed=true');
  await page.getByRole('button', { name: 'Start the assessment' }).click();
  await page.waitForURL('**/assessments/**', { timeout: 20000 });
  note('submitted');

  // 4 — the report, once the run finishes. The page follows its own progress
  // over the event stream, so this is waiting for the UI to update itself.
  // THE SUMMARY IS THE FRONT DOOR SINCE PHASE 20, so the report is ready when
  // its heading is.
  await page.getByRole('heading', { name: 'The report at a glance' }).waitFor({ timeout: 120000 });
  const id = page.url().split('/').pop();
  const base = `http://127.0.0.1:${PORT}/assessments/${id}`;

  /*
   * ONE QUESTION PER PAGE (phase 21). The views are routes now, reached from
   * GOV.UK's service navigation, and each section of a view is a page of its
   * own. `openView` clicks the navigation — never `goto` — because a link that
   * renders and does not route is the failure a walk exists to catch, and it
   * waits for the URL and the page's own content, not the shell.
   */
  // THE ASSESSMENT'S OWN SECTIONS (`.prt-subnav`) since phase 24: the
  // service's navigation is the other bar, on every page.
  const serviceNav = page.locator('.prt-subnav');
  const currentView = async () => (await serviceNav.locator('.govuk-service-navigation__item--active').innerText().catch(() => '')).trim();
  const settle = async () => {
    await page.locator('.prt-view').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(150);
  };
  const openView = async (label) => {
    await serviceNav.getByRole('link', { name: label, exact: true }).click();
    await page.waitForFunction((name) => {
      const active = document.querySelector('.prt-subnav .govuk-service-navigation__item--active');
      return active?.textContent?.trim() === name;
    }, label, { timeout: 10000 });
    await settle();
  };
  /** A section of the view on screen, opened from its card on the landing page. */
  const openSection = async (title) => {
    await page.locator('.prt-tiles').getByRole('link', { name: title, exact: true }).click();
    await page.getByRole('heading', { level: 2, name: title, exact: true }).first().waitFor({ timeout: 10000 });
    await settle();
  };
  const pathOf = () => { const url = new URL(page.url()); return url.pathname.replace(`/assessments/${id}`, '') || '/'; };

  /*
   * THE SUMMARY (phase 20): the default page, four figures that agree with the
   * views they open, and a way on that actually changes page. A summary that
   * disagrees with its own detail is worse than none, so the figure on the
   * first tile is checked against the Threats page's own count.
   */
  {
    const selected = await currentView();
    if (selected !== 'Summary') failures.push(`summary: the report opened on "${selected}", not the summary`);
    const panel = page.locator('.prt-view');
    const tiles = await panel.locator('.prt-kpi').count();
    if (tiles < 2) failures.push(`summary: ${tiles} headline figures, expected at least two`);
    const cards = await panel.locator('.prt-card').count();
    if (cards < 3) failures.push(`summary: ${cards} summary boxes, expected at least three`);
    if (await page.getByRole('heading', { name: 'Read the report in full' }).count()) failures.push('summary: still carries "Read the report in full", which the navigation above it already is');
    const first = (await panel.locator('.prt-kpi__value').first().innerText()).trim();
    await panel.getByRole('link', { name: /^See all \d+ ways to beat it/ }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/threats/weights'), { timeout: 10000 }).catch(() => {});
    await settle();
    if (await currentView() !== 'Threats') failures.push(`summary: "See all … ways to beat it" left the reader on "${await currentView()}"`);
    if (pathOf() !== '/threats/weights') failures.push(`summary: "See all … ways to beat it" opened ${pathOf()}, not the ranked list's own page`);
    await openView('Threats');
    const caption = (await page.locator('.prt-viewhead').innerText()).replace(/\s+/g, ' ');
    if (!caption.includes(`${first} way`)) failures.push(`summary: the first figure says ${first} and the Threats page says "${caption}"`);
    note(`summary: ${tiles} figures, ${cards} boxes, and the way on opens a section of Threats`);
  }

  /*
   * EVERY VIEW IS VISITED, because a section silently assigned to the wrong one
   * still renders — just never where the reader looking for it will be. A
   * landing page names its sections on cards, so a section's title is on its
   * own view's landing page whether it is the lead or a card.
   */
  const VIEWS = [
    ['Summary', '/', 'The report at a glance'],
    ['Findings', '/findings', 'Main findings'],
    ['Causes', '/causes', 'How they connect'],
    ['Threats', '/threats', 'Ways to beat it'],
    ['Who is involved', '/who', 'Who is involved'],
    ['How it was made', '/method', 'How this was produced'],
  ];
  for (const [label, path, heading] of VIEWS) {
    await openView(label);
    if (pathOf() !== path) failures.push(`report: "${label}" in the navigation opened ${pathOf()}, not ${path}`);
    const visible = await page.locator('#main-content').innerText();
    if (!visible.includes(heading)) failures.push(`report: "${heading}" is not in ${label}`);
    if (!(await page.locator('.prt-usebar').count())) failures.push(`report: ${label} has no bar of things to do with it`);
  }
  // The big block under every view is gone; its contents live on /use.
  if (await page.getByRole('heading', { name: 'What you can do with this' }).count()) failures.push('report: "What you can do with this" is still a block under the report');

  await openView('How it was made');
  await openSection('How this was produced');
  if (!/18 of 18 completed/.test(await page.locator('#main-content').innerText())) failures.push('report: does not say all eighteen stages completed');
  /*
   * A SECTION PAGE: the section, a side menu of its siblings with this one
   * marked, and previous/next. The menu's current entry is the page's own.
   */
  {
    const current = await page.locator('.prt-sidenav [aria-current="page"]').innerText().catch(() => '');
    if (current !== 'How this was produced') failures.push(`section page: the side menu marks "${current}" as the page`);
    if (!(await page.locator('.govuk-pagination').count())) failures.push('section page: no previous/next');
    if (await currentView() !== 'How it was made') failures.push('section page: the navigation does not mark the view it is under');
    await audit('/assessments/:id/method/provenance (a section page)');
  }

  /*
   * THE BRIEF IS THE FIRST THING IN FINDINGS (phase 19, workstream B). The
   * fixture writes key judgements, so the brief is built from them: the
   * heading says so, a judgement quotes the paper as a quote, and the Word
   * download of the brief alone answers with a Word file.
   */
  await openView('Findings');
  const brief = page.locator('.prt-view .prt-brief');
  if (!(await brief.count())) {
    failures.push('brief: Findings does not open with the brief');
  } else {
    const firstSection = await page.locator('.prt-view section').first().getAttribute('aria-labelledby');
    if (firstSection !== 'main-findings') failures.push(`brief: Findings opens with "${firstSection}", not the brief`);
    if (!(await brief.getByRole('heading', { name: 'Key judgements' }).count())) failures.push('brief: the fixture has key judgements and the brief does not lead with them');
    if (!(await brief.locator('blockquote').count())) failures.push('brief: no judgement quotes the paper');
    if (!(await brief.getByRole('heading', { name: 'What we could not check' }).count())) note('brief: the fixture run noted nothing it could not check');
    const href = await brief.getByRole('link', { name: 'Download the brief (Word)' }).getAttribute('href');
    if (!href?.includes('part=brief')) failures.push('brief: no Word download of the brief alone');
    const docx = await fetch(`http://127.0.0.1:${PORT}${href}`);
    if (!docx.ok || !/wordprocessingml/.test(docx.headers.get('content-type') ?? '')) failures.push(`brief: the Word download answered ${docx.status} ${docx.headers.get('content-type')}`);
    const sharedBrief = await (await fetch(`http://127.0.0.1:${PORT}${href.replace('format=docx', 'format=md')}&scope=shared`)).text();
    if (!/This is a shared copy/.test(sharedBrief) || !/## Key judgements/.test(sharedBrief)) failures.push('brief: the shared brief is not the brief, or does not say it is shared');
    note('the brief leads Findings, from key judgements, with a Word copy of it alone');
  }

  /*
   * THE PATTERN GRID LEADS THREATS, and a square is a carried selection: it
   * narrows the ranked list and the banner says both halves of it.
   */
  await openView('Threats');
  const firstThreat = await page.locator('.prt-view section').first().getAttribute('aria-labelledby');
  if (firstThreat !== 'patterns') failures.push(`grid: Threats opens with "${firstThreat}", not the pattern grid`);
  const square = page.locator('.prt-view .prt-pgrid__square').first();
  if (await square.count()) {
    await square.click();
    const said = await page.locator('.prt-selection').innerText();
    if (!/aimed at/.test(said)) failures.push(`grid: pressing a square said "${said}"`);
    if ((await square.getAttribute('aria-pressed')) !== 'true') failures.push('grid: the pressed square is not marked pressed');
    await page.getByRole('button', { name: /Clear the selection/i }).first().click();
    note('a square of the pattern grid narrows the report and says so');
  } else {
    failures.push('grid: no square to press');
  }

  /*
   * THE SELECTION HAS TO SURVIVE A PAGE CHANGE, which is the one thing here
   * that breaks without throwing: the next page simply shows a narrower set,
   * and a reader comparing two views draws a conclusion from a list they did
   * not know was filtered. It rides in `?sel=` on every link — the service
   * navigation, the cards and previous/next — so each of those is crossed.
   */
  await openSection('How exposed the policy is');
  const band = page.locator('.prt-view .prt-stack__seg').first();
  let selectedAt = '';
  if (await band.count()) {
    await band.click();
    await page.waitForTimeout(200);
    const banner = page.locator('.prt-selection');
    const stated = await banner.innerText();
    if (!/Showing/.test(stated)) failures.push('report: selecting a band says nothing above the page');
    if (!new URL(page.url()).searchParams.get('sel')) failures.push('report: selecting a band did not put it in the address');
    const navHref = await serviceNav.getByRole('link', { name: 'Findings', exact: true }).getAttribute('href');
    if (!navHref?.includes('sel=')) failures.push(`report: the service navigation does not carry the selection (${navHref})`);

    await openView('Findings');
    const afterView = await page.locator('.prt-selection').innerText().catch(() => '');
    if (afterView !== stated) failures.push('report: the selection did not survive a change of view');

    // And through previous/next on a section page, back in Threats.
    await openView('Threats');
    await openSection('How exposed the policy is');
    await page.locator('.govuk-pagination__next a').click();
    await page.waitForURL((url) => url.pathname.endsWith('/threats/weights'), { timeout: 10000 });
    await settle();
    if ((await page.locator('.prt-selection').innerText().catch(() => '')) !== stated) failures.push('report: the selection did not survive "Next"');
    selectedAt = pathOf() + new URL(page.url()).search;

    // And it is clearable from a page other than the one that set it.
    await openView('Who is involved');
    await page.getByRole('button', { name: /Clear the selection/i }).click();
    await page.waitForTimeout(200);
    if (await page.locator('.prt-selection').count()) failures.push('report: the selection could not be cleared from another view');
    if (new URL(page.url()).searchParams.get('sel')) failures.push('report: clearing the selection left it in the address');
    const clearedHref = await serviceNav.getByRole('link', { name: 'Threats', exact: true }).getAttribute('href');
    if (clearedHref?.includes('sel=')) failures.push('report: the navigation still carries a cleared selection');
  } else {
    failures.push('report: no exposure band to select');
  }

  /*
   * EVERY VIEW IS AUDITED, landing page by landing page, and a section page
   * once above. Only what is mounted is audited, so this is the floor.
   */
  for (const [label] of VIEWS) {
    await openView(label);
    await audit(`/assessments/:id (report — ${label})`);
  }
  note(`report rendered for ${id}: six views, section pages, and a carried selection`);

  /*
   * OLD ADDRESSES STILL ANSWER. `?move=` was the tabbed report's, and it is in
   * browsers' histories; it must land on the view it named with the selection
   * it carried.
   */
  await page.goto(`${base}?move=causality&sel=band:severe`, { waitUntil: 'networkidle' });
  await settle();
  if (pathOf() !== '/causes') failures.push(`old address: ?move=causality landed on ${pathOf()}`);
  if (!new URL(page.url()).searchParams.get('sel')) failures.push('old address: ?move= dropped the selection on the way');
  await page.goto(`${base}?move=verdict#suggests`, { waitUntil: 'networkidle' });
  await page.waitForURL((url) => url.pathname.endsWith('/findings/suggests'), { timeout: 10000 }).catch(() => {
    failures.push(`old address: ?move=verdict#suggests landed on ${pathOf()}, not the recommendations' page`);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await settle();

  // 5 — the diagram and its table are both reachable, which the accessibility
  // statement promises and which nothing else checks.
  // Each toggle names its own figure — three of them on this page now, and
  // three buttons all announcing "Table" would tell a screen-reader user
  // nothing about which table.
  // The ease-against-impact scatter was cut in phase 19; the toggle checked
  // here is the theory-of-change strips', in Causes, where the fixture has one.
  await openView('Causes');
  await openSection('How each part is meant to work');
  const tableToggle = page.getByRole('button', { name: 'Table of how each part is meant to work' });
  if (await tableToggle.count()) {
    await tableToggle.click();
    await page.getByRole('table', { name: /meant to work/i }).waitFor({ timeout: 5000 }).catch(() => {
      failures.push('report: the theory-of-change strips have no table view');
    });
    // The pressed view must be visible and not merely announced: two identical
    // grey buttons over a chart leave a sighted reader no way to know which one
    // they are looking at.
    // BOTH BUTTONS ARE `--secondary` BY DESIGN (see `parts/_figtoggle.scss`):
    // the pressed one is drawn by `[aria-pressed="true"]`. This used to assert
    // the pressed one was NOT secondary, which stopped being true when the
    // toggle was restyled and went unnoticed because the scatter it ran against
    // never showed its toggle in the fixture. So it compares what is painted.
    const pressed = await tableToggle.evaluate((el) => {
      const other = [...el.parentElement.querySelectorAll('button')].find((b) => b !== el);
      const look = (b) => { const s = getComputedStyle(b); return `${s.backgroundColor}|${s.color}|${s.boxShadow}|${s.borderColor}`; };
      return { pressed: el.getAttribute('aria-pressed'), same: other ? look(other) === look(el) : true };
    });
    if (pressed.pressed !== 'true' || pressed.same) {
      failures.push('report: the selected view is not marked pressed, or does not look it');
    }
    await audit('/assessments/:id (table view)');
    note('diagram and table both render, and the pressed one looks pressed');
  }

  // 5b — THE RELATIONSHIP GRAPH. Present only when the paper states
  // relationships; the fixture states one, which is enough to prove the section
  // renders, counts and links.
  // The graph lives in Causes, on its own page since phase 21.
  await openView('Causes');
  await openSection('How they connect');
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

  // 5c — THE STRESS TEST: the one thing on the page you RUN rather than read.
  //
  // It simulates, so a gate that only checks it rendered has checked nothing.
  // This pulls a lever and asserts the page changed, that the two directions
  // stayed opposite, and that axe is clean on the result — which is a different
  // DOM from the one at rest.
  // The stress lab is the one thing you RUN rather than read, so it sits with
  // the plays in Threats.
  await openView('Threats');
  await openSection('What if we are wrong');
  const stress = page.getByRole('heading', { name: 'What if we are wrong' });
  if (await stress.count()) {
    await stress.scrollIntoViewIfNeeded();
    const panel = page.locator('section[aria-labelledby="stress"]');
    const atRest = await panel.innerText();
    if (!atRest.includes('Nothing failed yet')) failures.push('stress: does not say it is waiting for a lever');

    const lever = panel.locator('input[type=checkbox]').first();
    if (!(await lever.count())) {
      failures.push('stress: rendered with no levers at all');
    } else {
      // Every lever must be reachable and labelled, or the panel is unusable
      // from a keyboard — which is the whole risk of a bespoke control and the
      // reason this uses GOV.UK's checkboxes.
      const labelled = await panel.evaluate((el) => [...el.querySelectorAll('input[type=checkbox]')]
        .every((i) => !!el.querySelector(`label[for="${i.id}"]`)));
      if (!labelled) failures.push('stress: a lever has no label pointing at it');

      await lever.check();
      await page.waitForTimeout(200);
      const pulled = await panel.innerText();
      if (pulled === atRest) failures.push('stress: pulling a lever changed nothing on the page');
      if (!/\d+ of \d+ conclusions and results lose their support|No conclusion loses its support/.test(pulled)) {
        failures.push('stress: does not say how much lost its footing');
      }
      // THE TWO DIRECTIONS MUST NEVER BE COLLAPSED, and this asserts it against
      // the DOM rather than against two adjacent string literals — which is what
      // it did before, and which could not fail. A disarmed play is good news
      // for the policy; a conclusion that lost its footing is not, and a review
      // found one being printed in red under the other's heading.
      const mixed = await panel.evaluate(() => {
        const bad = [];
        for (const section of document.querySelectorAll('section[aria-labelledby^="stress-"]')) {
          const id = section.getAttribute('aria-labelledby');
          const tags = [...section.querySelectorAll('.govuk-tag')].map((t) => t.textContent.trim());
          const good = id === 'stress-disarmed' || id === 'stress-eased';
          if (!good && tags.some((t) => /Taken off the table|No longer applies/.test(t))) bad.push(`${id}: ${tags.join(', ')}`);
          if (id === 'stress-disarmed' && tags.some((t) => /Nothing left supporting it|Partly undercut/.test(t))) {
            bad.push(`${id}: ${tags.join(', ')}`);
          }
        }
        return bad;
      });
      for (const bad of mixed) failures.push(`stress: the two directions are mixed — ${bad}`);
      // And the figure has to be about what FELL, never about everything that moved.
      if (/conclusions and results move/.test(pulled)) {
        failures.push('stress: the headline counts both directions as one figure');
      }
      if (!/checks? on how the policy is set up (is|are) untouched/.test(pulled)) {
        failures.push('stress: does not say what cannot move');
      }
      await audit('/assessments/:id (stress test, pulled)');

      // THE SHOW-ALL PATH, where a ticked lever used to vanish. Expanding and
      // collapsing the rail must never silently drop what the reader chose, nor
      // leave a results panel driven by a lever with no box on screen.
      const showAll = panel.getByRole('button', { name: /most rested on/ });
      if (await showAll.count()) {
        await showAll.click();
        const expanded = panel.locator('input[type=checkbox]');
        const last = expanded.nth((await expanded.count()) - 1);
        const lastId = await last.getAttribute('id');
        await last.check();
        await showAll.click();
        await page.waitForTimeout(200);
        const still = panel.locator(`input[type=checkbox]#${lastId}`);
        if (!(await still.count())) {
          failures.push('stress: collapsing the rail hid a ticked lever, leaving no way to untick it');
        } else if (!(await still.isChecked())) {
          failures.push('stress: collapsing the rail silently unticked a lever');
        }
        await still.uncheck().catch(() => {});
        note('a ticked lever survives the rail collapsing');
      }

      await lever.uncheck();
      await page.waitForTimeout(200);
      if (!(await panel.innerText()).includes('Nothing failed yet')) {
        failures.push('stress: unticking the lever did not put it back');
      }
      note('the stress test runs, and both directions stay opposite');
    }
  } else {
    failures.push('report: no "What if we are wrong" section at all');
  }

  // 5d — THE COPY YOU SEND SOMEONE, and what is not in it.
  //
  // There is no share LINK: every owner route here is unauthenticated by
  // design, so a URL that worked for a recipient would also hand them the whole
  // paper two requests later. The redacted copy leaves as a FILE, and these are
  // the assertions that matter — not that the page rendered, but that three
  // kinds of thing are absent from what a recipient receives.
  // Sharing and the export are actions on the whole report, so since phase 21
  // they are on a page of their own, reached from the bar at the foot of every
  // page of the report — which is the link walked here.
  await page.locator('.prt-usebar').getByRole('link', { name: 'Download a copy' }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/use') && url.hash === '#take', { timeout: 10000 }).catch(() => {
    failures.push(`use: "Download a copy" opened ${page.url()}`);
  });
  await audit('/assessments/:id/use');
  /*
   * ONE SECTION, NOT TWO. "Take it away" and "Send it to someone" were two
   * headings over one subject — every download in the first, and in the second
   * an argument about links plus the redacted copy. They are now one `take`
   * section holding a download grid and that argument.
   *
   * SO THE ASSERTION MOVED RATHER THAN RELAXED. The section now legitimately
   * offers the owner's own unredacted exports beside the shared one, so "no
   * download here that is not redacted" is no longer the invariant. What still
   * has to be true is that the redacted copy is offered, that the page says why
   * there is no link, and — the assertion that actually protects a recipient —
   * that the shared pack's payload withholds the three kinds, which is checked
   * against the real bytes below.
   */
  await page.getByRole('heading', { name: 'Take it away' }).scrollIntoViewIfNeeded();
  const panelText = await page.locator('section[aria-labelledby="take"]').innerText();
  if (!/no link to send/i.test(panelText)) failures.push('take: does not say why there is no link');
  if (!(await page.locator('section[aria-labelledby="take"] a[href*="scope=shared"]').count())) {
    failures.push('take: does not offer the redacted copy');
  }

  const owned = await page.evaluate(async (a) => (await fetch(`/api/policy-analysis/${a}`)).json(), id);
  const sharedZip = Buffer.from(await (await fetch(`http://127.0.0.1:${PORT}/api/policy-analysis/${id}/export?format=bundle&scope=shared`)).arrayBuffer());
  const zip = await JSZip.loadAsync(sharedZip);
  const sharedHtml = await zip.file(Object.keys(zip.files).find((f) => f.endsWith('index.html'))).async('string');
  const island = /<script type="application\/json" id="[^"]*">([\s\S]*?)<\/script>/.exec(sharedHtml);
  const payload = island ? JSON.parse(island[1]) : null;
  if (!payload) {
    failures.push('send: the shared pack carries no payload to check');
  } else {
    // The three kinds a recipient must never receive. `persona_link` is the one
    // upstream does not withhold — its data carries the standing dossier drawn
    // from the owner's OTHER assessments — and is a recorded divergence.
    for (const kind of ['passage', 'cross_policy', 'persona_link']) {
      if (payload.artefacts.some((a) => a.kind === kind)) failures.push(`send: the shared pack carries ${kind} artefacts`);
    }
    if (!payload.withheld?.length) failures.push('send: the shared pack does not say anything was withheld');
    if (payload.documentSha256 !== null) failures.push('send: the shared pack carries the document digest, which is a confirmation oracle');
    // And the paper's own words are not in what the file carries.
    //
    // Searched in the PARSED payload rather than the raw HTML: the payload is a
    // JSON island, so a newline inside a passage arrives as the two characters
    // `\` `n` and a substring search over the markup silently matches nothing.
    // That made this assertion vacuous until the control below caught it.
    const flat = (v) => v.replace(/\s+/g, ' ');
    const words = (p) => flat(p.artefacts.map((a) => `${a.statement} ${a.sourceQuote ?? ''}`).join(' '));
    const passage = owned.artefacts.find((a) => a.kind === 'passage' && a.statement.length > 120);
    const needle = passage ? flat(passage.statement).slice(40, 110) : null;
    if (needle && words(payload).includes(needle)) {
      failures.push('send: a span of the paper survived into the shared pack');
    }

    // THE OWNER'S OWN PACK IS THE CONTROL. Without it the check above passes
    // just as happily against a pack that carries nothing at all — and it did.
    const ownZip = await JSZip.loadAsync(Buffer.from(await (await fetch(`http://127.0.0.1:${PORT}/api/policy-analysis/${id}/export?format=bundle`)).arrayBuffer()));
    const ownHtml = await ownZip.file(Object.keys(ownZip.files).find((f) => f.endsWith('index.html'))).async('string');
    const ownIsland = /<script type="application\/json" id="[^"]*">([\s\S]*?)<\/script>/.exec(ownHtml);
    const ownPayload = ownIsland ? JSON.parse(ownIsland[1]) : { artefacts: [] };
    for (const kind of ['passage', 'persona_link']) {
      if (!ownPayload.artefacts.some((a) => a.kind === kind)) {
        failures.push(`send: the OWNER pack has no ${kind} either, so the redaction check proves nothing`);
      }
    }
    if (needle && !words(ownPayload).includes(needle)) {
      failures.push('send: the OWNER pack is missing the paper, so the redaction check proves nothing');
    }
    note(`the copy you send withholds ${payload.withheld.map((w) => `${w.count} ${w.kind}`).join(', ')}`);
  }

  // 5e — SOMETHING READ AFTER THE REPORT WAS WRITTEN, and the report written again.
  //
  // The whole point is that NOTHING IS RE-RUN: a pass owns its own block of
  // ordinals and appends, so the original report stays exactly as it was. What
  // this asserts is that the pass ran, that it reached a verdict on an existing
  // conclusion, and that the banner above the verdict says so — a reader who
  // meets the conclusion first has already formed a view of a report that has
  // been overtaken.
  // FROM THE BAR, BY ITS OWN ANCHOR — which has to open the disclosure it
  // names, or the link lands on a shut "Add something to it".
  await page.locator('.prt-usebar').getByRole('link', { name: 'Add something to it' }).click();
  await page.waitForURL((url) => url.hash === '#add', { timeout: 10000 });
  await page.waitForTimeout(300);
  if (!(await page.locator('details#add').evaluate((el) => el.open))) failures.push('use: "Add something to it" landed on a shut disclosure');
  await page.getByRole('heading', { name: 'What came after this was written' }).scrollIntoViewIfNeeded();
  const material = path.join(dataRoot, 'walk-rebuttal.txt');
  await writeFile(material, 'A rebuttal. The Council disputes that it has the capacity assumed, and says the funding line is not committed beyond one year.');
  // The form is behind a disclosure: 1,300px of radios and pickers at the foot
  // of every report was a sixth of the page, permanently open, for a thing done
  // rarely. The bar's link opened it above.
  await page.getByLabel('A critique or rebuttal').check();
  await page.getByLabel('The document', { exact: true }).setInputFiles(material);
  await page.getByLabel('Anything you want the reading to know').fill('Sent by the Council.');
  await page.getByRole('button', { name: 'Read it against this assessment' }).click();

  /*
   * WAIT ON THE STATE, NOT ON A HEADING. The report is still on screen for the
   * moment between the click and the status change, so waiting for "What it
   * found" matched the page that was already there and every assertion below
   * then read a report with no addendum in it. Polling the API for the thing
   * that must become true is the only version of this that cannot race.
   */
  await page.waitForFunction(
    async (a) => {
      const data = await (await fetch(`/api/policy-analysis/${a}`)).json();
      return data.passes.some((p) => p.kind === 'addendum' && /completed/.test(p.status));
    },
    id,
    { timeout: 180000, polling: 1000 },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'What came after this was written' }).waitFor({ timeout: 60000 });

  const afterText = await page.locator('section[aria-labelledby="after"]').innerText();
  if (process.env.WALK_DEBUG) console.log('--- AFTER SECTION ---\n' + afterText.slice(0, 900) + '\n---');
  if (!/A critique or rebuttal/.test(afterText)) failures.push('material: the pass does not say what was attached');
  if (!/passage read|passages read/.test(afterText)) failures.push('material: the pass does not say it read anything');
  if (!/Sent by the Council/.test(afterText)) failures.push('material: the reader\'s own note was dropped');
  // A verdict on an existing conclusion is the thing a pass exists to produce.
  const verdicts = await page.locator('section[aria-labelledby="after"] .govuk-tag').allInnerTexts();
  if (!verdicts.length) failures.push('material: the pass reached no verdict on anything');
  // And the banner, which must sit ABOVE the verdict rather than in the section.
  const banners = await page.locator('#main-content .govuk-warning-text').allInnerTexts();
  if (!banners.some((b) => /overtaken in part/.test(b))) {
    failures.push('material: nothing above the verdict says the report has been overtaken');
  }
  await audit('/assessments/:id (with an addendum)');
  note(`material read, ${verdicts.length} ${verdicts.length === 1 ? 'verdict' : 'verdicts'} reached`);

  // Writing it again, which the store refuses without a completed addendum —
  // so this could only ever run after the step above.
  // Behind its own disclosure, for the same reason the attach form is: a
  // restatement is the most expensive call in the tool and the rarest thing a
  // reader does with a report.
  await page.locator('summary', { hasText: 'Write the report again' }).click();
  const rewrite = page.getByRole('button', { name: 'Write it again' });
  if (!(await rewrite.count())) {
    failures.push('restate: not offered even with a completed addendum');
  } else {
    await rewrite.click();
    await page.waitForFunction(
      async (a) => {
        const data = await (await fetch(`/api/policy-analysis/${a}`)).json();
        return data.passes.some((p) => p.kind === 'restatement' && /completed/.test(p.status));
      },
      id,
      { timeout: 180000, polling: 1000 },
    );
    await page.reload({ waitUntil: 'networkidle' });
    // The reload keeps the page the URL names, which is /use.
    await page.locator('section[aria-labelledby="after"]').waitFor({ state: 'attached', timeout: 60000 });
    const detail = await page.evaluate(async (a) => (await fetch(`/api/policy-analysis/${a}`)).json(), id);
    if (!detail.passes.some((p) => p.kind === 'restatement' && /completed/.test(p.status))) {
      failures.push('restate: no completed restatement was recorded');
    }
    // NOTHING WAS RE-RUN. The original eighteen stages keep their ordinals and
    // the passes own their own block, so the report that was superseded is
    // still stored — which is the property the whole design turns on.
    if (detail.stages.filter((st) => st.ordinal < 100).length !== 18) {
      failures.push('restate: the original stages were disturbed');
    }
    note('the report was written again, and the original stages were left alone');
  }

  // 6 — THE DRILL: one artefact, opened out, with its chain back to the paper.
  //
  // Reached by clicking a name in the report, never by typing the URL. A link
  // that renders and does not navigate is the exact failure this step exists to
  // catch, and it is invisible to a type check.
  // FROM A SECTION PAGE UNDER A SELECTION, so the way back has something to
  // lose: the ranked list's own page, narrowed by the band chosen above.
  await page.goto(`${base}${selectedAt || '/threats/weights'}`, { waitUntil: 'networkidle' });
  await settle();
  const openedFrom = pathOf() + new URL(page.url()).search;
  // The playbook TABLE is gone — it printed the same forty-seven plays the
  // ranked cards above it already print, in five columns narrow enough to set
  // "compliant" as "compli / ant". The cards are the list now, so the drill is
  // entered from the first card's title, which is the link a reader would use.
  const firstPlay = page.locator('.prt-view .prt-play__title a').first();
  const playName = (await firstPlay.innerText()).trim();
  await firstPlay.click();
  // `/items/` since phase 21; `/artefacts/` is the old address, which redirects.
  await page.waitForURL(/\/(items|artefacts)\//, { timeout: 10000 });
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

  /*
   * THE ITEM IS FOUR PAGES (phase 21): what it is, what it rests on, what rests
   * on it, and everything recorded. The default part is the item itself, and
   * the chain is one click away on a strip of parts under the title — so the
   * assertion that the chain reaches the paper moved with it.
   */
  const drill = await page.locator('#main-content').innerText();
  for (const expected of ['How this would be run', 'Where this stands']) {
    if (!drill.includes(expected)) failures.push(`drill: missing section "${expected}"`);
  }
  for (const gone of ['Contents', 'Followed back']) {
    if (drill.includes(gone)) failures.push(`drill: the item's own part still carries "${gone}" — it belongs on a part of its own`);
  }
  const parts = page.getByRole('navigation', { name: /^Parts of / });
  if (!(await parts.count())) failures.push('drill: no strip of parts under the title');
  const current = await parts.locator('[aria-current="page"]').innerText().catch(() => '');
  if (!/Overview/.test(current)) failures.push(`drill: the current part is "${current}", not the overview`);
  await audit('/assessments/:id/items/:itemId (a way to beat it)');

  // `__spa` is stamped on the window here and checked after the back link: if
  // any navigation below reloaded the document the stamp is gone, which is how
  // a plain <a href> in a single-page app announces itself.
  await page.evaluate(() => { window.__spa = true; });
  const fromBefore = new URL(page.url()).searchParams.get('from');
  await parts.getByRole('link', { name: /What it rests on/ }).click();
  await page.waitForURL(/\/items\/[^/]+\/rests-on/, { timeout: 10000 });
  const restsOnUrl = page.url();
  // THE READING POSITION SURVIVES THE PART CHANGE, or the back link at the top
  // quietly starts returning to the report's first page.
  if (new URL(page.url()).searchParams.get('from') !== fromBefore) {
    failures.push(`drill: moving to "What it rests on" dropped ?from= (${page.url()})`);
  }
  await page.getByRole('heading', { level: 2, name: 'What it rests on' }).waitFor({ timeout: 10000 }).catch(() => {
    failures.push('drill: the "rests on" part never rendered its heading');
  });
  const restsOn = await page.locator('#main-content').innerText();
  // The chain is the whole point of the page. Stopping at the assessment's own
  // middle layers would leave a reader unable to argue with a finding, which is
  // the thing the drill is FOR.
  if (!/Followed back \d+ citations?/.test(restsOn)) failures.push('drill: the chain does not say how far back it went');
  if (!/Back at the paper/.test(restsOn)) failures.push('drill: the chain never reaches the paper');
  // THE TRAIL'S BOXES ALL CARRY WORDS — the chart it replaced printed a label
  // only where a band was tall enough, and that was the complaint.
  const trailBoxes = await page.locator('.prt-trail__box').allInnerTexts();
  if (trailBoxes.length < 2) failures.push('drill: the trail back to the paper has fewer than two boxes');
  if (trailBoxes.some((text) => !/[a-z]/i.test(text))) failures.push(`drill: a box on the trail has no words: ${JSON.stringify(trailBoxes)}`);
  if (await page.locator('.prt-rail, .prt-chainwalk').count()) failures.push('drill: the old stage strip or chain chart is back');
  await audit('/assessments/:id/items/:itemId/rests-on');
  note(`drill opens on "${playName}", and its chain is a part of its own`);

  for (const [slug, heading] of [['used-by', /^What rests on this/], ['record', /^Everything recorded about it/]]) {
    await parts.getByRole('link', { name: slug === 'used-by' ? /What rests on this/ : /Everything recorded/ }).click();
    await page.waitForURL(new RegExp(`/items/[^/]+/${slug}`), { timeout: 10000 });
    await page.getByRole('heading', { level: 2, name: heading }).waitFor({ timeout: 10000 }).catch(() => {
      failures.push(`drill: the "${slug}" part never rendered its heading`);
    });
    await audit(`/assessments/:id/items/:itemId/${slug}`);
  }
  await parts.getByRole('link', { name: /What it rests on/ }).click();
  await page.waitForURL(/\/rests-on/, { timeout: 10000 });
  await page.getByRole('heading', { level: 2, name: 'What it rests on' }).waitFor({ timeout: 10000 });

  // 7 — follow the chain one hop, then reverse out of it two ways.
  const here = page.url();
  await page.locator('.prt-rung a[href*="/items/"]').first().click();
  await page.waitForFunction((was) => location.href !== was, here, { timeout: 10000 });
  await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 10000 }).catch(() => {
    failures.push('drill: following the chain landed on a page that never rendered a heading');
  });
  await audit('/assessments/:id/items/:itemId (followed)');

  await page.goBack();
  await page.waitForURL(here, { timeout: 10000 });
  await page.getByRole('heading', { level: 1, name: playName }).waitFor({ timeout: 10000 });
  note('the chain is followable, and the browser back button reverses it');

  /*
   * THE BACK LINK RETURNS TO WHERE THE READER WAS, not to the top of the report.
   *
   * This used to wait for "What it found" — a Verdict section — because the back
   * link always landed on Move 1 with the selection cleared. That was the defect:
   * following a play out of Threats under a mechanism and pressing the one
   * visible way back put the reader on a different move showing everything,
   * while the browser's own Back, which nobody is looking at, was perfect.
   *
   * So the assertion is now the behaviour rather than the symptom: the report
   * renders, and the panel showing is the one the drill was opened from. Read
   * off the URL rather than hard-coded, so it keeps holding if the walk's route
   * through the moves changes.
   */
  await page.locator('.govuk-back-link').click();
  await page.waitForURL((url) => url.pathname.startsWith(`/assessments/${id}`) && !url.pathname.includes('/items/'), { timeout: 10000 }).catch(() => {
    failures.push(`drill: the back link went to ${page.url()}`);
  });
  await settle();
  /*
   * AND THE URL HAS TO SETTLE ON THE PAGE IT CAME FROM — path, section and
   * selection. Read after a pause, because the report writes the selection
   * back through the router and a writer that disagreed with the reader would
   * show the right page under an address that loses it on reload.
   */
  await page.waitForTimeout(600);
  const cameBack = pathOf() + new URL(page.url()).search;
  if (cameBack !== openedFrom) failures.push(`drill: opened from ${openedFrom}, and the back link settled on ${cameBack}`);
  if (openedFrom.includes('sel=') && !(await page.locator('.prt-selection').count())) failures.push('drill: the back link lost the selection banner');
  if (!(await page.evaluate(() => window.__spa === true))) {
    failures.push('drill: leaving the drill reloaded the whole app rather than routing');
  }
  // THE OLD ITEM ADDRESS REDIRECTS, keeping what it carried.
  const itemId = new URL(drillUrl).pathname.split('/items/')[1];
  await page.goto(`${base}/artefacts/${itemId}?from=${encodeURIComponent(`/assessments/${id}/causes`)}`, { waitUntil: 'networkidle' });
  if (!new URL(page.url()).pathname.includes('/items/') || !new URL(page.url()).searchParams.get('from')) failures.push(`drill: the old /artefacts/ address landed on ${page.url()}`);
  const backText = (await page.locator('.govuk-back-link').innerText()).trim();
  if (backText !== 'Back to Causes') failures.push(`drill: the back link from a Causes page reads "${backText}"`);
  note(`the back link returns to ${cameBack}, without reloading`);

  // 8 — REFLOW, at the narrowest width WCAG 2.2 asks about.
  //
  // 1.4.10 is about content reflowing to 320 CSS pixels without a second scroll
  // direction, and axe cannot see it: a table that pushes the page sideways is
  // valid markup. Both drill tables did, and so did the report's — the links
  // this change added to the actors and checks columns made cells wider than the
  // phone they have to fit on. `<Table scroll>` is the fix and this is what
  // notices the next one.
  await page.setViewportSize({ width: 320, height: 800 });
  /*
   * EVERY VIEW OF THE REPORT, ONE PAGE AT A TIME — the landing pages, and a
   * section page, whose side menu and previous/next are the furniture most
   * likely to push a phone sideways. Each waits for a heading only that page
   * has, because `Template` paints an h1 before the detail request returns.
   */
  /*
   * WHAT THE READER BROUGHT, ON THE PAGE (phase 22 part 2): their look-up first
   * and marked as theirs, their source tagged, read in full and used.
   */
  await page.goto(`${base}/findings/outside`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Checked outside the paper', exact: true }).first().waitFor({ timeout: 30000 });
  {
    const items = page.locator('.prt-checked__item');
    const first = (await items.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!first.includes('council delivery capacity evaluation') || !first.includes('Asked by you')) failures.push(`checked outside: the reader's look-up is not first and marked as theirs (${first.slice(0, 120)})`);
    const text = (await page.locator('.prt-checked').first().innerText()).replace(/\s+/g, ' ');
    if (!text.includes('Supplied by you')) failures.push('checked outside: the supplied source carries no "Supplied by you" tag');
    if (!text.includes('Council delivery capacity review')) failures.push('checked outside: the supplied page is not listed by its title');
    if (!/Council delivery capacity review.*?In full/.test(text)) failures.push('checked outside: the supplied page does not say it was read in full');
    if (!text.includes('Contradicts the paper')) failures.push('checked outside: the evidence drawn from the supplied source is not shown');
    if (!(await page.getByText('I have a source for this').first().isVisible())) failures.push('checked outside: an open gap carries no "I have a source for this"');
    // And its own item page says whose it is.
    await page.locator('.prt-checked__source a', { hasText: 'Council delivery capacity review' }).first().click();
    await page.getByRole('heading', { level: 1, name: 'Council delivery capacity review' }).waitFor({ timeout: 20000 });
    if (!(await page.locator('.prt-item__where').getByText('Supplied by you').isVisible())) failures.push('item page: a supplied source is not tagged "Supplied by you"');
    if (!(await page.getByRole('heading', { name: 'Checked outside the paper' }).isVisible())) failures.push('item page: no "Checked outside the paper" box');
    await audit('checked outside the paper (item page of a supplied source)');
  }
  note('the reader’s source and look-up reached the report, tagged as theirs');

  const views = [
    ['report (summary)', base, 'The report at a glance'],
    ['report (findings)', `${base}/findings`, 'Main findings'],
    ['report (causes)', `${base}/causes`, 'The parts of the policy most ways to beat it rest on'],
    ['report (threats)', `${base}/threats`, 'The same few ideas, aimed at the same parts'],
    ['report (who is involved)', `${base}/who`, 'Who is coming for what'],
    ['report (how it was made)', `${base}/method`, 'What was discarded, and why'],
    ['report (a section page)', `${base}/threats/weights`, 'Ways to beat it'],
    // Phase 22: the fixture's challenge round writes a rival explanation and
    // its synthesis leaves it unresolved, so Findings has this page to draw.
    ['report (another explanation)', `${base}/findings/rival`, 'What would tell them apart'],
    // Phase 22 part 2: what was checked outside the paper, the reader's own first.
    ['report (checked outside the paper)', `${base}/findings/outside`, 'Checked outside the paper'],
    ['report (what you can do)', `${base}/use`, 'Take it away'],
    ['drill', drillUrl, null],
    ['drill (what it rests on)', restsOnUrl, 'What it rests on'],
  ];
  for (const [label, url, ready] of views) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
    if (ready) await page.getByRole('heading', { name: ready, exact: true }).first().waitFor({ timeout: 30000 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 0) failures.push(`${label}: at 320px the page scrolls ${wide}px sideways — a table needs <Table scroll>`);
    /*
     * AND AXE, AT THIS WIDTH. Every audit in this file runs at 1280×900, so the
     * rules that only bite on a phone were never asked: `target-size` on the
     * exposure bar's narrowest segment (12px of a 24px floor) was one. Both of
     * those were sitting on the live report, both serious, and the gate was
     * green because nobody measured at 320.
     */
    await audit(label + ' at 320px');
  }

  /*
   * THE SERVICE NAVIGATION COLLAPSES ON A PHONE, as govuk-frontend's own does:
   * a Menu button, the list hidden until it is pressed, and a choice that both
   * routes and closes it. Implemented in React rather than by the framework's
   * class, so the behaviour is asserted here rather than trusted.
   */
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'The report at a glance' }).waitFor({ timeout: 30000 });
  const menu = page.locator('.prt-subnav .govuk-service-navigation__toggle');
  const list = page.locator('.prt-subnav .govuk-service-navigation__list');
  // THE SERVICE'S OWN BAR COLLAPSES TOO, and must not be the one opened here:
  // two "Menu" buttons at 320px is why the sections' toggle names itself.
  if ((await page.locator('.govuk-service-navigation__toggle', { hasText: /^Menu$/ }).count()) !== 1) failures.push('nav at 320px: the service navigation has no Menu button of its own');
  if (!(await menu.isVisible())) failures.push('nav at 320px: no Menu button');
  else {
    if (await list.isVisible()) failures.push('nav at 320px: the list is open before Menu is pressed');
    await menu.click();
    if ((await menu.getAttribute('aria-expanded')) !== 'true' || !(await list.isVisible())) failures.push('nav at 320px: Menu does not open the list');
    if ((await list.locator('.govuk-service-navigation__item--active').count()) !== 1) failures.push('nav at 320px: the list does not mark the current view');
    await list.getByRole('link', { name: 'Causes', exact: true }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/causes'), { timeout: 10000 }).catch(() => failures.push('nav at 320px: choosing a view did not route'));
    if (await list.isVisible()) failures.push('nav at 320px: the list stays open over the page it opened');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // WAITED FOR, NOT READ: the button is hidden by a `matchMedia` listener that
  // re-renders, so reading it in the same tick as the resize races the render.
  // Two seconds is ample; a button that never goes still fails.
  await menu.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => failures.push('nav at 1280px: the Menu button is still drawn'));
  if (!(await list.isVisible())) failures.push('nav at 1280px: the list is hidden');
  note('nothing overflows at 320px');

  // 9 — the history now has a row, and it links back
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  // TWICE SINCE PHASE 20: the newest finished run leads as a card with its
  // figures, and every run is in the table below with how it came out.
  if (!(await page.locator('table').getByRole('link', { name: 'Walk fixture paper' }).isVisible())) failures.push('landing: the finished assessment is not listed');
  const feature = page.locator('.prt-feature');
  if (!(await feature.count())) failures.push('landing: the newest finished assessment does not lead as a card');
  else if (!(await feature.locator('.prt-feature__figure').count())) failures.push('landing: the feature card carries no figures');
  await audit('/ (with a row)');
  note('history lists it');

  // 9b — THE PERSONA LIBRARY, and a dossier opened from it.
  //
  // The library only earns its place on the SECOND paper that names a body, so
  // the walk runs one — without which the page under test is the single case
  // where a dossier adds nothing the assessment did not already say.
  //
  // A DIFFERENT DOCUMENT, not the same file twice. Since phase 19 two runs of
  // one document are one paper to the library — a redraft is not another
  // policy — so resubmitting the fixture would rightly leave "seen in 1 paper".
  await page.goto(`http://127.0.0.1:${PORT}/new`, { waitUntil: 'networkidle' });
  await page.getByLabel('What is this paper called?', { exact: true }).fill('Walk second paper');
  const secondPaper = Buffer.concat([
    await readFile(path.join(ROOT, 'tests', 'fixtures', 'policy-analysis', 'policy.txt')),
    Buffer.from('\n\nThis note is a separate policy about the same Council.\n'),
  ]);
  await page.getByLabel('The paper', { exact: true }).setInputFiles({ name: 'second-policy.txt', mimeType: 'text/plain', buffer: secondPaper });
  await page.getByRole('button', { name: 'Start the assessment' }).click();
  await page.waitForURL('**/assessments/**', { timeout: 20000 });
  await page.getByRole('heading', { name: 'The report at a glance' }).waitFor({ timeout: 120000 });

  /*
   * 9a′ — THE LANDING PAGE NAMES THE BODIES THAT TURN UP AGAIN (phase 24).
   * Two papers that both name the fixture's bodies, so the panel has rows —
   * and each row is a way into that body's page.
   */
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  const recurringPanel = page.locator('.prt-recurring');
  await recurringPanel.waitFor({ timeout: 20000 });
  if (!(await recurringPanel.locator('a[href^="/bodies/"]').count())) failures.push('landing: "Bodies that turn up again" names no body after two papers that share them');
  if (!(await recurringPanel.locator('.prt-papermarks__mark').count())) failures.push('landing: a recurring body has no strip of papers');
  note('the landing page names the bodies two papers share');

  /*
   * 9a″ — A REPORT LINKS EACH BODY IT NAMES TO ITS PAGE ACROSS POLICIES
   * (phase 24), from "Who is involved", where it has turned up before.
   */
  const secondId = (await page.locator('table a[href^="/assessments/"]', { hasText: 'Walk second paper' }).first().getAttribute('href'))?.split('/')[2];
  await page.goto(`http://127.0.0.1:${PORT}/assessments/${secondId}/who`, { waitUntil: 'networkidle' });
  await page.locator('.prt-view').first().waitFor({ timeout: 30000 });
  const bodyLinks = page.locator('#main-content .prt-bodylink a[href^="/bodies/"]');
  if (!(await bodyLinks.count())) failures.push('report: no body under "Who is involved" links to its page across policies');
  else if (!/seen in 2 policies/.test(await bodyLinks.first().innerText())) failures.push('report: the link to a body\'s page does not say how many policies it was seen in');
  note('a report links its bodies to their pages across policies');

  // THE OLD ADDRESS ANSWERS, and the hub has the service's navigation.
  await page.goto(`http://127.0.0.1:${PORT}/personas`, { waitUntil: 'networkidle' });
  await page.waitForURL((u) => u.pathname === '/bodies', { timeout: 10000 }).catch(() => failures.push('hub: /personas does not redirect to /bodies'));
  await page.getByRole('heading', { name: 'Bodies across policies', level: 1 }).waitFor({ timeout: 20000 });
  const siteNav = page.locator('.govuk-service-navigation:not(.prt-subnav)');
  if ((await siteNav.locator('a[aria-current="page"]').innerText().catch(() => '')).trim() !== 'Bodies across policies') {
    failures.push('hub: the service navigation is missing or does not mark Bodies across policies as the current page');
  }
  for (const label of ['Assessments', 'How to read a report']) {
    if (!(await siteNav.getByRole('link', { name: label, exact: true }).count())) failures.push(`hub: the service navigation has no "${label}"`);
  }
  if (!(await page.locator('.prt-subnav').getByRole('link', { name: 'Clashes', exact: true }).count())) failures.push('hub: the views of the bodies are not offered');
  if (/persona/i.test(await page.locator('#main-content').innerText())) failures.push('hub: the page still says "persona"');
  await audit('/bodies (with bodies)');
  const persona = page.locator('#main-content table a').first();
  if (!(await persona.count())) {
    failures.push('personas: the library lists nothing after two assessments');
  } else {
    const personaName = (await persona.innerText()).trim();
    await persona.click();
    await page.waitForURL('**/bodies/**');
    // The hub's own h1 is still on screen until React swaps, so waiting for
    // "any level-1 heading" returns immediately on the wrong one.
    await page.getByRole('heading', { name: /^What papers ask of it/, level: 2 }).waitFor({ timeout: 20000 });
    const dossierText = await page.locator('#main-content').innerText();
    if (!dossierText.includes(personaName)) failures.push(`personas: the dossier does not name ${personaName}`);
    if (!/seen in 2 policies/.test(dossierText)) failures.push('personas: the dossier does not say it was seen twice');
    // THE THREE BANDS (phase 24), each saying what kind of thing it holds.
    for (const expected of ['What the register says', 'What papers ask of it', 'What public records show', 'Enquiries you commissioned', 'Is this the right record?']) {
      if (!dossierText.includes(expected)) failures.push(`personas: the dossier is missing "${expected}"`);
    }
    // A persona is CONTEXT, NEVER EVIDENCE, and the page has to say so: it is
    // drawn from other papers about other policies, and the one thing it must
    // not read like is a finding about the assessment in front of the reader.
    if (!/context, not evidence/i.test(dossierText)) {
      failures.push('personas: the dossier does not say it is context rather than evidence');
    }
    if ((await page.locator('#main-content a[href*="/assessments/"]').count()) < 2) {
      failures.push('personas: the dossier does not link back to both papers that named it');
    }
    if (!(await page.title()).startsWith(personaName)) failures.push('personas: the tab does not name the body');
    if (!/FACT[\s\S]*CONTEXT[\s\S]*EVIDENCE/.test(dossierText)) failures.push('personas: the bands are not labelled fact, context and evidence, in that order');
    if (!(await page.locator('#main-content a[href*="/who?sel="]').count())) failures.push('personas: a paper does not link to the body on its "Who is involved" page');
    await audit('/bodies/:id');
    note(`dossier opens on "${personaName}", seen in two papers`);

    /*
     * 9b′ — WHO A BODY IS: the four pages a reader rules on identity with.
     *
     * Parameterised routes, so `npm run a11y` cannot reach them; this is the
     * only gate that audits them. The walk splits one paper out into a record
     * of its own and then combines the two again — the round trip leaves the
     * library as it found it for anything later in the walk, and it proves the
     * split, the merge and the rebuild through the real HTTP layer.
     */
    const personaUrl = page.url();
    const personaId = personaUrl.split('/bodies/')[1].split(/[?#/]/)[0];
    // A bookmark from before phase 24 lands on the same body.
    await page.goto(`http://127.0.0.1:${PORT}/personas/${personaId}`, { waitUntil: 'networkidle' });
    await page.waitForURL(`**/bodies/${personaId}`, { timeout: 10000 }).catch(() => failures.push('personas: /personas/:id does not redirect to /bodies/:id'));

    await page.goto(`http://127.0.0.1:${PORT}/bodies/${personaId}/register`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Which public body is this?', level: 1 }).waitFor({ timeout: 20000 });
    await page.getByText(/Nothing on the list matches|Which of these is/).first().waitFor({ timeout: 20000 });
    await audit('/bodies/:id/register');

    await page.goto(`http://127.0.0.1:${PORT}/bodies/${personaId}/merge`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
    await audit('/bodies/:id/merge');

    await page.goto(personaUrl, { waitUntil: 'networkidle' });
    const split = page.getByRole('link', { name: /This paper meant a different body/ }).first();
    if (!(await split.count())) {
      failures.push('personas: a body seen in two papers offers no way to separate one of them');
    } else {
      await split.click();
      await page.getByRole('heading', { name: 'Did this paper mean a different body?', level: 1 }).waitFor({ timeout: 20000 });
      await audit('/bodies/:id/sightings/:observationId');
      await page.getByRole('button', { name: 'Yes, move it to its own record' }).click();
      await page.waitForURL((u) => u.pathname.startsWith('/bodies/') && !u.pathname.includes(personaId), { timeout: 20000 });
      await page.getByRole('heading', { name: /^What papers ask of it/, level: 2 }).waitFor({ timeout: 20000 });
      const splitId = new URL(page.url()).pathname.split('/')[2];
      if (!/seen in 1 policy\b/.test(await page.locator('#main-content').innerText())) failures.push('personas: the separated paper is not a record of its own');

      await page.goto(`http://127.0.0.1:${PORT}/bodies/${personaId}/merge/${splitId}`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Are these the same body?', level: 1 }).waitFor({ timeout: 20000 });
      await audit('/bodies/:id/merge/:other');
      await page.getByLabel(/Yes — combine them into one record/).check();
      await page.getByRole('button', { name: 'Save' }).click();
      await page.waitForURL(`**/bodies/${personaId}`, { timeout: 20000 });
      await page.getByRole('heading', { name: /^What papers ask of it/, level: 2 }).waitFor({ timeout: 20000 });
      if (!/seen in 2 policies/.test(await page.locator('#main-content').innerText())) failures.push('personas: combining the two records again did not bring both papers back');
      note('a paper separated into its own record and combined back, through the pages a reader would use');
    }

    /*
     * 9b″ — A BODY ACROSS PAPERS, AND ITS PUBLIC RECORD (phase 19, workstream X).
     *
     * The fixture paper's "Department" is on no register, so the walk says which
     * GOV.UK body it is — through the API the register page posts to — and then
     * presses "Check again now". The fixture server's public-record sources are
     * the stand-in `build.mjs` swaps in, so this reaches no government API and
     * still drives the store, the route and both new sections for real.
     */
    const linked = await page.evaluate(async (id) => (await fetch(`/api/policy-analysis/personas/${id}/body`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bodyId: 'govuk:department-for-education', verdict: 'same' }),
    })).status, personaId);
    if (linked !== 200) failures.push(`personas: linking a body to the GOV.UK list answered ${linked}`);
    await page.goto(personaUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /^Track record/, level: 3 }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Check again now' }).click();
    await page.getByText(/Found \d+ new documents?\.|Nothing new was found\./).waitFor({ timeout: 20000 });
    const intelText = await page.locator('#main-content').innerText();
    for (const expected of ['It is part of', 'What papers ask of it', 'What it says about its money and staff', '(fixture record)']) {
      if (!intelText.includes(expected)) failures.push(`personas: the body's page is missing "${expected}"`);
    }
    if (!/these are evidence/i.test(intelText)) failures.push('personas: the public record does not say it is evidence, unlike the rest of the page');
    await audit('/bodies/:id (across papers and public record)');

    await page.goto(`http://127.0.0.1:${PORT}/bodies/across`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Across papers', level: 2 }).waitFor({ timeout: 20000 });
    await page.locator('#main-content table').first().waitFor({ timeout: 20000 });
    const gridText = await page.locator('#main-content').innerText();
    if (!gridText.includes('Department for Education')) failures.push('bodies: the grid does not list the body the walk matched');
    if (/Same body, different asks/.test(gridText)) failures.push('bodies: the grid still repeats its own Papers column as a list');
    await audit('/bodies/across (with bodies)');
    for (const [path, heading] of [['/bodies/clashes', 'Clashes'], ['/bodies/groups', 'Groups of people']]) {
      await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: heading, level: 2 }).waitFor({ timeout: 20000 });
      await audit(`${path} (with bodies)`);
    }
    note('a body matched to GOV.UK shows what each paper asks of it, a dated public record, and a row in the bodies × papers grid');
  }

  // 9c — THE ADMIN PANEL, and the lock on it.
  //
  // This is the only authentication in the service and the only page holding
  // credentials, so the assertions are about what must NOT get through. Note
  // what is not tested here because it must not exist: an address check. Behind
  // a tunnel every request arrives from 127.0.0.1, so a gate on the client
  // address passes for the whole internet.
  const locked = await page.evaluate(async () => {
    const out = {};
    for (const [name, path, method] of [
      ['config', '/api/admin/config', 'GET'],
      ['save', '/api/admin/config/openrouter', 'POST'],
      ['active', '/api/admin/active', 'POST'],
      ['test', '/api/admin/test', 'POST'],
    ]) {
      const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      out[name] = res.status;
    }
    return out;
  });
  for (const [name, status] of Object.entries(locked)) {
    if (status !== 401) failures.push(`admin: ${name} answered ${status} without a session, expected 401`);
  }
  note('the admin API refuses everything without a session');

  await page.goto(`http://127.0.0.1:${PORT}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Configuration', level: 1 }).waitFor({ timeout: 20000 });
  if (!(await page.getByLabel('Admin password').count())) failures.push('admin: no password form');
  // A wrong password must not sign anyone in, and must say nothing useful.
  await page.getByLabel('Admin password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').waitFor({ timeout: 10000 });
  if (!/not the password/i.test(await page.getByRole('alert').innerText())) {
    failures.push('admin: a wrong password did not say so');
  }
  if (await page.getByRole('heading', { name: 'Which service answers' }).count()) {
    failures.push('admin: a wrong password got in');
  }

  await page.getByLabel('Admin password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Which service answers' }).waitFor({ timeout: 20000 });
  const panel = await page.locator('#main-content').innerText();
  for (const name of ['OpenRouter', 'Azure AI Foundry', 'Codex bridge']) {
    if (!panel.includes(name)) failures.push(`admin: ${name} is not offered`);
  }
  await audit('/admin (signed in)');

  // A SECRET GOES IN AND DOES NOT COME OUT. This is the assertion the whole
  // page is shaped around: the server reports whether one is set, never what.
  const secret = 'sk-or-walk-secret-value-9f2b';
  await page.locator('#openrouter-apiKey').fill(secret);
  await page.getByRole('button', { name: 'Save OpenRouter' }).click();
  await page.waitForTimeout(600);
  const readBack = await page.evaluate(async () => JSON.stringify(await (await fetch('/api/admin/config')).json()));
  if (readBack.includes(secret)) failures.push('admin: the saved key comes back out of the config endpoint');
  if (!/"apiKey":true/.test(readBack)) failures.push('admin: the panel cannot tell that a key is stored');
  if ((await page.locator('#openrouter-apiKey').inputValue()) !== '') {
    failures.push('admin: the secret box is pre-filled, so blank cannot mean "leave it alone"');
  }

  /*
   * AZURE ASKS HOW TO AUTHENTICATE BEFORE IT ASKS FOR ANYTHING ELSE.
   *
   * A tenant with local authentication switched off has no key to type, which
   * until phase 18 meant the service could not be configured at all. Four modes
   * now share one form and `showWhen` reveals only what the chosen one needs —
   * eight fields of which a reader fills in one to three.
   *
   * This is browser behaviour and there is no jsdom in this repo, so the walk is
   * the only thing that can see it. Without this assertion the conditional
   * rendering could break and every gate would stay green.
   */
  const azureMode = page.locator('#azure-authMode');
  if (!(await azureMode.count())) {
    failures.push('admin: Azure does not ask how to authenticate');
  } else {
    if (await page.locator('#azure-clientSecret').count()) {
      failures.push('admin: a client secret is shown while the mode is an API key');
    }
    await azureMode.selectOption('entra-app');
    await page.waitForTimeout(200);
    for (const field of ['tenantId', 'clientId', 'clientSecret']) {
      if (!(await page.locator(`#azure-${field}`).count())) {
        failures.push(`admin: choosing an app registration does not reveal ${field}`);
      }
    }
    if (await page.locator('#azure-apiKey').count()) {
      failures.push('admin: the API key box stays on screen for an Entra configuration');
    }
    // Managed identity is the one that needs nothing, and a form still asking
    // for a tenant would be a form the reader cannot finish.
    await azureMode.selectOption('managed-identity');
    await page.waitForTimeout(200);
    if (await page.locator('#azure-tenantId').count()) {
      failures.push('admin: a managed identity is asked for a tenant it does not need');
    }
    await azureMode.selectOption('key');
    await page.waitForTimeout(200);
    if (!(await page.locator('#azure-apiKey').count())) {
      failures.push('admin: going back to key authentication does not bring the key box back');
    }
  }
  note('Azure asks how to authenticate, and shows only what that answer needs');

  // And a fixture build must not be able to reach anything, however configured.
  const tested = await page.evaluate(async () => (await (await fetch('/api/admin/test', { method: 'POST' })).json()));
  if (tested.ok) failures.push('admin: the FIXTURE build reported a working provider, which it cannot have');
  if (!/fixture/i.test(tested.message ?? '')) {
    failures.push(`admin: the fixture build's failure does not say why — ${tested.message}`);
  }

  // ── The model menu ───────────────────────────────────────────────────────
  //
  // The catalogue is INVENTORY and the menu is a DECISION, and the failure this
  // guards is the two being confused: a picker that offers everything a provider
  // sells is a picker nobody can use, and a menu that silently loses a choice
  // when the search narrows is worse than no search at all.
  const menuBefore = await page.evaluate(async () =>
    (await (await fetch('/api/admin/config')).json()).menu.map((m) => m.id));
  if (menuBefore.length !== 5) {
    failures.push(`admin: expected the five built-in models before anything is chosen, got ${menuBefore.length}`);
  }

  await page.getByRole('button', { name: /^Browse what/ }).click();
  await page.getByLabel('Search the catalogue').waitFor({ timeout: 10000 });

  // With the box empty, only what is already chosen is listed — otherwise this
  // is a wall of checkboxes rather than a control.
  const boxes = 'section[aria-labelledby="admin-models"] .govuk-checkboxes__item';
  const emptyQuery = await page.locator(boxes).count();
  if (emptyQuery > menuBefore.length) {
    failures.push(`admin: an empty search listed ${emptyQuery} models, which is a wall not a menu`);
  }

  await page.getByLabel('Search the catalogue').fill('flash-latest');
  await page.waitForTimeout(250);
  const floating = page.locator('input[value="~deepseek/deepseek-flash-latest"]');
  if (!(await floating.count())) {
    failures.push('admin: searching for flash-latest does not find the floating alias');
  } else {
    // A floating id is a different KIND of choice and the panel has to say so:
    // the model behind it changes without the id changing, so two assessments a
    // month apart are not comparable though the provenance names the same thing.
    const hint = await page.locator(boxes, { has: floating }).innerText();
    if (!/redirects to whatever is newest/i.test(hint)) {
      failures.push('admin: a floating alias is offered without saying what floating means');
    }
    await floating.check();
  }

  // Narrowing the search must not drop it. This is the trap `Checkboxes` was
  // fixed for, and the fix only stays fixed if something keeps checking.
  await page.getByLabel('Search the catalogue').fill('claude');
  await page.waitForTimeout(250);
  if (await page.locator('input[value="~deepseek/deepseek-flash-latest"]').count()) {
    failures.push('admin: the search did not actually narrow');
  }
  await page.getByRole('button', { name: 'Save the menu' }).click();
  await page.waitForTimeout(600);

  const menuAfter = await page.evaluate(async () =>
    (await (await fetch('/api/admin/config')).json()).menu);
  if (!menuAfter.some((m) => m.id === '~deepseek/deepseek-flash-latest')) {
    failures.push('admin: a model ticked and then filtered out of view was lost on save');
  }
  if (menuAfter.length !== menuBefore.length + 1) {
    failures.push(`admin: saving the menu changed it to ${menuAfter.length}, expected ${menuBefore.length + 1}`);
  }

  // The submit form is the only reason this menu exists, so ask it, not the
  // panel that just wrote it.
  const offered = await page.evaluate(async () =>
    (await (await fetch('/api/policy-analysis')).json()).models.map((m) => m.id));
  if (!offered.includes('~deepseek/deepseek-flash-latest')) {
    failures.push('admin: the chosen model never reached the assessment picker');
  }

  // And the reset puts the build's own five back rather than emptying it.
  await page.getByRole('button', { name: /^Reset to the built-in/ }).click();
  await page.waitForTimeout(600);
  const menuReset = await page.evaluate(async () =>
    (await (await fetch('/api/admin/config')).json()));
  if (menuReset.menu.length !== menuBefore.length || menuReset.menuChosen) {
    failures.push(`admin: reset left ${menuReset.menu.length} models, chosen=${menuReset.menuChosen}`);
  }
  note('the model menu is chosen from the catalogue, and survives the search');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Admin password').waitFor({ timeout: 10000 });
  const after = await page.evaluate(async () => (await fetch('/api/admin/config')).status);
  if (after !== 401) failures.push(`admin: still signed in after signing out (${after})`);
  note('the panel signs in, hides its secrets, and signs out');

  /*
   * 9b — THE SETUP JOURNEY.
   *
   * The task list's statuses are the SERVER's, derived from what the install
   * actually holds, so this is really a test of that derivation: the one status
   * that cannot be derived — has a model actually answered — must not read
   * "done" on a fixture build, whose provider throws by design.
   *
   * It also asserts the thing a wizard is for: that it survives being left. The
   * journey has no state of its own, so a reader who closes the tab half way
   * through and comes back finds the same list saying the same things.
   */
  // SIGNED OUT, FIRST. The journey handles credentials, so it is behind the
  // same password the panel is — and a reader who arrives without a session
  // must be told that rather than watching a spinner that never resolves.
  await page.goto(`http://127.0.0.1:${PORT}/setup`, { waitUntil: 'networkidle' });
  if (!(await page.getByRole('heading', { name: 'Sign in to set this up', level: 1 }).isVisible())) {
    failures.push('setup: opening it without a session does not say to sign in');
  }
  await audit('/setup (signed out)');

  await page.goto(`http://127.0.0.1:${PORT}/admin`, { waitUntil: 'networkidle' });
  await page.getByLabel('Admin password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Which service answers' }).waitFor({ timeout: 20000 });

  await page.goto(`http://127.0.0.1:${PORT}/setup`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Get this service working', level: 1 }).waitFor({ timeout: 20000 });
  const tasks = page.locator('.govuk-task-list__item');
  if ((await tasks.count()) < 5) failures.push(`setup: only ${await tasks.count()} tasks in the list`);
  const listText = await page.locator('#main-content').innerText();
  if (!/Try the connection/.test(listText)) failures.push('setup: the task list does not include the connection test');
  // A FIXTURE BUILD CANNOT HAVE REACHED A MODEL, so this must not say done.
  const testRow = page.locator('.govuk-task-list__item', { hasText: 'Try the connection' });
  if (!/To do/.test(await testRow.innerText())) {
    failures.push(`setup: the fixture build claims it has reached a model — ${await testRow.innerText()}`);
  }
  await audit('/setup');

  // One thing per page, and each step is reachable from the list.
  for (const [href, heading] of [
    ['/setup/service', 'Which service answers'],
    ['/setup/access', 'Who can reach it'],
    ['/setup/spend', 'What one run may spend'],
    ['/setup/egress', 'What this needs to reach'],
    ['/setup/test', 'Try the connection'],
  ]) {
    await page.goto(`http://127.0.0.1:${PORT}${href}`, { waitUntil: 'networkidle' });
    if (!(await page.getByRole('heading', { name: heading, level: 1 }).isVisible())) {
      failures.push(`setup: ${href} has no "${heading}" heading`);
    }
    await audit(href);
  }

  // The egress list comes from the providers themselves, so a firewall change
  // can be written from one place.
  await page.goto(`http://127.0.0.1:${PORT}/setup/egress`, { waitUntil: 'networkidle' });
  // NOT a specific hostname: this is the FIXTURE registry, whose whole point is
  // that no real provider endpoint survives into the bundle — `build.mjs`
  // asserts it. What is checked is that the list is assembled from the
  // definitions at all, and that the "what it does not do" half is there, since
  // that is the half a network team actually argues about.
  const egressRows = await page.locator('#main-content table tbody tr').count();
  if (egressRows < 1) failures.push('setup: the egress list has no rows');
  const egress = await page.locator('#main-content').innerText();
  if (!/no telemetry/i.test(egress)) failures.push('setup: the egress page does not say what it does NOT do');

  // And the test step tells the truth about a build that cannot reach anything.
  await page.goto(`http://127.0.0.1:${PORT}/setup/test`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.waitForTimeout(1200);
  const outcome = await page.locator('#setup-test').innerText();
  if (!/did not answer/i.test(outcome)) {
    failures.push(`setup: the fixture build's connection test did not report a failure — "${outcome}"`);
  }
  if (!/fixture/i.test(outcome)) {
    failures.push(`setup: the failure does not say why — "${outcome}"`);
  }
  note('the setup journey lists what is left, and the test step tells the truth');

  // 10 — the rest of the surface
  for (const [route, heading] of [['/bodies', 'Bodies across policies'], ['/guide', 'How to read a report'], ['/design', 'Design system'], ['/accessibility', 'Accessibility statement'], ['/about', 'About this tool']]) {
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle' });
    if (!(await page.getByRole('heading', { name: heading, level: 1 }).waitFor({ timeout: 10000 }).then(() => true, () => false))) failures.push(`${route}: no "${heading}" heading`);
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
