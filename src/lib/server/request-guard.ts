import type { IncomingMessage } from 'node:http';

/**
 * WHAT ANOTHER WEBSITE IS ALLOWED TO MAKE THIS SERVICE DO.
 *
 * The admin cookie is `SameSite=Strict`, which stops another site RIDING a
 * session. It does not stop another site making a request at all, and this
 * service has a surface where that matters on its own:
 *
 *     POST /api/policy-analysis   multipart/form-data, no session required
 *
 * A multipart POST is a CORS-SIMPLE request. It needs no preflight, so a page
 * on any origin the reader happens to visit can submit one, and the browser
 * will send it. On an open install that is a stranger's web page uploading a
 * document to your service and starting an eighteen-stage run against your
 * quota — and the response being unreadable to them does not undo any of it.
 *
 * THE GUARD IS `Sec-Fetch-Site`, WITH `Origin` AS THE FALLBACK. Both are set by
 * the browser and cannot be set by page script; both are absent on a
 * non-browser client such as curl or the CLI, which must keep working. So:
 *
 *   - `Sec-Fetch-Site: same-origin` or `same-site`  → allowed
 *   - `Sec-Fetch-Site: cross-site` or `none`        → refused
 *   - no `Sec-Fetch-Site`, an `Origin` that matches the Host → allowed
 *   - no `Sec-Fetch-Site`, an `Origin` that does not         → refused
 *   - neither header                                → allowed (not a browser)
 *
 * THAT LAST LINE IS THE HONEST LIMIT OF THIS. Anything that can set arbitrary
 * headers can omit both and pass, so this is not an authorisation check and is
 * not written as one — it is the specific defence against a BROWSER being used
 * as the attacker's hands, which is the only way a cross-origin POST reaches
 * here with the reader's network position. Authorisation is
 * `POLICY_ACCESS`; this is in addition to it.
 *
 * IT IS NOT A CHECK ON THE REQUEST'S SOURCE ADDRESS, which is the thing this
 * repository has a standing rule against: `Origin` says which page made the
 * request, not which machine it came from, and behind a tunnel the second is
 * always 127.0.0.1 and tells you nothing.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Why this request should be refused, or null.
 *
 * Only state-changing methods are examined. A GET that a cross-origin page can
 * make is a GET whose response that page cannot read, and refusing those would
 * break an ordinary link.
 */
export function crossSiteProblem(req: IncomingMessage): string | null {
  const method = (req.method ?? 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return null;

  const fetchSite = header(req, 'sec-fetch-site');
  if (fetchSite) {
    if (fetchSite === 'same-origin' || fetchSite === 'same-site') return null;
    return 'This request came from another website. Open the service directly and try again.';
  }

  const origin = header(req, 'origin');
  if (!origin) return null; // Not a browser. curl, the CLI, a health check.
  const host = header(req, 'host');
  if (!host) return 'This request carries an origin but no host, so it cannot be checked.';

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return 'This request carries an origin that is not a URL.';
  }
  // Compared as hosts — name and port — because that is what the browser sends
  // and what `Host` carries. The scheme is deliberately not compared: behind a
  // tunnel the origin is https and the Host this process sees is the same name,
  // and requiring a scheme match would refuse every request on the one
  // deployment that most needs this guard.
  return originHost === host ? null : 'This request came from another website. Open the service directly and try again.';
}
