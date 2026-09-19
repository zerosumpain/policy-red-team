// What each provider needs, and what it must never hand back.
//
// The client construction is asserted through the SDK's own `baseURL`, because
// the shape of an Azure call — deployment in the path, version in the query,
// `api-key` in the header — is the thing that is easy to get subtly wrong and
// impossible to notice until a real call 404s.
import { afterEach, describe, expect, it } from 'vitest';
import { azure } from './azure';
import { codex } from './codex';
import { openrouter } from './openrouter';
import { providerById, providers, redact } from './index';
import { coerceModelContext } from '$lib/constants/default-models';
import { isOfferedModel, registerProviderModels } from '$lib/server/models/catalogue';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe('what a provider needs before it can be tried', () => {
  it('names the missing field rather than failing on the first call', () => {
    expect(openrouter.problem({})).toMatch(/key/i);
    expect(openrouter.problem({ apiKey: 'sk-or-x' })).toBeNull();

    expect(codex.problem({})).toMatch(/where/i);
    expect(codex.problem({ baseUrl: 'http://127.0.0.1:5207/v1' })).toMatch(/which model/i);
    expect(codex.problem({ baseUrl: 'http://127.0.0.1:5207/v1', model: 'gpt-5-codex' })).toBeNull();

    expect(azure.problem({ endpoint: 'https://r.openai.azure.com' })).toMatch(/deployment/i);
    expect(azure.problem({ endpoint: 'https://r.openai.azure.com', deployment: 'd' })).toMatch(/key/i);
    expect(azure.problem({ endpoint: 'https://r.openai.azure.com', deployment: 'd', apiKey: 'k' })).toBeNull();
  });

  it('refuses a base URL that is not one', () => {
    expect(codex.problem({ baseUrl: 'not a url', model: 'm' })).toMatch(/not a URL/i);
    // A `file:` or `ftp:` endpoint is not something to hand to an HTTP client.
    expect(codex.problem({ baseUrl: 'file:///etc/passwd', model: 'm' })).toMatch(/http/i);
    expect(azure.problem({ endpoint: 'http://r.openai.azure.com', deployment: 'd', apiKey: 'k' })).toMatch(/https/i);
  });

  it('treats a blank optional field as absent rather than as a value', () => {
    expect(codex.problem({ baseUrl: 'http://127.0.0.1:5207/v1', model: 'm', apiKey: '   ' })).toBeNull();
  });
});

describe('where the calls actually go', () => {
  it('puts an Azure deployment in the path and the version in the query', () => {
    // Azure's shape, and the one thing that is silently wrong until a real call
    // 404s: the deployment is part of the URL, not the model parameter alone.
    const client = azure.client({
      endpoint: 'https://my-resource.openai.azure.com/',
      deployment: 'gpt-5-policy',
      apiKey: 'secret',
    });
    expect(client.baseURL).toBe('https://my-resource.openai.azure.com/openai/deployments/gpt-5-policy');
    // And the deployment is what every request asks for by name.
    expect(azure.model({ endpoint: 'x', deployment: ' gpt-5-policy ', apiKey: 'k' })).toBe('gpt-5-policy');
  });

  it('escapes a deployment name rather than pasting it into a URL', () => {
    const client = azure.client({ endpoint: 'https://r.openai.azure.com', deployment: 'a b/c', apiKey: 'k' });
    expect(client.baseURL).toBe('https://r.openai.azure.com/openai/deployments/a%20b%2Fc');
  });

  it('trims a trailing slash off a bridge URL instead of doubling it', () => {
    expect(codex.client({ baseUrl: 'http://127.0.0.1:5207/v1///', model: 'm' }).baseURL)
      .toBe('http://127.0.0.1:5207/v1');
  });

  it('lets a loopback bridge have no key at all', () => {
    // The SDK refuses to construct without one, and making every such user
    // invent a value to get past a validation that is not the endpoint's is a
    // worse answer than sending a placeholder.
    expect(() => codex.client({ baseUrl: 'http://127.0.0.1:5207/v1', model: 'm' })).not.toThrow();
  });
});

