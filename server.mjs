import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8', '.md':'text/markdown; charset=utf-8'
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const requested = url.pathname === '/' ? '/index.html' : (url.pathname === '/platform' || url.pathname === '/platform/' ? '/platform.html' : url.pathname);
    const raw = decodeURIComponent(requested);
    const safe = normalize(raw).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, safe);
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = join(root, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://wzcaquxuvqfbstpxujsj.supabase.co; img-src 'self' data: blob: https://wzcaquxuvqfbstpxujsj.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'"
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type':'text/plain; charset=utf-8' });
    res.end(`Server error: ${error.message}`);
  }
}).listen(port, () => console.log(`Optimum is running on http://localhost:${port}`));
