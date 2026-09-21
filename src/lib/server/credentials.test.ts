import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PASSWORD, DEFAULT_USERNAME, hashPassword, isDefaultCredential,
  MINIMUM_LENGTH, passwordProblem, verifyPassword,
} from './credentials';

describe('hashing a password', () => {
  it('never produces the same verifier twice', () => {
    // A fresh salt per hash. Two readers who choose the same password must not
    // have the same row, and rotating to the same password must still change
    // the verifier — which is what logs every session out.
    expect(hashPassword('a-long-enough-password')).not.toBe(hashPassword('a-long-enough-password'));
  });

  it('carries its parameters, so raising the cost later does not lock anyone out', () => {
    const verifier = hashPassword('a-long-enough-password');
    const [scheme, cost] = verifier.split('$');
    expect(scheme).toBe('scrypt');
    expect(Number(cost)).toBeGreaterThanOrEqual(1 << 14);
  });

  it('does not contain the password', () => {
    expect(hashPassword('correct-horse-battery')).not.toContain('correct-horse-battery');
  });
});

describe('verifying a password', () => {
  const verifier = hashPassword('a-long-enough-password');

  it('accepts the password and refuses everything else', () => {
    expect(verifyPassword('a-long-enough-password', verifier)).toBe(true);
    expect(verifyPassword('a-long-enough-passwore', verifier)).toBe(false);
    expect(verifyPassword('a-long-enough-password ', verifier)).toBe(false);
    expect(verifyPassword('', verifier)).toBe(false);
  });

  it('normalises unicode, so the same typed password works on any keyboard', () => {
    // é as one code point and as e + combining accent look identical and are
    // different bytes. A reader who set their password on a Mac and typed it on
    // Windows should still get in.
    const composed = hashPassword('passwordé-long-enough');
    expect(verifyPassword('passwordé-long-enough', composed)).toBe(true);
  });

  it('FAILS CLOSED on a verifier it cannot parse', () => {
    // A corrupted or truncated row must refuse every password, not accept any.
    // The opposite reading — "unreadable means unset means open" — is how a
    // damaged database becomes an open door.
    for (const bad of ['', 'x', 'scrypt$', 'scrypt$1024$zz$zz', 'bcrypt$1$aa$bb', 'scrypt$notanumber$aa$bb', 'scrypt$1000$aa$bb']) {
      expect(`${bad} -> ${verifyPassword('a-long-enough-password', bad)}`).toBe(`${bad} -> false`);
    }
  });

  it('does not throw on anything', () => {
    expect(() => verifyPassword('x'.repeat(10_000), verifier)).not.toThrow();
    expect(() => verifyPassword('x', 'scrypt$1073741824$aa$bb')).not.toThrow();
  });
});

describe('what makes a password acceptable', () => {
  it('asks for length and nothing else', () => {
    // No composition rule. A digit-and-a-symbol requirement makes a password
    // harder to remember without making it harder to guess; the NCSC has been
    // saying so for a decade.
    expect(passwordProblem('x'.repeat(MINIMUM_LENGTH))).toBeNull();
    expect(passwordProblem('x'.repeat(MINIMUM_LENGTH - 1))).toMatch(/at least/);
    expect(passwordProblem('a whole sentence with spaces in it')).toBeNull();
  });

  it('refuses the shipped password by name', () => {
    // It is refused by the length rule anyway. Saying so explicitly is for the
    // reader who tries, because "change it to admin" would leave the install in
    // exactly the state the claim exists to get it out of.
    expect(passwordProblem(DEFAULT_PASSWORD)).toMatch(/ships with/);
    expect(passwordProblem('ADMIN')).toMatch(/ships with/);
  });
});

describe('the shipped credential', () => {
  it('is recognised, case-insensitively on the name only', () => {
    expect(isDefaultCredential(DEFAULT_USERNAME, DEFAULT_PASSWORD)).toBe(true);
    expect(isDefaultCredential('Admin', DEFAULT_PASSWORD)).toBe(true);
    expect(isDefaultCredential(' admin ', DEFAULT_PASSWORD)).toBe(true);
  });

  it('is not anything else', () => {
    expect(isDefaultCredential(DEFAULT_USERNAME, 'ADMIN')).toBe(false);
    expect(isDefaultCredential(DEFAULT_USERNAME, 'admin ')).toBe(false);
    expect(isDefaultCredential('administrator', DEFAULT_PASSWORD)).toBe(false);
    expect(isDefaultCredential('', '')).toBe(false);
  });

  it('does not throw comparing a password of the wrong length', () => {
    expect(() => isDefaultCredential(DEFAULT_USERNAME, 'x'.repeat(5000))).not.toThrow();
  });
});
