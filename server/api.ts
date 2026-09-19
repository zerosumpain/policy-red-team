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
import { isReadOnly, READ_ONLY_MESSAGE } from '$lib/server/read-only';
import { offeredModels } from '$lib/server/models/catalogue';
import { readSubmission, readMaterial } from '$lib/policy-analysis/server/ingest';
import {
  addMaterial, control, detail, listAnalyses, ownedAnalysis, purge, restate,
} from '$lib/policy-analysis/server/store';
import { census } from '$lib/policy-analysis/server/census';
import { buildReceipt } from '$lib/policy-analysis/receipt';
import { keyDir } from '$lib/policy-analysis/server/seal';
import { PolicyError } from '$lib/policy-analysis/validation';
import { assessmentDocument, isDownloadFormat, isExportFormat } from '$lib/policy-analysis/server/export';
import { assessmentBundle } from '$lib/policy-analysis/server/bundle';
import { ownerPayload, sharedPayload } from '$lib/policy-analysis/offline/payload';
import { shareableReport } from '$lib/policy-analysis/share';
import { STAGES } from '$lib/policy-analysis/contracts';
import { analysisStatus } from '$lib/worker';

const owner = () => getOwnerEmails()[0];

/**
 * The copied export layer returns a web `Response`; this server speaks
 * `node:http`. Rather than rewrite `assessmentDocument` and `assessmentBundle` —
 * both verbatim copies, and both carrying content-disposition headers that took
 * real care to get right — the two are bridged here, once.
 */
async function pipeResponse(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  res.writeHead(response.status, headers);
  if (!response.body) { res.end(); return; }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

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

  // One gate for every mutation, rather than a check per handler. A route added
  // later is covered without anyone remembering to cover it — which is the only
  // version of this that stays true.
  if (isReadOnly() && method !== 'GET' && method !== 'HEAD') {
    throw new HttpError(403, READ_ONLY_MESSAGE);
  }

  // GET /api/policy-analysis — the history list, plus what the submit form needs
  // to render. One request rather than two, because the landing page needs both
  // and a second round trip buys nothing.
  if (!segments.length && method === 'GET') {
    sendJson(res, 200, {
      analyses: await listAnalyses(owner()),
      models: offeredModels(),
      stages: STAGES,
      readOnly: isReadOnly(),
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
    // `readOnly` rides along so the page can decline to draw a control that
    // would only 403 — the same argument the landing page already makes. It is
    // read from the server rather than guessed, because the flag can change
    // under a running browser.
    sendJson(res, 200, { ...result, readOnly: isReadOnly() });
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
    return false;
  }

  // GET /api/policy-analysis/:id/export?format=docx|md|bundle
  //
  // A GET rather than a POST because it is a download of something that already
  // exists: it changes nothing, so the browser's own save dialog does the rest
  // and the link can be right-clicked like any other.
  if (segments.length === 2 && segments[1] === 'export' && method === 'GET') {
    const format = url.searchParams.get('format') ?? 'docx';
    if (!isDownloadFormat(format)) throw new HttpError(400, 'Ask for docx, md or bundle.');
    /*
     * `scope=shared` IS HOW A REDACTED COPY LEAVES THIS SERVICE, and it leaves
     * as a FILE.
     *
     * There was a token route here that handed a redacted copy to whoever held
     * a URL. It was removed, because on this architecture the promise it made
     * was false: every owner route is unauthenticated by design — the server
     * binds to loopback and everything it serves belongs to whoever reaches the
     * port — so a recipient who could use the link could also call
     * `GET /api/policy-analysis/:id` and read the whole paper two requests
     * later. Advertising a redaction the deployment does not enforce is worse
     * than not offering one.
     *
     * A file has no such hole. It carries exactly what `shareableReport` left
     * in it, needs no server, cannot be walked sideways, does not expire, has
     * nothing to revoke, and still works behind a Cloudflare Access policy that
     * would refuse a recipient outright. See docs/phase-10.md.
     */
    const shared = url.searchParams.get('scope') === 'shared';
    const result = await detail(owner(), id);
    if (!result) throw new HttpError(404, 'No such assessment.');

    const meta = {
      title: result.analysis.title,
      jurisdiction: result.analysis.jurisdiction,
      policyArea: result.analysis.policyArea,
      status: result.analysis.status,
      completedAt: result.analysis.completedAt,
    };

    // ONE REDACTOR, and the documents and the pack are rendered from its output
    // rather than each filtering for themselves.
    const redacted = shared ? shareableReport({ artefacts: result.artefacts, stages: result.stages }) : null;
    const artefacts = redacted ? redacted.artefacts : result.artefacts;

    const response = isExportFormat(format)
      ? await assessmentDocument(artefacts, meta, format)
      : await assessmentBundle({
          payload: redacted
            ? sharedPayload({ ...meta, artefacts, warnings: redacted.warnings, withheld: redacted.withheld })
            : ownerPayload({
                ...meta,
                sealed: result.analysis.sealed,
                documentSha256: result.documents?.[0]?.sha256 ?? null,
                artefacts,
                stages: result.stages,
              }),
          meta,
        });

    await pipeResponse(response, res);
    return true;
  }

  return false;
}
