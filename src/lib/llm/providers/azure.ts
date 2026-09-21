import { AzureOpenAI } from 'openai';
import type OpenAI from 'openai';
import { entraProblem, entraTokenProvider, type AuthMode } from './entra';
import { longRunningTransport } from './transport';
import type { ProviderDefinition, ProviderConfig } from './types';

/**
 * AZURE AI FOUNDRY — a model you have already provisioned.
 *
 * A Foundry deployment is not a model id, it is an endpoint plus a name you gave
 * it, and the distinction matters here: the deployment name is what goes in the
 * `model` field of every request, so what an assessment records as the model it
 * used is that name and not the family underneath. A reader looking at
 * `policy_model_calls` six months later should still be able to tell which
 * deployment answered, which is why the panel asks for it rather than deriving
 * a prettier label.
 *
 * THIS IS THE DEFAULT FOR A DEPLOYMENT INSIDE A DEPARTMENT, and phase 18
 * rebuilt it around what such a tenant actually looks like rather than around
 * the one case that is easy to test from outside one. Three things changed.
 *
 * ── AUTHENTICATION IS A QUESTION, NOT FOUR MORE BOXES ───────────────────────
 *
 * It used to support an `api-key` header and nothing else. A resource with
 * local authentication disabled — common, and the default posture in a lot of
 * government tenants — has no key to type, so the service could not be
 * configured at all. There are now four modes and the panel asks which before
 * it asks for anything else; `showWhen` reveals only the fields that mode
 * needs. `entra.ts` does the token work without adding a dependency.
 *
 * ── THE ENDPOINT IS NORMALISED, BECAUSE THERE ARE TWO OF THEM ───────────────
 *
 * `…openai.azure.com` is the classic Azure OpenAI resource;
 * `…services.ai.azure.com` is an AI Foundry / AI Services one. Both serve the
 * same API under `/openai/deployments/<name>`, and the portal shows readers
 * several different things to copy — sometimes with `/openai` already on the
 * end, sometimes a full chat-completions URL. Pasting any of them used to build
 * a doubled path and a 404 that says nothing. `normaliseEndpoint` takes them
 * all down to the resource root.
 *
 * ── THE TOKEN PARAMETER NEGOTIATES ITSELF ──────────────────────────────────
 *
 * The pipeline sends `max_tokens` on every call (`provider.ts`, a copied file).
 * A reasoning-capable deployment rejects it with a 400 naming
 * `max_completion_tokens` as the replacement, and an older api-version rejects
 * `max_completion_tokens` the same way in reverse. Which one a given deployment
 * wants depends on the model behind it and the api-version in front of it, and
 * neither is knowable from here.
 *
 * So it is not guessed. The first call sends `max_tokens`; if Azure refuses it
 * BY NAME, the same call is retried once with `max_completion_tokens` and the
 * answer is remembered for the life of the process. One wasted round trip,
 * once, against a class of failure that otherwise ends an eighteen-stage run at
 * stage one with a message about an unsupported parameter.
 */

/** What `api-version` to send when the reader has not chosen one. */
const DEFAULT_API_VERSION = '2024-10-21';

const AUTH_MODES: { value: AuthMode; text: string }[] = [
  { value: 'key', text: 'An API key from the resource' },
  { value: 'entra-app', text: 'Microsoft Entra — app registration (client secret)' },
  { value: 'managed-identity', text: 'Microsoft Entra — managed identity of this machine' },
  { value: 'workload-identity', text: 'Microsoft Entra — workload identity (AKS federated token)' },
];

const mode = (config: ProviderConfig): AuthMode =>
  (AUTH_MODES.find((m) => m.value === config.authMode?.trim())?.value ?? 'key');

const entra = { field: 'authMode', is: ['entra-app', 'managed-identity', 'workload-identity'] };

