import OpenAI from 'openai';
import { adaptTokenParameter } from './azure';
import { longRunningTransport } from './transport';
import type { CatalogueEntry, ProviderConfig, ProviderDefinition } from './types';

/**
 * DATABRICKS MODEL SERVING — the workspace's own models.
 *
 * Phase 21: this service is expected to be deployed INTO a Databricks workspace
 * and to use the models that workspace already serves, rather than a key of its
 * own. Databricks puts an OpenAI-compatible face over Model Serving, so like
 * Azure this is "the OpenAI client, a base URL, and a credential" — the work is
 * in the three things that are Databricks' own.
 *
 * ── THE MODEL IS A SERVING ENDPOINT ────────────────────────────────────────
 *
 * Every request names a serving endpoint in its `model` field: a pay-per-token
 * Foundation Model endpoint (`databricks-claude-sonnet-4-5`,
 * `databricks-gpt-oss-120b`), a provisioned-throughput one, or an external-model
 * endpoint somebody in the workspace set up in front of another provider. All
 * three answer the same chat-completions call at
 * `https://<workspace>/serving-endpoints`. As with an Azure deployment, the
 * endpoint name is what the assessment records as the model it used.
 *
 * Newer workspaces also route the same models through AI Gateway at
 * `/ai-gateway/mlflow/v1`, under `system.ai.*` names. Both are offered; the
 * serving-endpoints route is the default because it is the one every
 * workspace has.
 *
 * ── AUTHENTICATION: A SERVICE PRINCIPAL, OR A TOKEN ────────────────────────
 *
 * A Databricks App is given a service principal and runs with
 * `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID` and `DATABRICKS_CLIENT_SECRET` in
 * its environment. `client.ts` maps those exact names onto these fields, so an
 * install running as an App needs nothing typed into the panel but the
 * endpoint — and the endpoint has to be granted to the app's service principal
 * (`CAN_QUERY`), which is the one thing an App's resources page must say.
 *
 * The principal's id and secret are exchanged for a one-hour bearer token at
 * the workspace's own `/oidc/v1/token` (OAuth machine-to-machine). A personal
 * access token is the other option, for a service running outside the
 * workspace on somebody's behalf. The mode names are the Databricks SDK's own
 * `DATABRICKS_AUTH_TYPE` values, so that variable works here as it does
 * everywhere else.
 *
 * NO DEPENDENCY. The Databricks SDK for JavaScript would do the token exchange,
 * and it is one form POST with basic auth — the same argument `entra.ts` makes
 * against `@azure/identity`.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 *
 * No `grounded`: Model Serving has no web search, and a model answering a
 * research question from memory would put invented sources in an assessment.
 * The research stage says "no search" instead, as it does for Azure.
 */

const AUTH_MODES: { value: AuthMode; text: string }[] = [
  { value: 'oauth-m2m', text: 'A service principal (OAuth) — what a Databricks App runs as' },
  { value: 'pat', text: 'A personal access token' },
];

type AuthMode = 'oauth-m2m' | 'pat';

const ROUTES: { value: Route; text: string }[] = [
  { value: 'serving-endpoints', text: 'Model Serving endpoints (/serving-endpoints)' },
  { value: 'ai-gateway', text: 'AI Gateway (/ai-gateway/mlflow/v1)' },
];

type Route = 'serving-endpoints' | 'ai-gateway';

const mode = (config: ProviderConfig): AuthMode =>
  AUTH_MODES.find((m) => m.value === config.authMode?.trim())?.value ?? 'oauth-m2m';

const route = (config: ProviderConfig): Route =>
  ROUTES.find((r) => r.value === config.route?.trim())?.value ?? 'serving-endpoints';

/** One-hour tokens; refresh a minute early so a call in flight never holds a dead one. */
const EARLY_REFRESH_MS = 60_000;
const TOKEN_TIMEOUT_MS = 15_000;

type Cached = { token: string; expiresAt: number };

/** Keyed on host + principal, so a credential edited in the panel takes effect on the next call. */
const tokens = new Map<string, Cached>();

/** Dropped between tests, and whenever configuration changes underneath. */
export function clearDatabricksTokenCache(): void {
  tokens.clear();
}

