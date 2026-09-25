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
function fixtureProviderPlugin(target, registryTarget, tavilyTarget, bodySourcesTarget) {
  return {
    name: 'fixture-provider',
    setup(b) {
      b.onResolve({ filter: /^\.\/provider$/ }, (args) => {
        const from = args.importer.replace(/\\/g, '/');
        if (!from.endsWith('/policy-analysis/server/worker.ts')) return null;
        return { path: target };
      });
      /*
       * AND THE REGISTRY, which is where every provider now lives.
       *
       * This used to redirect `$lib/llm/client` instead, because replacing the
       * pipeline's provider covered the pipeline and missed `server/personas.ts`
       * calling `getLLMClient` directly — the endpoint check below caught that
       * after the swap had been declared a success.
       *
       * The registry is the better seam: a provider module is mostly the URL it
       * calls, so redirecting it removes every endpoint from the bundle and the
       * real gateway can be used unchanged. The fixture registry keeps every
       * shape, so the admin panel is still exercisable by the walk and `client()`
       * throws rather than constructing anything.
       */
      b.onResolve({ filter: /^\$lib\/llm\/providers$/ }, () => ({ path: registryTarget }));

      /*
       * AND THE SEARCH SERVICE.
       *
       * Tavily is metered, and it receives the text of the reader's research
       * questions. A fixture bundle that could call it would spend money and
       * send a query out — and the only reason the browser walk never did is
       * that it happens not to configure a key, which is an accident of a test
       * standing in for a guarantee.
       *
       * Redirected here rather than in `web-search.ts`, which is fork-owned and
       * could have done it: the guarantee should not depend on anyone
       * remembering to route a new call site through the right module. The
       * bundle either contains the endpoint or it does not.
       */
      b.onResolve({ filter: /tavily$/ }, (args) => {
        if (!args.path.includes('deepdive')) return null;
        return { path: tavilyTarget };
      });

      /*
       * AND THE PUBLIC-RECORD SOURCES — GOV.UK search, Parliament's committees
       * and Hansard (phase 19, workstream X).
       *
       * Free and keyless, so not a question of money: a fixture run must not
       * depend on a network it cannot promise, and the walk must not ask a
       * government API about a synthetic paper's bodies. Exactly one module
       * imports the adapter, and the importer is checked for the reason the
       * provider's is.
       */
      b.onResolve({ filter: /^\.\/body-sources$/ }, (args) => {
        const from = args.importer.replace(/\\/g, '/');
        if (!from.endsWith('/policy-analysis/server/body-evidence.ts')) return null;
        return { path: bodySourcesTarget };
      });
    },
  };
}

async function bundle({ outfile, plugins = [], entry = 'cli.ts' }) {
  await build({
    entryPoints: [path.join(root, entry)],
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
await bundle({ entry: 'server/index.ts', outfile: path.join(root, 'dist', 'server.js') });
// The register refresher is its own entry and nothing else imports it: it is
// run by hand, writes a file that is committed, and has no business in a
// bundle that serves readers. See the GOV.UK line in ENDPOINTS below.
await bundle({ entry: 'server/register-refresh.ts', outfile: path.join(root, 'dist', 'register-refresh.js') });
// `npm run research:bodies`: checks the public record for every body in the
// library. Its own entry for the same reason — run by hand, never served.
await bundle({ entry: 'server/research-bodies.ts', outfile: path.join(root, 'dist', 'research-bodies.js') });

const fixtureProvider = () => [
  fixtureProviderPlugin(
    path.join(lib, 'policy-analysis', 'server', 'provider.fixture.ts'),
    path.join(lib, 'llm', 'providers', 'index.fixture.ts'),
    path.join(lib, 'deepdive', 'tavily.fixture.ts'),
    path.join(lib, 'policy-analysis', 'server', 'body-sources.fixture.ts')
  ),
];

const fixture = await bundle({
  outfile: path.join(root, 'dist', 'cli-fixture.js'),
  plugins: fixtureProvider(),
});

// A fixture SERVER as well as a fixture CLI, so the browser walk in
// `scripts/walk.mjs` can go from submit to report without a key and without a
// bill — and so that walk is a real exercise of the HTTP layer rather than a
// mock of it.
const fixtureServer = await bundle({
  entry: 'server/index.ts',
  outfile: path.join(root, 'dist', 'server-fixture.js'),
  plugins: fixtureProvider(),
});

/*
 * The guarantee the fixture build exists to make.
 *
 * An ENDPOINT, not a domain. The check used to be the bare string
 * `openrouter.ai`, which was right while one provider existed and became
 * prose-sensitive the moment a second did: the fixture registry's own field hint
 * names openrouter.ai/keys, which is documentation and not a way to spend money.
 * These are the base URLs a client is actually constructed from, one per real
 * provider, and a new provider adds a line here.
 */
/*
 * NOT THE SAME LIST AS A PROVIDER'S `egress`, and deliberately so. That one is
 * prose for a network team and includes entries like "your Azure resource
 * endpoint", which is not a string anything can be grepped for. This is the set
 * of literal substrings that must be ABSENT from the fixture bytes. The two
 * answer different questions and merging them would quietly weaken this one.
 *
 * `login.microsoftonline.com` and the metadata address arrived with Entra
 * authentication in phase 18: both are places a real build can send a
 * credential, so both belong here.
 */
const ENDPOINTS = [
  'openrouter.ai/api',
  'openai.azure.com',
  'login.microsoftonline.com',
  '169.254.169.254',
  // Metered, and it receives the reader's research questions. It joined this
  // list in phase 18 along with `tavily.fixture.ts`, and in that order: adding
  // the name without the redirect fails the build on the next line.
  'api.tavily.com',
  // Free and public, so not a question of money: a fixture run must not depend
  // on a network it cannot promise, and the committed snapshot is how it
  // avoids one. The refresher's page URL is one literal for exactly this check
  // — see `register-fetch.ts`. Phase 19.
  'www.gov.uk/api/organisations?page=',
  // The three public-record APIs a body's track record comes from. Free, and
  // on this list for the register's reason. Added AFTER the redirect above, in
  // that order, as Tavily was: the names without the stub fail the build.
  // Phase 19, workstream X.
  'www.gov.uk/api/search.json',
  'committees-api.parliament.uk',
  'hansard-api.parliament.uk',
];
for (const [name, source] of [['cli-fixture.js', fixture], ['server-fixture.js', fixtureServer]]) {
  const found = ENDPOINTS.filter((endpoint) => source.includes(endpoint));
  if (found.length) {
    throw new Error(
      `dist/${name} still reaches a provider (${found.join(', ')}) — the fixture plugin did not apply.`
    );
  }
}

console.log('built cli.js, cli-fixture.js, server.js, server-fixture.js, register-refresh.js and research-bodies.js in dist/');
