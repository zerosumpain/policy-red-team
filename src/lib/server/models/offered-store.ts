import { deleteSetting, readSetting, writeSetting } from '$lib/server/settings-store';
import { offeredModels, providerPinnedModel, registerOfferedModels, registerProviderModels, registerProviderPinnedModel, tierForCost, type CostTier, type OfferedModel } from './catalogue';
import { resolveProvider } from '$lib/llm/client';
import { registerCallTimeout } from './call-deadline';
import type { ProviderConfig, ProviderDefinition } from '$lib/llm/providers/types';
import { setTokenCeiling } from '$lib/server/budget';

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

/**
 * MAKE THE MENU CURRENT — both halves of it.
 *
 * `isOfferedModel` consults two module variables: the panel's chosen menu, and
 * the ids the ACTIVE PROVIDER serves. Only the first was being refreshed outside
 * the admin panel, so a restart left the second empty until somebody happened to
 * open /admin — and until they did, a submission naming a Codex model was read
 * as unknown and degraded to the default.
 *
 * That degradation is quiet and it is expensive. The call still reaches the
 * bridge, because `getLLMClient` asks the provider what to call rather than
 * trusting the commission — but `policy_analyses.model` records null, so
 * `coerceModelContext` reads the run as OpenRouter and `callTimeoutMs` gives it
 * 180 seconds instead of Codex's 420. The one provider that needs seven minutes
 * gets three, and every long call is reported as the model being too slow.
 *
 * So: anything that is about to offer or accept a model calls this first.
 */
/** Where the operator records the most one run may spend, in tokens. */
export const RUN_TOKEN_CEILING = 'run.tokenCeiling';

/**
 * THE ID A PINNED PROVIDER'S MODEL IS RECOGNISED BY, which is the mechanism.
 *
 * `definition.model(config)` is the slug the endpoint is SENT — bare, because
 * the endpoint has never heard of a `codex/` prefix. `coerceModelContext`
 * recovers the provider from that prefix and from nothing else, so recording the
 * pin under the bare slug reads straight back as OpenRouter and hands the one
 * provider that needs seven minutes a three-minute deadline. The menu carries
 * the prefixed id; match the two on the name they share.
 *
 * Null where the provider names no model of its own — OpenRouter, ordinarily,
 * whose menu is a choice the reader makes rather than a pin. There the
 * commissioned id really is what gets called and needs no correcting.
 */
export function pinnedModel(definition: ProviderDefinition, config: ProviderConfig): OfferedModel | null {
  const own = definition.model(config).trim();
  if (!own) return null;
  const listed = definition.models(config).find((m) => m.name === own);
  return {
    id: listed?.id ?? own,
    name: listed?.name ?? own,
    note: listed?.note ?? 'The model this service is configured to call.',
    // A subscription bridge quotes no price, which `tierForCost` reads as
    // `balanced` — not free, just not metered here.
    tier: tierForCost(null),
  };
}

/**
 * THE MENU A SUBMISSION CAN ACTUALLY HONOUR, which is what the submit page draws.
 *
 * `offeredModels()` is the panel's chosen menu, and it is the right menu for a
 * deployment whose provider takes the run's own choice. Where the provider pins
 * a model it is a lie: every id on it would be accepted, recorded, and then
 * quietly not called. One model, named honestly, is the whole of the fix.
 *
 * The panel's own menu editor still shows the chosen menu — that is what it is
 * for, and a pin can be removed.
 */
export function commissionableModels(): OfferedModel[] {
  const pinned = providerPinnedModel();
  return pinned ? [pinned] : offeredModels();
}

export async function refreshModelMenu(): Promise<void> {
  await loadOfferedModels().catch(() => {});
  // Loaded with the menu because they are read at the same moments — boot, the
  // landing page, and immediately before a submission is accepted. A ceiling
  // that is only read at boot is a ceiling nobody can change without a restart.
  setTokenCeiling(Number(await readSetting(RUN_TOKEN_CEILING).catch(() => null)) || 0);
  try {
    const active = await resolveProvider();
    registerProviderModels(active.definition.models(active.config).map((m) => m.id));
    registerProviderPinnedModel(pinnedModel(active.definition, active.config));
    // AND THE DEADLINE ITS CALLS ARE JUDGED AGAINST. Registered here because
    // this runs at exactly the three moments the active provider can change —
    // boot, a configuration save, and a provider switch — which is the same
    // reason the model menu is refreshed here. A stale deadline is the quiet
    // half of the same bug: the panel says Azure and the run is timed as
    // whatever was active last. See $lib/server/models/call-deadline.
    registerCallTimeout(active.definition.callTimeoutMs);
  } catch {
    // A provider that cannot be resolved offers nothing, which is already the
    // state of the set. Never fail a submission over this.
  }
}
