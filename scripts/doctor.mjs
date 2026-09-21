#!/usr/bin/env node
/**
 * WHAT IS WRONG WITH THIS INSTALL, ANSWERED BEFORE A RUN IS STARTED.
 *
 *   npm run doctor
 *   npm run doctor -- --reach        also try the network (makes real requests)
 *
 * This exists for the estate this service is being aimed at: somebody else's
 * tenant, a proxy, an inspecting CA, an egress allow-list, and an hour to find
 * out whether the thing works. Every check here is a question that has already
 * been answered the slow way — by an eighteen-stage run failing at stage one
 * with "the configured model provider could not be reached", which is true of a
 * wrong key, a blocked host, an untrusted certificate and a typo alike.
 *
 * IT MAKES NO MODEL CALLS AND SPENDS NOTHING, even with `--reach`: reaching a
 * host means opening a connection and reading the status line, not asking a
 * question. The one honest test of a credential is the admin panel's
 * "Test the connection" button, which is a real call for a single token, and
 * this deliberately does not duplicate it.
 *
 * IT PRINTS NO SECRETS. A proxy URL can carry credentials and this output ends
 * up pasted into tickets, so a variable is reported as set or not set. The same
 * posture the panel takes with a key.
 */
import { readFileSync } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const REACH = process.argv.includes('--reach');

let failures = 0;
let warnings = 0;

const ok = (what, detail) => console.log(`  ok    ${what}${detail ? `  ${detail}` : ''}`);
const warn = (what, detail) => {
  warnings++;
  console.log(`  warn  ${what}${detail ? `  ${detail}` : ''}`);
};
const bad = (what, detail) => {
  failures++;
  console.log(`  FAIL  ${what}${detail ? `  ${detail}` : ''}`);
};

console.log('\nPolicy Red Team — install check\n');

// ── The runtime ────────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const floor = (pkg.engines?.node ?? '>=0').replace(/^\D+/, '');
const version = process.version.replace(/^v/, '');
const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
if (cmp(version, floor) >= 0) ok('node', `${process.version}`);
else {
  // A note, not a refusal: src/lib/polyfills.ts carries the two ES2025 APIs
  // pdfjs 5.4 needs. A THIRD missing API means stop polyfilling and upgrade.
  warn('node', `${process.version} is below the ${floor} this package declares; polyfills cover the known gaps`);
}

// ── Configuration the process will actually see ────────────────────────────
let envFile = false;
try {
  await access(path.join(ROOT, '.env'), constants.R_OK);
  envFile = true;
} catch {
  /* none */
}
if (envFile) ok('.env', 'present and readable');
else warn('.env', 'not found — the environment must supply configuration another way');

const DATA_DIR = process.env.POLICY_DATA_DIR ?? path.join(process.cwd(), '.data', 'db');
const KEY_DIR = process.env.POLICY_SEAL_KEY_DIR ?? path.join(process.cwd(), 'data', 'policy-keys');
ok('database', DATA_DIR);
ok('keys', KEY_DIR);

/*
 * THE KEY DIRECTORY IS THE ONE THAT BITES.
 *
 * `settings.key` lives here and it is what decrypts every provider credential.
 * `readAll()` DROPS a row it cannot decrypt rather than throwing — deliberately,
 * so one stale credential cannot stop the service — which means a key directory
 * restored from the wrong machine presents as "no credentials configured" and
 * not as an error. Saying its mode out loud is cheap; finding that out from a
 * service that silently forgot its configuration is not.
 */
try {
  const mode = (await stat(KEY_DIR)).mode & 0o777;
  if (mode === 0o700) ok('key directory mode', '0700');
  else warn('key directory mode', `0${mode.toString(8)} — expected 0700`);
} catch {
  warn('key directory', 'does not exist yet; it is created on first use');
}

// ── The network this process has been given ────────────────────────────────
const proxyVar = (...names) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? null;
const httpsProxy = proxyVar('https_proxy', 'HTTPS_PROXY');
const httpProxy = proxyVar('http_proxy', 'HTTP_PROXY');
const noProxy = proxyVar('no_proxy', 'NO_PROXY');

