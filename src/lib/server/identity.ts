/**
 * WHOSE SERVICE THIS IS, according to the artefacts it produces.
 *
 * Two copied files carried the author's own domain, and both of them put it in
 * front of a reader:
 *
 *   bundle.ts      "Produced by strangeramblings.com" in every offline pack
 *   contracts.ts   a rule refusing to cite `strangeramblings.com` as a source
 *
 * Neither was wrong upstream, where the tool runs inside that site. Both are
 * wrong in a department's tenant: the first prints a stranger's personal domain
 * at the bottom of a government assessment, and the second refuses citations of
 * a site nobody there has heard of while cheerfully citing the deployment's own
 * hostname — which is the thing the rule was actually for.
 *
 * So the value becomes a setting and the rule becomes a question about THIS
 * install. Synchronous and total, because `safeSourceUrl` is called from the
 * middle of the copied validation path and per citation.
 */

/** What an offline pack says produced it. */
export function producerName(): string {
  return process.env.POLICY_PRODUCER?.trim() || 'Policy Red Team';
}

/**
 * The hostname this install is served under, if the operator has said.
 *
 * Used to refuse a "source" that is really this service citing itself — a
 * provenance chain that leaves the paper and comes back is not evidence. It is
 * a single name rather than a list because an install has one public hostname;
 * an install with none sets nothing and loses only a check it never needed,
 * since a citation cannot point at a service nobody can reach.
 */
export function selfHostname(): string | null {
  const value = process.env.POLICY_HOSTNAME?.trim().toLowerCase();
  if (!value) return null;
  // Accept a URL or a bare host, because an operator will paste whichever they
  // have to hand and both mean the same thing.
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
}

/** Whether this hostname is the service's own. False when nothing is configured. */
export function isSelfHost(hostname: string): boolean {
  const self = selfHostname();
  if (!self) return false;
  const host = hostname.toLowerCase();
  return host === self || host.endsWith(`.${self}`);
}
