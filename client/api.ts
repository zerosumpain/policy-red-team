/**
 * Talking to the server.
 *
 * Thin on purpose. The shapes come from the copied store — `detail()` returns
 * what `detail()` returns — so the types here describe that rather than
 * redefining it, and a change upstream shows up as a type error instead of an
 * empty panel.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { PassRow } from '$lib/policy-analysis/view';

export interface OfferedModel {
  id: string;
  name: string;
  note: string;
  tier: 'economy' | 'balanced' | 'frontier';
}

export interface AnalysisRow {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  jurisdiction: string | null;
  policyArea: string | null;
}

export interface StageRow {
  ordinal: number;
  name: string;
  status: string;
  warnings: string[];
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface Detail {
  analysis: AnalysisRow & { model: string | null; thinkingLevel: string | null; depth: string; sealed: boolean; error: string | null; context: string | null };
  stages: StageRow[];
  artefacts: Artefact[];
  /**
   * The stage and timestamp of every artefact, read off the row rather than
   * inferred from its id. `detail()` has always sent this; nothing described it
   * until the drill needed to say when a thing was produced, and an id-derived
   * stage was quietly wrong for everything the pipeline computes rather than
   * writes — see src/lib/provenance.ts.
   */
  artefactMetadata: { id: string; stage: number; updatedAt: string }[];
  /**
   * Material attached after the report was written, and restatements over it.
   *
   * Typed against the copied view layer's own row shape rather than redescribed
   * here, so `addenda()` and `addendumBanner()` take it unchanged.
   */
  passes: PassRow[];
  personas: { actorId: string | null; personaId: string; name: string; sightings: number }[];
  heartbeat: string | null;
  /** True when the server refuses every mutation, so the page can decline to draw a control that would 403. */
  readOnly: boolean;
}

/** A trait the library holds about a body, folded across every paper that said it. */
export interface PersonaTrait {
  key: string;
  label: string;
  value: string;
  origin: string;
  confidence: number | null;
}

/** A row in the library. `listPersonas` computes far more than the list used to show. */
export interface PersonaSummary {
  id: string;
  name: string;
  entityType: string;
  aliases: string[];
  summary: string | null;
  dossier: PersonaTrait[];
  sightings: number;
  researchedAt: string | null;
  updatedAt: string | null;
  lastSeen: string | null;
  worstBand: string | null;
  plays: number;
  researchNotes: number;
}

/** One assessment's or one research pass's contribution to a persona. */
export interface PersonaObservation {
  id: string;
  personaId: string;
  kind: 'assessment' | 'research';
  analysisId: string | null;
  analysisTitle: string | null;
  actorId: string | null;
  traits: PersonaTrait[];
  plays: { label: string; band: string; exposure: number; legality: string }[];
  sources: { url: string; title: string; quality: string }[];
  note: string | null;
  observedAt: string | null;
}

export interface PersonaDossier {
  persona: PersonaSummary;
  observations: PersonaObservation[];
  analyses: { id: string; title: string; status: string; completedAt: string | null; policyArea: string | null }[];
  readOnly: boolean;
}

/** One field a provider needs. A `secret` is written once and never read back. */
export interface ProviderField {
  name: string;
  label: string;
  hint: string;
  secret?: boolean;
  placeholder?: string;
  optional?: boolean;
}

export interface ProviderView {
  id: string;
  label: string;
  blurb: string;
  fields: ProviderField[];
  /** A secret arrives as `true`/`false` — set or not — and never as its value. */
  values: Record<string, string | boolean>;
  models: { id: string; name: string; note: string }[];
}

/** One row of a provider's live inventory. Costs are USD per MILLION tokens. */
export interface CatalogueEntry {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  promptCost: number | null;
  completionCost: number | null;
  /** An id that redirects to whatever is newest in its family. */
  floating: boolean;
}

export interface AdminConfig {
  active: string;
  activeProblem: string | null;
  /** Fields the environment supplies, which the panel cannot override. */
  fromEnvironment: string[];
  /** True when POLICY_PROVIDER pins the choice for this deployment. */
  pinned: boolean;
  providers: ProviderView[];
  /** What the assessment picker offers today. */
  menu: OfferedModel[];
  /** True when somebody chose that menu, rather than it being this build's default. */
  menuChosen: boolean;
  /** True when POLICY_MODELS pins it, in which case the panel cannot change it. */
  menuPinned: boolean;
  /** What a reset would restore. */
  builtIn: OfferedModel[];
  /** Whether the active provider will list what it sells. Azure will not. */
  canBrowse: boolean;
}

