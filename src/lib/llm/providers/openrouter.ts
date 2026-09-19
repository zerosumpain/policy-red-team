import OpenAI from 'openai';
import { offeredModels } from '$lib/server/models/catalogue';
import type { ProviderDefinition } from './types';

/**
 * OpenRouter — one key, every model, per-token.
 *
 * The default, and the only one that needs no decisions: the catalogue in
 * `server/models/catalogue.ts` is the menu, and the key funds all of it.
 */
export const openrouter: ProviderDefinition = {
  id: 'openrouter',
  label: 'OpenRouter',
  blurb:
    'One key, billed per token, reaching every model in the picker. The simplest thing to set up, and the only one that charges you per assessment rather than against something you already pay for.',
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      hint: 'From openrouter.ai/keys. Starts sk-or-.',
      secret: true,
    },
  ],
  problem: (config) => (config.apiKey?.trim() ? null : 'Put your OpenRouter key in.'),
  model: (config) => config.model?.trim() || '',
  client: (config) => new OpenAI({ apiKey: config.apiKey, baseURL: 'https://openrouter.ai/api/v1' }),
  models: () => offeredModels().map((m) => ({ id: m.id, name: m.name, note: m.note })),
};
