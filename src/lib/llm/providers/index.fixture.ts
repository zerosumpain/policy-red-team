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
import type { ProviderDefinition, ProviderId } from './types';

export type { ProviderDefinition, ProviderId, ProviderField, ProviderConfig } from './types';

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
    models: (config) => {
      const own = config.model?.trim() || config.deployment?.trim();
      return own ? [{ id: own, name: own, note: 'Configured here.' }] : [];
    },
  };
}

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
