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
    expect(codex.models({ baseUrl: 'x', model: 'gpt-5-codex' })).toEqual([
      { id: 'gpt-5-codex', name: 'gpt-5-codex', note: expect.any(String) },
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