export const azure: ProviderDefinition = {
  id: 'azure',
  label: 'Azure AI Foundry',
  blurb:
    'A model you have already provisioned in Azure — including provisioned throughput. Calls go to your own deployment and bill to your Azure subscription, which is usually the reason for choosing it over per-token access. Works with an API key or with Microsoft Entra, for a resource where local authentication is switched off.',
  egress: ['your Azure resource endpoint', 'login.microsoftonline.com (Entra app or workload identity only)'],
  fields: [
    {
      name: 'endpoint',
      label: 'Endpoint',
      hint: 'The resource endpoint from the Azure portal. Either an openai.azure.com or a services.ai.azure.com address; anything after the host is trimmed, so a URL copied from the portal works as pasted.',
      placeholder: 'https://my-resource.openai.azure.com',
    },
    {
      name: 'deployment',
      label: 'Deployment name',
      hint: 'What you called the deployment, not the model family. This is what every request asks for, and what the assessment records as the model it used.',
      placeholder: 'gpt-5-policy',
    },
    {
      name: 'authMode',
      label: 'How to authenticate',
      hint: 'A resource with local authentication disabled has no key; use Entra. Managed identity needs no secret at all and is the best option when this service runs on an Azure VM or container app.',
      kind: 'select',
      options: AUTH_MODES,
    },
    {
      name: 'apiKey',
      label: 'API key',
      hint: 'Either key from the resource. Keys and Endpoint in the portal.',
      secret: true,
      showWhen: { field: 'authMode', is: ['key'] },
    },
    {
      name: 'tenantId',
      label: 'Directory (tenant) ID',
      hint: 'The tenant the resource lives in.',
      placeholder: '00000000-0000-0000-0000-000000000000',
      showWhen: { field: 'authMode', is: ['entra-app', 'workload-identity'] },
    },
    {
      name: 'clientId',
      label: 'Application (client) ID',
      hint: 'For a managed identity, leave this blank unless the machine has more than one user-assigned identity and you need to say which.',
      placeholder: '00000000-0000-0000-0000-000000000000',
      optional: true,
      showWhen: entra,
    },
    {
      name: 'clientSecret',
      label: 'Client secret',
      hint: 'From the app registration. Certificate credentials are not supported here.',
      secret: true,
      showWhen: { field: 'authMode', is: ['entra-app'] },
    },
    {
      name: 'federatedTokenFile',
      label: 'Federated token file',
      hint: 'Leave blank to use AZURE_FEDERATED_TOKEN_FILE, which is what an AKS cluster sets.',
      placeholder: '/var/run/secrets/azure/tokens/azure-identity-token',
      optional: true,
      showWhen: { field: 'authMode', is: ['workload-identity'] },
    },
    {
      name: 'authorityHost',
      label: 'Entra authority',
      hint: 'Leave blank unless this is a sovereign cloud.',
      placeholder: 'https://login.microsoftonline.com',
      optional: true,
      showWhen: { field: 'authMode', is: ['entra-app', 'workload-identity'] },
    },
    {
      name: 'apiVersion',
      label: 'API version',
      hint: `Leave blank for ${DEFAULT_API_VERSION}. A deployment of a reasoning model may need a newer one; if calls come back refusing both max_tokens and max_completion_tokens, this is the field to change.`,
      placeholder: DEFAULT_API_VERSION,
      optional: true,
    },
  ],

  problem: (config) => {
    const endpoint = config.endpoint?.trim();
    if (!endpoint) return 'Put the resource endpoint in.';
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== 'https:') return 'An Azure endpoint is https.';
    } catch {
      return 'That is not an endpoint this can reach.';
    }
    const deployment = config.deployment?.trim();
    if (!deployment) return 'Say which deployment to call.';
    /*
     * THE SDK PASTES THIS INTO A PATH WITHOUT ESCAPING IT.
     *
     * `azure.js` builds `/deployments/${model}${path}` verbatim. The hand-rolled
     * client this replaced called `encodeURIComponent`, so a name with a slash
     * or a space was merely ugly; now it silently builds a different URL, and a
     * 404 from a path the reader never typed is close to undiagnosable.
     *
     * Azure's own rule for a deployment name is letters, digits, dash and
     * underscore, so nothing legitimate is refused here — and a reader who has
     * pasted a whole URL or a display name by mistake is told which field is
     * wrong instead of being sent to look at their network.
     */
    if (!/^[A-Za-z0-9_-]+$/.test(deployment)) {
      return 'A deployment name is letters, numbers, dashes and underscores. This looks like something else — check you have copied the deployment name and not the model or a URL.';
    }
    const auth = mode(config);
    if (auth === 'key') return config.apiKey?.trim() ? null : 'Put one of the resource keys in.';
    return entraProblem(auth, config);
  },

  model: (config) => config.deployment.trim(),

  client: (config) => {
    const auth = mode(config);
    const key = config.apiKey?.trim();
    const tokenProvider = entraTokenProvider(auth, config);

    const client = new AzureOpenAI({
      endpoint: normaliseEndpoint(config.endpoint),
      deployment: config.deployment.trim(),
      apiVersion: config.apiVersion?.trim() || DEFAULT_API_VERSION,
      /*
       * EXACTLY ONE OF THESE, AND PASSING BOTH THROWS.
       *
       * `azure.js` constructor: "The `apiKey` and `azureADTokenProvider`
       * arguments are mutually exclusive; only one can be passed at a time."
       * A placeholder key alongside a token provider — the pattern the
       * OpenAI-compatible provider uses, where the SDK genuinely does demand a
       * string — makes every Entra configuration fail at construction, before
       * a single request is built.
       *
       * The SSO path works because the SDK puts the provider function WHERE the
       * key goes (`apiKey: azureADTokenProvider ?? apiKey`) and its
       * `authHeaders` only sends an `api-key` header when that value is a
       * string. A function falls through to bearer auth, which is what Entra
       * needs.
       */
      ...(tokenProvider ? { azureADTokenProvider: tokenProvider } : { apiKey: key }),
      // A PROVISIONED DEPLOYMENT UNDER LOAD IS SLOW, and until phase 18 an
      // Azure call was judged against OpenRouter's 180 seconds by a timeout
      // table that can only name `openrouter` and `codex`. The wire must outlast
      // whatever deadline is above it; see `transport.ts` and
      // `call-deadline.ts`.
      ...longRunningTransport(),
      // The pipeline does its own retrying and its own deadline accounting. An
      // SDK retry underneath both is work the run cannot see and cannot budget.
      maxRetries: 0,
    });

    return adaptTokenParameter(client);
  },

  models: (config) =>
    config.deployment?.trim()
      ? [
          {
            id: config.deployment.trim(),
            name: config.deployment.trim(),
            note: 'Your Azure deployment. Whatever model is behind it is what answers.',
          },
        ]
      : [],

  /*
   * NO CATALOGUE, DELIBERATELY. Azure does not publish the deployments on a
   * resource through this API — that list is behind a separate ARM call against
   * a different credential and a different scope. The panel says so and asks
   * the reader to type the name, which is better than a browse button that
   * cannot work. Recorded in `docs/phase-13.md`; phase 18 re-examined it and
   * reached the same answer.
   */

  /*
   * NO `grounded` EITHER, and that is the honest answer rather than a gap.
   * Azure has no web search on this API. A provider that answered a research
   * question from the model's own memory would put invented sources in an
   * assessment, which is far worse than an acknowledged absence — see
   * `src/lib/server/web-search.ts`, which makes "no search" a stated state.
   */

  /** How long one call to this provider may take. Read by the pipeline's deadline. */
  callTimeoutMs: 420_000,
};

