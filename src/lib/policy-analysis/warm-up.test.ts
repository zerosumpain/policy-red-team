import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATTERNS, PERSONA_STAGE, type Artefact } from './contracts';
import { PolicyError } from './validation';
import { ingest } from './server/ingest';
import { executeStage, WARM_FIRST_STAGES } from './pipeline';
import type { ModelCall } from './server/provider';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

/**
 * THE WARM-UP: one call out first, the other lanes released when it lands.
 *
 * Every test here drives stage 7 — ten interaction patterns, all sharing one
 * context, in `WARM_FIRST_STAGES` — with a model whose calls are held open by
 * the test, so the scheduling is observed directly rather than inferred from
 * timings. Nothing waits on a clock except the safety timer that turns a hang
 * into a failure with a reason.
 */
const fixture = readFileSync('tests/fixtures/policy-analysis/policy.txt');
const neverResearch = async () => ({ artefacts: [], warnings: ['Synthetic test: external research unavailable.'] });

/** The inventory stage 7 is given, built by the fixture model through stages 1 to 6. */
async function inventoryFor(stage: number): Promise<Artefact[]> {
  const all = (await ingest(fixture, 'policy.txt', 'text/plain')).artefacts;
  for (let s = 1; s < stage; s++) {
    const result = await executeStage(
      { stage: s, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model: async (...a) => fixtureModel(...a), research: neverResearch, signal: new AbortController().signal, concurrency: 1 },
    );
    all.push(...result.artefacts);
  }
  return all;
}

/** A model whose every call waits until the test lets it go, and which records who was out when. */
function heldModel(fail?: (key: string) => PolicyError | null) {
  const out = new Set<string>();
  const started: { key: string; alongside: number }[] = [];
  const gates = new Map<string, () => void>();
  const opened = new Map<string, Promise<void>>();
  const gateFor = (key: string) => {
    if (!opened.has(key)) opened.set(key, new Promise<void>((resolve) => gates.set(key, resolve)));
    return opened.get(key)!;
  };
  const model: ModelCall = async (stage, key, input) => {
    started.push({ key, alongside: out.size });
    out.add(key);
    await gateFor(key);
    out.delete(key);
    const err = fail?.(key);
    if (err) throw err;
    return fixtureModel(stage, key, input);
  };
  return {
    model, started, out,
    release: (key: string) => { gateFor(key); gates.get(key)!(); },
    releaseAll: () => { for (const key of PATTERNS) { gateFor(key); gates.get(key)!(); } },
  };
}

/** Let every pending microtask and timer-free continuation run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('the warm-up — one call first, then the lanes', () => {
  it('is on for the shared-prefix fan-outs and off for the per-unit ones', () => {
    for (const stage of [3, 6, 7, 9, 10, 14, 16]) expect(WARM_FIRST_STAGES.has(stage)).toBe(true);
    // A passage, a body's profile and a library write share nothing worth caching.
    for (const stage of [1, 2, 4, PERSONA_STAGE]) expect(WARM_FIRST_STAGES.has(stage)).toBe(false);
  });

  it('sends nothing beside the first call until it lands, then fills every lane', async () => {
    const all = await inventoryFor(7);
    const held = heldModel();
    const safety = setTimeout(() => held.releaseAll(), 3_000);
    const running = executeStage(
      { stage: 7, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model: held.model, research: neverResearch, signal: new AbortController().signal, concurrency: 3 },
    );
    await settle();
    // ONE call out, and it is the first unit.
    expect(held.started.map((s) => s.key)).toEqual([PATTERNS[0]]);
    held.release(PATTERNS[0]);
    await settle();
    // Every lane filled at once — the two that waited and the one the warm-up
    // call freed — and no more than that.
    expect(held.started.map((s) => s.key)).toEqual(PATTERNS.slice(0, 4));
    expect(held.out.size).toBe(3);
    held.releaseAll();
    const wide = await running;
    clearTimeout(safety);
    // Nobody went out beside the warm-up call; after it, never more than three at once.
    expect(held.started[0].alongside).toBe(0);
    expect(Math.max(...held.started.map((s) => s.alongside))).toBeLessThanOrEqual(2);
    expect(held.started[1].alongside).toBe(0);
    // And it is the same stage a serial run produces: ids, artefacts and warnings.
    const serial = await executeStage(
      { stage: 7, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model: async (...a) => fixtureModel(...a), research: neverResearch, signal: new AbortController().signal, concurrency: 1 },
    );
    expect(wide.artefacts).toEqual(serial.artefacts);
    expect(wide.warnings).toEqual(serial.warnings);
  });

  it('asks every call exactly what it would have asked without the warm-up', async () => {
    const all = await inventoryFor(7);
    const payloads = async (concurrency: 1 | 6) => {
      const seen: string[] = [];
      await executeStage(
        { stage: 7, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
        { model: async (stage, key, input) => { seen.push(`${key}:${JSON.stringify(input)}`); return fixtureModel(stage, key, input); }, research: neverResearch, signal: new AbortController().signal, concurrency },
      );
      return seen.sort();
    };
    expect(await payloads(6)).toEqual(await payloads(1));
  });

  it('releases the lanes when the first call FAILS, and the failure is a gap like any other', async () => {
    const all = await inventoryFor(7);
    const held = heldModel((key) => key === PATTERNS[0] ? new PolicyError('contract', 'Synthetic refusal.') : null);
    const safety = setTimeout(() => held.releaseAll(), 3_000);
    const running = executeStage(
      { stage: 7, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model: held.model, research: neverResearch, signal: new AbortController().signal, concurrency: 3 },
    );
    await settle();
    expect(held.started).toHaveLength(1);
    held.release(PATTERNS[0]);
    await settle();
    expect(held.started.map((s) => s.key)).toEqual(PATTERNS.slice(0, 4));
    held.releaseAll();
    const result = await running;
    clearTimeout(safety);
    expect(result.warnings.some((w) => w.includes('could not be assessed: Synthetic refusal.'))).toBe(true);
    expect(held.started).toHaveLength(PATTERNS.length);
  });

  it('keeps the brake: a dead provider still stops the stage, and the waiting lanes are not left hanging', async () => {
    const all = await inventoryFor(7);
    const calls: string[] = [];
    const dead: ModelCall = async (_stage, key) => {
      calls.push(key);
      await new Promise((resolve) => setTimeout(resolve, 1));
      throw new PolicyError('contract', `Synthetic failure for ${key}.`);
    };
    await expect(executeStage(
      { stage: 7, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model: dead, research: neverResearch, signal: new AbortController().signal, concurrency: 3 },
    )).rejects.toThrow(/consecutive parts of this stage failed/);
    // Three in a row ends it: the warm-up, then at most one lane-width past the fold.
    expect(calls[0]).toBe(PATTERNS[0]);
    expect(calls.length).toBeLessThan(PATTERNS.length);
  });

  it('a run cancelled during the warm-up call sends nothing else', async () => {
    const all = await inventoryFor(7);
    const controller = new AbortController();
    const calls: string[] = [];
    const model: ModelCall = async (_stage, key, _input, options) => {
      calls.push(key);
      await new Promise<void>((_, reject) => {
        const signal = options?.signal ?? controller.signal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      throw new Error('unreachable');
    };
    const running = executeStage(
      { stage: 7, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts: all },
      { model, research: neverResearch, signal: controller.signal, concurrency: 6 },
    );
    await settle();
    controller.abort(new Error('Synthetic cancel.'));
    await expect(running).rejects.toThrow();
    expect(calls).toEqual([PATTERNS[0]]);
  });
});
