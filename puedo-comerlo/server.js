// Servidor local de desarrollo de «¿Puedo comerlo?». Sin dependencias: solo node:http.
//
//   node server.js            → http://localhost:5173
//   PORT=8080 node server.js  → otro puerto
//   HOST=0.0.0.0 node server.js → accesible desde la red local (por defecto solo 127.0.0.1)
//
// Sirve SOLO los archivos públicos de la app (index.html, styles.css, manifest.webmanifest, icon.svg, iconos
// y lo que hay bajo src/ y fonts/) y las funciones POST /api/leer y POST /api/producto. Nada de node_modules, tests, docs, api, .git ni
// package.json. No registra peticiones ni cuerpos.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import leerHandler from './api/leer.js';
import productoHandler from './api/producto.js';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));

const ROOT_FILES = new Set(['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg']);
const ROOT_ICON = /^(?:icon|apple-touch-icon|favicon)[a-z0-9-]*\.(?:png|svg|ico)$/;
const STATIC_DIRS = new Set(['src', 'fonts']);

export const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
});

export const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
});

// Traduce la ruta de la URL a un archivo permitido dentro de `root`, o null si no se debe servir.
export function resolveStatic(pathname, root = ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\')) return null;
  const rel = decoded === '/' ? 'index.html' : decoded.slice(1);
  const segments = rel.split('/');
  // Sin segmentos vacíos (//, barra final), sin «.» ni «..» y sin archivos ocultos.
  if (segments.some((s) => s === '' || s.startsWith('.'))) return null;
  if (segments.length === 1) {
    if (!ROOT_FILES.has(segments[0]) && !ROOT_ICON.test(segments[0])) return null;
  } else if (!STATIC_DIRS.has(segments[0])) {
    return null;
  }
  if (!MIME[path.extname(rel).toLowerCase()]) return null;
  const abs = path.resolve(root, ...segments);
  if (!abs.startsWith(path.resolve(root) + path.sep)) return null;
  return abs;
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

async function serveStatic(req, res, pathname, root) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Método no permitido', { Allow: 'GET, HEAD' });
    return;
  }
  const file = resolveStatic(pathname, root);
  if (!file) {
    sendText(res, 404, 'No encontrado');
    return;
  }
  let real;
  let info;
  try {
    const realRoot = await realpath(root);
    real = await realpath(file);
    // Protección extra contra enlaces simbólicos que salgan de la raíz.
    if (!real.startsWith(realRoot + path.sep)) throw new Error('fuera');
    info = await stat(real);
    if (!info.isFile()) throw new Error('no es archivo');
  } catch {
    sendText(res, 404, 'No encontrado');
    return;
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[path.extname(real).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    // Las fuentes no cambian (su nombre lleva la versión): caché larga. Lo demás, siempre revalidado.
    'Cache-Control': path.extname(real).toLowerCase() === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(real);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

export function createServer({ root = ROOT, leer = leerHandler, producto = productoHandler } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      // Las cabeceras comunes también para /api/leer y /api/producto (el handler añade no-store y JSON).
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
      if (pathname === '/api/leer') {
        await leer(req, res);
        return;
      }
      if (pathname === '/api/producto') {
        await producto(req, res);
        return;
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        sendText(res, 404, 'No encontrado');
        return;
      }
      await serveStatic(req, res, pathname, root);
    } catch {
      if (!res.headersSent) sendText(res, 500, 'Error interno');
      else res.destroy();
    }
  });
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMain()) {
  const port = Number(process.env.PORT) || 5173;
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => {
    const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
    const vision = process.env.ANTHROPIC_API_KEY ? 'con lectura por visión' : 'sin ANTHROPIC_API_KEY: la foto se lee con OCR local';
    console.log(`¿Puedo comerlo? en http://${shown}:${port} (${vision})`);
  });
  const close = () => server.close(() => process.exit(0));
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
