import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ADMIN_COOKIE, clearedCookie, issueSession, passwordMatches, readCookie, sessionCookie, sessionValid,
} from '$lib/server/admin-auth';
import { adminCredential, readerCredential } from '$lib/server/credential-store';
import { accessMode, READER_COOKIE } from '$lib/server/reader-access';
import { rateLimit } from '$lib/server/rate-limit';
import { HttpError, readJson, sendJson } from './http';

/**
 * THE WEAKER GATE, over the part of the service that is not the credential
 * editor.
 *
 * `POLICY_ACCESS=password` turns it on. It exists because
 * `policy.strangeramblings.com` is bound to loopback behind a tunnel, which
 * means the documented security model — "it belongs to whoever is at the
 * machine" — has been wrong about that host since the day it was published, and
 * the Cloudflare Access policy that was meant to be the real lock was still
 * outstanding four days later.
 *
 * IT REUSES THE SESSION MACHINERY AND NOT THE CREDENTIAL. Same signed-statement
 * cookie, same derivation, same timing-safe comparison — there is no argument
 * for a second implementation of a scheme this small. A DIFFERENT password,
 * though, and a different cookie: a reader who can open an assessment must not
 * thereby hold the password that opens the API keys.
 *
 * AN ADMIN SESSION IS ALSO A READER SESSION, because the alternative is asking
 * the person who configured the service to sign in twice with two passwords to
 * look at the thing they configured. It does not work the other way round.
 */

/** A 401 body when this reader may not see the data, or null when they may. */
export async function readerDenied(req: IncomingMessage): Promise<{ message: string; signIn: true } | null> {
  if ((await accessMode()) === 'open') return null;

  const credential = await readerCredential();
  if (!credential) {
    /*
     * THE GATE IS ON AND THERE IS NO PASSWORD BEHIND IT.
     *
     * `POST /api/admin/access` refuses to reach this state, but the environment
     * can: `POLICY_ACCESS=password` with no `POLICY_READER_PASSWORD`. Failing
     * CLOSED is the only safe answer — an operator who asked for a gate and
     * mistyped the second variable must not get an open service that believes
     * it is closed.
     */
    return { message: 'This service is closed: it is configured to need a reader password, and none is set.', signIn: true };
  }

  if (sessionValid(readCookie(req.headers.cookie, READER_COOKIE), credential)) return null;
  // An admin session opens everything, so whoever configured this is not asked
  // to sign in twice.
  if (sessionValid(readCookie(req.headers.cookie, ADMIN_COOKIE), await adminCredential())) return null;

  return { message: 'Sign in to read this.', signIn: true };
}

/** True when the reader reached us over HTTPS — behind a tunnel, only the header knows. */
function isSecure(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (proto ?? '').split(',')[0].trim() === 'https';
}

/**
 * `/api/reader/session` — sign a reader in and out.
 *
 * Deliberately NOT under `/api/admin`, which is the branch that holds
 * credentials and is gated as one. This is the other gate's own door and it has
 * to be reachable by somebody who has not got through either.
 */
export async function handleReader(
  req: IncomingMessage,
  res: ServerResponse,
  segments: string[],
  method: string,
): Promise<boolean> {
  if (segments.length === 1 && segments[0] === 'status' && method === 'GET') {
    const mode = await accessMode();
    sendJson(res, 200, {
      // Whether a gate exists is not a secret — a reader looking at a sign-in
      // form can see that much — and the client needs it to decide what to draw.
      gated: mode === 'password',
      signedIn: !(await readerDenied(req)),
    });
    return true;
  }

  if (segments.length === 1 && segments[0] === 'session' && method === 'POST') {
    // Its own bucket, not the admin one: a reader fumbling their password must
    // not be able to lock the owner out of the configuration page, and an
    // attacker guessing one must not get a free extra budget by switching to
    // the other.
    const limit = rateLimit('reader-signin', { capacity: 8, refillPerSecond: 1 / 30 });
    if (!limit.allowed) {
      throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(limit.retryAfterMs / 1000)} seconds.`);
    }
    const credential = await readerCredential();
    const body = await readJson(req);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!passwordMatches(password, credential)) throw new HttpError(401, 'That is not the password.');
    res.setHeader('set-cookie', sessionCookie(issueSession(credential!), isSecure(req), undefined, READER_COOKIE));
    sendJson(res, 200, { signedIn: true });
    return true;
  }

  if (segments.length === 1 && segments[0] === 'session' && method === 'DELETE') {
    res.setHeader('set-cookie', clearedCookie(isSecure(req), READER_COOKIE));
    sendJson(res, 200, { signedIn: false });
    return true;
  }

  return false;
}
