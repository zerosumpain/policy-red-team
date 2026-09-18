/* Phase 0, spike B. Does GOV.UK Frontend 6 compile under Vite without the
 * assets this service is not licensed to use?
 *
 * The check that matters is the absence of GDS Transport. It is Crown copyright,
 * licensed to services on GOV.UK only, and `govuk-frontend` emits @font-face
 * rules for it unless told not to. A build that quietly ships those rules is a
 * licensing problem, not a styling one, so it is asserted rather than eyeballed. */
import { build } from 'vite';
import { readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/tmp/claude-1000/-home-john/16d59563-c7d6-4f32-9fc5-7f1b56f83f75/scratchpad/govuk-spike';
await rm(OUT, { recursive: true, force: true });

await build({
  root: path.resolve('spike/govuk'),
  logLevel: 'warn',
  // Vite 8 minifies CSS with LightningCSS by default, and LightningCSS REFUSES
  // govuk-frontend: the framework still carries `@media (min-width: 0\\0)`, an
  // Internet Explorer hack that is not valid CSS. `errorRecovery` strips those
  // rules rather than failing the build, which is the outcome we want — they are
  // dead code for every browser this service supports. Without this the build
  // dies, and it would have died in phase 3 instead of here.
  css: { lightningcss: { errorRecovery: true } },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    cssCodeSplit: false,
    cssMinify: 'lightningcss',
    rollupOptions: { input: path.resolve('spike/govuk/index.ts') },
  },
});

const files = await readdir(path.join(OUT, 'assets'));
const cssFile = files.find((f) => f.endsWith('.css'));
const css = await readFile(path.join(OUT, 'assets', cssFile), 'utf8');

let failed = 0;
function assert(label, ok, detail = '') {
  console.log(ok ? `  ok     ${label} ${detail}` : `  FAIL   ${label} ${detail}`);
  if (!ok) failed++;
}

console.log(`\ncompiled ${cssFile}, ${(css.length / 1024).toFixed(0)} kB\n`);
console.log('licensing — assets this service may not use:');
assert('no GDS Transport @font-face', !/font-face/i.test(css) || !/transport/i.test(css));
assert('no reference to the GDS Transport family', !/GDS Transport/i.test(css));
// The crest url() survives in the stylesheet because it belongs to the GOV.UK
// header and footer rules, which this service does not use. What matters is that
// the image itself is never shipped, so no browser can ever fetch it.
assert('the royal arms image is not shipped',
  !files.some((f) => /crest|crown|royal/i.test(f)));
assert('no font file is shipped', !files.some((f) => /\.(woff2?|ttf|eot)$/i.test(f)));
// Unquoted: the minifier strips the quotes GOV.UK's Sass writes around the
// family name. Asserting the quoted form was a bug in this spike, not a miss.
assert('the font stack is the off-GOV.UK fallback',
  /Helvetica Neue,\s*arial,\s*sans-serif/i.test(css));

console.log('\nthe framework actually built:');
assert('govuk-button is present', /\.govuk-button\s*\{/.test(css));
assert('govuk-table is present', /\.govuk-table\s*\{/.test(css));
assert('govuk-task-list is present (the 18-stage progress view)', /\.govuk-task-list/.test(css));
assert('govuk-summary-list is present (the report)', /\.govuk-summary-list/.test(css));
assert('govuk-error-summary is present (submission)', /\.govuk-error-summary/.test(css));
assert('govuk-accordion is present (the stage guide)', /\.govuk-accordion/.test(css));
assert('govuk-tag is present (stage status)', /\.govuk-tag/.test(css));
// `$govuk-global-styles: true` does NOT emit bare `a { }` and `p { }` rules. The
// mixin uses `@extend`, so the elements join the class selector lists instead —
// `a,.govuk-link{...}`. Grepping for a bare selector finds nothing and means
// nothing.
assert('global styles reach bare <a>', /(^|\}|,)a,\.govuk-link\{/.test(css));
assert('global styles reach bare <p>', /(^|\}|,)p,\.govuk-body/.test(css));
// The page shell is class-scoped in v6: there is no bare `body` rule, only
// `.govuk-template` and `.govuk-template__body`. The React document must carry
// both classes or the page renders on the wrong background with the wrong
// scrollbar behaviour. This is a phase 3 requirement, discovered here.
assert('the shell requires .govuk-template on <html>', /\.govuk-template\{/.test(css));
assert('the shell requires .govuk-template__body on <body>', /\.govuk-template__body\{/.test(css));
assert('the Sass API is reachable from our own rules', /\.prt-service-name\s*\{/.test(css));
assert('the dead IE media hack was stripped, not shipped', !/min-width:\s*0\\0/.test(css));

console.log(failed ? `\nSPIKE B: FAILED (${failed})` : '\nSPIKE B: PASSED');
process.exit(failed ? 1 : 0);
