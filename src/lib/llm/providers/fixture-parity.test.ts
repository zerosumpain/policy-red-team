import { describe, expect, it } from 'vitest';
import * as real from './index';
import * as fixture from './index.fixture';

/**
 * THE TWO REGISTRIES HAVE TO STAY THE SAME SHAPE, and nothing was checking.
 *
 * `build.mjs` swaps `./index` for `./index.fixture` in the fixture bundles, so
 * every gate that is not the real build — the browser walk, the offline pack
 * check, the fixture CLI — exercises the stub registry and never the real one.
 * A provider added to one and not the other is therefore invisible: the panel
 * offers it in production and does not exist in any test that runs.
 *
 * `AGENTS.md` says "a new provider needs a stub in `index.fixture.ts` too" and
 * that instruction has been load-bearing prose. This is the assertion.
 *
 * WHAT IT DELIBERATELY DOES NOT COMPARE: hints, blurbs and labels. The fixture's
 * copy is shorter on purpose — `build.mjs` asserts no provider endpoint survives
 * in the bundle, and the real Codex hint contains `http://127.0.0.1:5207/v1`.
 * Requiring identical prose would make the guarantee prose-sensitive, which is
 * the trap the fixture registry's own docstring warns about.
 */
describe('the fixture registry', () => {
  const env = process.env.POLICY_PROVIDERS;
  const all = (mod: typeof real | typeof fixture) => {
    delete process.env.POLICY_PROVIDERS;
    try {
      return mod.providers();
    } finally {
      if (env !== undefined) process.env.POLICY_PROVIDERS = env;
    }
  };

  it('offers exactly the providers the real one does, in the same order', () => {
    expect(all(fixture).map((p) => p.id)).toEqual(all(real).map((p) => p.id));
  });

  it('gives each provider the same fields, with the same flags, kinds and conditions', () => {
    const shape = (mod: typeof real | typeof fixture) =>
      Object.fromEntries(
        all(mod).map((p) => [
          p.id,
          p.fields.map((f) => ({
            name: f.name,
            secret: Boolean(f.secret),
            optional: Boolean(f.optional),
            // Not prose — the hints and labels differ on purpose, because the
            // real Azure placeholder carries a hostname `build.mjs` forbids in
            // the fixture bundle. Everything that changes BEHAVIOUR is here.
            kind: f.kind ?? 'text',
            options: f.options?.map((o) => o.value) ?? null,
            showWhen: f.showWhen ? `${f.showWhen.field}=${[...f.showWhen.is].sort().join('|')}` : null,
          })),
        ]),
      );
    // A field the fixture does not carry is a field the walk cannot fill in; a
    // `secret` flag that disagrees is the difference between a value that
    // round-trips and one the panel refuses to show; and a `showWhen` that
    // disagrees is a form the walk can complete and a reader cannot, or the
    // reverse.
    expect(shape(fixture)).toEqual(shape(real));
  });

  it('declares egress for every provider, so the allow-list can be printed from one place', () => {
    for (const definition of [...all(real), ...all(fixture)]) {
      expect(definition.egress.length, `${definition.id} declares no egress`).toBeGreaterThan(0);
    }
  });

  it('declares that it cannot reach anything, where the real one declares that it can', () => {
    // The flag `modelAccessProblem()` reads to decide whether a missing
    // credential should stop an assessment being created. Getting these the
    // wrong way round either breaks `npm run assess:fixture` or lets a real
    // build start a run it cannot finish.
    expect(real.REACHES_REAL_PROVIDERS).toBe(true);
    expect(fixture.REACHES_REAL_PROVIDERS).toBe(false);
  });

  it('refuses to build a client, for every provider', () => {
    for (const definition of all(fixture)) {
      expect(() => definition.client({})).toThrow(/cannot be reached from this build/);
    }
  });
});
