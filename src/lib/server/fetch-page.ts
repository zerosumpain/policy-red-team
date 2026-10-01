import { extractPdf } from '$lib/jkai/extract/pdf';
import { assertPublicUrl } from './ssrf-guard';

/**
 * READ ONE PUBLIC PAGE IN FULL, FOR NOTHING (phase 22 part 2).
 *
 * Measured on the real Best Start run (`44dd5420`): 116 research sources, and
 * NOT ONE read in full. The live box has no Tavily key, so research runs on the
 * model's grounded search, and `web-search.ts`'s `extract` answers every URL
 * with "no extraction service configured". Part 1 then had to grade all 197
 * evidence rows weak, because a search snippet cannot carry more — which was
 * the honest reading of a run that had read nothing.
 *
 * A grounded model hands back the page's URL. Reading the page behind it is an
 * ordinary GET: no service, no key, no bill. This is that GET, and three
 * callers use it:
 *
 *   - `research.ts`, as the FULL-TEXT fallback inside its existing budget, when
 *     `extract()` fails or the engine is grounded or none;
 *   - the worker, for a page a READER named at submission;
 *   - the material route, for a page a reader names after the run.
 *
 * WHAT IT REFUSES, every time, before any byte is read:
 *
 *   - anything `assertPublicUrl` refuses — a private, loopback, link-local or
 *     CGNAT address, a private namespace — re-checked on EVERY redirect, because
 *     a public page that 302s to `http://169.254.169.254/` is the classic way
 *     round a guard that only looks at the first URL. Redirects are followed by
 *     hand (`redirect: 'manual'`) for exactly that reason, at most five;
 *   - a body over 2 MB, counted as it streams rather than trusted from a
 *     header, since a header is the server's claim and the stream is the fact;
 *   - anything but HTML, plain text or PDF;
 *   - fifteen seconds of anybody's time.
 *
 * THE PROXY IS HONOURED WITHOUT ASKING. `fetch` here is Node's global one, and
 * `$lib/llm/providers/transport` installs an `EnvHttpProxyAgent` as the global
 * dispatcher at boot — the same route every other outbound call takes. Behind a
 * proxy the DNS half of the guard is advisory (the proxy resolves the name),
 * and the literal-address and namespace checks still hold. A DNS rebind between
 * the check and the connect is not closed here either, exactly as it is not in
 * `research.ts`'s own URL check; `resolvePinnedUrl` pins a socket, which a
 * proxied request cannot use.
 *
 * NO NEW DEPENDENCY. HTML becomes text with a handful of regular expressions —
 * this is not a browser and does not pretend to be one: it drops what is never
 * content (script, style, navigation, header, footer), prefers `<main>` when a
 * page has one (every GOV.UK page does), keeps the `<title>`, decodes entities
 * and collapses whitespace. A PDF goes through the same `extractPdf` the
 * submission form uses.
 *
 * THE FIXTURE BUILDS CANNOT CALL IT. `build.mjs` redirects this module to
 * `fetch-page.fixture.ts` in both fixture bundles and asserts the user agent
 * below is absent from their bytes — keep it ONE literal, or that check stops
 * seeing it.
 */

export const PAGE_USER_AGENT = 'policy-red-team-page-reader/1 (+reads one public page a reader or the research step named)';
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
/** `research.ts`'s `MAX_SOURCE_CHARACTERS`: what one source may put in front of the model. */
export const MAX_PAGE_CHARACTERS = 10_000;

export type FetchedPage = {
  /** Where it was asked for. */
  url: string;
  /** Where it ended up, after redirects. Cite this one. */
  finalUrl: string;
  title: string;
  text: string;
  kind: 'html' | 'text' | 'pdf';
  /** True when the text was cut at `maxCharacters`. */
  truncated: boolean;
};

export type PageFailure = 'blocked' | 'redirects' | 'status' | 'type' | 'too_large' | 'timeout' | 'empty' | 'network';

/** A refusal or a failure, with a sentence a reader can be shown. Never the remote server's own words. */
export class PageError extends Error {
  constructor(readonly code: PageFailure, message: string) {
    super(message);
    this.name = 'PageError';
  }
}

export type FetchPageOptions = {
  signal?: AbortSignal;
  maxCharacters?: number;
  /** Swapped in tests, which must never reach a network. */
  fetch?: typeof globalThis.fetch;
  assert?: (url: string) => Promise<URL>;
  timeoutMs?: number;
};

export type FetchPage = (url: string, options?: FetchPageOptions) => Promise<FetchedPage>;

