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
 */
import type { ModelCall } from './provider';
import { fixtureModel } from '../../../../tests/fixtures/policy-analysis/model';

export function modelCaller(): ModelCall {
  return async (stage: number, key: string, input: unknown) => fixtureModel(stage, key, input);
}
