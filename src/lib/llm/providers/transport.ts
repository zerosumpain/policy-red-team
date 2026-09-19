import { Agent, fetch as undiciFetch } from 'undici';

/**
 * A WIRE THAT OUTLASTS THE DEADLINE ABOVE IT.
 *
 * Node's built-in `fetch` is undici, and undici's `headersTimeout` and
 * `bodyTimeout` both default to 300 seconds. The pipeline allows a Codex call
 * 420 (`SLOW_PROVIDER_TIMEOUT_MS`), so the socket gave up two minutes before the
 * deadline did — and because the deadline had not fired, `provider.ts` classified
 * the result through its TRANSPORT branch and reported "the configured model
 * provider could not be reached". The bridge was fine every time.
 *
 * Measured on the run of 2026-09-19: three of the first ten calls died at
 * exactly 300.7s, while the completed ones ran 197–261s. Codex sits squarely in
 * the window this opens.
 *
 * THE RULE THIS ENCODES: the transport must never be the thing that decides. A
 * call should end because the deadline the code states has passed, and for no
 * other reason — anything else is a limit nobody wrote down being enforced under
 * a misleading error message. So this is set well clear of 420s rather than
 * exactly at it.
 *
 * IT MUST BE undici's OWN `fetch`, NOT NODE'S. They are different copies of
 * undici, and a dispatcher built here is rejected by the built-in one — the SDK
 * even guesses at the cause: "This may be caused by passing an undici
 * dispatcher... that is incompatible". Passing the matching `fetch` alongside
 * the dispatcher is what makes the pair legal. That cost an attempt.
 */
const LONG_CALL_MS = 600_000;

/**
 * One agent, module-scoped, because an Agent owns a connection pool. Building
 * one per client would open a fresh pool for every configuration change and
 * leave the old ones to be collected with their sockets still open.
 */
const longRunningAgent = new Agent({
  headersTimeout: LONG_CALL_MS,
  bodyTimeout: LONG_CALL_MS,
});

/**
 * Constructor options that let a call run for as long as its caller allows.
 *
 * Spread into `new OpenAI({...})`. Only providers whose declared deadline can
 * exceed undici's 300-second default need it; OpenRouter's is 180 and is
 * therefore already inside the wire's patience.
 */
export function longRunningTransport() {
  return {
    fetch: undiciFetch as unknown as typeof globalThis.fetch,
    fetchOptions: { dispatcher: longRunningAgent },
  };
}
