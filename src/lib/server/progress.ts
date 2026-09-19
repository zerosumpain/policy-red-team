import { detail } from '$lib/policy-analysis/server/store';
import { STAGES } from '$lib/policy-analysis/contracts';
import { describeEstimate, estimateRun, type RunEstimate } from './estimate';
import { readSetting } from '$lib/server/settings-store';

/**
 * WHAT A READER WATCHING A RUN NEEDS, AND NOTHING ELSE.
 *
 * The assessment page follows its run over SSE, which fires when a STAGE ends.
 * An eighteen-stage run spends forty minutes inside a single stage, so for most
 * of its life the page has nothing new to say and no way to say how long is
 * left. This is what the poll asks for in between.
 *
 * IT IS DELIBERATELY SMALL. The obvious implementation is "fetch the detail
 * again every thirty seconds", and on a real assessment that is three thousand
 * artefacts over the wire to render one sentence. The server still reads the
 * run — the estimate needs the passage count and every call's duration — but
 * what crosses the network is a dozen numbers.
 */
export type RunProgress = {
  status: string;
  stagesDone: number;
  stagesTotal: number;
  /** The stage being worked on, by name, or null between stages. */
  currentStage: string | null;
  calls: { completed: number; failed: number; running: number };
  estimate: RunEstimate | null;
  /**
   * WHAT IT HAS ACTUALLY CONSUMED, and what it is on course to consume.
   *
   * `spent` is measured from `policy_model_calls.usage`; `projected` multiplies
   * the per-call average by the calls still to come. Null before anything has
   * reported usage, because a projection from nothing is a guess dressed as a
   * measurement.
   */
  tokens: {
    input: number;
    cached: number;
    output: number;
    reasoning: number;
    total: number;
    /** Share of input served from cache, 0–1. The only honest test of the ordering. */
    cachedShare: number | null;
    /** Total tokens this run is on course to use, including what it has spent. */
    projectedTotal: number | null;
  } | null;
  /**
   * Share of a subscription allowance, when one is configured.
   *
   * Codex publishes no quota anywhere a caller can read — not in a response
   * header, not through the bridge, not from the CLI — so this is measured
   * against a figure the operator sets in the admin panel. Absent that, it is
   * null and the page says tokens rather than percentages: a made-up
   * denominator would be worse than no denominator at all.
   */
  allowance: { weeklyTokens: number; usedByThisRun: number; projectedShare: number | null } | null;
  /** One sentence for the page to print. */
  says: string;
  /**
   * When it should be done, as ISO instants — earliest and latest.
   *
   * Computed here rather than in the browser so the two agree: a client clock
   * that is three minutes fast would otherwise print a finish time three minutes
   * out, and the reader has no way to tell which of the two is wrong.
   */
  finishBy: { earliest: string; latest: string } | null;
};

export async function runProgress(owner: string, id: string): Promise<RunProgress | null> {
  const found = await detail(owner, id);
  if (!found) return null;

  const { analysis, stages, artefacts, calls } = found;
  const done = stages.map((s, i) => [i, s] as const).filter(([, s]) => s.status === 'completed').map(([i]) => i);
  const runningIndex = stages.findIndex((s) => s.status === 'running');

  // BOTH OUTCOMES, because a call that timed out still burned the clock. See the
  // note in `estimate.ts`: counting only the survivors made a failing run look
  // faster than a healthy one.
  const durations = calls
    .filter((c) => c.completedAt && c.startedAt && (c.status === 'completed' || c.status === 'failed'))
    .map((c) => new Date(c.completedAt!).getTime() - new Date(c.startedAt!).getTime());

  const passages = artefacts.filter((a) => a.kind === 'passage').length;

  // Summed from what the provider reported, not from what we think we sent.
  let input = 0, cached = 0, output = 0, reasoning = 0, measuredCalls = 0;
  for (const call of calls) {
    for (const u of (call.usage ?? []) as { tokensInput?: number | null; cacheReadTokens?: number | null; tokensOutput?: number | null; reasoningTokens?: number | null }[]) {
      input += u.tokensInput ?? 0;
      cached += u.cacheReadTokens ?? 0;
      output += u.tokensOutput ?? 0;
      reasoning += u.reasoningTokens ?? 0;
      measuredCalls++;
    }
  }
  const terminal = !['running', 'queued', 'pending'].includes(analysis.status);

  const estimate = terminal || !passages
    ? null
    : estimateRun({
        passages,
        depth: analysis.depth === 'deep' ? 'deep' : 'standard',
        completedStages: done,
        callDurationsMs: durations,
        concurrency: analysis.concurrency ?? undefined,
        artefacts: artefacts.length,
        callsMade: calls.length,
      });

  const total = input + output;
  const perCall = measuredCalls ? total / measuredCalls : null;
  const remaining = estimate ? (estimate.calls.low + estimate.calls.high) / 2 : 0;
  const tokens = measuredCalls
    ? {
        input, cached, output, reasoning, total,
        cachedShare: input ? cached / input : null,
        projectedTotal: perCall ? Math.round(total + perCall * remaining) : null,
      }
    : null;

  const weekly = Number((await readSetting(WEEKLY_TOKENS).catch(() => null)) ?? 0);
  const allowance = weekly > 0 && tokens
    ? {
        weeklyTokens: weekly,
        usedByThisRun: tokens.total,
        projectedShare: tokens.projectedTotal ? tokens.projectedTotal / weekly : null,
      }
    : null;

  const finishBy = estimate?.seconds
    ? {
        earliest: new Date(Date.now() + estimate.seconds.low * 1000).toISOString(),
        latest: new Date(Date.now() + estimate.seconds.high * 1000).toISOString(),
      }
    : null;

  return {
    status: analysis.status,
    stagesDone: done.length,
    stagesTotal: STAGES.length,
    currentStage: runningIndex >= 0 ? STAGES[runningIndex] ?? null : null,
    calls: {
      completed: calls.filter((c) => c.status === 'completed').length,
      failed: calls.filter((c) => c.status === 'failed').length,
      running: calls.filter((c) => c.status === 'running').length,
    },
    estimate,
    tokens,
    allowance,
    says: estimate ? describeEstimate(estimate) : '',
    finishBy,
  };
}

/** Where the operator records their weekly subscription allowance, in tokens. */
export const WEEKLY_TOKENS = 'subscription.weeklyTokens';
