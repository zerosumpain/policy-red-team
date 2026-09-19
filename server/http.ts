/**
 * The small amount of HTTP plumbing a `node:http` server needs and does not have.
 *
 * Deliberately small. Upstream gets `json()`, `error()` and typed params from
 * SvelteKit; this build has one file of helpers instead of a framework, which is
 * the trade the brief asked for.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import zlib from 'node:zlib';
import busboy from 'busboy';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Below this, compressing costs more than it saves. Most responses here are a
 * few hundred bytes; the one that matters is an assessment.
 */
const COMPRESS_FLOOR = 8 * 1024;

/**
 * WHAT THE CALLER WILL TAKE. `res.req` is Node's own back-reference, which is
 * why none of the twenty-nine call sites had to learn about this.
 */
function encodingFor(req: IncomingMessage | undefined): 'br' | 'gzip' | null {
  const accepts = String(req?.headers['accept-encoding'] ?? '');
  if (/\bbr\b/.test(accepts)) return 'br';
  if (/\bgzip\b/.test(accepts)) return 'gzip';
  return null;
}

/**
 * THE ORIGIN COMPRESSES NOW, AND IT DID NOT BEFORE.
 *
 * Cloudflare compresses edge-to-browser, which made this easy to miss: a reader
 * on the public hostname was already getting ~865 KB on the wire. But that is
 * added AT THE EDGE, so every one of those requests dragged the full 4,489,881
 * bytes out of the origin first, and `cf-cache-status: DYNAMIC` means nothing
 * revalidates it away. Anything reaching the service directly — the loopback the
 * CLI and the export path use, or a browser pointed at the box — got no
 * compression at all.
 *
 * Measured on that payload: gzip level 1 is 1,055,355 bytes in 33ms, brotli
 * quality 4 is 727,859 in 72ms. Both are cheap beside `JSON.stringify` of the
 * same object, which is 26ms and was always there.
 *
 * ASYNCHRONOUS ON PURPOSE. The worker shares this process and its lease check
 * runs every two seconds; a synchronous 33ms compression of every large response
 * would sit in front of it. `sendJson` returns void either way, so nothing
 * needed to change to wait for it.
 */
export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  const how = payload.length >= COMPRESS_FLOOR ? encodingFor(res.req) : null;

  const raw = () => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': payload.length,
      ...headers,
    });
    res.end(payload);
  };

  if (!how) { raw(); return; }

  const done = (err: Error | null, packed: Buffer) => {
    // A compressor that failed is not a reason to fail the request.
    if (err || res.headersSent) { if (!res.headersSent) raw(); return; }
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': packed.length,
      'content-encoding': how,
      // Anything caching this must key on the encoding, or a gzip body is served
      // to a client that asked for none.
      vary: 'accept-encoding',
      ...headers,
    });
    res.end(packed);
  };

  if (how === 'br') {
    zlib.brotliCompress(payload, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }, done);
  } else {
    zlib.gzip(payload, { level: 1 }, done);
  }
}

/** An error the client can show a reader, rather than a stack trace. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new HttpError(413, 'That request body is too large.');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'That request body is not JSON.');
  }
}

export interface Multipart {
  fields: Record<string, string>;
  /** `field` is the name the form used, which decides where it goes back. */
  file?: { field: string; filename: string; mimeType: string; bytes: Buffer };
}

/**
 * Read one multipart form.
 *
 * The size limit is enforced by busboy rather than checked afterwards, because
 * "afterwards" means the whole of a 2 GB upload has already been read into this
 * process. `validateBytes` in the copied ingest code checks it again on the
 * bytes it is handed; both are worth having, and they are guarding different
 * things.
 */
export function readMultipart(req: IncomingMessage): Promise<Multipart> {
  return new Promise((resolve, reject) => {
    const parser = busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 20 } });
    const result: Multipart = { fields: {} };
    let truncated = false;

    parser.on('field', (name, value) => {
      result.fields[name] = value;
    });

    // THE FIELD NAME IS KEPT. It was discarded, and `asRequest` then put every
    // upload back under the name the SUBMISSION form uses — so the material
    // form, whose field is `material`, arrived at `readMaterial` with no file
    // at all and was told to attach one. Nothing had ever driven that route.
    parser.on('file', (name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => {
        if (!chunks.length) return;
        result.file = { field: name, filename: info.filename, mimeType: info.mimeType, bytes: Buffer.concat(chunks) };
      });
    });

    parser.on('close', () => {
      if (truncated) reject(new HttpError(413, 'Supply a document of at most 10 MB.'));
      else resolve(result);
    });
    parser.on('error', (err: Error) => reject(new HttpError(400, err.message)));
    req.pipe(parser);
  });
}
