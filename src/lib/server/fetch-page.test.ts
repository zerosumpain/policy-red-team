// Phase 22 part 2 — the page reader. Every test here stubs `fetch` and uses
// literal addresses, so nothing reaches a network or a resolver.
import { describe, expect, it, vi } from 'vitest';
import { assertPublicUrl } from './ssrf-guard';
import { decodeEntities, fetchPage, htmlToText, MAX_PAGE_BYTES, PageError } from './fetch-page';

const PUBLIC = 'http://93.184.216.34/report';

/** A `fetch` that answers from a table of address → Response factory, and records what it was asked. */
function stub(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, asked };
}
const html = (body: string, headers: Record<string, string> = {}) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });

describe('what it refuses', () => {
  it('a private address, before anything is fetched', async () => {
    const { fetch, asked } = stub({});
    for (const url of ['http://127.0.0.1/', 'http://10.0.0.5/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'file:///etc/passwd']) {
      await expect(fetchPage(url, { fetch, assert: assertPublicUrl })).rejects.toMatchObject({ code: 'blocked' });
    }
    expect(asked).toEqual([]);
  });

  it('a public page that redirects to a private address — checked on every hop', async () => {
    const { fetch, asked } = stub({ [PUBLIC]: redirect('http://169.254.169.254/latest/meta-data') });
    const err = await fetchPage(PUBLIC, { fetch, assert: assertPublicUrl }).catch((e) => e);
    expect(err).toBeInstanceOf(PageError);
    expect(err).toMatchObject({ code: 'blocked', message: expect.stringMatching(/redirected to an address/) });
    // The private address was never requested.
    expect(asked).toEqual([PUBLIC]);
  });

  it('more than five redirects', async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i < 7; i++) routes[`http://93.184.216.34/${i}`] = redirect(`http://93.184.216.34/${i + 1}`);
    const { fetch } = stub(routes);
    await expect(fetchPage('http://93.184.216.34/0', { fetch, assert: assertPublicUrl })).rejects.toMatchObject({ code: 'redirects' });
  });

  it('a body over the cap, counted as it streams even when no length is declared', async () => {
    const big = 'x'.repeat(MAX_PAGE_BYTES + 10);
    const { fetch } = stub({ [PUBLIC]: () => new Response(new Blob([big]).stream(), { status: 200, headers: { 'content-type': 'text/plain' } }) });
    await expect(fetchPage(PUBLIC, { fetch, assert: assertPublicUrl })).rejects.toMatchObject({ code: 'too_large' });
  });

  it('a declared length over the cap, without reading it', async () => {
    const { fetch } = stub({ [PUBLIC]: html('<p>hi</p>', { 'content-length': String(MAX_PAGE_BYTES + 1) }) });
    await expect(fetchPage(PUBLIC, { fetch, assert: assertPublicUrl })).rejects.toMatchObject({ code: 'too_large' });
  });

  it('anything but a page, text or a PDF, and an error status', async () => {
    const { fetch } = stub({
      [PUBLIC]: () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      'http://93.184.216.34/gone': () => new Response('no', { status: 404, headers: { 'content-type': 'text/html' } }),
    });
    await expect(fetchPage(PUBLIC, { fetch, assert: assertPublicUrl })).rejects.toMatchObject({ code: 'type' });
    await expect(fetchPage('http://93.184.216.34/gone', { fetch, assert: assertPublicUrl })).rejects.toMatchObject({ code: 'status', message: 'The page answered 404.' });
  });

  it('never repeats the remote server’s own error', async () => {
    const fetch = vi.fn(async () => { throw new Error('secret internal detail'); }) as unknown as typeof globalThis.fetch;
    const err = await fetchPage(PUBLIC, { fetch, assert: assertPublicUrl }).catch((e) => e);
    expect(err).toMatchObject({ code: 'network' });
    expect(String(err.message)).not.toContain('secret');
  });
});

describe('what it reads', () => {
  it('follows a public redirect and cites where it landed', async () => {
    const { fetch } = stub({
      [PUBLIC]: redirect('/final'),
      'http://93.184.216.34/final': html('<html><head><title>Final &amp; real</title></head><body><main><p>The words.</p></main></body></html>'),
    });
    const page = await fetchPage(PUBLIC, { fetch, assert: assertPublicUrl });
    expect(page).toMatchObject({ url: PUBLIC, finalUrl: 'http://93.184.216.34/final', title: 'Final & real', text: 'The words.', kind: 'html', truncated: false });
  });

  it('caps the text and says so', async () => {
    const { fetch } = stub({ [PUBLIC]: () => new Response('word '.repeat(5000), { status: 200, headers: { 'content-type': 'text/plain' } }) });
    const page = await fetchPage(PUBLIC, { fetch, assert: assertPublicUrl, maxCharacters: 100 });
    expect(page.text).toHaveLength(100);
    expect(page.truncated).toBe(true);
  });
});

describe('HTML to text', () => {
  const page = `<!doctype html><html><head><title>Family hubs: guidance &ndash; GOV.UK</title><style>p{color:red}</style><script>var secret = "never read this";</script></head>
<body><header><nav><a href="/">Home</a> Cookies on GOV.UK</nav></header>
<!-- a comment -->
<main id="content"><h1>Family hubs</h1><p>Councils must open a hub&nbsp;by 2027.</p>
<ul><li>First &#8211; one</li><li>Second &#x2014; two</li></ul>
<table><tr><th>Area</th><th>Hubs</th></tr><tr><td>Kent</td><td>12</td></tr></table>
<p>${'Plenty of real guidance text follows here. '.repeat(6)}</p></main>
<footer>Is this page useful? All content is available under the Open Government Licence</footer></body></html>`;

  it('keeps the title and the main content, drops the rest, decodes entities, collapses whitespace', () => {
    const { title, text } = htmlToText(page);
    expect(title).toBe('Family hubs: guidance – GOV.UK');
    expect(text.startsWith('Family hubs\n\nCouncils must open a hub by 2027.')).toBe(true);
    expect(text).toContain('First – one');
    expect(text).toContain('Second — two');
    expect(text).toMatch(/Kent 12/);
    for (const gone of ['never read this', 'color:red', 'Cookies on GOV.UK', 'Is this page useful', 'a comment']) expect(text).not.toContain(gone);
    expect(text).not.toMatch(/ {2}|\n{3}/);
  });

  it('reads the whole body when there is no main, still without the furniture', () => {
    const { text } = htmlToText('<body><nav>Menu</nav><div>One</div><div>Two</div><footer>Foot</footer></body>');
    expect(text).toBe('One\n\nTwo');
  });

  it('decodes numeric and named entities and leaves unknown ones alone', () => {
    expect(decodeEntities('&pound;5 &amp; &#163;6 &#x20AC;7 &madeup;')).toBe('£5 & £6 €7 &madeup;');
  });
});
