/**
 * Which model does a given job.
 *
 * Upstream this is 499 lines: a registry of site workloads, each with a default,
 * an override read from the settings table, and a resolver per role. The
 * pipeline imports ONE of them.
 *
 * Here the answer comes from the environment, with a default that is a capable
 * reasoning model rather than a cheap one — the research stage is where an
 * assessment earns or loses its evidence, and it is not the place to save money.
 * `POLICY_RESEARCH_MODEL` overrides it.
 */
import type { ModelContext } from '$lib/server/models/types';
import { coerceModelContext } from '$lib/constants/default-models';
import { providerPinnedModel } from '$lib/server/models/catalogue';

/** The default for the targeted-research stage when nothing overrides it. */
export const DEFAULT_RESEARCH_DEEP_MODEL_ID = 'anthropic/claude-sonnet-4.5';

/**
 * The model for deep research. A submission may still commission a different one
 * per assessment — `Commission.model` in `server/provider.ts` wins over this.
 *
 * IT IS ALSO THE MODEL EVERY UNCOMMISSIONED RUN IS JUDGED AS, which is why the
 * active provider's own pin comes first.
 *
 * "Use the default" is the first option in the picker and the ordinary choice,
 * so `policy_analyses.model` is null for most runs and `server/provider.ts`
 * falls through to here. `getLLMClient` then ignores whatever this says and
 * calls `definition.model(config)` — the bridge's model, the Azure deployment —
 * but `callTimeoutMs` reads the provider off the id THIS returns. Answering with
 * a constant OpenRouter id therefore gave a bridge run 180 seconds a call
 * instead of 420, while the calls went to the bridge regardless.
 *
 * Measured on 2026-09-20: four of the first five calls of a real assessment died
 * at exactly 180.0s, and the one that survived took 173.3s.
 *
 * So the pin wins over `POLICY_RESEARCH_MODEL` as well. Where a provider names
 * its own model, that environment variable never reached a model in the first
 * place — all it could change was the deadline, and it changed it wrongly.
 */
export async function resolveResearchDeepModel(): Promise<ModelContext> {
  const pinned = providerPinnedModel();
  if (pinned) return coerceModelContext({ modelId: pinned.id });
  const modelId = process.env.POLICY_RESEARCH_MODEL?.trim() || DEFAULT_RESEARCH_DEEP_MODEL_ID;
  return coerceModelContext({ modelId });
}