export const databricks: ProviderDefinition = {
  id: 'databricks',
  label: 'Databricks Model Serving',
  blurb:
    'The models your Databricks workspace already serves — Foundation Model APIs, provisioned throughput, or an external model behind a serving endpoint. Calls bill to the workspace. When this runs as a Databricks App it signs in as the app’s own service principal and needs only the endpoint name.',
  egress: ['your Databricks workspace URL (model calls and the token exchange both go there)'],
  fields: [
    {
      name: 'host',
      label: 'Workspace URL',
      hint: 'The address you open the workspace at. Anything after the host is trimmed. A Databricks App sets DATABRICKS_HOST and this is filled in for you.',
      placeholder: 'https://dbc-a1b2c3d4-e5f6.cloud.databricks.com',
    },
    {
      name: 'endpoint',
      label: 'Serving endpoint',
      hint: 'The endpoint’s name exactly as the Serving page lists it, such as databricks-claude-sonnet-4-5. The service principal or token user needs Can Query on it.',
      placeholder: 'databricks-claude-sonnet-4-5',
    },
    {
      name: 'route',
      label: 'Which API',
      hint: 'Leave on Model Serving unless your workspace administrators have moved models behind AI Gateway, where names look like system.ai.claude-sonnet-4-5.',
      kind: 'select',
      options: ROUTES,
    },
    {
      name: 'authMode',
      label: 'How to authenticate',
      hint: 'A Databricks App runs as a service principal and has its id and secret in its environment already. Use a personal access token only for a service running outside the workspace.',
      kind: 'select',
      options: AUTH_MODES,
    },
    {
      name: 'clientId',
      label: 'Service principal client ID',
      hint: 'The application ID of the service principal. Set for you inside a Databricks App.',
      placeholder: '00000000-0000-0000-0000-000000000000',
      showWhen: { field: 'authMode', is: ['oauth-m2m'] },
    },
    {
      name: 'clientSecret',
      label: 'Service principal OAuth secret',
      hint: 'Generated on the service principal’s Secrets tab. Set for you inside a Databricks App.',
      secret: true,
      showWhen: { field: 'authMode', is: ['oauth-m2m'] },
    },
    {
      name: 'token',
      label: 'Personal access token',
      hint: 'From Settings, Developer, Access tokens. Starts dapi.',
      secret: true,
      showWhen: { field: 'authMode', is: ['pat'] },
    },
  ],

  problem: (config) => {
    const raw = config.host?.trim();
    if (!raw) return 'Put the workspace URL in.';
    let host: string;
    try {
      host = normaliseHost(raw);
    } catch {
      return 'That is not a workspace URL this can reach.';
    }
    if (!host.startsWith('https:')) return 'A Databricks workspace is https.';
    const endpoint = config.endpoint?.trim();
    if (!endpoint) return 'Say which serving endpoint to call.';
    /*
     * The name goes into the request body, not the path, so a slash would not
     * build a wrong URL as it does for Azure — but a pasted URL or a display
     * name is still the commonest mistake, and saying which field is wrong
     * beats a 404 from the workspace. Endpoint names are letters, digits, dash
     * and underscore; AI Gateway's `system.ai.*` names add dots.
     */
    if (!/^[A-Za-z0-9_.-]+$/.test(endpoint)) {
      return 'An endpoint name is letters, numbers, dots, dashes and underscores. Check you have copied the name from the Serving page and not its URL.';
    }
    if (mode(config) === 'pat') return config.token?.trim() ? null : 'Put a personal access token in.';
    if (!config.clientId?.trim()) return 'Put the service principal’s client ID in.';
    if (!config.clientSecret?.trim()) return 'Put the service principal’s OAuth secret in.';
    return null;
  },

  model: (config) => config.endpoint.trim(),

  client: (config) => {
    const host = normaliseHost(config.host);
    const client = new OpenAI({
      baseURL: route(config) === 'ai-gateway' ? `${host}/ai-gateway/mlflow/v1` : `${host}/serving-endpoints`,
      /*
       * A FUNCTION, FOR OAUTH. The SDK calls an `apiKey` setter before each
       * request and sends what it returns as the bearer token, so a cached
       * one-hour token refreshes itself under a run that outlasts it — an
       * eighteen-stage run regularly does.
       */
      apiKey: mode(config) === 'pat' ? config.token.trim() : () => bearer(config),
      // Provisioned endpoints under load are slow, and the wire must outlast
      // the deadline above it. See `transport.ts` and `callTimeoutMs` below.
      ...longRunningTransport(),
      // The pipeline does its own retrying and deadline accounting.
      maxRetries: 0,
    });
    /*
     * The same negotiation as Azure, for the same reason: an external-model
     * endpoint in front of an OpenAI reasoning model refuses `max_tokens` by
     * name, and `provider.ts` sends it on every call.
     */
    return adaptTokenParameter(client);
  },

  models: (config) =>
    config.endpoint?.trim()
      ? [{
          id: config.endpoint.trim(),
          name: config.endpoint.trim(),
          note: 'Your Databricks serving endpoint. Whatever model is behind it is what answers.',
        }]
      : [],

  /*
   * THE WORKSPACE WILL SAY WHAT IT SERVES, which Azure will not. `GET
   * /api/2.0/serving-endpoints` lists every endpoint the credential can see,
   * on the same host and the same token, so the panel can offer a list instead
   * of asking the reader to spell a name. Only chat endpoints are kept: an
   * embeddings or custom-model endpoint would accept the name and fail the
   * first call.
   */
  catalogue: async (config) => listServingEndpoints(config),

  callTimeoutMs: 420_000,
};

