/**
 * THE ONE PLACE THIS SERVICE AUTHENTICATES ANYTHING.
 *
 * `access.ts` has said since phase 4 that "if this build is ever put behind a
 * network listener that is not loopback, this is the file that has to grow real
 * authentication". It is behind one — a cloudflared tunnel — and an admin panel
 * holding API keys is what forces the issue.
 *
 * DO NOT REPLACE THIS WITH AN ADDRESS CHECK. Behind a tunnel every request
 * arrives from 127.0.0.1, so "only allow local connections" is a gate that
 * passes for the entire internet. That exact mistake took the author's main site
 * down for 33 hours and exposed its admin area, and it is written into
 * `CLAUDE.md` as a hard rule. A password is a password.
 *
 * WHAT THIS IS AND IS NOT. It gates `/admin` and `/api/admin/*`, which is where
 * credentials live. `POLICY_ACCESS` in `reader-access.ts` is a separate, weaker
 * gate over the rest of the service, with a SEPARATE credential — a reader who
 * can open an assessment must not thereby hold the password that opens the
 * credential editor.
 *
 * ── WHAT PHASE 18 CHANGED ──────────────────────────────────────────────────
 *
 * The password used to be `POLICY_ADMIN_PASSWORD` and only that: read from the
 * environment, compared as a string, and used DIRECTLY as the HMAC key for the
 * session cookie. Changing it therefore invalidated every cookie ever issued,
 * with no session table to clean up — a genuinely good property that came for
 * free, and the one thing a stored, changeable password threatened.
 *
 * It is kept. The cookie is signed with a key DERIVED FROM THE CREDENTIAL —
 * from the password itself when the environment supplies one, and from the
 * scrypt verifier when the store does. Either way the key changes exactly when
 * the credential changes, so rotating the password still logs everyone out and
 * there is still nothing to clean up.
 *
 * THE COOKIE IS A SIGNED STATEMENT, NOT A LOOKUP. It carries an expiry and an
 * HMAC over it. Comparison is timing-safe, and a forged or expired cookie is
 * indistinguishable from none.
 *
 * THIS MODULE IS PURE. Every function takes the credential it should check
 * against rather than reading one. That is what makes the claim flow safe to
 * write and safe to test: there is no path through here that can issue a
 * session for a credential the caller did not hand it, and no hidden read of a
 * global that a test could leave in the wrong state.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPassword } from './credentials';

export const ADMIN_COOKIE = 'policy_admin';
/** Long enough to configure something without re-typing; short enough that a borrowed laptop forgets. */
export const SESSION_HOURS = 12;

/**
 * What a password is checked against.
 *
 * Two shapes because there are two sources and they are checked differently —
 * the environment gives a password to compare, the store gives a one-way
 * verifier to test a guess against. Normalising them into one would mean either
 * hashing the environment's value on every boot (a fresh salt each time, so
 * every restart would invalidate every session) or keeping the stored one
 * reversible (which is the property a verifier exists not to have).
 */
export type Credential =
  | { kind: 'environment'; password: string }
  | { kind: 'stored'; verifier: string };

/**
 * The key the session cookie is signed with.
 *
 * Derived rather than stored, so there is no second secret to manage and no way
 * for it to drift out of step with the credential. `password` for an
 * environment credential and `verifier` for a stored one are both secret and
 * both change exactly when the password does, which is the property the whole
 * scheme rests on.
 */
function signingKey(credential: Credential): string {
  const material = credential.kind === 'environment' ? credential.password : credential.verifier;
  // A fixed label so this key can never collide with another use of the same
  // material, should one ever be added.
  return createHmac('sha256', material).update('policy-admin-session-v1').digest('hex');
}

const sign = (credential: Credential, payload: string) =>
  createHmac('sha256', signingKey(credential)).update(payload).digest('hex');

/** Constant-time, and false rather than throwing on a length mismatch. */
function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Whether this is the password.
 *
 * Timing-safe in both branches, because the alternative leaks the password one
 * character at a time to anyone patient enough to measure — and this is
 * reachable from the open internet.
 */
export function passwordMatches(candidate: string, credential: Credential | null): boolean {
  if (!credential) return false;
  return credential.kind === 'environment'
    ? sameString(candidate, credential.password)
    : verifyPassword(candidate, credential.verifier);
}

/** A cookie value: when it expires, and proof that this server issued it. */
export function issueSession(credential: Credential, now = Date.now()): string {
  const expires = now + SESSION_HOURS * 60 * 60 * 1000;
  return `${expires}.${sign(credential, String(expires))}`;
}

/**
 * Whether a cookie is one of ours and still current.
 *
 * Every failure — malformed, forged, expired, no credential configured —
 * returns the same `false`. Distinguishing them would tell an attacker whether
 * they had the shape right.
 */
export function sessionValid(
  cookie: string | undefined | null,
  credential: Credential | null,
  now = Date.now(),
): boolean {
  if (!credential || !cookie) return false;
  const dot = cookie.indexOf('.');
  if (dot <= 0) return false;
  const expires = cookie.slice(0, dot);
  const mac = cookie.slice(dot + 1);
  if (!/^\d+$/.test(expires)) return false;
  if (!sameString(mac, sign(credential, expires))) return false;
  return Number(expires) > now;
}

/**
 * The Set-Cookie header for a session.
 *
 * `HttpOnly` so script cannot read it, `SameSite=Strict` so another site cannot
 * ride it, `Path=/` because both the page and its API need it, and `Secure`
 * whenever the request arrived over HTTPS — which behind a tunnel means reading
 * the forwarded header, since the connection to this process is plain.
 *
 * NO `__Host-` PREFIX, and that is deliberate rather than an oversight. The
 * prefix requires `Secure`, and this service runs on plain loopback for every
 * reader who is not behind a tunnel — a name that only works in one of the two
 * supported deployments is worse than a name that works in both. The three
 * attributes the prefix would enforce are all set explicitly above.
 */
export function sessionCookie(
  value: string,
  secure: boolean,
  maxAgeSeconds = SESSION_HOURS * 3600,
  // The reader gate issues the same shape of cookie under its own name. A
  // parameter rather than a second implementation, because two copies of a
  // signing scheme is how one of them stops being maintained.
  name = ADMIN_COOKIE,
): string {
  const parts = [
    `${name}=${value}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const clearedCookie = (secure: boolean, name = ADMIN_COOKIE) => sessionCookie('', secure, 0, name);

/** Read one cookie out of a request header without pulling in a parser. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}
