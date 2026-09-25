import { GOVUK_LICENCE, GOVUK_ORGANISATIONS_API, organisationsFromPage, REGISTER_SOURCE, type RegisterOrganisation, type RegisterSnapshot } from '../register';

/**
 * FETCH THE GOV.UK ORGANISATIONS REGISTER, page by page.
 *
 * Deliberately NOT reachable from the server or either fixture bundle. It is
 * run by hand — `npm run register:refresh` — and its output is a file that is
 * committed and reviewed like any other change. `build.mjs` asserts the API's
 * address is absent from both fixture bundles, so a future import that pulls
 * this into the running service fails the build rather than quietly giving a
 * test run a network dependency.
 *
 * Through the process's own `fetch`, never a client of its own. The CLI that
 * calls this imports `$lib/llm/providers/transport` first, which installs the
 * proxy-aware dispatcher — so an install whose only way out is a proxy
 * refreshes through it. Importing `undici` here would do the opposite: phase 18
 * measured that a bare import of the package replaces the proxy-aware
 * dispatcher with one that goes straight to the origin.
 *
 * Free, public, no key. It is still somebody else's service, so it is polite:
 * one page at a time, a named user agent, and a short back-off on 429 or 5xx.
 */

/**
 * The page address as ONE literal, because `build.mjs` greps the fixture
 * bundles for exactly this string. Built from a template of the base URL it
 * would never appear in the bytes, and the guard would pass whatever was bundled.
 */
export const REGISTER_PAGE_URL = 'https://www.gov.uk/api/organisations?page=';

/** Below this, a refresh is treated as broken rather than as news: the register has held ~1,265 bodies for years. */
export const MIN_ORGANISATIONS = 800;
const MAX_PAGES = 200;
const ATTEMPTS = 3;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchRegister(options: {
  fetch?: Fetch;
  log?: (line: string) => void;
  now?: () => Date;
  wait?: (ms: number) => Promise<void>;
  previousCount?: number | null;
} = {}): Promise<RegisterSnapshot> {
  const get = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const log = options.log ?? (() => {});
  const wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const organisations = new Map<string, RegisterOrganisation>();
  let pages = 1;
  let total: number | null = null;

  for (let page = 1; page <= Math.min(pages, MAX_PAGES); page++) {
    const url = `${REGISTER_PAGE_URL}${page}`;
    let parsed: ReturnType<typeof organisationsFromPage> | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS && !parsed; attempt++) {
      const response = await get(url, {
        headers: { accept: 'application/json', 'user-agent': 'policy-red-team register refresh' },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) { parsed = organisationsFromPage(await response.json()); break; }
      if (attempt === ATTEMPTS || (response.status < 500 && response.status !== 429)) {
        throw new Error(`GOV.UK answered ${response.status} for page ${page}. Nothing was written.`);
      }
      await wait(1000 * attempt);
    }
    if (!parsed) throw new Error(`No answer for page ${page}. Nothing was written.`);
    pages = parsed.pages ?? pages;
    total = parsed.total ?? total;
    for (const org of parsed.organisations) organisations.set(org.slug, org);
    log(`  page ${page} of ${pages}: ${organisations.size} organisations so far`);
  }

  const list = [...organisations.values()];
  // A SHORT ANSWER MUST NOT REPLACE A GOOD SNAPSHOT. The committed file is what
  // every install falls back on; one throttled page overwriting it with half
  // the government is worse than not refreshing at all.
  if (list.length < MIN_ORGANISATIONS) {
    throw new Error(`Only ${list.length} organisations came back, fewer than the ${MIN_ORGANISATIONS} this register has always held. Nothing was written.`);
  }
  if (options.previousCount && list.length < options.previousCount * 0.9) {
    throw new Error(`${list.length} organisations came back against ${options.previousCount} in the snapshot. A drop that large is more likely a broken answer than a reorganisation, so nothing was written.`);
  }
  if (total && list.length < total * 0.95) {
    throw new Error(`GOV.UK says it has ${total} organisations and only ${list.length} were read. Nothing was written.`);
  }
  return {
    source: REGISTER_SOURCE,
    url: GOVUK_ORGANISATIONS_API,
    licence: GOVUK_LICENCE,
    fetchedAt: (options.now?.() ?? new Date()).toISOString(),
    count: list.length,
    organisations: list.sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}
