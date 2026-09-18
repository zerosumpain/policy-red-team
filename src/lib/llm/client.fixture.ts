/**
 * A model gateway with no model behind it.
 *
 * The fixture builds replace `server/provider` with deterministic output, which
 * covers the pipeline — but not everything that reaches a model goes through the
 * pipeline. `server/personas.ts` calls `getLLMClient` directly to research a
 * dossier, and the build check caught it: `dist/server-fixture.js` still had
 * `openrouter.ai` in it, because one import had been redirected and the other
 * had not.
 *
 * Redirecting the client itself closes every path at once rather than chasing
 * importers, which is the point: the guarantee is "this bundle cannot reach a
 * provider", and it should not depend on anyone remembering to add a file here.
 */
import type { ModelContext } from '$lib/server/models/types';

export function clearLLMClientCache(): void {}

export async function getLLMClient(ctx: ModelContext): Promise<never> {
  throw new Error(
    `This build cannot reach a model (asked for ${ctx.modelId}). It was compiled with the ` +
      `fixture provider for testing; run the real build to make model calls.`
  );
}
