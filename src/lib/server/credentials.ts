import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * A PASSWORD, STORED SO THAT HOLDING THE STORE IS NOT HOLDING THE PASSWORD.
 *
 * Until phase 18 the admin password was `POLICY_ADMIN_PASSWORD` and nothing
 * else: read from the environment, compared as a string, and used directly as
 * the HMAC key for the session cookie. That is a sound design for a credential
 * an operator sets in a file, and it cannot survive the thing the owner asked
 * for — a password the reader changes from the browser — because a password
 * that can change has to be written down somewhere, and a password written down
 * in a readable form is one that leaks with the first database copy.
 *
 * WHY scrypt AND NOT THE AES-GCM ALREADY HERE. `settings-store.ts` encrypts
 * every value it keeps, and encrypting the password would work in the sense
 * that a dump would not reveal it. It would also mean the server holds the
 * plaintext in memory and can print it, which is exactly the property the
 * credential should NOT have: nothing needs to read this back, only to check a
 * guess against it. A one-way verifier is the smaller promise, and `node:crypto`
 * has scrypt, so it costs no dependency.
 *
 * The parameters are Node's defaults for scrypt apart from N, which is raised to
 * 2^15. This is checked once per sign-in against a token bucket, not per
 * request, so the cost is paid by an attacker and not by a reader.
 *
 * THE VERIFIER IS ALSO THE COOKIE'S SIGNING KEY, which keeps a property the old
 * design had for free: changing the password invalidates every session ever
 * issued, with no session table to clean up. See `admin-auth.ts`.
 */

const N = 1 << 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * NODE'S DEFAULT `maxmem` IS 32 MB AND scrypt AT THESE PARAMETERS NEEDS 33.5.
 *
 * `128 * N * r` is 128 × 32768 × 8 = 33,554,432 bytes, which is just over the
 * default — so `scryptSync` throws `memory limit exceeded` rather than being
 * slow. The failure is a RangeError at hash time, not a weak hash, so it fails
 * loudly; it is still exactly the sort of thing that would have shipped if the
 * only test had used a smaller N than production.
 *
 * Set with headroom so raising N once more does not need this line changed
 * again, and stated here rather than inline so the arithmetic is visible.
 */
const MAX_MEM = 128 * N * R * 2;

/** The shortest password this service will accept. */
export const MINIMUM_LENGTH = 12;

/**
 * `scrypt$<N>$<salt hex>$<hash hex>`.
 *
 * The parameters travel with the value so raising N later does not invalidate
 * every existing credential — an old verifier keeps verifying at its own cost
 * until the reader next changes their password.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return `scrypt$${N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Whether this is the password. Timing-safe, and false rather than throwing on
 * anything malformed.
 *
 * A verifier that cannot be parsed returns false, which fails CLOSED: the panel
 * refuses every password rather than accepting any. The alternative — treating
 * an unreadable verifier as "no password set" — would turn a corrupted row into
 * an open door, and `readAll()` already drops rows it cannot decrypt.
 */
export function verifyPassword(password: string, verifier: string): boolean {
  const parts = verifier.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const cost = Number(parts[1]);
  if (!Number.isInteger(cost) || cost < 2 || (cost & (cost - 1)) !== 0) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2], 'hex');
    expected = Buffer.from(parts[3], 'hex');
  } catch {
    return false;
  }
  if (!salt.length || expected.length !== KEY_LENGTH) return false;

  let actual: Buffer;
  try {
    // `maxmem` scales with the verifier's OWN cost, not the current one, so an
    // old verifier made with smaller parameters still verifies — and one made
    // with absurdly large ones throws and is caught below rather than
    // exhausting this process's memory.
    actual = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, { N: cost, r: R, p: P, maxmem: 128 * cost * R * 2 });
  } catch {
    // A cost parameter large enough to exceed scrypt's memory limit throws.
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * Why this password is not acceptable, or null.
 *
 * The floor is a length and nothing else. A composition rule — a digit, a
 * symbol, a capital — makes a password harder to remember without making it
 * harder to guess, and the NCSC has been saying so for a decade. Length is the
 * property that matters and it is the one thing checked.
 *
 * `admin` IS REFUSED BY NAME, because this service ships with `admin`/`admin`
 * as a one-shot claim credential and "change it to admin" would leave the
 * install in exactly the state the claim exists to get it out of. It is refused
 * by the length rule anyway; saying so explicitly is for the reader who tries.
 */
export function passwordProblem(password: string): string | null {
  const value = password.normalize('NFKC');
  // THE SPECIFIC ANSWER FIRST. `admin` is five characters, so a length check
  // written above this one would fire instead and tell a reader their password
  // is too short — true, unhelpful, and it leaves them to discover the real
  // objection by lengthening it.
  if (value.toLowerCase() === DEFAULT_PASSWORD) {
    return 'That is the password this service ships with, which is the one it must not keep.';
  }
  if (value.length < MINIMUM_LENGTH) {
    return `A password has to be at least ${MINIMUM_LENGTH} characters. Length is what makes it hard to guess — a long phrase you can remember beats a short one you cannot.`;
  }
  return null;
}

/**
 * THE CREDENTIAL AN UNCLAIMED INSTALL ACCEPTS, ONCE, TO SET A REAL ONE.
 *
 * It is not a login and it never opens anything: the only request it is
 * accepted on is the one that replaces it, and no session cookie exists until
 * the replacement is written. See `claim.ts` for the conditions that have to
 * hold before it is accepted at all.
 */
export const DEFAULT_USERNAME = 'admin';
export const DEFAULT_PASSWORD = 'admin';

/** Whether a submitted pair is the shipped default. Timing-safe on the password. */
export function isDefaultCredential(username: string, password: string): boolean {
  if (username.trim().toLowerCase() !== DEFAULT_USERNAME) return false;
  const given = Buffer.from(password);
  const expected = Buffer.from(DEFAULT_PASSWORD);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
