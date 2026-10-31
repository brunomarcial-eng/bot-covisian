// Consulta de un código de barras con varias fuentes.
//
//   lookupProduct(code, { signal, onStatus }) →
//     { found, product?, source: 'off'|'web'|null, productSource, ingredientsSource,
//       sourceName?, sourceUrl?, confidence?, incomplete, webTried, offFailed? }
//
// 1. Open Food Facts (directo desde el navegador). Si está y trae ingredientes → fin, no se llama a la web.
// 2. Si no está, falló o no trae ingredientes → POST /api/producto (búsqueda web en nuestro servidor).
// 3. Se combinan: nombre y marca de OFF si existen; ingredientes de la web.
//
// Errores: Error con .code = 'network' solo si OFF falló por red y la web tampoco pudo responder. Si la web
// falla pero OFF respondió, se devuelve lo de OFF. Cancelado con `signal` → AbortError.
// El modelo de la web solo transcribe; el semáforo lo calcula siempre el motor local.
//
// Los ingredientes de la web con confianza «baja» NO se usan (el producto queda «incomplete» y la app puede
// pedir la foto de la etiqueta): preferimos no saber a saber mal.

import { isValidCode, cleanCode } from './barcode.js';
import { fetchProduct } from './off.js';

export const PRODUCT_URL = '/api/producto';
export const WEB_TIMEOUT_MS = 45_000;
export const STATUS_OFF = 'Buscando en Open Food Facts…';
export const STATUS_WEB = 'Buscando en internet…';
const MAX_INGREDIENTS = 3000;
const MAX_NAME = 150;

function abortError() {
  const err = new Error('Cancelado.');
  err.name = 'AbortError';
  return err;
}

function networkError(cause) {
  const err = new Error('No se ha podido consultar el producto.');
  err.code = 'network';
  if (cause) err.cause = cause;
  return err;
}

function say(onStatus, text) {
  try {
    onStatus?.(text);
  } catch {
    /* un fallo de la interfaz no debe romper la consulta */
  }
}

function text(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function httpUrl(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s || s.length > 300) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : '';
  } catch {
    return '';
  }
}

// Llama a /api/producto. Devuelve { ok: true, found, ... } o { ok: false } si no se pudo (503, 429, 5xx, red,
// tiempo agotado, reason: 'web_no_disponible'…). Si lo cancela quien llama → lanza AbortError.
async function fetchWeb(code, { signal, timeoutMs = WEB_TIMEOUT_MS, hint } = {}) {
  if (signal?.aborted) throw abortError();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let res;
    try {
      res = await fetch(PRODUCT_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(hint ? { code, ...hint } : { code }),
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      if (signal?.aborted) throw abortError();
      return { ok: false };
    }
    if (!res.ok) return { ok: false };
    let json;
    try {
      json = await res.json();
    } catch {
      if (signal?.aborted) throw abortError();
      return { ok: false };
    }
    if (!json || typeof json !== 'object') return { ok: false };
    if (json.reason === 'web_no_disponible') return { ok: false };
    if (json.found !== true) return { ok: true, found: false };
    const p = json.product && typeof json.product === 'object' ? json.product : {};
    const name = text(p.name, MAX_NAME);
    if (!name) return { ok: true, found: false };
    return {
      ok: true,
      found: true,
      name,
      brand: text(p.brand, 80),
      ingredientsText: text(p.ingredientsText, MAX_INGREDIENTS),
      sourceName: text(json.sourceName, 80),
      sourceUrl: httpUrl(json.sourceUrl),
      confidence: ['alta', 'media', 'baja'].includes(json.confidence) ? json.confidence : 'baja',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function fromWebOnly(code, web) {
  const usable = web.confidence !== 'baja' && web.ingredientsText;
  const product = {
    code,
    name: web.name,
    brand: web.brand,
    image: null,
    ingredientsText: usable ? web.ingredientsText : '',
    allergens: [],
    traces: [],
    categories: [],
    labels: [],
  };
  return {
    found: true,
    product,
    source: 'web',
    productSource: 'web',
    ingredientsSource: usable ? 'web' : null,
    sourceName: web.sourceName,
    sourceUrl: web.sourceUrl,
    confidence: web.confidence,
    incomplete: !product.ingredientsText,
    webTried: true,
  };
}

export async function lookupProduct(code, { signal, onStatus, offOptions, webTimeoutMs } = {}) {
  const clean = cleanCode(code);
  if (!isValidCode(clean)) return { found: false, product: null, source: null, incomplete: false, webTried: false };
  if (signal?.aborted) throw abortError();

  // 1. Open Food Facts
  say(onStatus, STATUS_OFF);
  let off = null;
  let offError = null;
  try {
    off = await fetchProduct(clean, { ...offOptions, signal });
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) throw abortError();
    offError = err;
  }
  if (off?.found && !off.incomplete) {
    return {
      found: true,
      product: off.product,
      source: 'off',
      productSource: 'off',
      ingredientsSource: 'off',
      incomplete: false,
      webTried: false,
    };
  }

  // 2. Búsqueda web de respaldo
  say(onStatus, STATUS_WEB);
  // Si OFF conoce el nombre, se le pasa a la búsqueda: encontrar una ficha por nombre y marca es mucho
  // más fácil que por el número suelto.
  let hint;
  if (off?.found) {
    const name = text(off.product.name, 100);
    const brand = text(off.product.brand, 60);
    if (name) hint = brand ? { name, brand } : { name };
    else if (brand) hint = { brand };
  }
  const web = await fetchWeb(clean, { signal, timeoutMs: webTimeoutMs, hint });

  // OFF falló por red y la web tampoco respondió → error de red.
  if (offError && !web.ok) throw offError.code === 'network' ? offError : networkError(offError);

  // OFF lo tiene pero sin ingredientes
  if (off?.found) {
    const usable = web.ok && web.found && web.confidence !== 'baja' && web.ingredientsText;
    if (!usable) {
      return {
        found: true,
        product: off.product,
        source: 'off',
        productSource: 'off',
        ingredientsSource: null,
        incomplete: true,
        webTried: true,
      };
    }
    const product = {
      ...off.product,
      name: off.product.name || web.name,
      brand: off.product.brand || web.brand,
      ingredientsText: web.ingredientsText,
    };
    delete product.ingredientsLang; // la lista que se usa ya no es la de OFF
    return {
      found: true,
      product,
      source: 'web',
      productSource: 'off',
      ingredientsSource: 'web',
      sourceName: web.sourceName,
      sourceUrl: web.sourceUrl,
      confidence: web.confidence,
      incomplete: false,
      webTried: true,
    };
  }

  // OFF no lo tiene (o no se pudo consultar)
  if (web.ok && web.found) {
    const r = fromWebOnly(clean, web);
    if (offError) r.offFailed = true;
    return r;
  }
  const r = { found: false, product: null, source: null, incomplete: false, webTried: true };
  if (offError) r.offFailed = true;
  return r;
}
