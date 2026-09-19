import { afterEach, describe, expect, it } from 'vitest';
import { executionContext } from '$lib/context/execution';
import { BudgetExceeded, chargeRun, forgetRun, setTokenCeiling, spentOn, tokenCeiling } from './budget';

/**
 * THE GUARD THAT SHOULD HAVE EXISTED ON 2026-09-19.
 *
 * A series of runs took a ChatGPT subscription from 1% to 78% of its weekly
 * allowance and finished nothing. Each reported "$0.00 spent" — truthfully,
 * because a subscription costs no money per call. The meter that mattered was
 * never read, so the only thing that could have stopped it was a ceiling
 * enforced by the code that spends.
 */
const inRun = <T>(runId: string, fn: () => T): T =>
  executionContext.run({ workflowId: 'w', runId, nodeId: 'n', llmCalls: [] }, fn);

afterEach(() => { setTokenCeiling(0); forgetRun('run-a'); forgetRun('run-b'); });

describe('charging a run', () => {
  it('accumulates across calls', () => {
    inRun('run-a', () => { chargeRun(1_000); chargeRun(2_500); });
    expect(spentOn('run-a')).toBe(3_500);
  });

  it('keeps runs apart, so one overrunning does not kill the other', () => {
    setTokenCeiling(5_000);
    inRun('run-a', () => chargeRun(4_000));
    expect(() => inRun('run-b', () => chargeRun(4_000))).not.toThrow();
    expect(spentOn('run-a')).toBe(4_000);
    expect(spentOn('run-b')).toBe(4_000);
  });

  it('charges nothing outside a run — the admin test button has no budget', () => {
    setTokenCeiling(1);
    expect(() => chargeRun(10_000)).not.toThrow();
  });
});

describe('the ceiling', () => {
  it('stops the run once past it', () => {
    setTokenCeiling(10_000);
    expect(() => inRun('run-a', () => { chargeRun(6_000); chargeRun(6_000); })).toThrow(BudgetExceeded);
  });

  it('says what was spent and what the limit was, not just "too much"', () => {
    setTokenCeiling(1_000);
    try {
      inRun('run-a', () => chargeRun(2_500));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceeded);
      expect((err as Error).message).toContain('2,500');
      expect((err as Error).message).toContain('1,000');
      // A reader who hits this needs to know the finished stages survive.
      expect((err as Error).message).toMatch(/stages it finished are kept/);
    }
  });

  it('is unlimited by default, because a tool that demands configuration gets disabled', () => {
    expect(tokenCeiling()).toBe(0);
    expect(() => inRun('run-a', () => chargeRun(500_000_000))).not.toThrow();
  });

  it('treats nonsense as no ceiling rather than a ceiling of zero', () => {
    // A zero ceiling would refuse the first call of every run.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      setTokenCeiling(bad);
      expect(tokenCeiling()).toBe(0);
    }
  });
});