const KINDS: [RegExp, FetchedPage['kind']][] = [
  [/^text\/html\b|^application\/xhtml\+xml\b/i, 'html'],
  [/^text\/plain\b/i, 'text'],
  [/^application\/pdf\b/i, 'pdf'],
];

export const fetchPage: FetchPage = async (url, options = {}) => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const assert = options.assert ?? ((u: string) => assertPublicUrl(u));
  const deadline = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const maxCharacters = options.maxCharacters ?? MAX_PAGE_CHARACTERS;

  let current = url;
  let response: Response | null = null;
  try {
    for (let hop = 0; ; hop++) {
      try { await assert(current); }
      catch { throw new PageError('blocked', hop ? 'The page redirected to an address this service will not fetch.' : 'That address is not a public web page this service will fetch.'); }
      response = await doFetch(current, {
        redirect: 'manual',
        signal,
        headers: { 'user-agent': PAGE_USER_AGENT, accept: 'text/html, text/plain;q=0.9, application/pdf;q=0.8' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location) throw new PageError('status', 'The page redirected without saying where to.');
        if (hop + 1 > MAX_REDIRECTS) throw new PageError('redirects', `The page redirected more than ${MAX_REDIRECTS} times.`);
        current = new URL(location, current).toString();
        continue;
      }
      break;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new PageError('status', `The page answered ${response.status}.`);
    }
    const type = response.headers.get('content-type') ?? '';
    const kind = KINDS.find(([pattern]) => pattern.test(type.trim()))?.[1];
    if (!kind) {
      await response.body?.cancel().catch(() => {});
      throw new PageError('type', 'That address is not a web page, plain text or a PDF.');
    }
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_PAGE_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw new PageError('too_large', `The page is over ${MAX_PAGE_BYTES / 1024 / 1024} MB.`);
    }
    const bytes = await readCapped(response, MAX_PAGE_BYTES);

    let title = '';
    let text = '';
    if (kind === 'pdf') {
      const result = await extractPdf(bytes, { maxPages: 200, maxCharacters: 2_000_000 }).catch(() => null);
      if (!result) throw new PageError('empty', 'The PDF could not be read.');
      text = collapse(result.text);
      title = decodeURIComponent(new URL(current).pathname.split('/').pop() || '') || new URL(current).hostname;
    } else {
      const raw = new TextDecoder('utf-8').decode(bytes);
      if (kind === 'html') ({ title, text } = htmlToText(raw));
      else text = collapse(raw);
    }
    if (!text.trim()) throw new PageError('empty', 'The page had no readable text.');
    return {
      url,
      finalUrl: current,
      title: (title || new URL(current).hostname).slice(0, 300),
      text: text.slice(0, maxCharacters),
      kind,
      truncated: text.length > maxCharacters,
    };
  } catch (err) {
    if (err instanceof PageError) throw err;
    if (deadline.aborted && !options.signal?.aborted) throw new PageError('timeout', `The page took longer than ${Math.round((options.timeoutMs ?? FETCH_TIMEOUT_MS) / 1000)} seconds.`);
    if (options.signal?.aborted) throw err;
    throw new PageError('network', 'The page could not be reached.');
  }
};

/** The body, refused the moment it passes `cap` bytes. */
async function readCapped(response: Response, cap: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) {
      await reader.cancel().catch(() => {});
      throw new PageError('too_large', `The page is over ${cap / 1024 / 1024} MB.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', pound: '£', euro: '€', copy: '©', reg: '®', middot: '·', bull: '•',
};

/** `&amp;`, `&#163;`, `&#x2014;` and the common named entities. Anything else is left as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

/** Spaces within a line collapsed; more than one blank line becomes one. */
function collapse(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Elements whose contents are never the page's content. */
const NEVER = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer'];

/**
 * HTML to the words on the page, and its title.
 *
 * `<main>` first when there is one with real text in it: on a GOV.UK page that
 * is the difference between the guidance and the guidance plus the cookie
 * banner, the phase banner, the breadcrumbs and the "Is this page useful?"
 * survey. Elements are dropped before tags are stripped, so the words inside a
 * `<script>` never reach the text.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const title = collapse(decodeEntities((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ''))).replace(/\n/g, ' ');
  let body = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of NEVER) body = body.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  body = body.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ');
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1];
  const words = (fragment: string) => collapse(decodeEntities(fragment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote|dd|dt|dl|pre|figure|figcaption)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' \t ')
    .replace(/<[^>]+>/g, ' ')));
  const fromMain = main ? words(main) : '';
  return { title, text: fromMain.length > 200 ? fromMain : words(body) };
}
