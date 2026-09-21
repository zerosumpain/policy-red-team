import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { crossSiteProblem } from './request-guard';

const req = (method: string, headers: Record<string, string>) =>
  ({ method, headers } as unknown as IncomingMessage);

/**
 * THE DEFENCE AGAINST A BROWSER BEING USED AS SOMEBODY ELSE'S HANDS.
 *
 * `POST /api/policy-analysis` takes multipart, which is a CORS-simple request:
 * no preflight, so a page on any origin can submit one and the browser will
 * send it. On an open install that is a stranger's web page uploading a
 * document and starting an eighteen-stage run against the reader's quota.
 */
describe('a state-changing request', () => {
  it('is allowed from the same origin', () => {
    expect(crossSiteProblem(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBeNull();
    expect(crossSiteProblem(req('POST', { 'sec-fetch-site': 'same-site' }))).toBeNull();
  });

  it('is refused from another site', () => {
    expect(crossSiteProblem(req('POST', { 'sec-fetch-site': 'cross-site' }))).toMatch(/another website/);
    // `none` is a request the reader typed or bookmarked — not a form post from
    // a page, and not something a POST should be.
    expect(crossSiteProblem(req('POST', { 'sec-fetch-site': 'none' }))).toMatch(/another website/);
  });

  it('falls back to Origin against Host when Sec-Fetch-Site is absent', () => {
    expect(crossSiteProblem(req('POST', { origin: 'https://policy.example', host: 'policy.example' }))).toBeNull();
    expect(crossSiteProblem(req('POST', { origin: 'https://evil.example', host: 'policy.example' }))).toMatch(/another website/);
  });

  it('compares host and port, not scheme', () => {
    // Behind a tunnel the origin is https and the Host this process sees is the
    // same name over a plain connection. Requiring a scheme match would refuse
    // every request on the one deployment that most needs this guard.
    expect(crossSiteProblem(req('POST', { origin: 'https://policy.example', host: 'policy.example' }))).toBeNull();
    expect(crossSiteProblem(req('POST', { origin: 'http://127.0.0.1:5290', host: '127.0.0.1:5290' }))).toBeNull();
    expect(crossSiteProblem(req('POST', { origin: 'http://127.0.0.1:5290', host: '127.0.0.1:5291' }))).toMatch(/another website/);
  });

  it('allows a client that is not a browser', () => {
    // THE HONEST LIMIT OF THIS. curl, the CLI and a health check send neither
    // header, and they must keep working — so anything that can set arbitrary
    // headers can omit both and pass. This is not an authorisation check and is
    // not written as one; `POLICY_ACCESS` is.
    expect(crossSiteProblem(req('POST', {}))).toBeNull();
  });

  it('refuses an origin that is not a URL', () => {
    expect(crossSiteProblem(req('POST', { origin: 'null', host: 'policy.example' }))).toMatch(/not a URL/);
  });
});

describe('a safe method', () => {
  it('is never refused, whatever the headers say', () => {
    // A GET a cross-origin page can make is a GET whose response that page
    // cannot read, and refusing those would break an ordinary link.
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(crossSiteProblem(req(method, { 'sec-fetch-site': 'cross-site' }))).toBeNull();
    }
  });

  it('is matched case-insensitively', () => {
    expect(crossSiteProblem(req('get', { 'sec-fetch-site': 'cross-site' }))).toBeNull();
    // And the reverse: a lowercase verb must not slip past the check.
    expect(crossSiteProblem(req('post', { 'sec-fetch-site': 'cross-site' }))).toMatch(/another website/);
  });
});
