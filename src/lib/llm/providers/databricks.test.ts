import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDatabricksTokenCache, databricks, listServingEndpoints, normaliseHost } from './databricks';
import { providerById } from './index';

/**
 * DATABRICKS, PROVED WITHOUT A WORKSPACE.
 *
 * Nothing here has reached a real Databricks workspace. What is asserted is the
 * shape of every request against the documented API — the token exchange at
 * `/oidc/v1/token` with basic auth and `scope=all-apis`, the base URL a chat
 * call is built on, and the serving-endpoint listing — with `fetch` stood in
 * for. A real call is the first thing to do on a workspace.
 */

const APP = {
  host: 'dbc-a1b2c3d4-e5f6.cloud.databricks.com',
  endpoint: 'databricks-claude-sonnet-4-5',
  clientId: 'sp-client',
  clientSecret: 'sp-secret',
};

type Call = { url: string; init?: RequestInit };
const calls: Call[] = [];

function stubFetch(answer: (url: string) => { status?: number; body: unknown }) {
  vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = answer(url);
    return new Response(JSON.stringify(body), { status });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
  clearDatabricksTokenCache();
});

describe('what a Databricks configuration needs', () => {
  it('is offered by the registry', () => {
    expect(providerById('databricks')?.label).toBe('Databricks Model Serving');
  });

  it('is ready with only what a Databricks App is started with, plus the endpoint', () => {
    expect(databricks.problem(APP)).toBeNull();
  });

  it('says which field is missing', () => {
    expect(databricks.problem({ ...APP, host: '' })).toMatch(/workspace URL/);
    expect(databricks.problem({ ...APP, endpoint: '' })).toMatch(/serving endpoint/);
    expect(databricks.problem({ ...APP, clientSecret: '' })).toMatch(/OAuth secret/);
    expect(databricks.problem({ ...APP, authMode: 'pat' })).toMatch(/personal access token/);
    expect(databricks.problem({ ...APP, authMode: 'pat', token: 'dapi123' })).toBeNull();
  });

  it('refuses a pasted URL in place of an endpoint name, and accepts an AI Gateway name', () => {
    expect(databricks.problem({ ...APP, endpoint: 'https://x/serving-endpoints/foo/invocations' })).toMatch(/Serving page/);
    expect(databricks.problem({ ...APP, endpoint: 'system.ai.claude-sonnet-4-5' })).toBeNull();
  });

  it('refuses plain http', () => {
    expect(databricks.problem({ ...APP, host: 'http://example.cloud.databricks.com' })).toMatch(/https/);
  });
});

describe('the workspace address', () => {
  it('takes a bare host, a full URL or a page inside the workspace down to the origin', () => {
    expect(normaliseHost('dbc-1.cloud.databricks.com')).toBe('https://dbc-1.cloud.databricks.com');
    expect(normaliseHost('https://adb-123.4.azuredatabricks.net/')).toBe('https://adb-123.4.azuredatabricks.net');
    expect(normaliseHost('https://dbc-1.cloud.databricks.com/ml/endpoints?o=123')).toBe('https://dbc-1.cloud.databricks.com');
  });
});

describe('where the calls go', () => {
  it('builds chat calls on /serving-endpoints, or on AI Gateway when chosen', () => {
    expect(databricks.client(APP).baseURL).toBe('https://dbc-a1b2c3d4-e5f6.cloud.databricks.com/serving-endpoints');
    expect(databricks.client({ ...APP, route: 'ai-gateway' }).baseURL).toBe('https://dbc-a1b2c3d4-e5f6.cloud.databricks.com/ai-gateway/mlflow/v1');
  });

  it('asks for the endpoint by name, and records that name as the model', () => {
    expect(databricks.model(APP)).toBe('databricks-claude-sonnet-4-5');
    expect(databricks.models(APP)).toEqual([expect.objectContaining({ id: 'databricks-claude-sonnet-4-5' })]);
  });

  it('exchanges the service principal for a token once, and sends it as a bearer', async () => {
    stubFetch((url) => {
      if (url.endsWith('/oidc/v1/token')) return { body: { access_token: 'oauth-token', token_type: 'Bearer', expires_in: 3600 } };
      return {
        body: {
          id: 'x', object: 'chat.completion', created: 0, model: APP.endpoint,
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }],
        },
      };
    });
    const client = databricks.client(APP);
    // The client carries the long-running transport's own fetch, which the
    // global stub cannot reach; hand it the stub instead.
    (client as unknown as { fetch: typeof fetch }).fetch = globalThis.fetch;
    for (let i = 0; i < 2; i++) {
      await client.chat.completions.create({ model: APP.endpoint, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 });
    }

    const exchanges = calls.filter((c) => c.url.endsWith('/oidc/v1/token'));
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].url).toBe('https://dbc-a1b2c3d4-e5f6.cloud.databricks.com/oidc/v1/token');
    const headers = new Headers(exchanges[0].init?.headers);
    expect(headers.get('authorization')).toBe(`Basic ${Buffer.from('sp-client:sp-secret').toString('base64')}`);
    expect(String(exchanges[0].init?.body)).toBe('grant_type=client_credentials&scope=all-apis');

    const chats = calls.filter((c) => c.url.endsWith('/serving-endpoints/chat/completions'));
    expect(chats).toHaveLength(2);
    for (const chat of chats) expect(new Headers(chat.init?.headers).get('authorization')).toBe('Bearer oauth-token');
  });

  it('says what the workspace said when it refuses a token', async () => {
    stubFetch(() => ({ status: 401, body: { error: 'invalid_client' } }));
    await expect(listServingEndpoints(APP)).rejects.toThrow(/refused to issue a token for the service principal \(401\).*invalid_client/);
  });
});

describe('what the workspace serves', () => {
  it('lists chat endpoints only, with their display names, and marks one that is not ready', async () => {
    stubFetch(() => ({
      body: {
        endpoints: [
          { name: 'databricks-gte-large-en', task: 'llm/v1/embeddings' },
          { name: 'databricks-claude-sonnet-4-5', task: 'llm/v1/chat', state: { ready: 'READY' }, config: { served_entities: [{ foundation_model: { display_name: 'Claude Sonnet 4.5', description: 'Anthropic.' } }] } },
          { name: 'team-gpt', task: 'llm/v1/chat', state: { ready: 'NOT_READY' }, config: { served_entities: [{ external_model: { name: 'gpt-5', provider: 'openai' } }] } },
          { name: 'my-sklearn-model' },
        ],
      },
    }));
    const rows = await listServingEndpoints({ ...APP, authMode: 'pat', token: 'dapi123' });
    expect(rows.map((r) => r.id)).toEqual(['databricks-claude-sonnet-4-5', 'team-gpt']);
    expect(rows[0].name).toBe('Claude Sonnet 4.5');
    expect(rows[1].description).toMatch(/^Not ready\. An external model: openai gpt-5/);
    expect(calls[0].url).toBe('https://dbc-a1b2c3d4-e5f6.cloud.databricks.com/api/2.0/serving-endpoints');
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer dapi123');
  });
});