export interface Landing {
  analyses: AnalysisRow[];
  models: OfferedModel[];
  stages: readonly string[];
  /** True when the server refuses every mutation. See src/lib/server/read-only.ts. */
  readOnly: boolean;
}

class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError((body as { message?: string }).message ?? 'That did not work.');
  }
  return (await response.json()) as T;
}

export const api = {
  landing: () => request<Landing>('/api/policy-analysis'),
  detail: (id: string) => request<Detail>(`/api/policy-analysis/${id}`),
  submit: (form: FormData) => request<{ id: string }>('/api/policy-analysis', { method: 'POST', body: form }),
  /** Attach something read AFTER the report was written. Starts a four-stage pass; spends. */
  material: (id: string, form: FormData) =>
    request<{ status: string }>(`/api/policy-analysis/${id}/material`, { method: 'POST', body: form }),
  act: (id: string, action: 'cancel' | 'resume' | 'restate') =>
    request<{ status: string }>(`/api/policy-analysis/${id}/${action}`, { method: 'POST' }),
  purge: (id: string) => request<{ receipt: unknown }>(`/api/policy-analysis/${id}`, { method: 'DELETE' }),
  personas: () => request<{ personas: PersonaSummary[]; readOnly: boolean }>('/api/policy-analysis/personas'),
  persona: (id: string) => request<PersonaDossier>(`/api/policy-analysis/personas/${id}`),
  forgetPersona: (id: string) => request<{ removed: boolean }>(`/api/policy-analysis/personas/${id}`, { method: 'DELETE' }),
  /** Spends: two model calls plus retrieval. Refused outright in a read-only copy. */
  researchPersona: (id: string) =>
    request<{ sources: number; traits: number }>(`/api/policy-analysis/personas/${id}/research`, { method: 'POST' }),
};

/**
 * The admin panel, which is the only part of this service behind a password.
 *
 * A secret goes in and never comes back: `config()` reports whether each one is
 * set, not what it is.
 */
export const admin = {
  status: () => request<{ available: boolean; problem: string | null; signedIn: boolean }>('/api/admin/status'),
  signIn: (password: string) =>
    request<{ signedIn: boolean }>('/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  signOut: () => request<{ signedIn: boolean }>('/api/admin/session', { method: 'DELETE' }),
  config: () => request<AdminConfig>('/api/admin/config'),
  save: (provider: string, values: Record<string, string>) =>
    request<AdminConfig>(`/api/admin/config/${provider}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    }),
  use: (provider: string) =>
    request<AdminConfig>('/api/admin/active', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    }),
  /** Everything the active provider sells. A few hundred rows and a network call. */
  catalogue: () => request<{ provider: string; entries: CatalogueEntry[] }>('/api/admin/catalogue'),
  /** Set the assessment picker's menu. An empty list resets to the built-in one. */
  saveModels: (models: { id: string; name: string; note: string; cost: number | null }[]) =>
    request<AdminConfig>('/api/admin/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ models }),
    }),
  /** One token of output against the live configuration. "Saved" is not "reachable". */
  test: () => request<{ ok: boolean; provider: string; model?: string; ms: number; message?: string }>(
    '/api/admin/test',
    { method: 'POST' },
  ),
};

/**
 * Watch a run.
 *
 * Server-sent events, not polling: a run emits a handful of updates over several
 * minutes, and asking every second for twenty of them is the wrong shape of work.
 * `EventSource` reconnects on its own, which is most of why it is worth using
 * over a socket for something this one-directional.
 */
export function watchRun(id: string, handlers: { stage?: () => void; done?: () => void; error?: (message: string) => void }): () => void {
  const source = new EventSource(`/api/policy-analysis/${id}/events`);
  source.addEventListener('stage', () => handlers.stage?.());
  source.addEventListener('done', () => {
    handlers.done?.();
    source.close();
  });
  source.addEventListener('error', (event) => {
    // An EventSource error is usually a reconnect, not a failure — only our own
    // "error" event carries a message worth showing.
    const data = (event as MessageEvent).data;
    if (typeof data === 'string' && data) {
      try { handlers.error?.((JSON.parse(data) as { message: string }).message); } catch { /* reconnect */ }
    }
  });
  return () => source.close();
}
