/**
 * WHERE A MODEL CALL GOES, AND ON WHOSE BILL.
 *
 * `getLLMClient` used to hard-code one OpenRouter key read from the environment,
 * which is right for a tool with one user and a `.env` and wrong the moment
 * somebody wants to point it at a subscription they already pay for. This is the
 * registry that replaces it: one module per service, each owning its own fields,
 * its own client and its own account of what it costs.
 *
 * IT DOES NOT TOUCH `ModelProvider`. That union — `'openrouter' | 'codex'` — is
 * in a COPIED file and belongs to the pipeline's own `ModelContext`, which
 * records what an assessment was run on. Extending it would be a divergence on a
 * file the fork keeps byte-identical, for no gain: the pipeline never chooses a
 * service, it asks for a model and the registry decides who serves it. The two
 * vocabularies stay separate on purpose.
 *
 * REMOVING A PROVIDER IS DELETING A FILE. Each is self-contained and the registry
 * is a list; `POLICY_PROVIDERS` narrows that list without a rebuild. A build that
 * ships to other people drops `codex` — which is a local bridge against one
 * person's subscription and no use to anyone else — by naming the two that stay.
 */
import type OpenAI from 'openai';

export type ProviderId = 'openrouter' | 'codex' | 'azure';

/** One thing a reader has to supply. `secret` never comes back out of the server. */
export type ProviderField = {
  name: string;
  label: string;
  hint: string;
  /** Written once, never read back. The panel shows whether it is set, not what it is. */
  secret?: boolean;
  /** Shown in the field when nothing is stored, and used when the reader leaves it blank. */
  placeholder?: string;
  optional?: boolean;
};

/** What a reader has configured for one provider, as stored. */
export type ProviderConfig = Record<string, string>;

export type ProviderDefinition = {
  id: ProviderId;
  label: string;
  /** What this is, in the reader's terms — shown above the fields. */
  blurb: string;
  fields: ProviderField[];
  /**
   * Whether this configuration is complete enough to try.
   *
   * Returns a sentence when it is not, so the panel can say which field is
   * missing rather than failing on the first call.
   */
  problem(config: ProviderConfig): string | null;
  /** The model id calls are made with. For a deployment-based service this IS the deployment. */
  model(config: ProviderConfig): string;
  /** Built fresh per call site; the caller caches. */
  client(config: ProviderConfig): OpenAI;
  /**
   * What this provider can serve, for the model picker.
   *
   * OpenRouter has a catalogue; a bridge or a deployment has exactly what the
   * reader configured, and saying so beats offering a menu of things that will
   * 404.
   */
  models(config: ProviderConfig): { id: string; name: string; note: string }[];
};
