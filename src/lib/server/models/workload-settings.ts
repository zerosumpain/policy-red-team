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

/** The default for the targeted-research stage when nothing overrides it. */
export const DEFAULT_RESEARCH_DEEP_MODEL_ID = 'anthropic/claude-sonnet-4.5';

/**
 * The model for deep research. A submission may still commission a different one
 * per assessment — `Commission.model` in `server/provider.ts` wins over this.
 */
export async function resolveResearchDeepModel(): Promise<ModelContext> {
  const modelId = process.env.POLICY_RESEARCH_MODEL?.trim() || DEFAULT_RESEARCH_DEEP_MODEL_ID;
  return coerceModelContext({ modelId });
}