if (httpsProxy || httpProxy) {
  ok('proxy', `set${noProxy ? ', with NO_PROXY' : ' (no NO_PROXY — loopback calls will be proxied too)'}`);
  if (!noProxy) {
    // A bridge on 127.0.0.1 sent through a corporate proxy is a bridge that
    // never answers, and the error says "unreachable" either way.
    warn('NO_PROXY', 'unset — add 127.0.0.1,localhost if anything is configured on loopback');
  }
} else {
  ok('proxy', 'none set — calls go direct');
}

if (process.env.NODE_EXTRA_CA_CERTS) {
  try {
    await access(process.env.NODE_EXTRA_CA_CERTS, constants.R_OK);
    ok('extra CA', process.env.NODE_EXTRA_CA_CERTS);
  } catch {
    // Node reads this before any of our code runs and says nothing if the path
    // is wrong; the first symptom is every TLS handshake failing.
    bad('extra CA', `${process.env.NODE_EXTRA_CA_CERTS} is not readable — Node ignores it silently`);
  }
} else {
  ok('extra CA', 'none — fine unless TLS is being inspected');
}

/*
 * THE DISPATCHER, INSTALLED THE WAY THE SERVICE INSTALLS IT.
 *
 * This is not decoration and it is not a check — it is what makes `--reach`
 * mean anything. Importing the standalone `undici` package claims the global
 * dispatcher slot with a plain Agent if nothing else has, and Node's own
 * `fetch` reads that slot. So a doctor that just called `fetch` would test a
 * direct route the service never takes, and would report every host as
 * reachable on a box whose only way out is a proxy — the exact failure this
 * script exists to catch, passed with flying colours.
 *
 * `src/lib/llm/providers/transport.ts` claims the slot with an
 * EnvHttpProxyAgent at module load. It is TypeScript and cannot be imported
 * here, so this does the same thing with the same class. The two must agree;
 * `transport.test.ts` pins the server's half.
 */
let dispatcherKind = 'unknown';
try {
  const { EnvHttpProxyAgent, setGlobalDispatcher, getGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new EnvHttpProxyAgent());
  dispatcherKind = getGlobalDispatcher()?.constructor?.name ?? 'unknown';
  ok('dispatcher', `${dispatcherKind} — reads the proxy environment, as the service does`);
} catch (err) {
  bad('dispatcher', `could not be installed: ${err.message}`);
}

// ── Can it get out? ────────────────────────────────────────────────────────
if (REACH) {
  console.log('\n  reaching hosts (no model calls, nothing is spent)\n');
  /*
   * Only the hosts this build can actually be configured to use. An Azure
   * endpoint is per-tenant, so it is read from the environment if it is there
   * and skipped if it is not — inventing a hostname to test would report a
   * failure about somebody else's resource.
   */
  const targets = [
    ['openrouter.ai', 'https://openrouter.ai/api/v1/models'],
    ['api.tavily.com', 'https://api.tavily.com'],
  ];
  const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT?.trim();
  if (endpoint) targets.push(['your Azure endpoint', endpoint.replace(/\/+$/, '')]);
  const bridge = process.env.CODEX_BASE_URL?.trim();
  if (bridge) targets.push(['your OpenAI-compatible endpoint', bridge.replace(/\/+$/, '')]);

  for (const [name, url] of targets) {
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
      // Any status line is a success here: 401 from an unauthenticated probe
      // means the host answered, which is the question being asked.
      ok(name, `answered ${res.status} in ${Date.now() - started} ms`);
    } catch (err) {
      const cause = err.cause?.code ?? err.cause?.message ?? err.message;
      bad(name, `${cause} after ${Date.now() - started} ms`);
    }
  }
} else {
  console.log('\n  (pass --reach to also try the network)');
}

console.log(
  failures
    ? `\n${failures} problem${failures === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.\n`
    : `\nNo problems. ${warnings} warning${warnings === 1 ? '' : 's'}.\n`,
);
process.exit(failures ? 1 : 0);
