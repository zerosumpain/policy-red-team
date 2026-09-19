/**
 * Talking to the server.
 *
 * Thin on purpose. The shapes come from the copied store — `detail()` returns
 * what `detail()` returns — so the types here describe that rather than
 * redefining it, and a change upstream shows up as a type error instead of an
 * empty panel.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';

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
  passes: unknown[];
  personas: { actorId: string | null; personaId: string; name: string; sightings: number }[];
  heartbeat: string | null;
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
  act: (id: string, action: 'cancel' | 'resume' | 'restate') =>
    request<{ status: string }>(`/api/policy-analysis/${id}/${action}`, { method: 'POST' }),
  purge: (id: string) => request<{ receipt: unknown }>(`/api/policy-analysis/${id}`, { method: 'DELETE' }),
  personas: () => request<{ personas: { id: string; name: string; sightings: number; kind: string | null }[] }>('/api/policy-analysis/personas'),
  persona: (id: string) => request<Record<string, unknown>>(`/api/policy-analysis/personas/${id}`),
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
