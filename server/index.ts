/**
 * The server.
 *
 * One process: the HTTP listener, the static client, and the worker that runs
 * assessments. Upstream splits those into a web container and a worker container
 * because several web replicas share one queue; here there is one of everything,
 * and a second process would be two things to start.
 *
 * IT BINDS TO LOOPBACK, AND THAT IS THE SECURITY MODEL. There is no session, no
 * password and no owner check per request, because the tool belongs to whoever is
 * at the machine. That is a reasonable design for something local and a terrible
 * one for something on a network, so binding anywhere else needs
 * `POLICY_HOST` set deliberately — and it says out loud what that means.
 */
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/lib/polyfills';
import { handleApi, toHttpError } from './api';
import { serveStatic } from './static';
import { sendJson } from './http';
import { client } from '$lib/db';
import { migrate } from '../scripts/migrate.mjs';
import { drain, runWorker } from '$lib/worker';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLIENT = path.join(ROOT, 'dist', 'client');

const PORT = Number(process.env.POLICY_PORT ?? 5290);
const HOST = process.env.POLICY_HOST ?? '127.0.0.1';

/**
 * Who is watching which assessment, for the progress stream.
 *
 * Server-sent events rather than polling: a run emits a handful of updates over
 * several minutes, and a browser that asks every second for twenty minutes to
 * catch eighteen of them is doing the wrong shape of work.
 */
const watchers = new Map<string, Set<(event: string, data: unknown) => void>>();

function publish(analysisId: string, event: string, data: unknown): void {
  for (const send of watchers.get(analysisId) ?? []) send(event, data);
}

/** Assessments this process is already running, so a resume cannot start a second. */
const running = new Set<string>();

function startRun(analysisId: string): void {
  if (running.has(analysisId)) return;
  running.add(analysisId);
  void drain(analysisId, {
    onStage: ({ completed, status }) => publish(analysisId, 'stage', { completed, status }),
  })
    .then((status) => publish(analysisId, 'done', { status }))
    .catch((err: unknown) => publish(analysisId, 'error', { message: err instanceof Error ? err.message : String(err) }))
    .finally(() => running.delete(analysisId));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (url.pathname === '/health') {
      sendJson(res, 200, { ok: true, running: [...running] });
      return;
    }

    // The progress stream. Held open, so it is handled before anything that
    // would try to end the response.
    if (url.pathname.startsWith('/api/policy-analysis/') && url.pathname.endsWith('/events')) {
      const id = url.pathname.split('/').at(-2)!;
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        // Without this, any proxy between here and the browser may buffer the
        // whole stream and deliver it when the run finishes — which is exactly
        // when nobody needs it any more.
        'x-accel-buffering': 'no',
      });
      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const set = watchers.get(id) ?? new Set();
      set.add(send);
      watchers.set(id, set);
      send('open', { id });
      // A keep-alive comment every twenty seconds: a stream that says nothing for
      // minutes at a time is one that intermediaries close.
      const beat = setInterval(() => res.write(': beat\n\n'), 20_000);
      req.on('close', () => {
        clearInterval(beat);
        set.delete(send);
        if (!set.size) watchers.delete(id);
      });
      return;
    }

    if (url.pathname.startsWith('/api/policy-analysis')) {
      const handled = await handleApi(req, res, url, startRun);
      if (!handled) sendJson(res, 404, { message: 'No such endpoint.' });
      return;
    }

    if (await serveStatic(CLIENT, url.pathname, res)) return;
    sendJson(res, 404, { message: 'Not found.' });
  } catch (err) {
    const httpError = toHttpError(err);
    if (httpError.status >= 500) console.error(err);
    if (!res.headersSent) sendJson(res, httpError.status, { message: httpError.message });
    else res.end();
  }
});

await migrate(client, { log: () => {} });

// The long-running loop picks up anything left running by a previous process —
// a stage whose lease lapsed when the server was stopped mid-run.
const worker = runWorker((message) => console.log(`worker: ${message}`));
worker.start();

server.listen(PORT, HOST, () => {
  console.log(`Policy Red Team on http://${HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn(
      `\n  WARNING: bound to ${HOST}, not loopback.\n` +
        `  This service has no authentication of any kind. Anyone who can reach\n` +
        `  this port can read every assessment and start new ones against your key.\n`
    );
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\nstopping; the current stage will finish first');
    void worker.stop().then(async () => {
      server.close();
      await client.close().catch(() => {});
      process.exit(0);
    });
  });
}
