import { readFile } from 'node:fs/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import type { ProviderConfig } from './types';

/**
 * A MICROSOFT ENTRA TOKEN, WITHOUT `@azure/identity`.
 *
 * A government tenant very often disables local authentication on a Cognitive
 * Services resource, which means the `api-key` header this provider used to be
 * built around does not exist and cannot be created. Without a bearer token
 * there is no way to configure the service at all — the first blocker the phase
 * 18 review found for an Azure-only deployment.
 *
 * WHY NOT THE SDK. `@azure/identity` is the obvious answer and it is a large
 * MSAL dependency tree for what is, in the two flows that matter here, a single
 * form POST. The install this is being built for may not be able to reach
 * npmjs.com at all, so every dependency added now is one somebody has to carry
 * in later. The `openai` package already vendors `AzureOpenAI` with an
 * `azureADTokenProvider` hook (`node_modules/openai/azure.d.ts`) — a function
 * returning a string, called per request. This is that function.
 *
 * WHAT IS AND IS NOT SUPPORTED. Three flows, chosen because they are what an
 * Azure deployment of this shape actually uses:
 *
 *   entra-app          a service principal with a client secret
 *   managed-identity   the identity attached to the VM or container app
 *   workload-identity  a federated token file, which is how AKS does it
 *
 * Not supported: interactive sign-in, device code, Azure CLI credentials,
 * certificate-based client assertions. None of them belongs in a service that
 * runs unattended, and the first two need a human at a browser.
 *
 * THE TOKEN IS CACHED AND REFRESHED EARLY. `azureADTokenProvider` is invoked on
 * EVERY request, and an eighteen-stage run makes hundreds — fetching a token
 * each time would add a round trip to every model call and would rate-limit the
 * token endpoint long before the model. Cached until sixty seconds before it
 * expires, which is enough to cover a call in flight without holding one that
 * is about to be refused.
 */

const SCOPE = 'https://cognitiveservices.azure.com/.default';
const RESOURCE = 'https://cognitiveservices.azure.com';

/** Refresh this long before expiry, so a call in flight is never holding a dead token. */
const EARLY_REFRESH_MS = 60_000;

type Cached = { token: string; expiresAt: number };

/**
 * Keyed on the configuration, so editing a credential in the panel takes effect
 * on the next call rather than after a restart — the same rule
 * `getLLMClient` follows for the client itself.
 */
const cache = new Map<string, Cached>();

/** Dropped between tests, and whenever configuration changes underneath. */
export function clearEntraTokenCache(): void {
  cache.clear();
}

/**
 * THE INSTANCE METADATA SERVICE IS NOT ON THE INTERNET AND MUST NOT BE PROXIED.
 *
 * `169.254.169.254` is link-local. In an estate with `HTTPS_PROXY` set — which
 * is the whole reason this code exists — the process-wide `EnvHttpProxyAgent`
 * would send the token request to the corporate proxy, which cannot route to a
 * link-local address on this machine and will refuse it. The failure reads as
 * "managed identity is not available", which is wrong and sends the reader to
 * the wrong team.
 *
 * `NO_PROXY` would also fix it and an operator should still set it, but relying
 * on that is relying on a variable nobody documented. A dedicated direct agent
 * is the thing that cannot be got wrong.
 */
const directAgent = new Agent();

/** IMDS is on the machine; a second is generous and a hang is a stalled run. */
const IMDS_TIMEOUT_MS = 5_000;
const TOKEN_TIMEOUT_MS = 15_000;

export type AuthMode = 'key' | 'entra-app' | 'managed-identity' | 'workload-identity';

/**
 * Why this configuration cannot get a token, or null. Pure and synchronous, so
 * `problem()` can call it — the panel says which field is missing rather than
 * failing on the first model call.
 */
export function entraProblem(mode: AuthMode, config: ProviderConfig): string | null {
  if (mode === 'entra-app') {
    if (!config.tenantId?.trim()) return 'Put the directory (tenant) ID in.';
    if (!config.clientId?.trim()) return 'Put the application (client) ID in.';
    if (!config.clientSecret?.trim()) return 'Put the client secret in.';
    return null;
  }
  if (mode === 'workload-identity') {
    if (!config.tenantId?.trim()) return 'Put the directory (tenant) ID in.';
    if (!config.clientId?.trim()) return 'Put the application (client) ID in.';
    // The file is written by the cluster, so its absence is a deployment
    // problem rather than a typing one — but naming the variable is what lets
    // somebody go and look.
    if (!federatedTokenPath(config)) {
      return 'Set AZURE_FEDERATED_TOKEN_FILE, or give the path to the projected token.';
    }
    return null;
  }
  // Managed identity needs nothing: the platform supplies it, and a client ID
  // is only required to disambiguate between several user-assigned identities.
  return null;
}

