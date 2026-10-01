/**
 * A DATABRICKS WORKSPACE TOKEN FOR A SERVICE PRINCIPAL — shared by the two
 * things that need one.
 *
 * Model calls (`$lib/llm/providers/databricks`) and the Lakebase database
 * (`$lib/db/postgres`) both authenticate as the same principal: the one a
 * Databricks App is started as, with `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`
 * and `DATABRICKS_CLIENT_SECRET` in its environment. One exchange, one cache,
 * so a run that makes four hundred model calls and a few thousand queries asks
 * the workspace for a token about once an hour rather than once per caller.
 *
 * OAuth machine-to-machine: `POST <workspace>/oidc/v1/token`, basic auth with
 * the client id and secret, `grant_type=client_credentials&scope=all-apis`.
 * The token lives an hour; it is refreshed a minute early so a call in flight
 * never holds a dead one.
 *
 * NO DEPENDENCY: the Databricks SDK would do this, and it is one form POST —
 * the argument `providers/entra.ts` makes against `@azure/identity`.
 */

export type ServicePrincipal = { host: string; clientId: string; clientSecret: string };

/** One-hour tokens; refresh a minute early. */
const EARLY_REFRESH_MS = 60_000;
const TOKEN_TIMEOUT_MS = 15_000;

type Cached = { token: string; expiresAt: number };

/** Keyed on host + principal, so a credential edited in the panel takes effect on the next call. */
const cache = new Map<string, Cached>();

/** Dropped between tests, and whenever configuration changes underneath. */
export function clearWorkspaceTokenCache(): void {
  cache.clear();
}

/** Any URL a reader might paste, reduced to `https://<workspace>`. A bare host gets a scheme. */
export function normaliseHost(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  return url.origin;
}

/** The principal the environment names, or null when it names none. What a Databricks App is started with. */
export function principalFromEnvironment(env: NodeJS.ProcessEnv = process.env): ServicePrincipal | null {
  const host = env.DATABRICKS_HOST?.trim();
  const clientId = env.DATABRICKS_CLIENT_ID?.trim();
  const clientSecret = env.DATABRICKS_CLIENT_SECRET?.trim();
  return host && clientId && clientSecret ? { host, clientId, clientSecret } : null;
}

/** A bearer token for the principal, cached until a minute before it expires. */
export async function workspaceToken(principal: ServicePrincipal): Promise<string> {
  const host = normaliseHost(principal.host);
  const clientId = principal.clientId.trim();
  const secret = principal.clientSecret.trim();
  const key = `${host}|${clientId}|${secret}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt - EARLY_REFRESH_MS > Date.now()) return hit.token;

  let response: Response;
  try {
    response = await fetch(`${host}/oidc/v1/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
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
  cache.set(key, fresh);
  return fresh.token;
}
