import { describe, expect, it } from 'vitest';
import { isLegitimateSilence, malformedRetryDelayMs, transportRetryDelayMs, type Rejection } from './validation';

describe('an empty reply is an answer, not a dead provider', () => {
  /**
   * `CONSECUTIVE_LIMIT` exists to catch a provider that has stopped answering.
   * A well-formed `{"artefacts": [], "warnings": []}` is the opposite: proof it
   * answered, and the correct reply for a body the paper mentions once. Counting
   * it as a fault killed the first deep run of the Post-16 white paper on
   * 2026-09-17 — 152 bodies at the graph stage, 22-28% of them silent, three in
   * a row ending each of the three attempts.
   */
  const reject = (reason: string): Rejection => ({ id: 'x', kind: 'edge', code: 'contract', reason });

  it('treats nothing-returned-and-nothing-rejected as silence', () => {
    expect(isLegitimateSilence(0, [], false)).toBe(true);
  });

  it('still faults when the model returned items and every one was rejected', () => {
    expect(isLegitimateSilence(0, [reject('bad ref')], false)).toBe(false);
  });

  it('still faults when an earlier repair round was rejected', () => {
    // Round one rejected, round two empty: the rejection is still the story, and
    // silence must not launder it into a clean unit.
    expect(isLegitimateSilence(0, [], true)).toBe(false);
  });

  it('is not consulted when anything was accepted', () => {
    expect(isLegitimateSilence(3, [], false)).toBe(false);
    expect(isLegitimateSilence(3, [reject('one bad item')], false)).toBe(false);
  });
});

describe('a transport blip is waited out, a deadline is not', () => {
  /**
   * `CONCURRENT_EVENT_CODES` stops one bridge restart reading as three dead
   * lanes, but only inside a fan-out. The single-call stages — entity
   * resolution, research planning, synthesis, appraisal, assured synthesis — go
   * through `request()`, which never touches that counter, so one blip failed
   * them outright. Seen live at 22:20 on 2026-09-17: the sixth SR-Main deploy of
   * the evening, one failed call, stage 5 down an attempt.
   */
  it('waits, with a bounded backoff, when the wire went away', () => {
    expect(transportRetryDelayMs('provider', 0)).toBe(5_000);
    expect(transportRetryDelayMs('provider', 1)).toBe(15_000);
    expect(transportRetryDelayMs('provider', 2)).toBe(30_000);
  });

  it('gives up rather than waiting forever on a provider that is really gone', () => {
    expect(transportRetryDelayMs('provider', 3)).toBeNull();
  });

  it('never retries a deadline, which is deterministic', () => {
    // Retrying a timeout cost a run two hours on 2026-09-10; the same model on
    // the same page runs out of time again.
    expect(transportRetryDelayMs('timeout', 0)).toBeNull();
  });

  it('never retries a contract failure, which the repair round owns', () => {
    // The response arrived and was wrong. Re-sending it unchanged asks the same
    // question again; the repair round carries the reason back instead.
    expect(transportRetryDelayMs('contract', 0)).toBeNull();
  });
});

describe('a reply that did not parse is asked for again', () => {
  /**
   * The repair round cannot help here: it works by naming the artefacts that
   * were rejected, and a response that never parsed has none. So an unparseable
   * reply went straight to a thrown fault, and in a fan-out that is the unit
   * lost. On the deep Post-16 run it lost Skills England from the exploitation
   * playbook of a post-16 skills white paper.
   */
  it('asks again, briefly, when the reply was just noise', () => {
    expect(malformedRetryDelayMs(false, 0)).toBe(2_000);
    expect(malformedRetryDelayMs(false, 1)).toBe(6_000);
  });

  it('stops asking rather than looping on a model that will not produce JSON', () => {
    expect(malformedRetryDelayMs(false, 2)).toBeNull();
  });

  it('never asks again when the reply was CUT OFF at the output limit', () => {
    // finish_reason 'length' is a fact about how much was asked for, not noise.
    // The identical request truncates identically — the timeout lesson again.
    expect(malformedRetryDelayMs(true, 0)).toBeNull();
    expect(malformedRetryDelayMs(true, 1)).toBeNull();
  });
});
