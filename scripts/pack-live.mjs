/**
 * THE PACK, BUILT FROM THIS WORKING TREE, CARRYING A REAL ASSESSMENT.
 *
 *   node scripts/pack-live.mjs --base https://your-host [--id <uuid>]
 *
 * `npm run offline` is the gate and it runs against the fixture, which is right:
 * a gate must not need a network or somebody else's data. But the fixture is a
 * small synthetic run, and the pack it produces has nine controls where a real
 * one has thirty-seven. The control that threw
 * `ReferenceError: Cannot access '_e' before initialization` in every pack this
 * service had ever handed out was one of the twenty-eight the fixture does not
 * reach, so the gate passed for as long as the defect existed.
 *
 * This is the other half: download a pack from a running service, splice in the
 * bundle THIS tree just built, and open it from `file://` the way a reader does
 * — with the network blocked, pressing every control. It is not a gate (it needs
 * a service and real data) and it is not a substitute for one. It is the thing to
 * run before shipping a change that touches the report, because the pack is a
 * second bundle of the same components and the two do not always agree.
 *
 * The pack is a SKELETON around a JSON island: one `<style>` for the compiled
 * stylesheet and one trailing `<script>` for the bundle. Swapping those two is
 * enough to re-render somebody's real assessment with local code, and the island
 * — which is the part that takes a minute to fetch — is left exactly as it came.
 */
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
/*
 * NO DEFAULT HOST. This used to default to the author's own deployment, so
 * running it with no arguments fetched HIS assessment — fine on his machine and
 * meaningless to anybody else, which is the kind of thing that stops a
 * repository being usable by a stranger without anybody noticing.
 */
const BASE = arg('base', process.env.POLICY_BASE_URL ?? '');
if (!BASE) {
  console.error('Say which install to fetch from: --base https://your-host (or POLICY_BASE_URL).');
  process.exit(2);
}
const ID = arg('id', '36ebca37-7369-4a40-a23c-7fceb4d5cc2e');

const failures = [];
const note = (m) => console.log(`  ${m}`);

const work = await mkdtemp(path.join(tmpdir(), 'pack-live-'));
try {
  const bundle = path.join(ROOT, 'static', 'policy-offline');
  const [js, css] = await Promise.all([
    readFile(path.join(bundle, 'app.js'), 'utf8'),
    readFile(path.join(bundle, 'app.css'), 'utf8'),
  ]).catch(() => {
    throw new Error('no bundle in static/policy-offline — run `npm run build:offline` first');
  });
  note(`local bundle: ${(js.length / 1e3).toFixed(0)}kB of script, ${(css.length / 1e3).toFixed(0)}kB of style`);

  const url = `${BASE}/api/policy-analysis/${ID}/export?format=bundle`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const zip = Buffer.from(await response.arrayBuffer());
  const archive = path.join(work, 'pack.zip');
  await writeFile(archive, zip);
  const { execFileSync } = await import('node:child_process');
  execFileSync('unzip', ['-o', '-q', archive, '-d', work]);
  const { readdir } = await import('node:fs/promises');
  const folders = (await readdir(work, { withFileTypes: true })).filter((e) => e.isDirectory());
  const packDir = path.join(work, folders[0].name);
  note(`pack from ${BASE}: ${(zip.length / 1e6).toFixed(2)}MB`);

  /*
   * The SECOND `<style>` is the compiled stylesheet (the first is the tiny reset
   * the skeleton writes) and the LAST bare `<script>` is the bundle — the ones
   * before it carry the payload island, which is typed `application/json` and
   * therefore never matches `<script>` with no attributes.
   */
  const source = path.join(packDir, 'index.html');
  const html = await readFile(source, 'utf8');
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (styles.length < 2 || !scripts.length) {
    throw new Error(`the pack skeleton has changed: ${styles.length} plain styles, ${scripts.length} plain scripts`);
  }
  const style = styles[1];
  const script = scripts[scripts.length - 1];
  let out = html;
  out = out.slice(0, script.index) + '<script>' + js + '</script>' + out.slice(script.index + script[0].length);
  out = out.slice(0, style.index) + '<style>' + css + '</style>' + out.slice(style.index + style[0].length);
  const local = path.join(packDir, 'local.html');
  await writeFile(local, out);
  note(`repacked with local code: ${(out.length / 1e6).toFixed(2)}MB`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const attempted = [];
  // The same blockade the gate uses: a pack that reaches the network is broken
  // whatever it renders.
  await page.route('**/*', (route) => {
    const target = route.request().url();
    if (!target.startsWith('file://') && !target.startsWith('data:')) attempted.push(target);
    return target.startsWith('file://') || target.startsWith('data:') ? route.continue() : route.abort();
  });
  page.on('pageerror', (err) => failures.push(`page error: ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`console error: ${m.text()}`); });

  await page.goto(`file://${local}`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const stats = await page.evaluate(() => ({
    words: (document.body.innerText || '').trim().split(/\s+/).length,
    height: document.documentElement.scrollHeight,
    sections: document.querySelectorAll('#main-content h2').length,
  }));
  note(`${stats.words.toLocaleString()} words, ${stats.sections} sections, ${stats.height.toLocaleString()}px`);

  const controls = await page.locator('button').all();
  let pressed = 0;
  for (const control of controls) {
    const label = (await control.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 40);
    const before = failures.length;
    try { await control.click({ timeout: 2000, force: true }); pressed += 1; } catch { /* unreachable is not a defect */ }
    await page.waitForTimeout(80);
    if (failures.length > before) note(`↑ thrown by "${label || '(no label)'}"`);
  }
  note(`pressed ${pressed} of ${controls.length} controls`);

  if (attempted.length) failures.push(`the pack tried to reach the network: ${[...new Set(attempted)].slice(0, 5).join(', ')}`);
  else note('no request left the page');

  await browser.close();
} catch (err) {
  failures.push(`pack-live stopped: ${err.message}`);
} finally {
  await rm(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error('\nFAILED');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('\nPASSED — a real assessment renders and drives from file:// on local code');
