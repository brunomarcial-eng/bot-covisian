// Cliente de Open Food Facts (solo lectura, sin cuenta). Se consulta directamente desde el navegador;
// no pasa por nuestro servidor.
//
// fetchProduct(code) → { found: true, product, source: 'off', incomplete } | { found: false }
//   incomplete = true cuando el producto existe pero NO trae lista de ingredientes (es lo más habitual en
//   marcas blancas y la causa de muchos «No estoy segura»); entonces conviene buscar en otra fuente.
//   Error de red (tras un reintento) → lanza Error con .code = 'network'. Cancelado con `signal` → AbortError.

import { isValidCode, cleanCode } from './barcode.js';

export const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
// Idiomas de respaldo para la lista de ingredientes, en este orden, si no hay en español ni genérica.
export const OFF_FALLBACK_LANGS = Object.freeze(['en', 'fr', 'it', 'pt', 'ca', 'de']);
export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_es',
  'brands',
  'image_front_small_url',
  'ingredients_text_es',
  'ingredients_text',
  'allergens_tags',
  'traces_tags',
  'categories_tags',
  'labels_tags',
  'quantity',
  'lang',
  ...OFF_FALLBACK_LANGS.map((l) => `ingredients_text_${l}`),
  'ingredients',
].join(',');
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 400;
const MAX_INGREDIENTS_TEXT = 3000;

function str(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function tags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t) => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function firstBrand(brands) {
  const list = Array.isArray(brands) ? brands : str(brands).split(',');
  return list.map(str).find(Boolean) ?? '';
}

function safeImage(url) {
  const s = str(url);
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
}

function cap(text) {
  const chars = Array.from(text);
  return chars.length > MAX_INGREDIENTS_TEXT ? chars.slice(0, MAX_INGREDIENTS_TEXT).join('').trim() : text;
}

// Lista de ingredientes con su idioma. Orden: ingredients_text_es, ingredients_text, ingredients_text_<idioma>
// (en/fr/it/pt/ca/de) y, si no hay texto, la lista estructurada `ingredients` (array de { text }).
// lang: 'es' | 'en' | … | '' (se desconoce o es la lista estructurada).
function pickIngredients(p) {
  const es = str(p.ingredients_text_es);
  if (es) return { text: cap(es), lang: 'es' };
  const generic = str(p.ingredients_text);
  if (generic) return { text: cap(generic), lang: str(p.lang).toLowerCase() };
  for (const l of OFF_FALLBACK_LANGS) {
    const t = str(p[`ingredients_text_${l}`]);
    if (t) return { text: cap(t), lang: l };
  }
  if (Array.isArray(p.ingredients)) {
    const parts = p.ingredients
      .map((i) => (i && typeof i === 'object' ? str(i.text) : ''))
      .filter(Boolean);
    if (parts.length) return { text: cap(parts.join(', ')), lang: str(p.lang).toLowerCase() };
  }
  return { text: '', lang: '' };
}

// Convierte la respuesta de OFF (o su objeto `product`) en el Product del contrato. Puro.
// Además del contrato: `quantity` si viene, e `ingredientsLang` solo cuando la lista NO está en español
// (el motor reconoce palabras en español; una lista en otro idioma hay que tomarla con cautela).
export function normalizeProduct(json) {
  const root = json && typeof json === 'object' ? json : {};
  const p = root.product && typeof root.product === 'object' ? root.product : root;
  const ingredients = pickIngredients(p);
  const product = {
    code: str(p.code) || str(root.code),
    name: str(p.product_name_es) || str(p.product_name) || '',
    brand: firstBrand(p.brands),
    image: safeImage(p.image_front_small_url),
    ingredientsText: ingredients.text,
    allergens: tags(p.allergens_tags),
    traces: tags(p.traces_tags),
    categories: tags(p.categories_tags),
    labels: tags(p.labels_tags),
  };
  const quantity = str(p.quantity);
  if (quantity) product.quantity = quantity;
  if (ingredients.text && ingredients.lang && ingredients.lang !== 'es') product.ingredientsLang = ingredients.lang;
  return product;
}

function networkError(cause) {
  const err = new Error('No se ha podido consultar Open Food Facts.');
  err.code = 'network';
  if (cause) err.cause = cause;
  return err;
}

function abortError() {
  const err = new Error('Cancelado.');
  err.name = 'AbortError';
  return err;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Un intento. Devuelve { retry: true } si merece la pena reintentar (fallo de red o 5xx), o el resultado.
async function attempt(url, { timeoutMs, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let res;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (err) {
      if (signal?.aborted) throw abortError();
      return { retry: true, error: networkError(err) }; // sin red, CORS o tiempo agotado
    }
    // OFF responde 404 (con JSON status: 0) cuando el producto no existe: no es un error de red.
    if (res.status === 404) return { json: null };
    if (res.status >= 500) return { retry: true, error: networkError() };
    if (!res.ok) throw networkError();
    let json;
    try {
      json = await res.json();
    } catch (err) {
      if (signal?.aborted) throw abortError();
      throw networkError(err);
    }
    return { json };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchProduct(code, { timeoutMs = TIMEOUT_MS, retryDelayMs = RETRY_DELAY_MS, signal } = {}) {
  const clean = cleanCode(code);
  if (!isValidCode(clean)) return { found: false };
  if (signal?.aborted) throw abortError();
  const url = `${OFF_PRODUCT_URL}${clean}.json?fields=${OFF_FIELDS}`;

  let out = await attempt(url, { timeoutMs, signal });
  if (out.retry) {
    // Un único reintento ante fallo de red o 5xx.
    if (retryDelayMs > 0) await sleep(retryDelayMs);
    if (signal?.aborted) throw abortError();
    out = await attempt(url, { timeoutMs, signal });
    if (out.retry) throw out.error;
  }

  const json = out.json;
  if (!json || Number(json.status) !== 1 || !json.product || typeof json.product !== 'object') {
    return { found: false };
  }
  const product = normalizeProduct(json);
  if (!product.code) product.code = clean;
  return { found: true, product, source: 'off', incomplete: !product.ingredientsText };
}
