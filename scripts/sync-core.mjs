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
  // ── The exposure ramp had no values, so every mark painted black ─────────
  //
  // `BAND_FILL` is `var(--accent)` and three `color-mix()` steps off it, and
  // NEITHER custom property is defined anywhere in this build — `app.scss`
  // declares none and there is no tokens file. It is consumed in exactly one
  // place, `ExposurePlot.tsx`, so the `fill` was invalid and every circle fell
  // back to black: the band encoding on that plot did nothing at all, and had
  // done nothing since phase 8.
  //
  // The four values come from the phase 14 prototype and clear the system's own
  // floor: ΔE 15 against the accent, and 16.2 between adjacent steps under
  // protanopia, deuteranopia and tritanopia alike. `--error` was the obvious
  // pick for `severe` and scores 6.8, below the floor; teal reaches 10.2; a warm
  // ramp puts its middle step 8.8 from the error red, which in a product where
  // red means FAILED is the worse collision. Magenta is the one unused hue that
  // clears both, at 16.0.
  //
  // It holds on one condition worth writing down: NO STATUS COLOUR EVER ENTERS A
  // PLOT FRAME. Status is a worded tag outside the drawing; the ramp owns the
  // inside of it.
  //
  // A divergence rather than a hand edit because `view.ts` is copied, and an
  // edit to a copied file is silently reverted by the next sync. If upstream
  // ever gives these properties real values, this `.replace()` stops matching
  // and throws — which is the point.
  // ── The prompt cache reached three more fan-outs ─────────────────────────
  //
  // `orderedContext` exists because a prompt cache matches an exact leading
  // PREFIX, and it was wired into three of the nine fan-out sites. Measured on
  // the live run (36ebca37, 419 calls, 61.3M tokens): the wired stages cached
  // 67.5% and 85.1% of their input; the four that skip it cached 225,792 of
  // 10,116,528 — 2.2% — leaving 9.89M uncached input tokens, 42% of the run's
  // whole uncached input. Stage 7 read 3,584 of 2,373,405 from cache, stage 9
  // 1,792 of 1,899,464, stage 10 10,752 of 4,374,911, stage 16 209,664 of
  // 1,468,748.
  //
  // The two causes are the ones the function's own comment names. Stages 7, 9
  // and 16 hand every call an IDENTICAL context that is over `FIT_LIMIT`, so
  // `provider.ts` shed ~372,000 characters per call independently and landed
  // somewhere slightly different each time. Stage 10 orders shared-first already
  // and then defeats itself with a `protect` set naming the actor being written
  // about — exactly the failure stage 14 was rewritten to fix.
  //
  // THE FIX IS UPSTREAM'S OWN, APPLIED FOUR MORE TIMES. Stage 10 takes stage
  // 14's shape: the subject comes out of the shared block and goes in as the
  // call's own, where it is appended after the shared bytes and never shed. The
  // three whose context is entirely shared have nowhere to put their essentials,
  // so `orderedContext` gains an optional `protect` — and the distinction that
  // makes that safe is the one the original comment draws: a set that is
  // IDENTICAL on every call is one decision taken once, while a set that varies
  // per call is what moved the boundary 122 times across 144 calls.
  //
  // Concurrency bounds the prize: with six lanes the first batch can never hit,
  // so this recovers roughly half of the 9.89M rather than all of it.
  //
  // A divergence rather than a hand edit because `pipeline.ts` is copied. If
  // upstream wires these itself, or moves any of the four, a `.replace()` here
  // stops matching and the sync throws instead of quietly dropping the fix.
  'src/lib/policy-analysis/pipeline.ts': (s) => {
    let out = s.replace(
      '  const orderedContext = (shared: Artefact[], own: Artefact[], key: string, owns: Artefact[][]): Artefact[] => {',
      '  const orderedContext = (shared: Artefact[], own: Artefact[], key: string, owns: Artefact[][], protect: Set<string> = new Set()): Artefact[] => {',
    );
    out = out.replace(
      `      // \`protect\` is deliberately EMPTY. What a call is for lives in \`own\`,
      // which is appended after this block and never shed by it — so nothing a
      // call depends on can be lost to a decision taken once for every call.
      const result = fitToBudget(shared, (artefacts) => ({ artefacts }), FIT_LIMIT - allowance, new Set());`,
      `      // \`protect\` DEFAULTS TO EMPTY: what a call is for lives in \`own\`, which is
      // appended after this block and never shed by it. A fan-out whose context
      // is ENTIRELY shared has nowhere else to put its essentials, so it may pass
      // a set — one that is identical on every call, which is a single decision
      // and cannot move the shedding boundary between calls the way a per-call
      // set does. See the divergence note in scripts/sync-core.mjs.
      const result = fitToBudget(shared, (artefacts) => ({ artefacts }), FIT_LIMIT - allowance, protect);`,
    );
    // Stages 7 and 9 — interaction patterns and scenarios.
    out = out.replace(
      "    await fanOut((stage === 7 ? PATTERNS : SCENARIOS).map((key) => ({ key, context, describe:",
      `    // ONE FIT FOR THE WHOLE FAN-OUT: every call here is handed the identical
    // context, and both stages cached 0.2% without it. See sync-core.mjs.
    await fanOut((stage === 7 ? PATTERNS : SCENARIOS).map((key) => ({ key, context: orderedContext(context, [], stage === 7 ? 'patterns' : 'scenarios', [[]], new Set(hypotheses)), describe:`,
    );
    // Stage 10 — the exploitation fan-out, given stage 14's shape.
    out = out.replace(
      `    await fanOut(ranked.slice(0, limits.actors).map((actor) => ({
      key: actor.id,
      context: [...base, ...profiles.filter((p) => p.data.actorId === actor.id)],`,
      `    // STAGE 14'S SHAPE: the actor and its profiles come OUT of the shared block
    // and go in as this call's own, so a per-call \`protect\` can no longer move
    // the shedding boundary. See sync-core.mjs.
    const chosen = ranked.slice(0, limits.actors);
    const playOwns = chosen.map((actor) => [
      ...base.filter((a) => a.id === actor.id),
      ...profiles.filter((p) => p.data.actorId === actor.id),
    ]);
    await fanOut(chosen.map((actor, i) => ({
      key: actor.id,
      context: orderedContext(base.filter((a) => a.id !== actor.id), playOwns[i], 'plays', playOwns, new Set(hypotheses)),`,
    );
    // Stage 16 — the assurance challenges.
    out = out.replace(
      `    await fanOut(ASSURANCE_CATEGORIES.map((category) => ({
      key: category,
      context,
      describe: \`\${category.replaceAll('_', ' ')} challenge\`,
      extra: { targetCategory: category, protect: [...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses] },`,
      `    // The report itself, which every challenge must see whatever its remit, and
    // which is the same list for all seven — so it is protected once in the
    // shared fit rather than seven times at the boundary. See sync-core.mjs.
    const assured = [...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses];
    await fanOut(ASSURANCE_CATEGORIES.map((category) => ({
      key: category,
      context: orderedContext(context, [], 'assurance', [[]], new Set(assured)),
      describe: \`\${category.replaceAll('_', ' ')} challenge\`,
      extra: { targetCategory: category, protect: assured },`,
    );
    if (out === s) throw new Error('pipeline.ts: the fan-out sites moved');
    return out;
  },

  'src/lib/policy-analysis/view.ts': (source) =>
    source.replace(
      `export const BAND_FILL: Record<Band, string> = {
  severe: 'var(--accent)',
  significant: 'color-mix(in oklab, var(--accent) 60%, var(--bg))',
  moderate: 'color-mix(in oklab, var(--accent) 32%, var(--bg))',
  limited: 'color-mix(in oklab, var(--accent) 15%, var(--bg))',
};`,
      `export const BAND_FILL: Record<Band, string> = {
  severe: '#55163a',
  significant: '#ac2f6e',
  moderate: '#d48cb0',
  limited: '#f0d5e3',
};

/**
 * Ink that stays legible on each step. The two light steps sit below 3:1
 * against the page, so they never carry meaning alone — every mark is outlined
 * in \`text\`, sized by band, and captioned with the band's word.
 */
export const BAND_INK: Record<Band, string> = {
  severe: '#ffffff',
  significant: '#ffffff',
  moderate: '#4a1230',
  limited: '#4a1230',
};`,
    ),

  // ── Research without a Tavily account ────────────────────────────────────
  //
  // `research.ts` imports its search engine directly, so an install with no
  // `TAVILY_API_KEY` plans its research questions and answers NONE of them.
  // Measured on 2026-09-19: twelve questions, zero sources, and twelve
  // "Research unavailable … authority, freshness and jurisdiction remain
  // unverified" warnings carried forward into every stage that would have cited
  // external evidence.
  //
  // The Codex bridge has served `/v1/grounded/chat/completions` throughout — the
  // same call with web search on, against the subscription already being paid
  // for. So this fork routes `search`/`extract` through its own module, which
  // prefers Tavily wherever a key exists and falls back to the active provider's
  // grounded client otherwise.
  //
  // ONE LINE, DELIBERATELY. Everything decided lives in fork-written code
  // (`$lib/server/web-search`), which keeps the substitution trivial to
  // re-apply and means an upstream change to the research STAGE does not
  // collide with our choice of search ENGINE.
  // Upstream's own test mocks the module `research.ts` imports. Change that
  // import and the mock stops intercepting, so all eight retrieval tests call a
  // real search. Same one-line substitution, applied to the test, so upstream's
  // assertions keep running against the fork's wiring rather than being skipped:
  // they are the tests that prove instant-then-advanced escalation, bounded full
  // reads and the refusal of unsafe links, and none of that changed.
  'src/lib/policy-analysis/research.test.ts': (source) =>
    source
      .replace(
        "vi.mock('$lib/deepdive/tavily', () => ({ search: vi.fn(), extract: vi.fn() }));",
        "vi.mock('$lib/server/web-search', () => ({ search: vi.fn(), extract: vi.fn() }));",
      )
      .replace(
        "import { search, extract } from '$lib/deepdive/tavily';",
        "import { search, extract } from '$lib/server/web-search';",
      ),

  'src/lib/policy-analysis/server/research.ts': (source) =>
    source.replace(
      "import { search, extract } from '$lib/deepdive/tavily';",
      "import { search, extract } from '$lib/server/web-search';",
    ),

  // ── The redactor, and an upstream leak ───────────────────────────────────
  //
  // TWO UPSTREAM BUGS, both found by a security review of this fork's share UI
  // on 2026-09-19 and both worth reporting back.
  //
  // FIRST: `persona_link` is not withheld. Stage 13 mints those artefacts and
  // their `data` carries the MERGED standing dossier — `traits` updated from
  // priors, `continuity` ("what this assessment adds to what was already held")
  // and `divergence` ("where this policy's evidence CONTRADICTS the standing
  // dossier"). Those priors come from the owner's OTHER assessments via
  // `priorsFor`, which is the one thing `share.ts`'s own header says must never
  // travel. The file contradicts itself about it: `WITHHELD_STAGES` withholds
  // stage 13's WARNINGS on exactly that ground while its OUTPUT goes in full.
  // Measured here: 10 such artefacts in a shared copy of a real assessment.
  //
  // SECOND: the `fromId`/`toId` pruning is a no-op — both branches of the
  // ternary return the same value, where the two lines above it prune `refs`
  // and `sourceId` correctly. It leaks withheld identifiers rather than
  // content, and it means the function does not make the guarantee it claims.
  'src/lib/policy-analysis/share.ts': (s) => {
    const kinds = "export const WITHHELD_KINDS = ['passage', 'cross_policy'] as const;";
    if (!s.includes(kinds)) throw new Error('share.ts: WITHHELD_KINDS moved');
    let out = s.replace(
      kinds,
      `// DIVERGENCE: \`persona_link\` is withheld too. Its data carries the merged
// standing dossier — traits, continuity and divergence — drawn from the owner's
// OTHER assessments, which is the thing this module's own header says must not
// leave the account. Upstream withholds stage 13's warnings on that ground and
// ships its output.
export const WITHHELD_KINDS = ['passage', 'cross_policy', 'persona_link'] as const;`,
    );
    // Two plain replaces rather than one regex: the pair sits on adjacent lines
    // and a pattern spanning them is a pattern that breaks on reindentation.
    for (const field of ['fromId', 'toId']) {
      const was = `${field}: a.${field} && alive.has(a.${field}) ? a.${field} : a.${field},`;
      if (!out.includes(was)) throw new Error(`share.ts: the ${field} pruning moved, or was fixed upstream`);
      out = out.replace(was, `${field}: a.${field} && alive.has(a.${field}) ? a.${field} : null,`);
    }
    return out;
  },

  // The test pins the list it is asserting, so the divergence above needs it.
  // Everything else in the file derives from `WITHHELD_KINDS` and adapts.
  'src/lib/policy-analysis/share.test.ts': (s) => {
    const pin = "expect([...WITHHELD_KINDS]).toEqual(['passage', 'cross_policy']);";
    if (!s.includes(pin)) throw new Error('share.test.ts: the WITHHELD_KINDS assertion moved');
    return s.replace(pin, "expect([...WITHHELD_KINDS]).toEqual(['passage', 'cross_policy', 'persona_link']);");
  },

  // ── The offline pack ─────────────────────────────────────────────────────
  //
  // The pack embeds the fonts the SITE's design system sets text in — Archivo
  // Black, DM Sans, JetBrains Mono — because without them its headlines fall
  // back to Impact. This build sets text in Helvetica Neue and Arial, which are
  // on the reader's machine already, and it is not licensed to ship GDS
  // Transport. So the pack carries NO font files at all, which is both correct
  // and the same promise `scripts/a11y.mjs` enforces on the web build.
  'src/lib/policy-analysis/server/bundle.ts': (s) => {
    /*
     * AND THE README DOES NOT PROMISE A DRILL-DOWN.
     *
     * "the same grids, drill-downs and stress test as the live page" is simply
     * false of a pack: `OfflineApp` passes no `linkTo`, so every artefact name
     * renders as plain text — deliberately, and its own comment says so. The pack
     * does now carry the paper itself as a readable section, which is the thing a
     * reader with no network cannot get any other way, so the sentence says that
     * instead of naming a feature that is not there.
     */
    let out = s.replace(
      'the same grids, drill-downs and stress test as the live page.',
      `the same grids and stress test as the live page, and the policy document
  itself at the end, so the report can be checked against its source.`
    );
    if (out === s) throw new Error('bundle.ts: the README blurb moved');

    const from = out.match(/const FACES: \{ file: string; family: string; weight: string \}\[\] = \[[\s\S]*?\n\];/);
    if (!from) throw new Error('bundle.ts: the FACES list moved');
    return out.replace(
      from[0],
      `// DIVERGENCE: no embedded faces. This build sets text in the stack GOV.UK
// itself specifies off GOV.UK — Helvetica Neue and Arial — which every reader
// already has, and it may not ship GDS Transport. An empty list means the pack
// carries no font bytes and renders identically offline.
const FACES: { file: string; family: string; weight: string }[] = [];`
    );
  },

  // The pack's page needs GOV.UK's shell classes or it renders on the wrong
  // background with the wrong scroll behaviour — version 6 emits no bare `body`
  // rule at all (phase 0). And the generator string named the site.
  'src/lib/policy-analysis/offline/html.ts': (s) => {
    let out = s.replace(
      '<html lang="en">',
      '<html lang="en-GB" class="govuk-template">'
    );
    out = out.replace('<body>', '<body class="govuk-template__body">');
    out = out.replace(
      'strangeramblings.com policy assessment — offline pack v',
      'Policy Red Team — offline pack v'
    );
    if (out === s) throw new Error('html.ts: the shell moved');
    return out;
  },

  // Its test asserted three embedded faces and a --font-display token, both of
  // which belong to the site's design system. The equivalent assertion here is
  // the stronger one: that NO font travels in the pack.
  'src/lib/policy-analysis/offline/pack.test.ts': (s) => {
    const from = s.match(/    expect\(shell\.css\)\.toContain\('--font-display'\);[\s\S]*?expect\(shell\.fontCss\.match\(\/url\\\(data:font\\\/woff2;base64,\/g\)\)\.toHaveLength\(3\);/);
    if (!from) throw new Error('pack.test.ts: the font assertions moved');
    return s.replace(
      from[0],
      `    // DIVERGENCE: upstream embeds three faces because its headlines fall back
    // to Impact without them. This build sets text in Helvetica Neue and Arial,
    // which the reader already has, and may not ship GDS Transport — so the
    // assertion is the opposite one, and it is a licensing guarantee as much as
    // a rendering one.
    expect(shell.fontCss).toBe('');
    expect(shell.css).not.toContain('GDS Transport');`
    );
  },

  // ── The integration suite ────────────────────────────────────────────────
  //
  // Upstream guards these destructive tests with a regex over DATABASE_URL,
  // refusing to run unless it names its isolated Postgres on port 15435. This
  // build has no connection string, so the same promise is kept by requiring the
  // data directory to be one tests/setup-integration.ts made under the system
  // temp directory. The guard is REPLACED, never removed: these tests purge and
  // delete, and pointing them at a real install must stay hard.
  ...Object.fromEntries(
    [
      'persistence.integration.test.ts',
      'personas.integration.test.ts',
      'provider.integration.test.ts',
      'sealed.integration.test.ts',
    ].map((name) => [
      `src/lib/policy-analysis/${name}`,
      (s) =>
        s.replace(
          /^const local = process\.env\.POLICY_LOCAL_TESTS === '1' && \/\^postgres.*$/m,
          `// DIVERGENCE: upstream keys this off DATABASE_URL naming its isolated
// Postgres. Here the throwaway database is a temp directory this suite created.
const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\\/db$/.test(process.env.POLICY_DATA_DIR ?? '');`
        ),
    ])
  ),

  // parseSubject is pure and lives in peek.ts here; the rest of upstream's
  // peek.svelte.ts is a Svelte rune store that phase 4 replaces.
  // Two of the four persistence cases drive a browser against a running preview,
  // which phase 4 builds. The first is entirely browser-driven and is skipped;
  // the second only ENDS in the browser, so its block is wrapped and every
  // database assertion around it still runs.
  'src/lib/policy-analysis/persistence.integration.test.ts': (s) => {
    let out = s.replace(
      /^const local = process\.env\.POLICY_LOCAL_TESTS === '1' && \/\^postgres.*$/m,
      `const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\\/db$/.test(process.env.POLICY_DATA_DIR ?? '');
/** Browser cases need a running preview to point at. Phase 4. */
const preview = Boolean(process.env.POLICY_PREVIEW_ORIGIN);`
    );
    out = out.replace(
      "  it('creates via browser upload,",
      "  it.skipIf(!preview)('creates via browser upload,"
    );
    const block = out.match(
      /^    const browser = await chromium\.launch\(\{ headless: true \}\);\n    try \{\n[\s\S]*?\n    \} finally \{ await browser\.close\(\); \}$/m
    );
    if (!block) throw new Error('persistence: the second browser block moved');
    const indented = block[0].split('\n').map((l) => (l ? `  ${l}` : l)).join('\n');
    out = out.replace(block[0], `    if (preview) {\n${indented}\n    }`);
    return out;
  },
  // THE MODEL PICKER. Upstream validates a commissioned model against
  // CODEX_MODELS, because on the site the picker offers subscription-funded
  // Codex models. This build reaches OpenRouter and nothing else, so it checks
  // the OpenRouter catalogue instead and asks for that provider's effort levels.
  // Without this the picker is inert: every submission degrades to null. Two
  // lines, and the reason is in docs/phase-1.md.
  'src/lib/policy-analysis/server/ingest.ts': (s) => {
    let out = s.replace(
      "import { CODEX_MODELS, toCodexModelId } from '$lib/server/models/codex-catalogue';",
      "import { isOfferedModel } from '$lib/server/models/catalogue';"
    );
    out = out.replace(
      "  const model = CODEX_MODELS.some((m) => toCodexModelId(m.slug) === askedModel) ? askedModel : null;",
      "  const model = isOfferedModel(askedModel) ? askedModel : null;"
    );
    out = out.replace(
      "  const offered = thinkingLevelsFor('codex', model);",
      "  const offered = thinkingLevelsFor('openrouter', model);"
    );
    if (out === s) throw new Error('ingest.ts: the commission block moved');
    return out;
  },
  'src/lib/policy-analysis/dashboard-shaping.test.ts': (s) =>
    s.replace("from './peek.svelte'", "from './peek'"),
  // The commissioned-model case asserts against CODEX_MODELS, which is empty
  // here. Skipped with its reasoning, not rewritten. Phase 4 restores it.
  // UPSTREAM BUG, fixed here. census.ts lists TWELVE probes and says so in its
  // own header — policy_passes was added in b2e2c06 — but this assertion and the
  // test's name still say eleven, because upstream's integration suite needs a
  // Docker Postgres and is not run in CI. Reported in docs/phase-2.md.
  'src/lib/policy-analysis/sealed.integration.test.ts': (s) =>
    s
      .replace(
        /^const local = process\.env\.POLICY_LOCAL_TESTS === '1' && \/\^postgres.*$/m,
        `const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\\/db$/.test(process.env.POLICY_DATA_DIR ?? '');`
      )
      .replace("purges to eleven zeroes", "purges to twelve zeroes")
      .replace("expect(probes).toHaveLength(11);", "expect(probes).toHaveLength(12);"),
  // The commissioned-model case, translated rather than skipped. Phase 1 could
  // not: the catalogue was empty and every assertion was about Codex. Now that
  // ingest.ts checks the OpenRouter catalogue, each case has a direct equivalent
  // — including the last one, because `max` is a Codex-only effort level and so
  // is still "an effort this model will not take".
  'src/lib/policy-analysis/pipeline.test.ts': (s) => {
    const replacements = [
      [
        "    const asked = base(); asked.set('model', 'codex/gpt-5.6-luna'); asked.set('thinkingLevel', 'high');\n" +
        "    expect(await read(asked)).toMatchObject({ model: 'codex/gpt-5.6-luna', thinkingLevel: 'high' });",
        "    // DIVERGENCE: OpenRouter ids, because this build has no Codex bridge and\n" +
        "    // its catalogue is src/lib/server/models/catalogue.ts. Same assertions.\n" +
        "    const asked = base(); asked.set('model', 'anthropic/claude-sonnet-4.5'); asked.set('thinkingLevel', 'high');\n" +
        "    expect(await read(asked)).toMatchObject({ model: 'anthropic/claude-sonnet-4.5', thinkingLevel: 'high' });",
      ],
      [
        "    const unknown = base(); unknown.set('model', 'codex/gpt-9-nonesuch');",
        "    const unknown = base(); unknown.set('model', 'openai/gpt-9-nonesuch');",
      ],
      [
        "    // `max` is per-model on Codex: gpt-5.5 answers it with a 400 rather than\n" +
        "    // with less thinking, so it must never reach the bridge.\n" +
        "    const tooDeep = base(); tooDeep.set('model', 'codex/gpt-5.5'); tooDeep.set('thinkingLevel', 'max');\n" +
        "    expect(await read(tooDeep)).toMatchObject({ model: 'codex/gpt-5.5', thinkingLevel: null });",
        "    // `max` and `xhigh` are Codex-only levels; OpenRouter offers off/low/medium/high.\n" +
        "    // So this is still the same case: a real model, an effort it will not take,\n" +
        "    // and the model kept while the effort falls back rather than the submission failing.\n" +
        "    const tooDeep = base(); tooDeep.set('model', 'deepseek/deepseek-v4-flash'); tooDeep.set('thinkingLevel', 'max');\n" +
        "    expect(await read(tooDeep)).toMatchObject({ model: 'deepseek/deepseek-v4-flash', thinkingLevel: null });",
      ],
    ];
    let out = s;
    for (const [from, to] of replacements) {
      if (!out.includes(from)) throw new Error('pipeline.test.ts: the commission case moved');
      out = out.replace(from, to);
    }
    return out;
  },
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
