import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '$lib/db';
import { readAll } from '$lib/server/settings-store';

/**
 * WHETHER THIS INSTALL MAY STILL BE CLAIMED WITH `admin`/`admin`.
 *
 * The owner asked for a default credential that the reader changes on first
 * sign-in. A default credential on a host anything can reach is how services
 * get taken, and this repository's own `CLAUDE.md` records a 33-hour outage and
 * a publicly exposed admin area from one gate that was weaker than it looked.
 * So the default exists, and it is fenced.
 *
 * FIVE CONDITIONS, ALL OF WHICH MUST HOLD:
 *
 *   1. No admin verifier is stored. The claim is one-shot by construction —
 *      the only thing it can do is write one, after which it is refused.
 *   2. No provider credential is stored. An install somebody has already put an
 *      API key into is not an unclaimed install, whatever the verifier says.
 *   3. No assessment exists. Same argument from the other direction: a database
 *      with work in it has been used, and a claim would be a takeover.
 *   4. `POLICY_ADMIN_PASSWORD` is not set. An install whose password comes from
 *      the environment already has one; the claim has nothing to offer it.
 *   5. Either the service is on loopback, or `POLICY_SETUP_TOKEN` is set and
 *      presented. On a laptop the claim is free. On anything reachable it needs
 *      a secret the operator put there, which is the decision taken on
 *      2026-09-21 and recorded in `docs/phase-18-plan.md`.
 *
 * WHY 2 AND 3 AND NOT JUST 1. The verifier lives in `policy_settings`,
 * encrypted with a key in a file outside the database — and `readAll()` DROPS a
 * row it cannot decrypt, by design, so that one stale credential cannot stop
 * the service. Put those together and a lost or restored-from-elsewhere key
 * file turns a live install into one with no readable verifier: unclaimed, and
 * claimable by whoever asks first. Conditions 2 and 3 are what stop that being
 * a takeover, because the same key loss leaves the assessments and the provider
 * rows exactly where they are.
 *
 * THIS IS NOT A GATE ON THE REQUEST'S SOURCE ADDRESS. Condition 5 reads
 * `POLICY_HOST` — what the operator configured this process to bind to — and
 * never where a request claims to have come from. Behind a tunnel every request
 * arrives from 127.0.0.1, so "local connections only" passes for the entire
 * internet. The rule this encodes, which belongs in `AGENTS.md`: an address may
 * make you stricter, never more permissive.
 */

export type ClaimState = {
  /** True when `admin`/`admin` would be accepted right now. */
  claimable: boolean;
  /** Why not, for the server's own logs. Never sent to an unauthenticated caller. */
  reason: string | null;
  /** True when a setup token is required to claim — the off-loopback case. */
  tokenRequired: boolean;
};

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/** What this process was told to bind to. Not where a request came from. */
export function boundToLoopback(): boolean {
  return LOOPBACK.has((process.env.POLICY_HOST ?? '127.0.0.1').trim());
}

export function setupToken(): string | null {
  return process.env.POLICY_SETUP_TOKEN?.trim() || null;
}

/** Namespaced beside the provider settings, and encrypted like them. */
export const ADMIN_VERIFIER = 'admin.verifier';
export const READER_VERIFIER = 'reader.verifier';

export async function claimState(): Promise<ClaimState> {
  const tokenRequired = !boundToLoopback();

  if (process.env.POLICY_ADMIN_PASSWORD?.trim()) {
    return { claimable: false, reason: 'POLICY_ADMIN_PASSWORD is set, so this install already has a password.', tokenRequired };
  }
  if (tokenRequired && !setupToken()) {
    return {
      claimable: false,
      reason:
        'This service is not bound to loopback, so the shipped credential is refused. ' +
        'Set POLICY_SETUP_TOKEN to a secret of your choosing and present it, or set POLICY_ADMIN_PASSWORD.',
      tokenRequired,
    };
  }

  const stored = await readAll().catch(() => ({} as Record<string, string>));
  if (stored[ADMIN_VERIFIER]) {
    return { claimable: false, reason: 'This install has already been claimed.', tokenRequired };
  }
  // A provider secret means somebody configured this, whatever the verifier
  // says — most likely a settings key that was lost or replaced.
  if (Object.keys(stored).some((key) => key.startsWith('provider.') && stored[key])) {
    return {
      claimable: false,
      reason:
        'This install holds provider configuration, so it is not new. If the admin password is lost, ' +
        'set POLICY_ADMIN_PASSWORD on the server and restart.',
      tokenRequired,
    };
  }
  if (await hasAssessments()) {
    return {
      claimable: false,
      reason:
        'This install holds assessments, so it is not new. If the admin password is lost, ' +
        'set POLICY_ADMIN_PASSWORD on the server and restart.',
      tokenRequired,
    };
  }
  return { claimable: true, reason: null, tokenRequired };
}

/**
 * Whether any assessment exists.
 *
 * `select 1 … limit 1` rather than a count or a row estimate: the question is
 * existence, so the first row answers it, and `n_live_tup` is an estimate that
 * has been wrong by more than an order of magnitude on this estate.
 *
 * Fails CLOSED. If the table cannot be read, assume there is work here rather
 * than assume there is not.
 */
async function hasAssessments(): Promise<boolean> {
  try {
    const result = await db.execute(sql`select 1 from policy_analyses limit 1`);
    return ((result as unknown as { rows: unknown[] }).rows ?? []).length > 0;
  } catch {
    return true;
  }
}

/**
 * Whether a presented setup token is the configured one, where one is required.
 *
 * Length-independent comparison is not worth it here — the token is compared
 * once per claim attempt behind a rate limit, and it is not a password being
 * guessed character by character. It is still compared in constant time because
 * the primitive is one line.
 */
export function setupTokenAccepted(presented: string | undefined): boolean {
  if (boundToLoopback()) return true;
  const expected = setupToken();
  if (!expected) return false;
  const given = Buffer.from(presented ?? '');
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}
