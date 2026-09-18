/**
 * Credentials, read from the environment.
 *
 * Upstream these come from a settings table with an encrypted-at-rest store and
 * a UI to edit them. A standalone tool has one user, who has a `.env`.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and put your key in it.`
    );
  }
  return value;
}

/** One OpenRouter key funds every model this build can reach. */
export function getOpenRouterApiKey(): string {
  return required('OPENROUTER_API_KEY');
}

/**
 * Tavily powers the targeted-research stage. It is OPTIONAL: an assessment
 * without it still runs, and the research stage records that it had no search
 * rather than failing the run. `hasTavilyKey` is what callers should ask before
 * reaching for the key.
 */
export function hasTavilyKey(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

export function getTavilyKey(): string {
  return required('TAVILY_API_KEY');
}
