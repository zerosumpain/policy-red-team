/**
 * Read-only mode — for when this is reachable by someone who is not you.
 *
 * The service has no authentication: `server/index.ts` binds to loopback and the
 * security model is that whoever is at the machine owns it. Putting it behind a
 * public hostname inverts that, and the cost is not just privacy — a submission
 * spends real money, one model call per passage, against whatever key the server
 * is holding.
 *
 * `POLICY_READ_ONLY=1` makes every mutation a 403. Assessments already in the
 * database open, drill, and export exactly as they do normally; nothing new can
 * be started, resumed, restated, shared or purged.
 *
 * IT IS NOT AUTHENTICATION and must not be mistaken for it. Anyone who reaches
 * the port still reads every assessment on it. It is the second lock, for the
 * case where the first one — Cloudflare Access, a tailnet, a firewall — turns out
 * to have been misconfigured. Put a demo's papers on a box on the open internet
 * only if you would be content for them to be read.
 */
export function isReadOnly(): boolean {
  const value = process.env.POLICY_READ_ONLY?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export const READ_ONLY_MESSAGE =
  'This copy is read-only. You can open, drill into and download every assessment here, but nothing new can be started.';