/** Any URL a reader might paste, reduced to `https://<workspace>`. A bare host gets a scheme. */
export function normaliseHost(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  return url.origin;
}

/** A bearer token for the service principal, cached until a minute before it expires. */
async function bearer(config: ProviderConfig): Promise<string> {
  const host = normaliseHost(config.host);
  const clientId = config.clientId.trim();
  const key = `${host}|${clientId}|${config.clientSecret.trim()}`;
  const hit = tokens.get(key);
  if (hit && hit.expiresAt - EARLY_REFRESH_MS > Date.now()) return hit.token;

  let response: Response;
  try {
    response = await fetch(`${host}/oidc/v1/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${config.clientSecret.trim()}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'all-apis' }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `${host} could not be reached for a token. In a restricted network the workspace URL needs to be on the egress allow-list. ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Databricks refused to issue a token for the service principal (${response.status}): ${text.slice(0, 600)}`);
  }
  const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Databricks answered without a token.');
  const fresh = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  tokens.set(key, fresh);
  return fresh.token;
}

type WireEndpoint = {
  name?: unknown;
  task?: unknown;
  state?: { ready?: unknown };
  config?: { served_entities?: { foundation_model?: { display_name?: unknown; description?: unknown }; external_model?: { name?: unknown; provider?: unknown } }[] };
};

/** The workspace's chat endpoints, for the admin panel's list. */
export async function listServingEndpoints(config: ProviderConfig): Promise<CatalogueEntry[]> {
  const host = normaliseHost(config.host);
  const auth = mode(config) === 'pat' ? config.token.trim() : await bearer(config);
  const response = await fetch(`${host}/api/2.0/serving-endpoints`, {
    headers: { authorization: `Bearer ${auth}` },
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Databricks would not list the serving endpoints (${response.status}): ${text.slice(0, 400)}`);
  const body = JSON.parse(text) as { endpoints?: WireEndpoint[] };

  const rows: CatalogueEntry[] = [];
  for (const raw of body.endpoints ?? []) {
    const name = typeof raw.name === 'string' ? raw.name : '';
    if (!name || raw.task !== 'llm/v1/chat') continue;
    const entity = raw.config?.served_entities?.[0];
    const foundation = entity?.foundation_model;
    const external = entity?.external_model;
    const display = typeof foundation?.display_name === 'string' ? foundation.display_name : '';
    const description = typeof foundation?.description === 'string'
      ? foundation.description
      : typeof external?.name === 'string'
        ? `An external model: ${String(external.provider ?? 'another provider')} ${external.name}.`
        : '';
    rows.push({
      id: name,
      name: display || name,
      description: raw.state?.ready === 'NOT_READY' ? `Not ready. ${description}`.trim() : description,
      contextLength: null,
      // Billed in DBUs against the workspace, not quoted per token here.
      promptCost: null,
      completionCost: null,
      floating: false,
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}
