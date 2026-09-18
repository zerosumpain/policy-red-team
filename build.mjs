/**
 * Bundling the CLI.
 *
 * The copied core imports through the `$lib/*` alias — deliberately, so its files
 * stay byte-identical to upstream's — and Node cannot resolve that. esbuild can,
 * which is also how upstream ships its worker (`packages/jkai-policy-worker/build.mjs`),
 * so this follows that file rather than inventing a second approach.
 *
 * TWO ENTRIES from one source:
 *
 *   dist/cli.js          the real thing; calls a model, costs money
 *   dist/cli-fixture.js  `./provider` aliased to `./provider.fixture`, so the
 *                        bundle has no path to a provider at all
 *
 * The fixture build is how eighteen stages get verified without an API key. A
 * runtime flag would have been easier and weaker: this one cannot be mis-set,
 * and the check below proves it by refusing a bundle that still mentions
 * OpenRouter.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(root, 'src', 'lib');

/**
 * Redirect the ONE value import of the real provider.
 *
 * esbuild's `alias` takes bare package names only, so a relative import needs a
 * resolver. Exactly one module imports the provider for its value —
 * `policy-analysis/server/worker.ts` — while `pipeline.ts` imports only its type
 * and is erased before this runs. The importer is checked so a future `./provider`
 * somewhere else cannot be silently swapped too.
 */
function fixtureProviderPlugin(target) {
  return {
    name: 'fixture-provider',
    setup(b) {
      b.onResolve({ filter: /^\.\/provider$/ }, (args) => {
        const from = args.importer.replace(/\\/g, '/');
        if (!from.endsWith('/policy-analysis/server/worker.ts')) return null;
        return { path: target };
      });
    },
  };
}

async function bundle({ outfile, plugins = [] }) {
  await build({
    entryPoints: [path.join(root, 'cli.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    sourcemap: true,
    logLevel: 'warning',
    alias: { $lib: lib },
    plugins,
  });

  // Upstream's check, and worth keeping: an unresolved framework import does not
  // fail the bundle, it fails at runtime, months later, on the one path nobody
  // exercised.
  const source = readFileSync(outfile, 'utf8');
  const unresolved = [...source.matchAll(/(?:from\s*|import\s*\()['"](\$(?:lib|app|env)[^'"]*)/g)];
  if (unresolved.length) {
    throw new Error(`Unresolved framework imports in ${outfile}: ${unresolved.map((m) => m[1]).join(', ')}`);
  }
  return source;
}

await bundle({ outfile: path.join(root, 'dist', 'cli.js') });

const fixture = await bundle({
  outfile: path.join(root, 'dist', 'cli-fixture.js'),
  plugins: [
    fixtureProviderPlugin(path.join(lib, 'policy-analysis', 'server', 'provider.fixture.ts')),
  ],
});

// The guarantee the fixture build exists to make. `openrouter.ai` reaches the
// bundle only through the real provider's client; if it is still in there, the
// alias did not take and the "cannot spend money" claim is false.
if (fixture.includes('openrouter.ai')) {
  throw new Error('dist/cli-fixture.js still reaches a provider — the fixture plugin did not apply.');
}

console.log('built dist/cli.js and dist/cli-fixture.js');
