import type OpenAI from 'openai';
import type { CatalogueEntry } from './types';

/**
 * `GET /v1/models`, read for a menu rather than for a machine.
 *
 * Every OpenAI-compatible service answers this, so one implementation serves
 * OpenRouter and any bridge. What they put in the answer differs wildly —
 * OpenRouter sends pricing, a context length and a paragraph of description; a
 * bridge over a subscription sends an id and little else — so everything beyond
 * the id is optional here and comes back null rather than invented.
 *
 * THE SDK'S TYPE IS THE FLOOR, NOT THE CEILING. `Model` declares four fields and
 * the extras arrive anyway, which is why this reads through a widened shape. The
 * alternative is a second HTTP client aimed at the same URL for the sake of a
 * type, and that would be a worse thing to maintain than this comment.
 */
type Wire = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
};

/** Per-token, quoted as a string, into USD per million. Null when unquoted or unparseable. */
function perMillion(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1_000_000;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function listOpenAICompatible(client: OpenAI): Promise<CatalogueEntry[]> {
  const page = await client.models.list();
  const rows: CatalogueEntry[] = [];

  for (const raw of page.data as unknown as Wire[]) {
    const id = asString(raw.id);
    if (!id) continue;
    rows.push({
      id,
      name: asString(raw.name) || id,
      description: asString(raw.description),
      contextLength: asNumber(raw.context_length),
      promptCost: perMillion(raw.pricing?.prompt),
      completionCost: perMillion(raw.pricing?.completion),
      // OpenRouter marks an alias that redirects to whatever is newest in a
      // family by prefixing the id with `~` — `~deepseek/deepseek-flash-latest`
      // is a real, callable id. Worth flagging in the panel rather than
      // stripping: a floating id means the model can change under a run, and the
      // reader choosing one should know that is what they picked.
      floating: id.startsWith('~'),
    });
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}
