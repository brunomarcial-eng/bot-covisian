// Router por hash: #/ruta/segmento?clave=valor

export function parseHash(hash = window.location.hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const qIndex = raw.indexOf('?');
  const pathPart = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? '' : raw.slice(qIndex + 1);
  const path = pathPart.replace(/^\/+|\/+$/g, '');
  let segs = [];
  try {
    segs = path ? path.split('/').map((s) => decodeURIComponent(s)) : [];
  } catch {
    segs = path ? path.split('/') : [];
  }
  return { path, segs, params: new URLSearchParams(query) };
}

export function buildHash(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  const s = qs.toString();
  return `#/${path}${s ? `?${s}` : ''}`;
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) {
    const url = new URL(window.location.href);
    url.hash = hash;
    window.location.replace(url.toString());
    return;
  }
  window.location.hash = hash;
}

// Cambia la URL sin provocar un nuevo pintado (para Buscar mientras se escribe).
export function replaceQuietly(hash) {
  const url = new URL(window.location.href);
  url.hash = hash;
  window.history.replaceState(window.history.state, '', url.toString());
}
