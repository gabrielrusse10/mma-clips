#!/usr/bin/env node
/**
 * Static file server for local viewing: `npm start`.
 *
 * The page uses fetch() for its data, which browsers block on file:// URLs,
 * so opening index.html directly does not work - this serves it over HTTP.
 */

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');

  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.join(ROOT, requested === '/' ? 'index.html' : requested);

  // Refuse anything that escapes site/ - "/../package.json" and friends.
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    return send(403, 'Forbidden');
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return send(404, 'Not found');

    const ext = path.extname(filePath);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': info.size,
      // The data file changes under the server; never let it be cached.
      'cache-control': ext === '.json' ? 'no-store' : 'no-cache',
    });

    if (req.method === 'HEAD') return res.end();
    createReadStream(filePath).pipe(res);
  } catch {
    send(404, 'Not found');
  }
});

server.listen(PORT, () => {
  console.log(`MMA Clips running at http://localhost:${PORT}`);
  console.log('Refresh the clips any time with: npm run update');
});
