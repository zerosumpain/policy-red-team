// The only authentication in this service, so the tests are about what must
// NOT get through rather than about what should.
import { describe, expect, it } from 'vitest';
import {
  ADMIN_COOKIE, clearedCookie, issueSession, passwordMatches,
  readCookie, sessionCookie, sessionValid, SESSION_HOURS, type Credential,
} from './admin-auth';
import { hashPassword } from './credentials';

const GOOD = 'a-long-enough-password';

/**
 * THE SAME PROPERTIES, ASSERTED AGAINST BOTH KINDS OF CREDENTIAL.
 *
 * Phase 18 made the password changeable, which means it can now come from the
 * store as a scrypt verifier as well as from the environment as a string. Every
 * property below has to hold either way — a session scheme that is sound for
 * one source and not the other is a scheme that is sound until somebody changes
 * their password.
 *
 * So the whole suite runs twice. The duplication is the point.
 */
const KINDS: [string, () => Credential][] = [
  ['an environment password', () => ({ kind: 'environment', password: GOOD })],
  ['a stored verifier', () => ({ kind: 'stored', verifier: hashPassword(GOOD) })],
];

describe.each(KINDS)('with %s', (_label, make) => {
  describe('the password check', () => {
    it('accepts the password', () => {
      expect(passwordMatches(GOOD, make())).toBe(true);
    });

    it('rejects a near miss, a prefix and a longer string', () => {
      const credential = make();
      expect(passwordMatches(`${GOOD}x`, credential)).toBe(false);
      expect(passwordMatches(GOOD.slice(0, -1), credential)).toBe(false);
      expect(passwordMatches(GOOD.toUpperCase(), credential)).toBe(false);
      expect(passwordMatches('', credential)).toBe(false);
    });

    it('does not throw on a length mismatch', () => {
      // `timingSafeEqual` throws on unequal lengths, which would turn a wrong
      // password into a 500 and leak the length through the difference.
      const credential = make();
      expect(() => passwordMatches('x', credential)).not.toThrow();
      expect(() => passwordMatches('x'.repeat(5000), credential)).not.toThrow();
    });
  });

  describe('the session cookie', () => {
    it('is accepted while it is current', () => {
      const credential = make();
      expect(sessionValid(issueSession(credential), credential)).toBe(true);
    });

    it('stops being accepted when it expires', () => {
      const credential = make();
      const now = Date.now();
      const session = issueSession(credential, now);
      expect(sessionValid(session, credential, now + (SESSION_HOURS - 1) * 3600_000)).toBe(true);
      expect(sessionValid(session, credential, now + (SESSION_HOURS + 1) * 3600_000)).toBe(false);
    });

    it('cannot be forged by extending the expiry', () => {
      // The whole point of signing it: the expiry is the reader's to read and
      // not theirs to choose.
      const credential = make();
      const [, mac] = issueSession(credential).split('.');
      const forged = `${Date.now() + 10 * 365 * 24 * 3600_000}.${mac}`;
      expect(sessionValid(forged, credential)).toBe(false);
    });

    it('answers the same `false` to every shape of rubbish', () => {
      const credential = make();
      for (const bad of ['', '.', 'x', 'abc.def', `${Date.now()}.`, `.${'a'.repeat(64)}`, 'NaN.aaaa', `${Date.now()}.zzzz`]) {
        expect(`${bad} -> ${sessionValid(bad, credential)}`).toBe(`${bad} -> false`);
      }
      expect(sessionValid(undefined, credential)).toBe(false);
      expect(sessionValid(null, credential)).toBe(false);
    });
  });
});

describe('with no credential at all', () => {
  it('refuses every password and every cookie', () => {
    // An unclaimed install must not be an open one, and `passwordMatches`
    // returning false for null is what lets the sign-in route answer an
    // unclaimed install exactly as it answers a wrong password.
    expect(passwordMatches('', null)).toBe(false);
    expect(passwordMatches('anything', null)).toBe(false);
    expect(sessionValid('whatever', null)).toBe(false);
  });
});

describe('changing the password', () => {
  /*
   * THE PROPERTY THE WHOLE SCHEME RESTS ON, and the one a stored password
   * threatened. The cookie's signing key is derived from the credential, so a
   * new password is a new key and every outstanding session stops validating —
   * with no session table to clean up and no step anybody can forget.
   */
  it('invalidates every session, from the environment', () => {
    const before: Credential = { kind: 'environment', password: GOOD };
    const session = issueSession(before);
    expect(sessionValid(session, before)).toBe(true);
    expect(sessionValid(session, { kind: 'environment', password: 'a-different-long-password' })).toBe(false);
  });

  it('invalidates every session, from the store', () => {
    const before: Credential = { kind: 'stored', verifier: hashPassword(GOOD) };
    const session = issueSession(before);
    expect(sessionValid(session, before)).toBe(true);
    expect(sessionValid(session, { kind: 'stored', verifier: hashPassword('a-different-long-password') })).toBe(false);
  });

  it('invalidates a session even when the password is set to the same value again', () => {
    // A fresh salt makes a different verifier for the same password, so this
    // logs everyone out too. That is the safe direction: "I changed my
    // password" should always mean "and everyone else is out", even when the
    // reader typed what they had before.
    const before: Credential = { kind: 'stored', verifier: hashPassword(GOOD) };
    const session = issueSession(before);
    expect(sessionValid(session, { kind: 'stored', verifier: hashPassword(GOOD) })).toBe(false);
  });

  it('does not let a session cross between the two sources', () => {
    // An install that had a stored password and then had one pinned in the
    // environment must not honour the old cookies, whatever the passwords are.
    const stored: Credential = { kind: 'stored', verifier: hashPassword(GOOD) };
    const fromEnv: Credential = { kind: 'environment', password: GOOD };
    expect(sessionValid(issueSession(stored), fromEnv)).toBe(false);
    expect(sessionValid(issueSession(fromEnv), stored)).toBe(false);
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
