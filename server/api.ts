/**
 * The API the client talks to.
 *
 * Upstream this is a dozen SvelteKit route files under `src/routes/api/policy-analysis`.
 * The shapes are kept — `GET /api/policy-analysis/:id` still returns what
 * `detail()` returns — so the client is written against the same contract and a
 * future divergence is a deliberate one rather than a drift.
 *
 * WHAT IS NOT HERE IS THE POINT: no session, no allow-list, no owner check per
 * request. Upstream needs all three because the policy tool lives inside a public
 * site. This build binds to loopback and belongs to whoever is sitting at the
 * machine — see `server/index.ts`, which refuses to listen anywhere else without
 * being told twice.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, readJson, readMultipart, sendJson } from './http';
import { getOwnerEmails } from '$lib/server/access';
import { offeredModels } from '$lib/server/models/catalogue';
import { readSubmission, readMaterial } from '$lib/policy-analysis/server/ingest';
import {
  addMaterial, control, detail, listAnalyses, ownedAnalysis, purge, restate,
} from '$lib/policy-analysis/server/store';
import { census } from '$lib/policy-analysis/server/census';
import { buildReceipt } from '$lib/policy-analysis/receipt';
import { createShare, listShares, revokeShare } from '$lib/policy-analysis/server/shares';
import { keyDir } from '$lib/policy-analysis/server/seal';
import { PolicyError } from '$lib/policy-analysis/validation';
import { STAGES } from '$lib/policy-analysis/contracts';
import { analysisStatus } from '$lib/worker';

const owner = () => getOwnerEmails()[0];

/**
 * A `PolicyError` is the pipeline telling the reader something they can act on —
 * the file is not a PDF, the paper is too long, three assessments are already
 * running. Those are 400s with the message shown as written. Anything else is a
 * fault of ours and says so without leaking its innards.
 */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof PolicyError) return new HttpError(400, err.message);
  return new HttpError(500, 'Something went wrong handling that. The server log has the detail.');
}

/** A FormData-alike, because `readSubmission` takes a Request and we have a form. */
function asRequest(fields: Record<string, string>, file?: { filename: string; mimeType: string; bytes: Buffer }): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) {
    form.set('document', new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.filename);
  }
  return new Request('http://localhost/api/policy-analysis', { method: 'POST', body: form });
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  onStarted: (analysisId: string) => void
): Promise<boolean> {
  const segments = url.pathname.replace(/^\/api\/policy-analysis\/?/, '').split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  // GET /api/policy-analysis — the history list, plus what the submit form needs
  // to render. One request rather than two, because the landing page needs both
  // and a second round trip buys nothing.
  if (!segments.length && method === 'GET') {
    sendJson(res, 200, {
      analyses: await listAnalyses(owner()),
      models: offeredModels(),
      stages: STAGES,
    });
    return true;
  }

  // POST /api/policy-analysis — submit a paper
  if (!segments.length && method === 'POST') {
    const form = await readMultipart(req);
    const submission = await readSubmission(asRequest(form.fields, form.file));
    const { createAnalysis } = await import('$lib/policy-analysis/server/store');
    const analysis = await createAnalysis(owner(), submission);
    onStarted(analysis.id);
    sendJson(res, 201, { id: analysis.id });
    return true;
  }

  // The persona library. Before the /:id routes, or "personas" is read as an id.
  if (segments[0] === 'personas') {
    const { listPersonas, personaDetail, removePersona } = await import('$lib/policy-analysis/server/personas');
    if (segments.length === 1 && method === 'GET') {
      sendJson(res, 200, { personas: await listPersonas(owner()) });
      return true;
    }
    if (segments.length === 2 && method === 'GET') {
      const dossier = await personaDetail(owner(), segments[1]);
      if (!dossier) throw new HttpError(404, 'No such persona.');
      sendJson(res, 200, dossier);
      return true;
    }
    if (segments.length === 2 && method === 'DELETE') {
      if (!(await removePersona(owner(), segments[1]))) throw new HttpError(404, 'No such persona.');
      sendJson(res, 200, { removed: true });
      return true;
    }
    return false;
  }

  const id = segments[0];
  if (!id) return false;

  // GET /api/policy-analysis/:id — everything the report page draws
  if (segments.length === 1 && method === 'GET') {
    const result = await detail(owner(), id);
    if (!result) throw new HttpError(404, 'No such assessment.');
    // `detail()` already carries the artefacts, unsealed. Loading them again
    // was a second query whose only effect was to overwrite its own field.
    sendJson(res, 200, result);
    return true;
  }

  // DELETE /api/policy-analysis/:id — purge, and hand back the receipt
  if (segments.length === 1 && method === 'DELETE') {
    const result = await purge(owner(), id);
    if (!result) throw new HttpError(404, 'No such assessment.');
    sendJson(res, 200, {
      receipt: buildReceipt({
        analysisId: result.id,
        sealed: result.sealed,
        keyDestroyed: result.keyDestroyed,
        probes: await census(id),
        keyLocation: keyDir(),
      }),
    });
    return true;
  }

  if (segments.length === 2 && method === 'POST') {
    const action = segments[1];
    if (!(await ownedAnalysis(owner(), id))) throw new HttpError(404, 'No such assessment.');

    if (action === 'cancel' || action === 'resume') {
      await control(owner(), id, action);
      if (action === 'resume') onStarted(id);
      sendJson(res, 200, { status: await analysisStatus(id) });
      return true;
    }
    if (action === 'restate') {
      await restate(owner(), id);
      onStarted(id);
      sendJson(res, 200, { status: await analysisStatus(id) });
      return true;
    }
    if (action === 'material') {
      const form = await readMultipart(req);
      await addMaterial(owner(), id, await readMaterial(asRequest(form.fields, form.file)));
      onStarted(id);
      sendJson(res, 200, { status: await analysisStatus(id) });
      return true;
    }
    if (action === 'shares') {
      const body = await readJson(req);
      const created = await createShare(owner(), id, { label: typeof body.label === 'string' ? body.label : null });
      sendJson(res, 201, created);
      return true;
    }
    return false;
  }

  if (segments.length === 2 && segments[1] === 'shares' && method === 'GET') {
    const shares = await listShares(owner(), id);
    if (!shares) throw new HttpError(404, 'No such assessment.');
    sendJson(res, 200, { shares });
    return true;
  }

  if (segments.length === 3 && segments[1] === 'shares' && method === 'DELETE') {
    await revokeShare(owner(), id, segments[2]);
    sendJson(res, 200, { revoked: true });
    return true;
  }

  return false;
}
