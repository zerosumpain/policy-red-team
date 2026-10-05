/**
 * A provider that cannot spend money.
 *
 * `server/provider.ts` calls a real model. This is the same shape backed by
 * `tests/fixtures/policy-analysis/model`, the deterministic fixture the
 * integration tests already run the whole pipeline against.
 *
 * It is never imported by name. `build.mjs` builds a SECOND cli bundle with
 * `./provider` aliased to this file, so the fixture binary is physically
 * incapable of reaching a provider — which is a stronger guarantee than a runtime
 * flag that could be mis-set, and the reason a full eighteen-stage run can be
 * verified without an API key or a bill.
 *
 * IT KEEPS A CALL LOG, as the real one does (phase 23). The value ledger on
 * the Method page and in the pack is built from `policy_model_calls`, and a
 * fixture run that wrote none drew no ledger — so the walk, the accessibility
 * gate and the pack check could never see the section. Each call is recorded
 * with the provider and model named `fixture` and token counts ESTIMATED from
 * the bytes (four characters a token), which no reader could mistake for a
 * bill: the report names the model it ran on. A sealed run records no input or
 * output, exactly as `provider.ts` does.
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { policyModelCalls } from '$lib/db/schema';
import { PROMPT_VERSION } from '../contracts';
import type { Commission, ModelCall } from './provider';
import { fixtureModel } from '../../../../tests/fixtures/policy-analysis/model';

const tokens = (value: unknown) => Math.ceil(JSON.stringify(value ?? null).length / 4);

export function modelCaller(executionId?: string, _runId?: string, _signal?: AbortSignal, _prior?: unknown, commission?: Commission): ModelCall {
  return async (stage: number, key: string, input: unknown) => {
    const output = fixtureModel(stage, key, input);
    if (!executionId) return output;
    const sealed = commission?.sealed === true;
    const { protect: _protect, indexed: _indexed, ...payload } = (input ?? {}) as Record<string, unknown>;
    const [call] = await db.insert(policyModelCalls).values({
      executionId, callKey: key, promptVersion: `${PROMPT_VERSION}#fixture`,
      inputHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      input: sealed ? null : payload, status: 'running', model: 'fixture',
    }).returning();
    await db.update(policyModelCalls).set({
      status: 'completed', output: sealed ? null : output, provider: 'fixture', model: 'fixture', completedAt: new Date(),
      usage: [{ model: 'fixture', provider: 'fixture', costUsd: null, priceSnapshot: null, tokensInput: tokens(payload), tokensOutput: tokens(output), cacheReadTokens: 0, reasoningTokens: 0 }],
    }).where(eq(policyModelCalls.id, call.id));
    return output;
  };
}
