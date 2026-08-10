import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PLATFORM_PORT || 4174);
const clientAppUrl = process.env.OPTIMUM_CLIENT_APP_URL || 'http://localhost:4173/';
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8'
};

const server = http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '/platform') pathname = '/index.html';
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, safe.replace(/^[/\\]/,''));
    if (!file.startsWith(root)) throw new Error('Invalid path');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not found');
    let body = await readFile(file);
    if (file.endsWith('index.html')) body = Buffer.from(body.toString('utf8').replace('__OPTIMUM_CLIENT_APP_URL__', clientAppUrl));
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://wzcaquxuvqfbstpxujsj.supabase.co; img-src 'self' data: blob: https://wzcaquxuvqfbstpxujsj.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'"
    });
    res.end(body);
  } catch {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Not found');
  }
});
server.listen(port,()=>console.log(`Optimum Platform Console is running on http://localhost:${port}`));
