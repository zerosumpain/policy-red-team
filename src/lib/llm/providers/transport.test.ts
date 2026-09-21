import { describe, expect, it } from 'vitest';
import { getGlobalDispatcher } from 'undici';
import { dispatcherKind, longRunningTransport, proxyInUse } from './transport';

/**
 * THE ASSERTION THAT KEEPS A PROXIED ESTATE WORKING.
 *
 * Importing the standalone `undici` package claims the global dispatcher slot
 * with a plain `Agent` if nothing has claimed it — and Node's own `fetch` reads
 * that same slot. So before this file set one deliberately, merely loading the
 * provider registry replaced whatever proxy-aware dispatcher Node was about to
 * install, and every call in the process went straight to the origin.
 *
 * Measured 2026-09-21 with `HTTPS_PROXY` pointing at a closed port: a plain
 * Node fetch failed with ECONNREFUSED (the proxy was tried, which is correct)
 * and the same fetch after `import('undici')` reached the origin.
 *
 * This is the kind of failure nothing else would catch. There is no proxy in
 * CI, so a regression here is green everywhere and fatal in the one estate the
 * service is being built for. Asserting the TYPE in the slot is the honest
 * proxy for behaviour that needs a network to observe.
 */
describe('the global dispatcher', () => {
  it('is one that reads the proxy environment, not a plain Agent', () => {
    // Importing this module is what installs it; the import above is the act
    // under test.
    expect(dispatcherKind()).toBe('EnvHttpProxyAgent');
    expect(getGlobalDispatcher().constructor.name).toBe('EnvHttpProxyAgent');
  });
});

describe('longRunningTransport', () => {
  it('pairs undici’s own fetch with the dispatcher, because Node’s rejects it', () => {
    const transport = longRunningTransport();
    // The SDK throws "This may be caused by passing an undici dispatcher... that
    // is incompatible" when the two halves come from different copies of undici.
    expect(typeof transport.fetch).toBe('function');
    expect(transport.fetch).not.toBe(globalThis.fetch);
    expect(transport.fetchOptions.dispatcher).toBeTruthy();
  });

  it('is a long-call dispatcher, so the wire outlasts a 420-second deadline', () => {
    // Not the same object as the ambient one: that would give every catalogue
    // listing and connection test a ten-minute patience it has no use for.
    expect(transportDispatcher()).not.toBe(getGlobalDispatcher());
  });
});

describe('proxyInUse', () => {
  it('reads both spellings and reports nothing when nothing is set', () => {
    const before = { ...process.env };
    try {
      for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy']) {
        delete process.env[name];
      }
      expect(proxyInUse()).toEqual({ https: null, http: null, noProxy: null });

      // Lowercase is the spelling curl and most estates actually use, and
      // reporting only the uppercase one would tell an operator their proxy is
      // not configured while it is.
      process.env.https_proxy = 'http://proxy.internal:8080';
      process.env.NO_PROXY = '.internal,localhost';
      expect(proxyInUse()).toEqual({
        https: 'http://proxy.internal:8080',
        http: null,
        noProxy: '.internal,localhost',
      });
    } finally {
      for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy']) {
        delete process.env[name];
        if (before[name] !== undefined) process.env[name] = before[name];
      }
    }
  });
});

function transportDispatcher() {
  return longRunningTransport().fetchOptions.dispatcher;
}