/**
 * ANY OF THE THINGS THE PORTAL SHOWS YOU, REDUCED TO THE RESOURCE ROOT.
 *
 * `AzureOpenAI` appends `/openai/deployments/<name>` itself, so what it wants is
 * the bare origin. Readers paste, variously:
 *
 *   https://r.openai.azure.com
 *   https://r.openai.azure.com/
 *   https://r.services.ai.azure.com/openai
 *   https://r.openai.azure.com/openai/deployments/foo/chat/completions?api-version=…
 *
 * and the last three used to build a doubled path answering 404 — which
 * `provider.ts` then reported as the provider being unreachable, sending the
 * reader to check their network for a typing mistake.
 */
export function normaliseEndpoint(raw: string): string {
  const url = new URL(raw.trim());
  // Everything this service needs hangs off the origin. Keeping a path would
  // only ever be keeping one of the wrong ones above.
  return url.origin;
}

/**
 * WHICH TOKEN PARAMETER THIS DEPLOYMENT WANTS, LEARNED FROM BEING TOLD.
 *
 * `provider.ts` sends `max_tokens` and is a copied file, so the translation has
 * to happen under it. Rather than guessing from the api-version — which does
 * not settle it, because the model behind the deployment also has a say — the
 * first refusal is read and obeyed.
 *
 * Azure's 400 for this names both parameters explicitly:
 *
 *   "Unsupported parameter: 'max_tokens' is not supported with this model.
 *    Use 'max_completion_tokens' instead."
 *
 * so the decision is the service's, not ours. Remembered per process: an
 * eighteen-stage run makes hundreds of calls and must not pay for this twice.
 *
 * SCOPED TO ONE CLIENT, because the client is rebuilt whenever the
 * configuration changes (`getLLMClient` keys its cache on the config). Pointing
 * the panel at a different deployment therefore starts the negotiation again,
 * rather than inheriting an answer that belonged to the old one.
 */
function adaptTokenParameter(client: AzureOpenAI): OpenAI {
  const completions = client.chat.completions;
  const create = completions.create.bind(completions);
  let useCompletionTokens: boolean | null = null;

  const swap = (body: Record<string, unknown>) => {
    const { max_tokens, ...rest } = body;
    return max_tokens === undefined ? body : { ...rest, max_completion_tokens: max_tokens };
  };

  completions.create = (async (body: Parameters<typeof create>[0], options?: Parameters<typeof create>[1]) => {
    const raw = body as unknown as Record<string, unknown>;
    if (useCompletionTokens === true) return create(swap(raw) as unknown as typeof body, options);

    try {
      return await create(body, options);
    } catch (err) {
      if (useCompletionTokens !== null || !namesCompletionTokens(err)) throw err;
      // Told, not guessed. Retry this call rather than failing it: the stage
      // that made it has a deadline and a repair budget, and spending one of
      // those on a parameter rename would be spending it on nothing.
      useCompletionTokens = true;
      return create(swap(raw) as unknown as typeof body, options);
    }
  }) as typeof completions.create;

  return client;
}

/** Whether this error is Azure asking for `max_completion_tokens` by name. */
function namesCompletionTokens(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  if (status !== 400) return false;
  const message = String((err as { message?: unknown }).message ?? '');
  return message.includes('max_completion_tokens');
}
