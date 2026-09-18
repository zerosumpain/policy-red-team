/**
 * Who owns this install.
 *
 * Upstream this reads an allow-list out of the database and is checked against a
 * signed session on every request — the site is public and the policy tool is
 * owner-only within it.
 *
 * A standalone install inverts that: it runs on one person's machine, and the
 * person running it is the owner. `POLICY_OWNER_EMAIL` exists so an assessment
 * still carries an owner on its rows — `policy_analyses.owner` is NOT NULL and
 * the store scopes every query by it — not because anything is being kept out.
 *
 * If this build is ever put behind a network listener that is not loopback, this
 * is the file that has to grow real authentication, and phase 4's server is where
 * that check belongs.
 */

/** The default owner when nothing is configured: enough to satisfy a NOT NULL
 *  column and to keep one install's assessments together. */
export const LOCAL_OWNER = 'local@localhost';

export function getOwnerEmails(): string[] {
  const configured = process.env.POLICY_OWNER_EMAIL?.trim();
  return configured ? configured.split(',').map((e) => e.trim()).filter(Boolean) : [LOCAL_OWNER];
}

export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const owners = getOwnerEmails().map((e) => e.toLowerCase());
  return owners.includes(email.trim().toLowerCase());
}
