/**
 * The model gateway.
 *
 * Upstream this routes between OpenRouter and a local Codex bridge, falls back
 * from one to the other on a credit outage, reads its key and its model defaults
 * from a settings table, and installs a usage capture that writes every call to
 * the site's cost ledger. None of that infrastructure exists here.
 *
 * What is left is what the pipeline actually asks for — `getLLMClient`, which
 * hands back a client and the model id to call it with. WHICH SERVICE ANSWERS is
 * now a configured thing rather than a compiled one: see
 * `$lib/llm/providers`, one module per service, and the admin panel that fills
 * them in.
 *
 * ENVIRONMENT BEATS THE STORE, ALWAYS. A key in `app.env` wins over anything the
 * panel holds, so a deployment managed by Ansible keeps doing what its files say
 * and nobody has to work out which of two sources is live. `resolveProvider`
 * reports which one is in force and the panel prints it.
 *
 * IT DOES NOT READ `ctx.provider`. That field belongs to the pipeline's own
 * `ModelContext` — a COPIED type — and records what an assessment was run on.
 * The service that answers is this module's business, and keeping the two
 * vocabularies apart is what lets the whole registry exist without a divergence.
 *
 * COST IS STILL RECORDED, just not centrally: the pipeline writes its own audit
 * to `policy_model_calls` through `server/provider.ts`, and it records the model
 * the API SAID answered — so a provider that serves a deployment rather than the
 * requested id is written down honestly.
 */
import type OpenAI from 'openai';
import { providerById, providers, type ProviderConfig, type ProviderDefinition } from '$lib/llm/providers';
import { ACTIVE_PROVIDER, providerSettingKey, readAll } from '$lib/server/settings-store';
import type { ModelContext } from '$lib/server/models/types';
import { mapLegacyModelId } from '$lib/constants/default-models';

export type Resolved = {
  definition: ProviderDefinition;
  config: ProviderConfig;
  /** Which fields came from the environment rather than the store, so the panel can say so. */
  fromEnvironment: string[];
  /** Why this cannot be used, or null. */
  problem: string | null;
};

/**
 * The environment variable a field is allowed to come from.
 *
 * Only the ones a deployment plausibly manages. `OPENROUTER_API_KEY` is the name
 * every version of this service has used and every `.env.example` documents, so
 * it keeps working untouched; the others follow the same shape.
 */
const ENV_NAMES: Record<string, Record<string, string>> = {
  openrouter: { apiKey: 'OPENROUTER_API_KEY' },
  codex: { baseUrl: 'CODEX_BASE_URL', model: 'CODEX_MODEL', apiKey: 'CODEX_API_KEY' },
  azure: {
    endpoint: 'AZURE_FOUNDRY_ENDPOINT',
    deployment: 'AZURE_FOUNDRY_DEPLOYMENT',
    apiKey: 'AZURE_FOUNDRY_KEY',
    apiVersion: 'AZURE_FOUNDRY_API_VERSION',
  },
};

let cached: { key: string; client: OpenAI } | undefined;

/** Dropped between tests, and whenever configuration changes underneath. */
export function clearLLMClientCache(): void {
  cached = undefined;
}

/**
 * Which service is in force, and whether it can be used.
 *
 * `POLICY_PROVIDER` pins it for a deployment; otherwise the panel's choice;
 * otherwise the first one this build offers, which is OpenRouter. An install
 * that had chosen a provider a later build no longer offers falls back with the
 * rest rather than failing — the panel shows what is active, so the change is
 * visible rather than mysterious.
 */
export async function resolveProvider(): Promise<Resolved> {
  const stored = await readAll().catch(() => ({} as Record<string, string>));
  const pinned = process.env.POLICY_PROVIDER?.trim();
  const definition =
    providerById(pinned) ?? providerById(stored[ACTIVE_PROVIDER]) ?? providers()[0];

  const config: ProviderConfig = {};
  const fromEnvironment: string[] = [];
  for (const field of definition.fields) {
    const envName = ENV_NAMES[definition.id]?.[field.name];
    const fromEnv = envName ? process.env[envName]?.trim() : undefined;
    if (fromEnv) {
      config[field.name] = fromEnv;
      fromEnvironment.push(field.name);
    } else {
      config[field.name] = stored[providerSettingKey(definition.id, field.name)] ?? '';
    }
  }

  return { definition, config, fromEnvironment, problem: definition.problem(config) };
}

/**
 * Can this build reach a model at all? Null when it can, otherwise a sentence.
 *
 * It exists so a missing credential is caught BEFORE an assessment is created
 * rather than two stages in. The first run of a fresh clone without a key used
 * to end in "failed." and a report file full of nothing, with the actual cause
 * buried in a stage's error column where the command line never showed it.
 */
export async function modelAccessProblem(): Promise<string | null> {
  const { definition, problem } = await resolveProvider();
  return problem ? `${definition.label}: ${problem}` : null;
}

/**
 * A client, and the model id to call it with.
 *
 * THE ACTIVE PROVIDER DECIDES THE MODEL where it serves only one. An Azure
 * deployment or a bridge answers with whatever is behind it whatever id is
 * asked for, so substituting here and letting the audit record what actually
 * replied is honest; pretending the request went to `anthropic/claude-sonnet-4.5`
 * because a workload default named it would not be.
 */
export async function getLLMClient(ctx: ModelContext): Promise<{ client: OpenAI; model: string }> {
  const { definition, config, problem } = await resolveProvider();
  if (problem) throw new Error(`${definition.label} is not usable: ${problem}`);

  // Keyed on the configuration, so editing a credential in the panel takes
  // effect on the next call rather than after a restart.
  const key = `${definition.id}:${JSON.stringify(config)}`;
  if (cached?.key !== key) cached = { key, client: definition.client(config) };

  const own = definition.model(config);
  return { client: cached.client, model: own || mapLegacyModelId(ctx.modelId) };
}
