/**
 * A registry with no services behind it.
 *
 * The fixture build's guarantee is that the bundle CANNOT REACH A PROVIDER, and
 * `build.mjs` enforces it by asserting `openrouter.ai` does not appear in the
 * output. The real registry fails that assertion the moment it exists, because a
 * provider module is mostly the URL it calls — so this is the registry the
 * fixture build gets instead.
 *
 * IT IS NOT EMPTY. The admin panel is part of the service and the browser walk
 * has to exercise it: the shapes are all here, the fields are all here, saving
 * works and the configuration round-trips. What is missing is the only thing
 * that matters — `client()` throws rather than constructing anything, so a
 * connection test in a fixture build fails loudly and truthfully instead of
 * quietly costing money in a test run.
 *
 * The same argument as `client.fixture.ts`: redirect the module rather than
 * chase its importers, because the guarantee should not depend on anyone
 * remembering to add a file here.
 */
import type { CatalogueEntry, ProviderDefinition, ProviderId } from './types';

export type { ProviderDefinition, ProviderId, ProviderField, ProviderConfig, CatalogueEntry } from './types';

const unreachable = (label: string): never => {
  throw new Error(
    `${label} cannot be reached from this build. It was compiled with the fixture provider ` +
      `for testing; run the real build to make model calls.`,
  );
};

function stub(id: ProviderId, label: string, blurb: string, fields: ProviderDefinition['fields']): ProviderDefinition {
  return {
    id,
    label,
    blurb,
    fields,
    problem: (config) => (fields.every((f) => f.optional || config[f.name]?.trim()) ? null : `Fill in ${label}.`),
    model: (config) => config.model?.trim() || config.deployment?.trim() || '',
    client: () => unreachable(label),
    /*
     * A CATALOGUE THAT REACHES NOTHING, so the browser walk can drive the model
     * picker without a key and without a network.
     *
     * Six rows, fixed, and one of them floating — the shapes the panel has to
     * render are a long id, a price, a missing price, and the `~` alias that
     * redirects to whatever is newest. A real call is what `client()` refuses;
     * listing a menu is not a call, and stubbing it here keeps the dialogue
     * under test rather than untested-because-untestable.
     */
    catalogue: async () => FIXTURE_CATALOGUE,
    models: (config) => {
      const own = config.model?.trim() || config.deployment?.trim();
      return own ? [{ id: own, name: own, note: 'Configured here.' }] : [];
    },
  };
}

const FIXTURE_CATALOGUE: CatalogueEntry[] = [
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: 'Efficiency-optimised, one million tokens of context.', contextLength: 1_048_576, promptCost: 0.046, completionCost: 0.093, floating: false },
  { id: '~deepseek/deepseek-flash-latest', name: 'DeepSeek Flash Latest', description: 'Always redirects to the newest model in the DeepSeek Flash family.', contextLength: 1_048_576, promptCost: 0.13, completionCost: 0.52, floating: true },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: 'Strong at holding a long document in view.', contextLength: 200_000, promptCost: 3, completionCost: 15, floating: false },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Long context at low cost.', contextLength: 1_048_576, promptCost: 0.3, completionCost: 2.5, floating: false },
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: 'Open weights, good at structure.', contextLength: 131_072, promptCost: 0.09, completionCost: 0.45, floating: false },
  { id: 'local/no-price-quoted', name: 'A bridge model with no price', description: 'Bills against a subscription, so nothing is quoted per token.', contextLength: null, promptCost: null, completionCost: null, floating: false },
];

const ALL: ProviderDefinition[] = [
  stub('openrouter', 'OpenRouter', 'Per-token access to every model in the picker.', [
    { name: 'apiKey', label: 'API key', hint: 'From your OpenRouter account.', secret: true },
  ]),
  stub('codex', 'Codex bridge, or another OpenAI-compatible endpoint', 'Anything that speaks the OpenAI chat-completions API at a URL you control.', [
    { name: 'baseUrl', label: 'Base URL', hint: 'Where the endpoint is.' },
    { name: 'model', label: 'Model name', hint: 'Exactly what the endpoint calls it.' },
    { name: 'apiKey', label: 'API key', hint: 'Optional.', secret: true, optional: true },
  ]),
  stub('azure', 'Azure AI Foundry', 'A model you have already provisioned in Azure.', [
    { name: 'endpoint', label: 'Endpoint', hint: 'The resource endpoint.' },
    { name: 'deployment', label: 'Deployment name', hint: 'What you called the deployment.' },
    { name: 'apiKey', label: 'API key', hint: 'Either key from the resource.', secret: true },
    { name: 'apiVersion', label: 'API version', hint: 'Leave blank for the default.', optional: true },
  ]),
];

export function providers(): ProviderDefinition[] {
  const allowed = process.env.POLICY_PROVIDERS?.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!allowed?.length) return ALL;
  const narrowed = ALL.filter((p) => allowed.includes(p.id));
  return narrowed.length ? narrowed : ALL;
}

export function providerById(id: string | null | undefined): ProviderDefinition | null {
  return providers().find((p) => p.id === id) ?? null;
}

export function isProviderId(id: string | null | undefined): id is ProviderId {
  return !!providerById(id);
}

export function redact(definition: ProviderDefinition, config: Record<string, string>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const field of definition.fields) {
    const value = config[field.name] ?? '';
    out[field.name] = field.secret ? Boolean(value.trim()) : value;
  }
  return out;
}