describe('what a provider offers', () => {
  it('offers exactly what was configured where there is no catalogue', () => {
    // The id is `codex/`-prefixed and the NAME is not: the prefix decides which
    // deadline the run gets (see the block at the bottom of this file), and the
    // reader should see the model they typed rather than our routing.
    expect(codex.models({ baseUrl: 'x', model: 'gpt-5-codex' })).toEqual([
      { id: 'codex/gpt-5-codex', name: 'gpt-5-codex', note: expect.any(String) },
    ]);
    expect(azure.models({ deployment: 'gpt-5-policy' })[0].id).toBe('gpt-5-policy');
    // Nothing configured is an empty menu, not a menu of things that will 404.
    expect(codex.models({})).toEqual([]);
    expect(azure.models({})).toEqual([]);
  });

  it('offers the whole catalogue for OpenRouter', () => {
    expect(openrouter.models({}).length).toBeGreaterThan(1);
  });
});

describe('what a build offers', () => {
  it('is everything by default', () => {
    delete process.env.POLICY_PROVIDERS;
    expect(providers().map((p) => p.id)).toEqual(['openrouter', 'codex', 'azure']);
  });

  it('narrows to a named list, which is how the Codex bridge leaves a shipped build', () => {
    process.env.POLICY_PROVIDERS = 'openrouter, azure';
    expect(providers().map((p) => p.id)).toEqual(['openrouter', 'azure']);
    expect(providerById('codex')).toBeNull();
  });

  it('ignores a name it does not know rather than refusing to start', () => {
    process.env.POLICY_PROVIDERS = 'openrouter,bedrock';
    expect(providers().map((p) => p.id)).toEqual(['openrouter']);
  });

  it('falls back to everything when the list names nothing real', () => {
    // A typo in a deployment variable must not leave a service that cannot
    // reach a model at all.
    process.env.POLICY_PROVIDERS = 'bedrock,vertex';
    expect(providers().map((p) => p.id)).toEqual(['openrouter', 'codex', 'azure']);
  });
});

describe('what the panel is allowed to see', () => {
  it('reports whether a secret is set and NEVER what it is', () => {
    const out = redact(azure, {
      endpoint: 'https://r.openai.azure.com',
      deployment: 'd',
      apiKey: 'super-secret-value',
      apiVersion: '2024-10-21',
    });
    expect(out.apiKey).toBe(true);
    expect(JSON.stringify(out)).not.toContain('super-secret');
    // Everything that is not a secret comes back as it was, so the panel can
    // show what is configured rather than making the reader retype it.
    expect(out.endpoint).toBe('https://r.openai.azure.com');
    expect(out.apiVersion).toBe('2024-10-21');
  });

  it('says a secret is unset rather than reporting an empty string as a value', () => {
    expect(redact(openrouter, {}).apiKey).toBe(false);
    expect(redact(openrouter, { apiKey: '  ' }).apiKey).toBe(false);
  });
});

/**
 * THE `codex/` PREFIX IS A DEADLINE, NOT A LABEL.
 *
 * `coerceModelContext` reads which provider a run is on from this prefix alone,
 * and `callTimeoutMs` then allows a Codex context 420 seconds a call against
 * OpenRouter's 180. A bridge model registered under its bare name is therefore
 * commissioned as an OpenRouter one and judged against the short deadline — so
 * the one provider that genuinely needs seven minutes would be given three, and
 * every call past three minutes reported as the model being too slow.
 */
