/**
 * Model settings.
 *
 * Upstream this is a 209-line module over a settings table: encrypted keys, a
 * per-workload default, a UI to change them. Here the pipeline asks it exactly
 * one question.
 */

/**
 * Is the Codex bridge available? Never, in a standalone install — there is no
 * sidecar to probe. See `codex-catalogue.ts` for why the module stays.
 */
export async function isCodexEnabled(): Promise<boolean> {
  return false;
}
