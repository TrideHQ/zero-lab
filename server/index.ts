// Dependency-free production server: serves the built app from dist/ and the
// lab-partner API. Run with `node server/index.ts` (PORT, HOST, LLM_* env vars).
import { createServer, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { handlePartner } from './api/partner-core.ts';
import { llmConfigured } from './api/llm.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const DEMO = join(ROOT, 'demo');
const PORT = Number(process.env.PORT ?? 8011);
const HOST = process.env.HOST ?? '127.0.0.1';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

// small in-memory rate limit for the API: 40 requests / minute / address
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  return ++h.n > 40;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendFile(res: ServerResponse, file: string, range: string | undefined, cache: string) {
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': cache });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': cache, 'x-content-type-options': 'nosniff' });
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = decodeURIComponent(url.pathname);
    if (path === '/healthz') return json(res, 200, { ok: true, llm: llmConfigured(process.env) });

    if (path === '/api/partner') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
      if (limited(ip)) {
        console.log(JSON.stringify({ t: new Date().toISOString(), api: 'partner', status: 429, outcome: 'rate_limited' }));
        return json(res, 429, { error: 'rate_limited' });
      }
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 20_000) return json(res, 413, { error: 'too_large' });
      }
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch { /* handled as bad request */ }
      const out = await handlePartner(body, process.env);
      // one line per call: status, latency and reason codes only (no readings, no text, no address)
      console.log(JSON.stringify({ t: new Date().toISOString(), api: 'partner', status: out.status, ...out.log }));
      return json(res, out.status, out.body);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });

    const fromDemo = path.startsWith('/demo/');
    const base = fromDemo ? DEMO : DIST;
    const rel = normalize(fromDemo ? path.slice(6) : path).replace(/^(\.\.[/\\])+/, '');
    let file = join(base, rel);
    if (!file.startsWith(base)) return json(res, 403, { error: 'forbidden' });
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      // unknown paths without an extension get the app shell (hash routing does the rest)
      if (fromDemo || extname(path)) return json(res, 404, { error: 'not_found' });
      file = join(DIST, 'index.html');
    }
    const hashed = /\/assets\/.+-[\w-]{8,}\.\w+$/.test(file);
    sendFile(res, file, req.headers.range, hashed ? 'public, max-age=31536000, immutable' : fromDemo ? 'public, max-age=3600' : 'no-cache');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'server_error' });
  }
}).listen(PORT, HOST, () => console.log(`0⁰ Lab on http://${HOST}:${PORT}  (lab partner: ${llmConfigured(process.env) ? 'AI' : 'rules only'})`));
