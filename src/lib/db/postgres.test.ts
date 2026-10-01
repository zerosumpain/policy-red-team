import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLakebaseCredentialCache, describeServer, lakebasePassword, usesPostgres } from './postgres';
import { clearWorkspaceTokenCache } from '$lib/databricks/oauth';

/**
 * WHICH DATABASE, AND THE LAKEBASE PASSWORD — without a workspace.
 *
 * The pool itself was proved by running a whole fixture assessment against a
 * throwaway `postgres:16` container (phase 21); what is asserted here is the
 * choice of backend and the shape of the three ways a Lakebase password is
 * minted, with `fetch` stood in for.
 */

const APP = {
  DATABRICKS_HOST: 'dbc-1.cloud.databricks.com',
  DATABRICKS_CLIENT_ID: 'sp',
  DATABRICKS_CLIENT_SECRET: 'secret',
  PGHOST: 'instance-1.database.cloud.databricks.com',
  PGDATABASE: 'databricks_postgres',
  PGUSER: 'sp',
};

const calls: { url: string; body: string }[] = [];

function stubFetch() {
  vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? '') });
    if (url.endsWith('/oidc/v1/token')) return new Response(JSON.stringify({ access_token: 'workspace-token', expires_in: 3600 }));
    return new Response(JSON.stringify({ token: 'database-token', expiration_time: new Date(Date.now() + 3_600_000).toISOString() }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
  clearWorkspaceTokenCache();
  clearLakebaseCredentialCache();
});

describe('which database', () => {
  it('is the embedded one unless a server is named', () => {
    expect(usesPostgres({})).toBe(false);
    expect(usesPostgres({ POLICY_DATABASE_URL: 'postgres://u:p@h/db' })).toBe(true);
    expect(usesPostgres({ PGHOST: 'h' })).toBe(true);
  });

  it('describes a server without its password', () => {
    expect(describeServer({ POLICY_DATABASE_URL: 'postgres://u:hunter2@db.example:5432/policy' })).toBe('postgres://db.example:5432/policy');
    expect(describeServer({ PGHOST: 'h', PGDATABASE: 'd', LAKEBASE_INSTANCE: 'i' })).toBe('postgres://h:5432/d (Lakebase)');
  });
});

describe('the Lakebase password', () => {
  it('mints a credential for a provisioned instance, once', async () => {
    stubFetch();
    const env = { ...APP, LAKEBASE_INSTANCE: 'policy-db' };
    expect(await lakebasePassword(env)).toBe('database-token');
    expect(await lakebasePassword(env)).toBe('database-token');
    const minted = calls.filter((c) => c.url.endsWith('/api/2.0/database/credentials'));
    expect(minted).toHaveLength(1);
    expect(JSON.parse(minted[0].body)).toMatchObject({ instance_names: ['policy-db'] });
    expect(calls.filter((c) => c.url.endsWith('/oidc/v1/token'))).toHaveLength(1);
  });

  it('mints a credential for an autoscaling endpoint', async () => {
    stubFetch();
    const endpoint = 'projects/p/branches/production/endpoints/e';
    expect(await lakebasePassword({ ...APP, LAKEBASE_ENDPOINT: endpoint })).toBe('database-token');
    const minted = calls.find((c) => c.url.endsWith('/api/2.0/postgres/credentials'));
    expect(JSON.parse(minted!.body)).toEqual({ endpoint });
  });

  it('falls back to the workspace token when told neither', async () => {
    stubFetch();
    expect(await lakebasePassword(APP)).toBe('workspace-token');
  });

  it('says what is missing when there is no principal to mint with', async () => {
    await expect(lakebasePassword({ PGHOST: 'h' })).rejects.toThrow(/PGPASSWORD is not set/);
  });
});
