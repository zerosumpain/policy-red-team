/**
 * Running the queue.
 *
 * Two shapes, because two callers want different things:
 *
 *   `drain(analysisId)` — run stages until ONE assessment reaches a terminal
 *   state, then return. This is what the CLI wants: a command that finishes.
 *
 *   `runWorker()` — the long-running loop, for phase 4's server. It is upstream's
 *   `createPolicyWorker`, copied verbatim, with its dependencies wired to this
 *   build's queue. The loop already handles lease renewal, returning an
 *   interrupted envelope for recovery, and draining the current stage on stop;
 *   there was no reason to write a second one.
 */
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyAnalyses } from '$lib/db/schema';
import { claimNext, clearLease, releaseExpiredLeases, renewLease } from '$lib/workflows/run-queue';
import { executePolicyRun } from '$lib/policy-analysis/server/worker';
import { TRIGGER } from '$lib/policy-analysis/contracts';
// Relative rather than aliased: the file sits at its upstream path so
// `scripts/sync-core.mjs` can keep proving it is a verbatim copy.
import { createPolicyWorker, type PolicyQueueRun } from '../../../packages/jkai-policy-worker/src/loop';

/**
 * Statuses an assessment does not come back from without a control action.
 *
 * `completed_with_gaps` is the one to know about, and guessing this list rather
 * than reading it cost a 120-second hang on the first real run. It is not a
 * failure: `store.ts` picks between `completed` and `completed_with_gaps` purely
 * on whether any stage recorded a warning, and a run with no Tavily key always
 * warns, because the research stage says so rather than pretending it searched.
 * Five places in the copied code treat the pair as one, and so does this.
 */
const FINISHED = ['completed', 'completed_with_gaps'] as const;
const TERMINAL = new Set<string>([...FINISHED, 'failed', 'cancelled']);

/** Did the assessment finish, gaps or not? */
export function isFinished(status: string): boolean {
  return (FINISHED as readonly string[]).includes(status);
}

export const WORKER_ID = `local:${process.pid}`;

export async function analysisStatus(analysisId: string): Promise<string | null> {
  const [row] = await db
    .select({ status: policyAnalyses.status })
    .from(policyAnalyses)
    .where(eq(policyAnalyses.id, analysisId));
  return row?.status ?? null;
}

export interface DrainOptions {
  /** Called after each stage, for progress output. */
  onStage?: (info: { completed: number; status: string }) => void;
  /** Give up rather than spin forever if the queue stops producing work. */
  idleTimeoutMs?: number;
  pollMs?: number;
}

/**
 * Run stages until this assessment is finished.
 *
 * The idle timeout is the thing to understand. A stage is enqueued with a DELAY
 * — `store.queueStage` sets `started_at` in the future to pace the pipeline — so
 * `claimNext` returning null usually means "not yet", not "nothing left". The
 * loop therefore waits rather than exiting on the first empty claim, and only
 * gives up if nothing becomes claimable for the whole idle window.
 */
export async function drain(analysisId: string, options: DrainOptions = {}): Promise<string> {
  const { onStage, idleTimeoutMs = 120_000, pollMs = 250 } = options;
  let completed = 0;
  let idleSince = Date.now();

  for (;;) {
    const status = await analysisStatus(analysisId);
    if (status === null) throw new Error(`No assessment ${analysisId}`);
    if (TERMINAL.has(status)) return status;

    await releaseExpiredLeases(TRIGGER);
    const claimed = await claimNext(WORKER_ID, 60_000, TRIGGER);
    if (!claimed) {
      if (Date.now() - idleSince > idleTimeoutMs) {
        throw new Error(
          `Nothing became claimable for ${Math.round(idleTimeoutMs / 1000)}s while ${analysisId} was still "${status}".`
        );
      }
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }

    idleSince = Date.now();
    try {
      await executePolicyRun(claimed, WORKER_ID);
      completed++;
      onStage?.({ completed, status: (await analysisStatus(analysisId)) ?? status });
    } finally {
      await clearLease(claimed.id, WORKER_ID);
    }
  }
}

/** The long-running loop, for phase 4's server. */
export function runWorker(log: (message: string) => void = () => {}) {
  return createPolicyWorker({
    claim: () => claimNext(WORKER_ID, 60_000, TRIGGER),
    execute: (run: PolicyQueueRun) => executePolicyRun(run, WORKER_ID),
    renew: (run: PolicyQueueRun) => renewLease(run.id, WORKER_ID),
    clear: (run: PolicyQueueRun) => clearLease(run.id, WORKER_ID),
    recover: async () => { await releaseExpiredLeases(TRIGGER); },
    sweep: () => releaseExpiredLeases(TRIGGER),
    log,
  });
}