describe('a Codex model carries its provider in its id', () => {
  const codex = providerById('codex')!;
  const config = { baseUrl: 'http://127.0.0.1:5207/v1', model: 'gpt-5.6-sol' };

  it('offers the id prefixed, so the run is recognised as Codex', () => {
    expect(codex.models(config)[0].id).toBe('codex/gpt-5.6-sol');
  });

  it('resolves that id back to the codex provider and the long deadline', () => {
    expect(coerceModelContext({ modelId: codex.models(config)[0].id }).provider).toBe('codex');
    // The bare name does not, which is the bug this pair of tests exists for.
    expect(coerceModelContext({ modelId: 'gpt-5.6-sol' }).provider).toBe('openrouter');
  });

  it('sends the BARE slug to the endpoint, which has never heard of the prefix', () => {
    expect(codex.model(config)).toBe('gpt-5.6-sol');
  });

  it('does not double the prefix if the reader typed one', () => {
    expect(codex.models({ ...config, model: 'codex/gpt-5.6-sol' })[0].id).toBe('codex/gpt-5.6-sol');
  });
});

/**
 * A COMMISSION THAT DEGRADES TAKES THE DEADLINE WITH IT.
 *
 * `isOfferedModel` gates what a submission may name, and it consults the ids the
 * ACTIVE provider serves — a set that was only ever filled when somebody opened
 * the admin panel. After a restart it is empty, so a Codex model is read as
 * unknown, `policy_analyses.model` records null, `coerceModelContext` reads the
 * run as OpenRouter, and `callTimeoutMs` allows 180 seconds instead of 420.
 *
 * The call still reaches the bridge either way, which is what makes this quiet:
 * the run is simply judged against a deadline it was never meant to face.
 */
describe('registering what the active provider serves', () => {
  const codex = providerById('codex')!;
  const config = { baseUrl: 'http://127.0.0.1:5207/v1', model: 'gpt-5.6-sol' };

  it('refuses a Codex id while the set is empty', () => {
    registerProviderModels([]);
    expect(isOfferedModel('codex/gpt-5.6-sol')).toBe(false);
  });

  it('accepts it once the provider has been registered', () => {
    registerProviderModels(codex.models(config).map((m) => m.id));
    expect(isOfferedModel('codex/gpt-5.6-sol')).toBe(true);
  });

  it('a refused id is what costs the long deadline', () => {
    // Degrading to null is not neutral: the run stops being a Codex run.
    expect(coerceModelContext({ modelId: 'codex/gpt-5.6-sol' }).provider).toBe('codex');
    // Whatever the default resolves to, it has no `codex/` prefix — that is
    // the whole mechanism, and it is why degrading is not a neutral act.
    expect(coerceModelContext({ modelId: 'anthropic/claude-sonnet-4.5' }).provider).toBe('openrouter');
  });
});

/**
 * THE TRANSPORT MUST NOT BE THE THING THAT DECIDES.
 *
 * Node's fetch is undici, whose headersTimeout and bodyTimeout default to 300
 * seconds. `SLOW_PROVIDER_TIMEOUT_MS` allows a Codex call 420. Without a
 * dispatcher the socket gives up two minutes early and `provider.ts` reports it
 * through the transport branch as "the configured model provider could not be
 * reached" — the bridge blamed for a limit nobody wrote down.
 */
describe('a Codex call can run as long as its deadline allows', () => {
  const codex = providerById('codex')!;
  const client = codex.client({ baseUrl: 'http://127.0.0.1:5207/v1', model: 'gpt-5.6-sol' });

  it('carries a dispatcher, so undici is not the limit', () => {
    expect((client as unknown as { fetchOptions?: { dispatcher?: unknown } }).fetchOptions?.dispatcher)
      .toBeDefined();
  });

  it('uses undici’s own fetch, because a dispatcher from another copy is refused', () => {
    // Node's built-in fetch is a DIFFERENT undici. Passing our dispatcher to it
    // fails instantly with "may be caused by passing an undici dispatcher...
    // that is incompatible" — the pair has to match.
    const used = (client as unknown as { fetch?: unknown }).fetch;
    expect(used).toBeTypeOf('function');
    expect(used).not.toBe(globalThis.fetch);
  });

  it('leaves OpenRouter alone, whose 180s deadline is inside undici’s patience', () => {
    const or = providerById('openrouter')!.client({ apiKey: 'sk-or-test' });
    expect((or as unknown as { fetchOptions?: unknown }).fetchOptions).toBeUndefined();
  });
});
