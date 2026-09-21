import { readAll, writeSetting } from './settings-store';

/**
 * WHERE THE RESEARCH STAGE GETS ITS SOURCES, AND WHAT IT SAYS WHEN IT CANNOT.
 *
 * One of the eighteen stages goes and looks things up. Until now the answer to
 * "how" was: a Tavily key in the ENVIRONMENT if there is one, otherwise a
 * provider's grounded endpoint if it has one, otherwise nothing. Two things
 * were wrong with that, and both matter more for the deployment this is being
 * aimed at than for a laptop.
 *
 * THE PANEL COULD NOT CONFIGURE IT AT ALL. The key was read straight from
 * `process.env` by a copied file, so the one credential a reader is most likely
 * to add second had no box to go in. A wizard that walks somebody through
 * connecting a model and then cannot ask about search is a wizard that stops
 * half way through the job.
 *
 * AND "NO SEARCH" WAS A SILENT DEGRADATION RATHER THAN A CHOICE. An Azure-only
 * install has no Tavily account and Azure declares no grounded endpoint, so
 * every run plans its research questions, answers NONE of them, and finishes
 * `completed_with_gaps` carrying a "research unavailable" warning per question.
 * That is the correct outcome and it reads like a fault — and worse, it costs a
 * model call per question to arrive at. A reader who has decided their tenant
 * has no route to the open web should be able to SAY so, once, and have the run
 * skip the asking rather than discover the answer twelve times.
 *
 * FOUR STATES:
 *
 *   auto      what it has always done: Tavily, then grounded, then nothing.
 *   tavily    insist on Tavily; fail visibly if it is not configured.
 *   grounded  insist on the provider's own search.
 *   none      do not look anything up, and say so once.
 *
 * SYNCHRONOUS, FROM A MODULE VARIABLE, for the same reason `catalogue.ts` and
 * `call-deadline.ts` are: the copied research stage calls into this on a hot
 * path and making it async would push a divergence into the middle of a file
 * this fork keeps byte-identical.
 */

export type SearchEngine = 'auto' | 'tavily' | 'grounded' | 'none';

export const SEARCH_ENGINE = 'search.engine';
export const SEARCH_TAVILY_KEY = 'search.tavilyKey';
export const SEARCH_DOMAINS = 'search.domains';

const ENGINES = new Set<SearchEngine>(['auto', 'tavily', 'grounded', 'none']);

/**
 * ONLY THE STORED HALF IS CACHED.
 *
 * The environment is read LIVE, every time, and that is not a detail: reading
 * `TAVILY_API_KEY` through a cache would mean a variable that has been honoured
 * live since phase 0 quietly stopped taking effect until something refreshed —
 * and the refresh runs at boot, so it would work everywhere except the one
 * place that notices, which is a test.
 *
 * The store is cached because reading it means decrypting it, and the copied
 * research stage asks on a hot path.
 */
type Stored = {
  engine: SearchEngine | null;
  tavilyKey: string | null;
  /** Hostnames a search may return, or empty for no restriction. */
  domains: string[];
};

let stored: Stored = { engine: null, tavilyKey: null, domains: [] };

/** Dropped between tests. */
export function clearSearchConfig(): void {
  stored = { engine: null, tavilyKey: null, domains: [] };
}

/**
 * Read the stored search configuration into the module variable.
 *
 * Called from `refreshModelMenu()`, which runs at boot, after a configuration
 * save and after a provider switch — the same three moments everything else
 * that is cached here is refreshed at.
 *
 * THE ENVIRONMENT STILL WINS, as everywhere else. `TAVILY_API_KEY` is the name
 * every version of this service has used and every `.env.example` documents, so
 * an install that has one keeps working with nothing touched.
 */
export async function refreshSearchConfig(): Promise<void> {
  const rows = await readAll().catch(() => ({} as Record<string, string>));
  const saved = rows[SEARCH_ENGINE] as SearchEngine | undefined;
  stored = {
    engine: saved && ENGINES.has(saved) ? saved : null,
    tavilyKey: rows[SEARCH_TAVILY_KEY] || null,
    domains: (rows[SEARCH_DOMAINS] ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  };
}

export async function saveSearchConfig(fields: { engine?: SearchEngine; tavilyKey?: string; domains?: string }): Promise<void> {
  if (fields.engine && ENGINES.has(fields.engine)) await writeSetting(SEARCH_ENGINE, fields.engine);
  if (fields.tavilyKey !== undefined) await writeSetting(SEARCH_TAVILY_KEY, fields.tavilyKey.trim());
  if (fields.domains !== undefined) await writeSetting(SEARCH_DOMAINS, fields.domains.trim());
  await refreshSearchConfig();
}

/** True when the environment decides it, so the panel says it cannot. */
export const searchIsPinned = (): boolean => ENGINES.has(process.env.POLICY_SEARCH?.trim() as SearchEngine);

/** The environment beats the store, and is read live so it never needs a refresh. */
export const tavilyKey = (): string | null => process.env.TAVILY_API_KEY?.trim() || stored.tavilyKey;
export const searchDomains = (): string[] => stored.domains;

export function chosenEngine(): SearchEngine {
  const fromEnv = process.env.POLICY_SEARCH?.trim() as SearchEngine | undefined;
  if (fromEnv && ENGINES.has(fromEnv)) return fromEnv;
  return stored.engine ?? 'auto';
}

/**
 * WHAT WILL ACTUALLY HAPPEN, and the sentence to put in front of a reader.
 *
 * `kind` is what the run will do; `why` says it in the reader's terms. The pair
 * is the point: a report that says "no sources were found" is describing a
 * search that failed, and a report that says "this install does not look things
 * up" is describing a decision. They are very different claims about an
 * assessment and only one of them is true here.
 *
 * `groundedAvailable` is passed in rather than read, because whether the active
 * provider offers a grounded endpoint is the provider registry's business and
 * this module has no opinion about which provider is active.
 */
export function searchPlan(groundedAvailable: boolean): { kind: 'tavily' | 'grounded' | 'none'; why: string } {
  const engine = chosenEngine();
  const haveTavily = Boolean(tavilyKey());

  if (engine === 'none') {
    return { kind: 'none', why: 'This install is set not to look anything up. Every finding rests on the paper itself.' };
  }
  if (engine === 'tavily') {
    return haveTavily
      ? { kind: 'tavily', why: 'Sources come from Tavily.' }
      : { kind: 'none', why: 'This install is set to use Tavily and no Tavily key is configured, so nothing was looked up.' };
  }
  if (engine === 'grounded') {
    return groundedAvailable
      ? { kind: 'grounded', why: 'Sources come from the model’s own web search.' }
      : { kind: 'none', why: 'This install is set to use the model’s own web search and the configured service does not offer one, so nothing was looked up.' };
  }
  // auto
  if (haveTavily) return { kind: 'tavily', why: 'Sources come from Tavily.' };
  if (groundedAvailable) return { kind: 'grounded', why: 'Sources come from the model’s own web search.' };
  return {
    kind: 'none',
    why:
      'Nothing is configured to search the web, so nothing was looked up. ' +
      'Every finding rests on the paper itself — which is a limit on the assessment, not a fault in it.',
  };
}
