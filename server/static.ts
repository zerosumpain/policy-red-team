/**
 * Serving the built client.
 *
 * A single-page app: anything with a file extension is a real file, everything
 * else is `index.html` and the router sorts it out. Hashed asset names get a long
 * cache; `index.html` never does, or a deploy would be invisible until someone
 * cleared their cache.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export async function serveStatic(root: string, pathname: string, res: ServerResponse): Promise<boolean> {
  // Resolve inside the root and check it stayed there: a request for
  // `/../../etc/passwd` must not escape, and `path.join` alone does not stop it.
  const requested = path.extname(pathname) ? pathname : '/index.html';
  const file = path.resolve(root, '.' + requested);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('forbidden');
    return true;
  }

  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;

  const extension = path.extname(file);
  res.writeHead(200, {
    'content-type': TYPES[extension] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
  return true;
}
