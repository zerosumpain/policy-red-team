import { executionContext } from '$lib/context/execution';

/**
 * A CEILING ON WHAT ONE RUN MAY CONSUME.
 *
 * On 2026-09-19 a series of runs took a ChatGPT subscription from 1% to 78% of
 * its weekly allowance and finished nothing. Every one of them reported "$0.00
 * spent", truthfully, because a subscription costs no money per call — and that
 * was exactly the problem. The cost was real, it was scarcer than money, and
 * nothing counted it.
 *
 * THE LESSON IS NOT "WATCH THE NUMBER". It is that a meter nobody reads stops a
 * nothing, so the ceiling has to be enforced by the code that spends rather than
 * by whoever happens to be looking. This throws.
 *
 * IT COUNTS PER RUN, not per process. Two assessments in flight have separate
 * budgets, because one overrunning is not a reason to kill the other — and a
 * process-wide total would make the limit depend on what else happened to be
 * running, which is the kind of rule nobody can reason about.
 *
 * ZERO MEANS UNLIMITED, and that is the default. A tool that refuses to run
 * until somebody sets a quota is a tool people disable; this exists to stop the
 * runaway case, not to make every first use a configuration exercise.
 */

export class BudgetExceeded extends Error {
  readonly code = 'budget';
  constructor(readonly runId: string, readonly spent: number, readonly limit: number) {
    super(
      `This run has used ${spent.toLocaleString()} tokens, past its ceiling of ${limit.toLocaleString()}. ` +
        `It has been stopped rather than allowed to keep spending. Raise the ceiling in the admin panel ` +
        `to continue, or resume it — the stages it finished are kept.`,
    );
    this.name = 'BudgetExceeded';
  }
}

/** Tokens spent per run id, for as long as this process lives. */
const spent = new Map<string, number>();

/** The ceiling, in tokens. 0 or unset means no ceiling. */
let ceiling = 0;

export function setTokenCeiling(tokens: number): void {
  ceiling = Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0;
}

export function tokenCeiling(): number {
  return ceiling;
}

/** What a run has spent so far, for the progress endpoint to report. */
export function spentOn(runId: string): number {
  return spent.get(runId) ?? 0;
}

export function forgetRun(runId: string): void {
  spent.delete(runId);
}

/**
 * Add a call's tokens to its run, and refuse to go further once past the ceiling.
 *
 * Called from the gateway's usage capture, so every model call counts —
 * including the ones a stage makes that nobody is watching.
 *
 * THROWN, NOT LOGGED. `provider.ts` classifies a non-transport error as a
 * contract failure and does not retry it, so this stops the stage rather than
 * being absorbed into a retry loop that spends more proving the point.
 */
export function chargeRun(tokens: number): void {
  const store = executionContext.getStore();
  // Outside an engine-managed run — the admin panel's test button, a persona
  // enrichment — there is no run to charge and no budget to enforce.
  if (!store?.runId || !tokens) return;

  const total = (spent.get(store.runId) ?? 0) + tokens;
  spent.set(store.runId, total);
  if (ceiling && total > ceiling) throw new BudgetExceeded(store.runId, total, ceiling);
}
