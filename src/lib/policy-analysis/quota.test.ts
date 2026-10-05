// Phase 27: a spent Codex allowance was reported as an unreachable provider.
import { describe, expect, it } from 'vitest';
import { PolicyError, quotaFault } from './validation';

// The error exactly as the OpenAI client raised it on 2026-10-05: the bridge's
// 502, whose body is Codex's 429.
const bridge = Object.assign(new Error('502 Codex run failed: codex responses 429: {"error":{"type":"usage_limit_reached","message":"The usage limit has been reached","plan_type":"plus","resets_at":1791232648,"eligible_promo":null,"limit_window_minutes":300,"resets_in_seconds":6867}}'), { status: 502 });

describe('a spent allowance is named as one', () => {
  it('says the limit was reached and when it resets, in UK time', () => {
    const fault = quotaFault(bridge, 'gpt-6-luna', new Date('2026-10-05T18:43:00Z'))!;
    expect(fault).toBeInstanceOf(PolicyError);
    expect(fault.code).toBe('quota');
    expect(fault.message).toContain('“gpt-6-luna” has used up its allowance');
    expect(fault.message).toContain('resets at 21:37');
    expect(fault.message).not.toContain(' on ');
    expect(fault.message).not.toContain('could not be reached');
  });

  it('names the day when the reset is not today', () => {
    const fault = quotaFault(bridge, 'gpt-6-luna', new Date('2026-10-04T12:00:00Z'))!;
    expect(fault.message).toContain('on Monday 5 October');
  });

  it('falls back to the seconds remaining when no reset time is given', () => {
    const err = Object.assign(new Error('429 You exceeded your current quota: insufficient_quota, resets_in_seconds: 600'), { status: 429 });
    expect(quotaFault(err, 'm', new Date('2026-10-05T12:00:00Z'))!.message).toContain('resets at 13:10');
  });

  it('leaves every other failure alone', () => {
    expect(quotaFault(new Error('connect ECONNREFUSED 127.0.0.1:5207'), 'm')).toBeNull();
    expect(quotaFault(Object.assign(new Error('429 Too Many Requests'), { status: 429 }), 'm')).toBeNull();
  });
});
