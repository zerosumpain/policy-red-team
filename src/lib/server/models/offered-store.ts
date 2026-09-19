import { deleteSetting, readSetting, writeSetting } from '$lib/server/settings-store';
import { registerOfferedModels, type CostTier, type OfferedModel } from './catalogue';

/**
 * THE MENU, AS THE ADMIN PANEL LEFT IT.
 *
 * `catalogue.ts` holds the menu in a module variable because `isOfferedModel` is
 * called synchronously from `ingest.ts`, a file this fork keeps byte-identical to
 * upstream. This is the half that talks to the database: read it, hand it over,
 * and let the synchronous side stay synchronous.
 *
 * WHOLE RECORDS, NOT IDS. Storing `['deepseek/deepseek-v4-flash', ...]` would
 * mean the submit form could not print a name without asking OpenRouter first —
 * a network call, on a page load, to render a dropdown, for a list that changes
 * about once a month. The name, the note and the tier are decided once when the
 * reader ticks the box and travel with the choice.
 *
 * A ROW THAT WILL NOT PARSE IS DROPPED, not thrown on. The same posture the
 * settings store takes with a value it cannot decrypt: a corrupt menu should
 * degrade to the built-in five, not take the service down on boot.
 */
export const OFFERED_MODELS = 'models.offered';

const TIERS: CostTier[] = ['economy', 'balanced', 'frontier'];

function parse(raw: string | null): OfferedModel[] | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;

  const models: OfferedModel[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id) continue;
    const tier = typeof row.tier === 'string' && TIERS.includes(row.tier as CostTier)
      ? (row.tier as CostTier)
      : 'balanced';
    models.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
      note: typeof row.note === 'string' ? row.note : '',
      tier,
    });
  }
  return models.length ? models : null;
}

/** Read the stored menu and install it. Called wherever the menu is about to be served. */
export async function loadOfferedModels(): Promise<OfferedModel[] | null> {
  const models = await readSetting(OFFERED_MODELS).then(parse).catch(() => null);
  registerOfferedModels(models);
  return models;
}

/** Save a chosen menu, or clear it back to the built-in one with an empty list. */
export async function saveOfferedModels(models: OfferedModel[]): Promise<void> {
  if (!models.length) await deleteSetting(OFFERED_MODELS);
  else await writeSetting(OFFERED_MODELS, JSON.stringify(models));
  registerOfferedModels(models);
}
