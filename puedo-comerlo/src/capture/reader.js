// Lector de fotos de cartas y etiquetas.
//
//   comprime → POST /api/leer (visión, solo transcripción) → si falla, OCR local (tesseract, español)
//
// Devuelve { readable, items: [{ name, ingredients, uncertain }], via: 'vision' | 'ocr' | 'none' }.
// Nunca inventa: si no se lee nada, { readable: false, items: [], via: 'none' }. Nunca lanza por «ilegible».
// Si la visión responde que no se lee, se respeta (via: 'vision') y no se intenta el OCR.

import { compressImage } from './image.js';
import { ocrImage } from './ocr.js';

export const ENDPOINT = '/api/leer';
const VISION_TIMEOUT_MS = 30_000;
const MAX_ITEMS = { carta: 12, etiqueta: 1 };
const MAX_NAME = 120;
const MAX_INGREDIENTS = 40;
const MAX_INGREDIENT = 80;

export const STATUS = Object.freeze({
  preparing: 'Preparando la foto…',
  carta: 'Leyendo la carta…',
  etiqueta: 'Leyendo la etiqueta…',
  offline: 'Leyendo sin conexión, puede tardar un poco…',
});

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('').trim() : text;
}

// Comprueba y recorta la respuesta de /api/leer. Devuelve null si la forma no es la esperada
// (en ese caso se intenta el OCR local). Puro (testeable en Node).
export function normalizeReading(data, mode = 'carta') {
  if (!data || typeof data !== 'object' || typeof data.readable !== 'boolean' || !Array.isArray(data.items)) {
    return null;
  }
  if (!data.readable) return { readable: false, items: [] };
  const max = MAX_ITEMS[mode] ?? MAX_ITEMS.carta;
  const items = [];
  for (const item of data.items) {
    if (items.length >= max) break;
    if (!item || typeof item !== 'object') continue;
    const name = cleanText(item.name, MAX_NAME);
    if (!name) continue;
    const ingredients = (Array.isArray(item.ingredients) ? item.ingredients : [])
      .map((x) => cleanText(x, MAX_INGREDIENT))
      .filter(Boolean)
      .slice(0, MAX_INGREDIENTS);
    items.push({ name, ingredients, uncertain: item.uncertain === true });
  }
  return items.length ? { readable: true, items } : { readable: false, items: [] };
}

async function askVision(image, mode, signal) {
  if (typeof fetch !== 'function') return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VISION_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: image.base64, mediaType: image.mediaType, mode }),
      signal: ctrl.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return null; // 503 sin_vision, 5xx, 4xx… → OCR local
    return normalizeReading(await res.json(), mode);
  } catch {
    return null; // red, tiempo agotado o JSON raro → OCR local
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

export async function readImage(blobOrFile, mode, { onStatus, signal } = {}) {
  const m = mode === 'etiqueta' ? 'etiqueta' : 'carta';
  const none = { readable: false, items: [], via: 'none' };
  const status = (text) => {
    try {
      onStatus?.(text);
    } catch {
      /* la interfaz no debe romper la lectura */
    }
  };

  status(STATUS.preparing);
  let image;
  try {
    image = await compressImage(blobOrFile);
  } catch {
    return none; // no se puede abrir la imagen: no hay nada que leer
  }
  if (signal?.aborted) return none;

  status(STATUS[m]);
  const vision = await askVision(image, m, signal);
  if (vision) return { ...vision, via: 'vision' };
  if (signal?.aborted) return none;

  status(STATUS.offline);
  // Para el OCR conviene algo más de resolución que para la visión; si no se puede, se usa la misma foto.
  let ocrBlob = image.blob;
  try {
    ocrBlob = (await compressImage(blobOrFile, { maxSide: 1600, quality: 0.85 })).blob;
  } catch {
    /* se queda la de 1280 */
  }
  const items = (await ocrImage(ocrBlob, m, { onStatus: status })).slice(0, MAX_ITEMS[m]);
  if (signal?.aborted) return none;
  return items.length ? { readable: true, items, via: 'ocr' } : none;
}
