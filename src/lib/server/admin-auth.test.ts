// The only authentication in this service, so the tests are about what must
// NOT get through rather than about what should.
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_COOKIE, adminProblem, clearedCookie, issueSession, passwordMatches,
  readCookie, sessionCookie, sessionValid, SESSION_HOURS,
} from './admin-auth';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

const GOOD = 'a-long-enough-password';
const withPassword = (value?: string) => {
  if (value === undefined) delete process.env.POLICY_ADMIN_PASSWORD;
  else process.env.POLICY_ADMIN_PASSWORD = value;
};

describe('when the panel is closed', () => {
  it('is closed because NO password is set, not open', () => {
    // A service that published its credential editor because somebody forgot a
    // deployment variable is the failure this file exists to prevent.
    withPassword(undefined);
    expect(adminProblem()).toMatch(/no admin password/i);
    expect(passwordMatches('')).toBe(false);
    expect(passwordMatches('anything')).toBe(false);
    expect(issueSession()).toBeNull();
    expect(sessionValid('whatever')).toBe(false);
  });

  it('is closed for a password too short to be one', () => {
    withPassword('short');
    expect(adminProblem()).toMatch(/twelve/i);
    // And the short password does not work even though it is the configured one.
    expect(passwordMatches('short')).toBe(false);
  });

  it('is open for a password long enough', () => {
    withPassword(GOOD);
    expect(adminProblem()).toBeNull();
    expect(passwordMatches(GOOD)).toBe(true);
  });
});

describe('the password check', () => {
  it('rejects a near miss, a prefix and a longer string', () => {
    withPassword(GOOD);
    expect(passwordMatches(`${GOOD}x`)).toBe(false);
    expect(passwordMatches(GOOD.slice(0, -1))).toBe(false);
    expect(passwordMatches(GOOD.toUpperCase())).toBe(false);
    expect(passwordMatches('')).toBe(false);
  });

  it('does not throw on a length mismatch', () => {
    // `timingSafeEqual` throws on unequal lengths, which would turn a wrong
    // password into a 500 and leak the length through the difference.
    withPassword(GOOD);
    expect(() => passwordMatches('x')).not.toThrow();
    expect(() => passwordMatches('x'.repeat(5000))).not.toThrow();
  });
});

describe('the session cookie', () => {
  it('is accepted while it is current', () => {
    withPassword(GOOD);
    const session = issueSession()!;
    expect(sessionValid(session)).toBe(true);
  });

  it('stops being accepted when it expires', () => {
    withPassword(GOOD);
    const now = Date.now();
    const session = issueSession(now)!;
    expect(sessionValid(session, now + (SESSION_HOURS - 1) * 3600_000)).toBe(true);
    expect(sessionValid(session, now + (SESSION_HOURS + 1) * 3600_000)).toBe(false);
  });

  it('cannot be forged by extending the expiry', () => {
    // The whole point of signing it: the expiry is the reader's to read and not
    // theirs to choose.
    withPassword(GOOD);
    const session = issueSession()!;
    const [, mac] = session.split('.');
    const forged = `${Date.now() + 10 * 365 * 24 * 3600_000}.${mac}`;
    expect(sessionValid(forged)).toBe(false);
  });

  it('is invalidated by changing the password, with nothing to clean up', () => {
    withPassword(GOOD);
    const session = issueSession()!;
    expect(sessionValid(session)).toBe(true);
    withPassword('a-different-long-password');
    expect(sessionValid(session)).toBe(false);
  });

  it('answers the same `false` to every shape of rubbish', () => {
    withPassword(GOOD);
    for (const bad of ['', '.', 'x', 'abc.def', `${Date.now()}.`, `.${'a'.repeat(64)}`, 'NaN.aaaa', `${Date.now()}.zzzz`]) {
      expect(`${bad} -> ${sessionValid(bad)}`).toBe(`${bad} -> false`);
    }
    expect(sessionValid(undefined)).toBe(false);
    expect(sessionValid(null)).toBe(false);
  });
});

describe('the Set-Cookie header', () => {
  it('is HttpOnly, SameSite=Strict and scoped to the whole site', () => {
    const header = sessionCookie('value', false);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/');
    expect(header).not.toContain('Secure');
  });

  it('is Secure over HTTPS, which behind a tunnel is what the forwarded header says', () => {
    expect(sessionCookie('value', true)).toContain('Secure');
  });

  it('clears by expiring immediately rather than by being absent', () => {
    expect(clearedCookie(true)).toContain('Max-Age=0');
    expect(clearedCookie(true)).toContain(`${ADMIN_COOKIE}=`);
  });
});

describe('reading a cookie out of a header', () => {
  it('finds one among several, and is not fooled by a suffix match', () => {
    const header = `other=1; ${ADMIN_COOKIE}=wanted; not_${ADMIN_COOKIE}=decoy`;
    expect(readCookie(header, ADMIN_COOKIE)).toBe('wanted');
  });

  it('returns nothing for an absent header or an absent cookie', () => {
    expect(readCookie(undefined, ADMIN_COOKIE)).toBeUndefined();
    expect(readCookie('a=1; b=2', ADMIN_COOKIE)).toBeUndefined();
    expect(readCookie('novalue', ADMIN_COOKIE)).toBeUndefined();
  });
});
