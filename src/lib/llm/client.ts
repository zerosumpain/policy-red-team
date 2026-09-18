/**
 * The model gateway, reduced to one provider.
 *
 * Upstream this routes between OpenRouter and a local Codex bridge, falls back
 * from one to the other on a credit outage, reads its key and its model defaults
 * from a settings table, and installs a usage capture that writes every call to
 * the site's cost ledger. None of that infrastructure exists here.
 *
 * What is left is what the pipeline actually asks for — `getLLMClient`, which
 * hands back a client and the model id to call it with. One OpenRouter key funds
 * every model, and it comes from the environment.
 *
 * COST IS STILL RECORDED, just not centrally: the pipeline writes its own audit
 * to `policy_model_calls` through `server/provider.ts`, which is the record that
 * matters for an assessment. See `src/lib/llm/pricing.ts` for the per-token
 * figures it uses.
 */
import OpenAI from 'openai';
import { getOpenRouterApiKey } from '$lib/llm/keys';
import type { ModelContext } from '$lib/server/models/types';
import { mapLegacyModelId } from '$lib/constants/default-models';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

let cached: OpenAI | undefined;

/** Dropped between tests, and after a key change. */
export function clearLLMClientCache(): void {
  cached = undefined;
}

/**
 * A client, and the model id to call it with.
 *
 * A `codex/…` id reaches here only if something asked for a model this build
 * cannot serve — the Codex bridge is a site sidecar, not part of a standalone
 * install. Failing loudly beats silently answering with a different model than
 * the one an assessment recorded that it used.
 */
export async function getLLMClient(ctx: ModelContext): Promise<{ client: OpenAI; model: string }> {
  if (ctx.provider === 'codex' || ctx.modelId.startsWith('codex/')) {
    throw new Error(
      `${ctx.modelId} is a Codex model, which needs the site's bridge sidecar. ` +
        `This build reaches models through OpenRouter only — pick an OpenRouter model.`
    );
  }
  cached ??= new OpenAI({
    apiKey: getOpenRouterApiKey(),
    baseURL: OPENROUTER_BASE_URL,
  });
  return { client: cached, model: mapLegacyModelId(ctx.modelId) };
}
