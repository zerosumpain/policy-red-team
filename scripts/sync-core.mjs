/**
 * The fork's copy mechanism.
 *
 * `docs/plan.md` chose a hard fork: the framework-free core is copied into this
 * repository rather than shared as a package, so a pipeline fix upstream has to
 * be applied twice. The risk that creates is silent drift — nobody can tell, six
 * months from now, which of these files still matches upstream and which was
 * edited here on purpose.
 *
 * So the copy is not a one-off `cp`. `docs/upstream.json` names every verbatim
 * file and the commit it came from, this script reproduces the copy, and
 * `--check` reports drift in three buckets: files that changed upstream, files
 * edited here, and files that have gone from upstream altogether.
 *
 *   node scripts/sync-core.mjs --check    what has drifted, changes nothing
 *   node scripts/sync-core.mjs            re-copy every verbatim file
 *   node scripts/sync-core.mjs --commit <sha>   re-copy and record a new baseline
 *
 * The upstream checkout defaults to ~/sr-policy-analysis and can be pointed
 * elsewhere with UPSTREAM=/path.
 */
import { readFile, writeFile, mkdir, cp, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const UPSTREAM = process.env.UPSTREAM ?? path.join(path.dirname(ROOT), 'sr-policy-analysis');
const MANIFEST = path.join(ROOT, 'docs', 'upstream.json');

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

/** Expands a manifest entry — a file, or a directory with an exclude list — into
 *  concrete relative paths. */
async function expand(entry) {
  const rel = typeof entry === 'string' ? entry : entry.path;
  const exclude = new Set(typeof entry === 'string' ? [] : (entry.exclude ?? []));
  const abs = path.join(UPSTREAM, rel);
  const s = await stat(abs).catch(() => null);
  if (!s) return { missing: [rel], files: [] };
  if (s.isFile()) return { missing: [], files: [rel] };
  const names = await readdir(abs, { recursive: true, withFileTypes: true });
  const files = [];
  for (const d of names) {
    if (!d.isFile()) continue;
    const child = path.join(path.relative(UPSTREAM, d.parentPath ?? d.path), d.name);
    // Exclusions are written relative to the ENTRY, which is how anyone reading
    // the manifest would expect them to read: "server/access.ts" under the entry
    // "src/lib/policy-analysis". Comparing against the repo-relative path made
    // every nested exclusion silently miss.
    const within = path.relative(rel, child);
    if (exclude.has(within) || exclude.has(path.basename(child))) continue;
    files.push(child);
  }
  return { missing: [], files: files.sort() };
}

async function resolveAll(manifest) {
  const files = [];
  const missing = [];
  for (const entry of manifest.verbatim) {
    const r = await expand(entry);
    files.push(...r.files);
    missing.push(...r.missing);
  }
  return { files, missing };
}

/**
 * The deliberate edits to otherwise-verbatim files, keyed by path. Each must be
 * described in `docs/upstream.json`'s `divergences` and must actually change
 * something, so an upstream rewrite that makes one a no-op fails the sync
 * instead of passing quietly.
 */
const DIVERGENCES = {
  // parseSubject is pure and lives in peek.ts here; the rest of upstream's
  // peek.svelte.ts is a Svelte rune store that phase 4 replaces.
  'src/lib/policy-analysis/dashboard-shaping.test.ts': (s) =>
    s.replace("from './peek.svelte'", "from './peek'"),
  // The commissioned-model case asserts against CODEX_MODELS, which is empty
  // here. Skipped with its reasoning, not rewritten. Phase 4 restores it.
  'src/lib/policy-analysis/pipeline.test.ts': (s) =>
    s.replace(
      "  it('takes a commissioned model and thinking level, and degrades rather than refusing'",
      `  // SKIPPED IN THIS BUILD: server/ingest.ts accepts a commissioned model only
  // if it is in CODEX_MODELS, and a standalone install has no Codex bridge, so
  // that catalogue is empty and nothing can be commissioned. The pipeline is
  // behaving as designed; the per-assessment model picker is inert until phase 4
  // re-points it at OpenRouter. See docs/phase-1.md.
  it.skip('takes a commissioned model and thinking level, and degrades rather than refusing'`
    ),
};

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const mode = process.argv.includes('--check') ? 'check' : 'sync';
const commitFlag = process.argv.indexOf('--commit');
const { files, missing } = await resolveAll(manifest);

if (missing.length) {
  console.log('gone from upstream (manifest is stale):');
  for (const m of missing) console.log('  ', m);
}

const changedUpstream = [];
const editedHere = [];
const absent = [];
let identical = 0;
let expected = 0;

for (const rel of files) {
  const up = await readFile(path.join(UPSTREAM, rel)).catch(() => null);
  const here = await readFile(path.join(ROOT, rel)).catch(() => null);
  const baseline = manifest.hashes?.[rel];
  if (!up) { absent.push(rel); continue; }
  if (!here) { changedUpstream.push(rel); continue; }
  if (hash(up) === hash(here)) { identical++; continue; }
  // Both exist and differ. The baseline hash says which side moved.
  // A divergence recorded in the manifest is expected to differ — flagging it
  // would make --check fail forever and so tell nobody anything.
  if (manifest.divergences?.[rel]) { expected++; continue; }
  if (baseline && hash(here) === baseline) changedUpstream.push(rel);
  else if (baseline && hash(up) === baseline) editedHere.push(rel);
  else changedUpstream.push(rel);
}

if (mode === 'check') {
  console.log(
    `\n${files.length} verbatim files, ${identical} identical to upstream` +
      (expected ? `, ${expected} diverging as recorded` : '')
  );
  const report = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label} (${list.length}):`);
    for (const f of list) console.log('  ', f);
  };
  report('changed upstream — re-copy with `node scripts/sync-core.mjs`', changedUpstream);
  report('edited here — a deliberate divergence, or a mistake', editedHere);
  report('not copied yet', absent);
  process.exit(changedUpstream.length || editedHere.length ? 1 : 0);
}

const hashes = {};
for (const rel of files) {
  const from = path.join(UPSTREAM, rel);
  const to = path.join(ROOT, rel);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
  hashes[rel] = hash(await readFile(from));
}
// Re-apply the recorded divergences. A copy that silently reverted them would
// make `docs/upstream.json` a description of something that is not true five
// seconds after it is written.
for (const [rel, note] of Object.entries(manifest.divergences ?? {})) {
  const edit = DIVERGENCES[rel];
  if (!edit) throw new Error(`docs/upstream.json records a divergence for ${rel} with no matching edit in sync-core.mjs`);
  const file = path.join(ROOT, rel);
  const before = await readFile(file, 'utf8');
  const after = edit(before);
  if (after === before) throw new Error(`divergence for ${rel} did not apply — upstream may have changed it: ${note}`);
  await writeFile(file, after);
  console.log(`  re-applied divergence: ${rel}`);
}

manifest.hashes = hashes;
manifest.copiedAt = new Date().toISOString().slice(0, 10);
if (commitFlag !== -1) manifest.commit = process.argv[commitFlag + 1];
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`copied ${files.length} files from ${UPSTREAM} @ ${manifest.commit}`);
