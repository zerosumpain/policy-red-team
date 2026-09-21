import OpenAI from 'openai';
import { toCodexSlug } from '$lib/server/models/codex-catalogue';
import { listOpenAICompatible } from './openai-catalogue';
import { longRunningTransport } from './transport';
import type { ProviderDefinition } from './types';

/**
 * A CODEX BRIDGE — or anything else that speaks the OpenAI API.
 *
 * `jkai-codex-bridge` puts an OpenAI-compatible face over the Codex CLI so that
 * traffic bills against a ChatGPT subscription rather than per token. From this
 * service's point of view that is just a base URL, which is why the same entry
 * serves anything else OpenAI-shaped — a local Ollama, a vLLM, a gateway of your
 * own.
 *
 * IT IS LOOPBACK-ONLY WHERE IT RUNS, and that is the thing to check before
 * choosing it: a bridge on one machine is not reachable from a service on
 * another. Run them on the same host, or put the bridge somewhere this service
 * can actually reach.
 *
 * THIS IS THE ONE TO DELETE WHEN THIS SHIPS. A bridge against one person's
 * subscription is no use to anybody else, and nothing outside this file knows it
 * exists: drop it from `PROVIDERS` in `./index`, or name the others in
 * `POLICY_PROVIDERS` and leave the file where it is.
 */
export const codex: ProviderDefinition = {
  id: 'codex',
  label: 'Codex bridge, or another OpenAI-compatible endpoint',
  blurb:
    'Anything that speaks the OpenAI chat-completions API at a URL you control — a Codex bridge running against a ChatGPT subscription, a local model server, a gateway of your own. Calls bill however that endpoint bills, which for a subscription bridge is nothing per assessment.',
  // The reader's own endpoint, so it cannot be named on their behalf. A
  // loopback bridge needs no egress at all, which is worth saying out loud in a
  // network conversation.
  egress: ['the base URL you configure below (nothing, if it is on this machine)'],
  fields: [
    {
      name: 'baseUrl',
      label: 'Base URL',
      hint: 'Where the endpoint is, including any path prefix. For jkai-codex-bridge that is http://127.0.0.1:5207/v1 — and it has to be reachable from the machine running this service, not from yours.',
      placeholder: 'http://127.0.0.1:5207/v1',
    },
    {
      name: 'model',
      label: 'Model name',
      hint: 'Exactly what the endpoint calls it. A bridge exposes the names its subscription serves; a local server exposes whatever you loaded.',
      placeholder: 'gpt-5-codex',
    },
    {
      name: 'apiKey',
      label: 'API key',
      hint: 'Optional. A loopback bridge usually needs none; leave it blank if so.',
      secret: true,
      optional: true,
    },
  ],
  problem: (config) => {
    const url = config.baseUrl?.trim();
    if (!url) return 'Say where the endpoint is.';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'The base URL has to be http or https.';
    } catch {
      return 'That is not a URL this can reach.';
    }
    if (!config.model?.trim()) return 'Say which model to ask for.';
    return null;
  },
  model: (config) => config.model.trim(),
  client: (config) =>
    new OpenAI({
      baseURL: config.baseUrl.trim().replace(/\/+$/, ''),
      // The SDK refuses to construct without one. A loopback bridge ignores it,
      // and sending a placeholder is better than making every such user invent a
      // value to get past a validation that is not the endpoint's.
      apiKey: config.apiKey?.trim() || 'not-required',
      // THE WIRE MUST OUTLAST THE DEADLINE. Node's fetch gives up at 300s; the
      // pipeline allows a Codex call 420. Without this the socket decides, two
      // minutes early, and the failure is reported as the bridge being
      // unreachable. See `transport.ts` — it cost three of the first ten calls
      // on the run of 2026-09-19.
      ...longRunningTransport(),
    }),
  /*
   * `codex/`-PREFIXED, AND THAT PREFIX IS LOAD-BEARING.
   *
   * `coerceModelContext` recovers which provider a run is on from this prefix
   * and from nothing else — not from a stored provider field, because plenty of
   * persisted state carries a bare model string. `callTimeoutMs` then gives a
   * Codex context 420 seconds a call against OpenRouter's 180.
   *
   * So a bridge model registered under its bare name is commissioned as an
   * OpenRouter one and judged against the SHORT deadline: the one provider that
   * actually needs seven minutes gets three, and every call over three minutes
   * is reported as the model being too slow. The bridge is slow by nature —
   * that is what the longer deadline exists for.
   *
   * The prefix never reaches the endpoint: `model()` below returns the bare
   * slug, which is what is sent. The two are deliberately different — one names
   * the run, the other names the call.
   */
  models: (config) =>
    config.model?.trim()
      ? [{
          id: `codex/${toCodexSlug(config.model.trim())}`,
          name: config.model.trim(),
          note: 'Served by the endpoint you configured, against your subscription rather than per token.',
        }]
      : [],
  // A bridge knows what its subscription serves, and the reader otherwise has to
  // guess the exact spelling of a name they cannot see. It needs only the URL to
  // answer, so it works before a model name has been chosen — which is the point
  // at which you need it.
  catalogue: (config) => listOpenAICompatible(codex.client(config)),
  /*
   * The bridge's grounded route is the SAME endpoint with `{ webSearch: true }`,
   * so it is the same client pointed one path deeper. Nothing else changes —
   * same auth, same model, same subscription.
   */
  grounded: (config) => {
    const base = config.baseUrl?.trim().replace(/\/+$/, '');
    if (!base) return null;
    return {
      client: new OpenAI({
        baseURL: `${base}/grounded`,
        apiKey: config.apiKey?.trim() || 'not-required',
        ...longRunningTransport(),
      }),
      model: toCodexSlug(config.model?.trim() ?? ''),
    };
  },
};
