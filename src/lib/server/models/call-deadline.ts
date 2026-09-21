/**
 * HOW LONG ONE MODEL CALL MAY TAKE, WHEN THE PIPELINE CANNOT NAME THE PROVIDER.
 *
 * `provider.ts` is a copied file and its rule is two lines:
 *
 *     function callTimeoutMs(provider: string): number {
 *       return provider === 'codex' ? SLOW_PROVIDER_TIMEOUT_MS : CALL_TIMEOUT_MS;
 *     }
 *
 * `provider` there is the pipeline's own `ModelProvider` union — `'openrouter'`
 * or `'codex'` — which records what an assessment was RUN ON and deliberately
 * knows nothing about this fork's provider registry. So an Azure deployment
 * resolves to neither, falls to the else branch, and is given 180 seconds.
 *
 * That is not a tidiness problem. Measured on this estate, an Azure-shaped
 * provisioned deployment answers stage-one decomposition in 237 seconds and
 * sometimes over 301. Every one of those calls was killed at 180 and reported
 * as "did not answer within 180 seconds … the run needs a model that answers
 * inside it" — a sentence that is true about the deadline and false about the
 * model, and which sends the reader to change the one thing that was fine.
 *
 * THIS IS THE SEAM, and it is a module variable for the same reason
 * `catalogue.ts` uses one: `callTimeoutMs` is called synchronously from inside
 * the copied file, and making it async would push a divergence into the middle
 * of the pipeline's hot path rather than into its two-line edge.
 *
 * The divergence in `scripts/sync-core.mjs` is four lines: an import, and a
 * lookup before the existing rule. The existing rule is left intact underneath,
 * so an install with no registered deadline behaves exactly as upstream does.
 */

let registered: number | null = null;

/**
 * Record what the active provider declares, or clear it.
 *
 * Called wherever the active provider is established or changes: at boot, after
 * a configuration save, and after a provider switch — the same three moments
 * `refreshModelMenu()` is called, and for the same reason. A stale deadline is
 * the quiet half of the same bug: the panel says Azure and the run is judged as
 * whatever was active last.
 */
export function registerCallTimeout(ms: number | null | undefined): void {
  registered = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * The registered deadline, or null to leave the pipeline's own rule alone.
 *
 * Read from a copied file. Keep it synchronous, pure and total — anything that
 * can throw here throws inside the pipeline's call loop.
 */
export function registeredCallTimeoutMs(): number | null {
  return registered;
}

/** Dropped between tests. */
export function clearRegisteredCallTimeout(): void {
  registered = null;
}
