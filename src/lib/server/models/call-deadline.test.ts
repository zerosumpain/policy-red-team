import { afterEach, describe, expect, it } from 'vitest';
import { clearRegisteredCallTimeout, registerCallTimeout, registeredCallTimeoutMs } from './call-deadline';
import { azure } from '$lib/llm/providers/azure';
import { openrouter } from '$lib/llm/providers/openrouter';
import { codex } from '$lib/llm/providers/codex';

/**
 * THE DEADLINE A RUN IS JUDGED AGAINST, and the reason this module exists.
 *
 * `provider.ts` is copied from upstream and its rule can name only 'openrouter'
 * and 'codex'. Anything else falls to the else branch and is given OpenRouter's
 * 180 seconds — which killed real Azure calls at 237s and over 301s and reported
 * them as the model being too slow, a sentence true about the deadline and false
 * about the model.
 *
 * The divergence that reads this is registered in `scripts/sync-core.mjs` and
 * `npm run sync:check` proves it reproduces the working tree byte for byte.
 */

afterEach(() => clearRegisteredCallTimeout());

describe('the registered deadline', () => {
  it('is absent until something registers one, so upstream’s rule stands', () => {
    // The default MUST be null rather than a number. A module that defaulted to
    // any value would silently take the decision away from `provider.ts` for
    // the two providers it is right about.
    expect(registeredCallTimeoutMs()).toBeNull();
  });

  it('takes a positive number and refuses anything else', () => {
    registerCallTimeout(420_000);
    expect(registeredCallTimeoutMs()).toBe(420_000);

    // Read from inside the pipeline's call loop, so it must be total: a
    // provider that declares nothing, or declares nonsense, falls back rather
    // than throwing where nothing can catch it usefully.
    for (const bad of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      registerCallTimeout(bad as number);
      expect(registeredCallTimeoutMs(), `${String(bad)} should not register`).toBeNull();
    }
  });

  it('clears back to null, so switching provider cannot inherit a deadline', () => {
    // The quiet half of the 2026-09-20 failure: the panel says one provider and
    // the run is judged as whatever was active last. `refreshModelMenu` calls
    // this on every provider change for exactly that reason.
    registerCallTimeout(420_000);
    registerCallTimeout(null);
    expect(registeredCallTimeoutMs()).toBeNull();
  });
});

describe('what each provider declares', () => {
  it('gives Azure longer than the 180 seconds it used to get', () => {
    expect(azure.callTimeoutMs).toBe(420_000);
  });

  it('leaves the two the pipeline can name alone', () => {
    // These already resolve correctly inside `provider.ts` — OpenRouter to 180,
    // Codex to 420 through the `codex/` id prefix. Declaring a value here would
    // be a second source of truth for a question already answered.
    expect(openrouter.callTimeoutMs).toBeUndefined();
    expect(codex.callTimeoutMs).toBeUndefined();
  });
});
