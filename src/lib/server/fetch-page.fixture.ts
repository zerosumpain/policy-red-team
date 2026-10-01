import type { FetchedPage, FetchPage, PageFailure } from './fetch-page';

/**
 * A PAGE READER THE FIXTURE BUILDS CANNOT POINT AT A NETWORK (phase 22 part 2).
 *
 * `fetch-page.ts` is free and needs no key, so this is not about money: it is
 * the register's reason. A fixture run must not depend on a network it cannot
 * promise, and the walk must not fetch a real page about a synthetic paper.
 * `build.mjs` swaps this in for both fixture bundles and asserts the real
 * reader's user agent is absent from their bytes.
 *
 * It answers deterministically: any `https://` address on a host that is not
 * plainly private comes back as a short page about delivery capacity — the
 * subject the fixture paper's assumptions turn on — so the walk can submit one
 * URL as a reader's source and watch it travel through research, evidence and
 * the report. An address on `fail.example` fails, so the refusal path has
 * something to show too.
 */
export class PageError extends Error {
  constructor(readonly code: PageFailure, message: string) {
    super(message);
    this.name = 'PageError';
  }
}

export const fetchPage: FetchPage = async (url) => {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new PageError('blocked', 'That address is not a public web page this service will fetch.'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new PageError('blocked', 'That address is not a public web page this service will fetch.');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(parsed.hostname)) throw new PageError('blocked', 'That address is not a public web page this service will fetch.');
  if (parsed.hostname === 'fail.example') throw new PageError('network', 'The page could not be reached.');
  const page: FetchedPage = {
    url,
    finalUrl: url,
    title: 'Council delivery capacity review',
    text: 'Council delivery capacity review. A review of local delivery found that most councils had the staff to run the service, '
      + 'but a third reported vacancies in the posts the policy relies on, and none had been funded for the extra demand. '
      + 'The review recommends that councils publish monthly delivery figures so that progress can be checked.',
    kind: 'html',
    truncated: false,
  };
  return page;
};

export type { FetchedPage, FetchPage, PageFailure } from './fetch-page';
