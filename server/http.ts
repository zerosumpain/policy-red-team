/**
 * The small amount of HTTP plumbing a `node:http` server needs and does not have.
 *
 * Deliberately small. Upstream gets `json()`, `error()` and typed params from
 * SvelteKit; this build has one file of helpers instead of a framework, which is
 * the trade the brief asked for.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import busboy from 'busboy';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
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
