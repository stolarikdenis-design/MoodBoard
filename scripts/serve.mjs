// Minimální statický server pro testy: servíruje složku (výchozí _site), neznámé cesty vrací 404.html se stavem 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? '_site');
const port = Number(process.argv[3] ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split(/[?#]/)[0]));
  const candidate = join(root, clean);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  for (const file of [candidate, join(candidate, 'index.html'), `${candidate}.html`]) {
    try {
      if ((await stat(file)).isFile()) return file;
    } catch { /* zkus další kandidát */ }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/');
  if (!file) {
    const body = await readFile(join(root, '404.html')).catch(() => Buffer.from('404'));
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(body);
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, '127.0.0.1', () => console.log(`serve: http://127.0.0.1:${port} -> ${root}`));
