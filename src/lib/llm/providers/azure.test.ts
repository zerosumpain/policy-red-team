import { afterEach, describe, expect, it, vi } from 'vitest';
import { azure, normaliseEndpoint } from './azure';
import { clearEntraTokenCache, entraProblem, entraTokenProvider } from './entra';

/**
 * THE SEAM FOR A TOKEN ENDPOINT NOBODY HERE CAN REACH.
 *
 * `fromImds` deliberately uses undici's own `fetch` with a direct dispatcher —
 * a link-local address must never be sent to a corporate proxy — so the thing
 * to stand in for is that import. `vi.spyOn` cannot: an ESM namespace object is
 * not configurable, and the failure ("Cannot redefine property: fetch") is the
 * module system rather than the test being wrong. A module factory is the seam
 * that exists.
 */
const imds: { calls: { url: string; headers: Record<string, string> }[] } = { calls: [] };

vi.mock('undici', async (importActual) => {
  const actual = await importActual<typeof import('undici')>();
  return {
    ...actual,
    fetch: async (input: unknown, init?: { headers?: Record<string, string> }) => {
      imds.calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'imds-token',
          expires_on: String(Math.floor(Date.now() / 1000) + 3600),
        }),
        text: async () => '',
      };
    },
  };
});

/**
 * AZURE, PROVED WITHOUT AN AZURE TENANT.
 *
 * Nothing here has ever made a real request to Azure and this repository cannot
 * make one — so the honest thing is to be exact about what is being asserted:
 * WHAT WE SEND and HOW WE READ WHAT COMES BACK. Whether Azure accepts it is not
 * knowable from here and is recorded as such in `docs/phase-18-plan.md`.
 *
 * That still covers the failures the phase 18 review actually found. A doubled
 * path, a missing `Metadata` header, a `max_tokens` that should have been
 * `max_completion_tokens`, a token fetched on every one of several hundred
 * calls — each is a property of the request, and each is checked below.
 */

