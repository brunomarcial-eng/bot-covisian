// Recalcular el semáforo con el perfil actual a partir de lo guardado (foodId o payload).
// La interfaz nunca decide el nivel: siempre pregunta al motor.

import { classifyText, classifyProduct, verdictForFood, FOOD_BY_ID, worstLevel } from '../engine/index.js';
import { setResult } from '../store.js';

export const NOTICE_CARTA_OCR = 'He leído la carta de forma aproximada. Revisa los nombres.';
export const NOTICE_ETIQUETA_OCR = 'He leído la etiqueta de forma aproximada. Revisa los ingredientes.';

export function classifyItem(item, profile) {
  return classifyText(
    String(item?.name || ''),
    { ingredients: Array.isArray(item?.ingredients) ? item.ingredients : [], uncertain: !!item?.uncertain },
    profile,
  );
}

export function verdictsForPayload(payload, profile) {
  if (!payload || typeof payload !== 'object') return null;
  switch (payload.kind) {
    case 'texto':
      return payload.text ? [classifyText(String(payload.text), {}, profile)] : null;
    case 'item':
      return payload.name ? [classifyItem(payload, profile)] : null;
    case 'carta':
    case 'etiqueta':
      return Array.isArray(payload.items) && payload.items.length
        ? payload.items.map((it) => classifyItem(it, profile))
        : null;
    case 'producto':
      return payload.product ? [classifyProduct(payload.product, profile)] : null;
    default:
      return null;
  }
}

export function worstOf(verdicts) {
  return verdicts.reduce((acc, v) => worstLevel(acc, v.level), null) || 'duda';
}

export function platosLeidos(n) {
  return n === 1 ? '1 plato leído.' : `${n} platos leídos.`;
}

// Para una entrada de historial o de lista: { level, phrase, foodId, verdict, verdicts }.
// Si algo falla, devuelve lo que se guardó.
export function refreshEntry(entry, profile) {
  try {
    if (entry.payload) {
      const vs = verdictsForPayload(entry.payload, profile);
      if (vs && vs.length) {
        if (entry.payload.kind === 'carta' || vs.length > 1) {
          return { level: worstOf(vs), phrase: platosLeidos(vs.length), foodId: null, verdict: null, verdicts: vs };
        }
        const v = vs[0];
        return { level: v.level, phrase: v.phrase, foodId: v.foodId || null, verdict: v, verdicts: vs };
      }
    } else if (entry.foodId && FOOD_BY_ID[entry.foodId]) {
      const v = verdictForFood(entry.foodId, profile);
      return { level: v.level, phrase: v.phrase, foodId: entry.foodId, verdict: v, verdicts: [v] };
    }
  } catch (err) {
    console.warn('No he podido recalcular una entrada guardada.', err);
  }
  return { level: entry.level || 'duda', phrase: entry.phrase || '', foodId: entry.foodId || null, verdict: null, verdicts: null };
}

// Adónde lleva una entrada guardada. { href, reopen } o null.
export function entryTarget(entry) {
  const kind = entry.payload?.kind;
  if (kind === 'carta' || kind === 'etiqueta' || kind === 'producto') return { href: '#/resultado', reopen: true };
  if (kind === 'texto' && entry.payload.text) {
    return { href: `#/buscar?q=${encodeURIComponent(entry.payload.text)}`, reopen: false };
  }
  if (entry.foodId && FOOD_BY_ID[entry.foodId]) {
    return { href: `#/ficha/${encodeURIComponent(entry.foodId)}`, reopen: false };
  }
  return null;
}

// Vuelve a publicar el resultado de una entrada (foto o código) recalculado con el perfil actual.
export function reopenResult(entry, profile) {
  const payload = entry.payload;
  let items = null;
  try {
    items = verdictsForPayload(payload, profile);
  } catch (err) {
    console.warn('No he podido recalcular el resultado.', err);
  }
  let notice = null;
  if ((payload?.kind === 'carta' || payload?.kind === 'etiqueta') && payload.items?.length
      && payload.items.every((it) => it.uncertain)) {
    notice = payload.kind === 'carta' ? NOTICE_CARTA_OCR : NOTICE_ETIQUETA_OCR;
  }
  setResult({
    title: entry.title,
    via: entry.via,
    items: items || [],
    notice,
    payload,
  });
}
