// Cliente de Open Food Facts (solo lectura, sin cuenta). Se consulta directamente desde el navegador;
// no pasa por nuestro servidor.

import { isValidCode, cleanCode } from './barcode.js';

export const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
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
].join(',');
const TIMEOUT_MS = 10_000;

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

// Convierte la respuesta de OFF (o su objeto `product`) en el Product del contrato. Puro.
export function normalizeProduct(json) {
  const root = json && typeof json === 'object' ? json : {};
  const p = root.product && typeof root.product === 'object' ? root.product : root;
  return {
    code: str(p.code) || str(root.code),
    name: str(p.product_name_es) || str(p.product_name) || '',
    brand: firstBrand(p.brands),
    image: safeImage(p.image_front_small_url),
    ingredientsText: str(p.ingredients_text_es) || str(p.ingredients_text) || '',
    allergens: tags(p.allergens_tags),
    traces: tags(p.traces_tags),
    categories: tags(p.categories_tags),
    labels: tags(p.labels_tags),
  };
}

function networkError(cause) {
  const err = new Error('No se ha podido consultar Open Food Facts.');
  err.code = 'network';
  if (cause) err.cause = cause;
  return err;
}

export async function fetchProduct(code, { timeoutMs = TIMEOUT_MS } = {}) {
  const clean = cleanCode(code);
  if (!isValidCode(clean)) return { found: false };
  const url = `${OFF_PRODUCT_URL}${clean}.json?fields=${OFF_FIELDS}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
      throw networkError(err); // sin red, CORS o tiempo agotado
    }
    // OFF responde 404 (con JSON status: 0) cuando el producto no existe: no es un error de red.
    if (res.status === 404) return { found: false };
    if (!res.ok) throw networkError();
    let json;
    try {
      json = await res.json();
    } catch (err) {
      throw networkError(err);
    }
    if (!json || Number(json.status) !== 1 || !json.product || typeof json.product !== 'object') {
      return { found: false };
    }
    const product = normalizeProduct(json);
    if (!product.code) product.code = clean;
    return { found: true, product };
  } finally {
    clearTimeout(timer);
  }
}
