/**
 * The Codex catalogue, deliberately empty.
 *
 * Codex models are served by a bridge sidecar running against a ChatGPT
 * subscription on the site's server. A standalone install has no such sidecar,
 * and `docs/plan.md` settled on one OpenRouter key as the only way this build
 * reaches a model.
 *
 * The module is kept — rather than the imports being edited out of the pipeline —
 * because `server/provider.ts` and the commission path are otherwise VERBATIM
 * copies, and the whole value of the hard fork is that a fix ported from upstream
 * applies without touching a line. An empty catalogue means the model picker
 * offers nothing from Codex, which is the truth here.
 *
 * Reversible: if a standalone user ever runs their own bridge, this file gets its
 * list back and `isCodexEnabled` starts probing.
 */
export interface CodexModel {
  slug: string;
  name: string;
  description: string;
  proOnly?: boolean;
  superseded?: boolean;
}

export const CODEX_MODELS: CodexModel[] = [];

/** Kept so persisted state that names it still parses. Nothing can serve it. */
export const DEFAULT_CODEX_MODEL_SLUG = 'gpt-6-astra';

/** `gpt-6-astra` → `codex/gpt-6-astra`, so a Codex pick can never be mistaken
 *  for an OpenRouter one in a stored commission. */
export function toCodexModelId(slug: string): string {
  return slug.startsWith('codex/') ? slug : `codex/${slug}`;
}

export function toCodexSlug(modelId: string): string {
  return modelId.startsWith('codex/') ? modelId.slice('codex/'.length) : modelId;
}

export function isCodexModelId(modelId: string): boolean {
  return modelId.startsWith('codex/');
}
