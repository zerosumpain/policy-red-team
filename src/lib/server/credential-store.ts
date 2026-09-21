import type { Credential } from './admin-auth';
import { ADMIN_VERIFIER, READER_VERIFIER } from './claim';
import { readAll, writeSetting } from './settings-store';
import { hashPassword } from './credentials';

/**
 * WHERE THE TWO PASSWORDS COME FROM, AND WHICH SOURCE WINS.
 *
 * `admin-auth.ts` is pure and checks whatever credential it is handed. This is
 * the module that decides what to hand it, and there is exactly one rule, the
 * same one the provider registry follows:
 *
 *     THE ENVIRONMENT BEATS THE STORE, ALWAYS.
 *
 * A deployment managed by Ansible keeps behaving the way its files say it does,
 * and nobody has to work out which of two sources is live. It is also the
 * recovery path: an operator who has lost the admin password sets
 * `POLICY_ADMIN_PASSWORD`, restarts, and is in — without a reset flow, a
 * recovery email, or any of the machinery a service with one user does not need.
 *
 * TWO CREDENTIALS, STATED EXPLICITLY. The admin password opens the credential
 * editor. The reader password, where one is set, opens the rest of the service.
 * They are separate because a reader who can open an assessment must not
 * thereby hold the key to the API keys — and because they are set at different
 * times by different people. Sharing one verifier between them was considered
 * and is the kind of economy that reads as sensible until somebody is given the
 * reader password.
 *
 * CACHED IN A MODULE VARIABLE, refreshed whenever it changes — the same pattern
 * `catalogue.ts` and `call-deadline.ts` use, and for the same reason: reading
 * the store means decrypting it, and this is consulted on every gated request
 * rather than once.
 */

let cachedAdmin: Credential | null | undefined;
let cachedReader: Credential | null | undefined;

/** Dropped whenever a password changes, and between tests. */
export function clearCredentialCache(): void {
  cachedAdmin = undefined;
  cachedReader = undefined;
}

/** The admin credential in force, or null when this install has none. */
export async function adminCredential(): Promise<Credential | null> {
  if (cachedAdmin !== undefined) return cachedAdmin;
  const fromEnv = process.env.POLICY_ADMIN_PASSWORD?.trim();
  if (fromEnv) {
    cachedAdmin = { kind: 'environment', password: fromEnv };
    return cachedAdmin;
  }
  const stored = (await readAll().catch(() => ({} as Record<string, string>)))[ADMIN_VERIFIER];
  cachedAdmin = stored ? { kind: 'stored', verifier: stored } : null;
  return cachedAdmin;
}

/** The reader credential, or null when the rest of the service is open. */
export async function readerCredential(): Promise<Credential | null> {
  if (cachedReader !== undefined) return cachedReader;
  const fromEnv = process.env.POLICY_READER_PASSWORD?.trim();
  if (fromEnv) {
    cachedReader = { kind: 'environment', password: fromEnv };
    return cachedReader;
  }
  const stored = (await readAll().catch(() => ({} as Record<string, string>)))[READER_VERIFIER];
  cachedReader = stored ? { kind: 'stored', verifier: stored } : null;
  return cachedReader;
}

/** True when the environment is supplying the admin password, so the panel cannot change it. */
export function adminPasswordIsPinned(): boolean {
  return Boolean(process.env.POLICY_ADMIN_PASSWORD?.trim());
}

export function readerPasswordIsPinned(): boolean {
  return Boolean(process.env.POLICY_READER_PASSWORD?.trim());
}

/**
 * Write a new admin password and drop every session issued under the old one.
 *
 * The invalidation is not a separate step and cannot be forgotten: the cookie's
 * signing key is derived from the verifier, so a new verifier is a new key and
 * every outstanding cookie stops validating the moment this returns. See
 * `admin-auth.ts`.
 */
export async function setAdminPassword(password: string): Promise<void> {
  await writeSetting(ADMIN_VERIFIER, hashPassword(password));
  clearCredentialCache();
}

export async function setReaderPassword(password: string): Promise<void> {
  await writeSetting(READER_VERIFIER, hashPassword(password));
  clearCredentialCache();
}
