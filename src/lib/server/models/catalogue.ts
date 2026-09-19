/**
 * The models this build offers for an assessment.
 *
 * Phase 1 left the picker inert and recorded why: `server/ingest.ts` accepts a
 * commissioned model only if it appears in `CODEX_MODELS`, the site's catalogue
 * of subscription-funded Codex models, and a standalone install has no Codex
 * bridge. The catalogue was empty, so every submission degraded to null. This is
 * the catalogue it should have been checking — OpenRouter ids, which is the one
 * provider this build can reach.
 *
 * NOT A HARD-CODED DEFAULT. The list is a menu, the default comes from
 * `POLICY_RESEARCH_MODEL`, and `POLICY_MODELS` replaces the menu entirely for
 * anyone whose key reaches models this list has never heard of. The ids below
 * are ones already in service in this estate (`$lib/constants/default-models`),
 * so they are known to resolve rather than guessed from a price page.
 *
 * The tiers matter more than the names. An eighteen-stage assessment makes one
 * model call per passage in decomposition alone, so the difference between a
 * cheap model and a frontier one is a bill, not a rounding error — and the
 * reader choosing is the one paying.
 */

export type CostTier = 'economy' | 'balanced' | 'frontier';

export interface OfferedModel {
  /** An OpenRouter model id, exactly as the API expects it. */
  id: string;
  name: string;
  /** What this one is actually for, in the reader's terms. */
  note: string;
  tier: CostTier;
}

const BUILT_IN: OfferedModel[] = [
  {
    id: 'deepseek/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    note: 'Fastest and cheapest. Good for a first read of a long paper, where the cost is one call per passage.',
    tier: 'economy',
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    note: 'Open weights, strong at pulling structure out of prose. A reasonable middle for extraction-heavy stages.',
    tier: 'economy',
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    note: 'Long context at low cost. Suits a paper whose passages keep referring back to each other.',
    tier: 'balanced',
  },
  {
    id: 'z-ai/glm-5.2',
    name: 'GLM 5.2',
    note: 'Capable and inexpensive. Note that it spends reasoning tokens out of its output budget, so it needs room.',
    tier: 'balanced',
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    note: 'The strongest of these at adversarial reading — holding a whole paper in view and arguing against it.',
    tier: 'frontier',
  },
];

/**
 * `POLICY_MODELS` is a comma-separated list of OpenRouter ids. Given one, it
 * REPLACES the built-in menu rather than adding to it: a reader who has said
 * which models they want offered does not also want five they did not pick.
 */
export function offeredModels(): OfferedModel[] {
  const configured = process.env.POLICY_MODELS?.trim();
  if (!configured) return BUILT_IN;
  return configured
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => {
      const known = BUILT_IN.find((m) => m.id === id);
      return known ?? { id, name: id, note: 'Configured in POLICY_MODELS.', tier: 'balanced' as const };
    });
}

/**
 * Ids the ACTIVE provider serves, which are not in the OpenRouter catalogue.
 *
 * An Azure deployment or a bridge's model name is a perfectly good thing to
 * commission and is not on any list here. Without this, `ingest.ts` would read
 * every such choice as unknown and quietly degrade it to the configured default
 * — so `policy_analyses.model` would say "the configured default" about a run
 * that named a deployment, and the report's own provenance section would be
 * wrong about what it was run on.
 *
 * A SET REPLACED WHOLE rather than added to, refreshed whenever the
 * configuration is read. A stale id lingering after a provider changed would let
 * a reader commission something nothing can serve.
 */
let providerModelIds = new Set<string>();

export function registerProviderModels(ids: string[]): void {
  providerModelIds = new Set(ids.filter(Boolean));
}

/** Is this a model the reader may commission? The question `ingest.ts` asks. */
export function isOfferedModel(id: string | null | undefined): boolean {
  if (!id) return false;
  return providerModelIds.has(id) || offeredModels().some((m) => m.id === id);
}