afterEach(() => {
  imds.calls.length = 0;
  clearEntraTokenCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('normaliseEndpoint', () => {
  /*
   * THE PORTAL SHOWS READERS FOUR DIFFERENT THINGS and they paste whichever
   * they found. Every one of these used to build a doubled path — the SDK
   * appends `/openai/deployments/<name>` itself — and answer 404, which
   * `provider.ts` then reported as the provider being unreachable.
   */
  it('reduces every shape the portal offers to the resource root', () => {
    const root = 'https://my-resource.openai.azure.com';
    expect(normaliseEndpoint(root)).toBe(root);
    expect(normaliseEndpoint(`${root}/`)).toBe(root);
    expect(normaliseEndpoint(`${root}/openai`)).toBe(root);
    expect(normaliseEndpoint(`${root}/openai/deployments/foo/chat/completions?api-version=2024-10-21`)).toBe(root);
    expect(normaliseEndpoint('  https://my-resource.openai.azure.com/openai/  ')).toBe(root);
  });

  it('handles the AI Foundry host as well as the classic one', () => {
    // Two different resource kinds serve the same API at the same path. A
    // reader with a Foundry project has the second and only ever sees it.
    expect(normaliseEndpoint('https://my-resource.services.ai.azure.com/openai')).toBe(
      'https://my-resource.services.ai.azure.com',
    );
  });
});

describe('azure.problem', () => {
  const base = { endpoint: 'https://r.openai.azure.com', deployment: 'gpt-5-policy' };

  it('asks for a key when the mode is a key', () => {
    expect(azure.problem({ ...base, authMode: 'key' })).toMatch(/resource keys/);
    expect(azure.problem({ ...base, authMode: 'key', apiKey: 'k' })).toBeNull();
  });

  it('defaults to key authentication when nothing has been chosen', () => {
    // The first option of the select, and the behaviour every existing install
    // already has. A default that silently became Entra would break them.
    expect(azure.problem({ ...base, apiKey: 'k' })).toBeNull();
  });

  it('asks for the app registration fields, one at a time, in a useful order', () => {
    const app = { ...base, authMode: 'entra-app' };
    expect(azure.problem(app)).toMatch(/tenant/i);
    expect(azure.problem({ ...app, tenantId: 't' })).toMatch(/client\) ID/i);
    expect(azure.problem({ ...app, tenantId: 't', clientId: 'c' })).toMatch(/client secret/i);
    expect(azure.problem({ ...app, tenantId: 't', clientId: 'c', clientSecret: 's' })).toBeNull();
  });

  it('asks a managed identity for nothing at all', () => {
    // The platform supplies it. A client ID only disambiguates between several
    // user-assigned identities, which is why it is optional.
    expect(azure.problem({ ...base, authMode: 'managed-identity' })).toBeNull();
  });

  it('names the variable when a workload identity has no token file', () => {
    const wl = { ...base, authMode: 'workload-identity', tenantId: 't', clientId: 'c' };
    expect(azure.problem(wl)).toMatch(/AZURE_FEDERATED_TOKEN_FILE/);
    vi.stubEnv('AZURE_FEDERATED_TOKEN_FILE', '/var/run/token');
    expect(azure.problem(wl)).toBeNull();
  });

  it('still refuses an endpoint that is not https, whatever the auth mode', () => {
    expect(azure.problem({ ...base, endpoint: 'http://r.openai.azure.com', apiKey: 'k' })).toMatch(/https/);
  });
});

describe('the managed-identity token request', () => {
  it('sends Metadata: true, asks for the right resource, and does not invent a client id', async () => {
    const token = await entraTokenProvider('managed-identity', {})!();

    expect(token).toBe('imds-token');
    const url = new URL(imds.calls[0].url);
    // IMDS refuses without the header — it is what distinguishes a deliberate
    // call from an SSRF, and omitting it is the classic way to get a 400 that
    // reads like the identity not existing.
    expect(imds.calls[0].headers.Metadata).toBe('true');
    expect(url.hostname).toBe('169.254.169.254');
    expect(url.searchParams.get('resource')).toBe('https://cognitiveservices.azure.com');
    // An empty client_id is REJECTED by IMDS rather than ignored, so it must be
    // absent and not blank.
    expect(url.searchParams.has('client_id')).toBe(false);
  });

  it('sends a client id only when one is configured', async () => {
    await entraTokenProvider('managed-identity', { clientId: 'uami-1' })!();
    expect(new URL(imds.calls[0].url).searchParams.get('client_id')).toBe('uami-1');
  });

  it('caches the token rather than fetching one per call', async () => {
    // An eighteen-stage run makes hundreds of calls and `azureADTokenProvider`
    // is invoked on every one. Without a cache this is a round trip per model
    // call, and a rate limit on the token endpoint long before the model.
    const provider = entraTokenProvider('managed-identity', {})!;
    await provider();
    await provider();
    await provider();
    expect(imds.calls).toHaveLength(1);
  });
});

describe('entraProblem', () => {
  it('is pure and synchronous, so the panel can call it', () => {
    // `problem()` is called on every config render. Anything that reaches the
    // network here would make the admin page make a request per keystroke.
    expect(entraProblem('key', {})).toBeNull();
    expect(entraProblem('entra-app', {})).toMatch(/tenant/i);
  });
});

describe('the provider definition', () => {
  it('declares a deadline longer than OpenRouter’s, because it is slower', () => {
    // 180s killed real calls at 237s and over 301s, and reported the model as
    // too slow. See `$lib/server/models/call-deadline`.
    expect(azure.callTimeoutMs).toBeGreaterThan(180_000);
  });

  it('declares the Entra host as egress, so a firewall change includes it', () => {
    expect(azure.egress.join(' ')).toMatch(/login\.microsoftonline\.com/);
  });

  it('publishes no catalogue and no grounded search, which are both real answers', () => {
    // Azure does not list deployments on this API and has no web search. A stub
    // that pretended otherwise would offer a browse button that cannot work, or
    // put invented sources in an assessment.
    expect(azure.catalogue).toBeUndefined();
    expect(azure.grounded).toBeUndefined();
  });
});
