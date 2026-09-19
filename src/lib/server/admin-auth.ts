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
 * credentials live. Everything else stays as open as it was — reading an
 * assessment, downloading a pack — because that is the deployment's shape and
 * narrowing it is a separate decision. A Cloudflare Access policy on the
 * hostname complements this; it does not replace it, and relying on one that is
 * not configured yet is how the incident above happened.
 *
 * THE COOKIE IS A SIGNED STATEMENT, NOT A LOOKUP. There is no session table
 * because there is no need for one: the cookie carries an expiry and an HMAC
 * over it, keyed by the password itself, so changing the password invalidates
 * every cookie ever issued without anything to clean up. Comparison is
 * timing-safe, and a forged or expired cookie is indistinguishable from none.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'policy_admin';
/** Long enough to configure something without re-typing; short enough that a borrowed laptop forgets. */
export const SESSION_HOURS = 12;

/** The configured password, or null when the panel is switched off entirely. */
export function adminPassword(): string | null {
  const value = process.env.POLICY_ADMIN_PASSWORD?.trim();
  return value ? value : null;
}

/**
 * Why the panel cannot be opened, or null.
 *
 * NO PASSWORD MEANS NO PANEL — it is not an open panel. A service that
 * published its credential editor because somebody forgot a variable is the
 * failure this whole file exists to prevent, so the absence of the setting is a
 * closed door with an explanation rather than an open one.
 */
export function adminProblem(): string | null {
  const password = adminPassword();
  if (!password) {
    return 'No admin password is set on this install, so the panel is closed. Set POLICY_ADMIN_PASSWORD and restart.';
  }
  if (password.length < 12) {
    return 'The admin password on this install is shorter than twelve characters, so the panel is closed. Set a longer POLICY_ADMIN_PASSWORD and restart.';
  }
  return null;
}

const sign = (password: string, payload: string) =>
  createHmac('sha256', password).update(payload).digest('hex');

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
 * Timing-safe, because the alternative leaks the password one character at a
 * time to anyone patient enough to measure — and this is reachable from the
 * open internet.
 */
export function passwordMatches(candidate: string, now = Date.now()): boolean {
  void now;
  const password = adminPassword();
  if (!password || adminProblem()) return false;
  return sameString(candidate, password);
}

/** A cookie value: when it expires, and proof that this server issued it. */
export function issueSession(now = Date.now()): string | null {
  const password = adminPassword();
  if (!password) return null;
  const expires = now + SESSION_HOURS * 60 * 60 * 1000;
  return `${expires}.${sign(password, String(expires))}`;
}

/**
 * Whether a cookie is one of ours and still current.
 *
 * Every failure — malformed, forged, expired, no password configured — returns
 * the same `false`. Distinguishing them would tell an attacker whether they had
 * the shape right.
 */
export function sessionValid(cookie: string | undefined | null, now = Date.now()): boolean {
  const password = adminPassword();
  if (!password || !cookie) return false;
  const dot = cookie.indexOf('.');
  if (dot <= 0) return false;
  const expires = cookie.slice(0, dot);
  const mac = cookie.slice(dot + 1);
  if (!/^\d+$/.test(expires)) return false;
  if (!sameString(mac, sign(password, expires))) return false;
  return Number(expires) > now;
}

/**
 * The Set-Cookie header for a session.
 *
 * `HttpOnly` so script cannot read it, `SameSite=Strict` so another site cannot
 * ride it, `Path=/` because both the page and its API need it, and `Secure`
 * whenever the request arrived over HTTPS — which behind a tunnel means reading
 * the forwarded header, since the connection to this process is plain.
 */
export function sessionCookie(value: string, secure: boolean, maxAgeSeconds = SESSION_HOURS * 3600): string {
  const parts = [
    `${ADMIN_COOKIE}=${value}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const clearedCookie = (secure: boolean) => sessionCookie('', secure, 0);

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