const federatedTokenPath = (config: ProviderConfig): string | null =>
  config.federatedTokenFile?.trim() || process.env.AZURE_FEDERATED_TOKEN_FILE?.trim() || null;

/**
 * A function the OpenAI client calls for a bearer token, or null for key auth.
 *
 * Errors are thrown with the service's own words attached. A token endpoint
 * that refuses says exactly why — `AADSTS7000215` is a wrong secret,
 * `AADSTS700016` is an application that is not in this tenant — and those codes
 * are the most useful thing anyone gets all day. Swallowing them into "could
 * not authenticate" is the failure mode this whole phase is about.
 */
export function entraTokenProvider(mode: AuthMode, config: ProviderConfig): (() => Promise<string>) | null {
  if (mode === 'key') return null;
  const key = `${mode}:${config.tenantId ?? ''}:${config.clientId ?? ''}:${config.clientSecret ?? ''}:${federatedTokenPath(config) ?? ''}`;

  return async () => {
    const hit = cache.get(key);
    if (hit && hit.expiresAt - EARLY_REFRESH_MS > Date.now()) return hit.token;

    const fresh = mode === 'managed-identity' ? await fromImds(config) : await fromTokenEndpoint(mode, config);
    cache.set(key, fresh);
    return fresh.token;
  };
}

/**
 * The platform's own identity, read off the metadata service.
 *
 * `Metadata: true` is not optional — it is what distinguishes a deliberate call
 * from an SSRF, and IMDS refuses without it. The `client_id` parameter is only
 * sent when one is configured: an empty one is rejected rather than ignored,
 * and most deployments have exactly one system-assigned identity and need none.
 */
async function fromImds(config: ProviderConfig): Promise<Cached> {
  const url = new URL('http://169.254.169.254/metadata/identity/oauth2/token');
  url.searchParams.set('api-version', '2018-02-01');
  url.searchParams.set('resource', RESOURCE);
  const clientId = config.clientId?.trim();
  if (clientId) url.searchParams.set('client_id', clientId);

  let response;
  try {
    response = await undiciFetch(url, {
      headers: { Metadata: 'true' },
      dispatcher: directAgent,
      signal: AbortSignal.timeout(IMDS_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      'The instance metadata service did not answer, so there is no managed identity on this machine. ' +
        'Managed identity only works on an Azure VM, container app or App Service — on anything else, use an app registration. ' +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `The metadata service refused to issue a token (${response.status}): ${(await response.text()).slice(0, 400)}`,
    );
  }
  const body = (await response.json()) as { access_token?: string; expires_on?: string; expires_in?: string };
  if (!body.access_token) throw new Error('The metadata service answered without a token.');
  // IMDS quotes `expires_on` as a unix timestamp in seconds, as a string.
  const expiresAt = body.expires_on
    ? Number(body.expires_on) * 1000
    : Date.now() + Number(body.expires_in ?? 3600) * 1000;
  return { token: body.access_token, expiresAt };
}

/**
 * A service principal, or a federated identity presenting a projected token.
 *
 * Both are the OAuth 2 client-credentials grant against the same endpoint; they
 * differ only in what proves the client is who it says. That is why they share
 * this function rather than having one each — the difference is four lines, and
 * two near-identical token fetchers is how one of them quietly stops being
 * maintained.
 */
async function fromTokenEndpoint(mode: AuthMode, config: ProviderConfig): Promise<Cached> {
  const tenant = config.tenantId!.trim();
  const authority = config.authorityHost?.trim() || 'https://login.microsoftonline.com';
  const url = `${authority.replace(/\/+$/, '')}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;

  const form = new URLSearchParams({
    client_id: config.clientId!.trim(),
    scope: SCOPE,
    grant_type: 'client_credentials',
  });

  if (mode === 'workload-identity') {
    const path = federatedTokenPath(config)!;
    let assertion: string;
    try {
      assertion = (await readFile(path, 'utf8')).trim();
    } catch (err) {
      throw new Error(
        `The federated token file at ${path} could not be read. On AKS the cluster projects it; ` +
          `outside one, workload identity is not the right mode. (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    form.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    form.set('client_assertion', assertion);
  } else {
    form.set('client_secret', config.clientSecret!.trim());
  }

  // Deliberately NOT the direct agent: unlike IMDS this is a public endpoint,
  // and in a proxied estate it is reached the same way every other outbound
  // call is. `login.microsoftonline.com` belongs on the egress allow-list.
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `${authority} could not be reached, so no token could be issued. ` +
        'In a restricted network it needs to be on the egress allow-list. ' +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    // AADSTS codes are the single most useful thing in this whole flow and they
    // are in the body, not the status.
    throw new Error(`Microsoft Entra refused to issue a token (${response.status}): ${text.slice(0, 600)}`);
  }
  const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Microsoft Entra answered without a token.');
  return { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
}
