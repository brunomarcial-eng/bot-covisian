// Escaneo guiado: lo que la pantalla de un producto añade bajo la frase.
//   · aviso de datos de internet (con enlace a la fuente)
//   · «Me faltan los ingredientes» y el botón para fotografiarlos
//   · «Lo que he mirado en la etiqueta»: una fila por tema, con lo hallado primero
// Los textos son los de Laura (docs/DECISIONES.md, «Claves del embarazo»). El motor decide qué aparece
// (checkLabel); aquí solo se cuenta. Sobre el color del veredicto, todo en crema (contraste AA).

import { checkLabel } from '../engine/index.js';
import { CLAVE_BY_ID } from '../engine/claves.js';
import { h, icon, announce } from './dom.js';

// Lo que se pide mirar cuando no hay nada reconocido (la regla 7 del motor).
export const DEFAULT_TOPICS = ['huevo-crudo', 'listeria', 'toxoplasmosis', 'alcohol', 'pescado-crudo'];

// «Voy a mirar si lleva: …» (palabras de Laura para cada tema).
const WORD = {
  'huevo-crudo': 'huevo',
  listeria: 'leche o queso sin pasteurizar',
  toxoplasmosis: 'embutido curado o carne cruda',
  mercurio: 'pescado con mercurio',
  'pescado-crudo': 'pescado crudo o ahumado',
  alcohol: 'alcohol',
  cafeina: 'cafeína',
  hierbas: 'hierbas o infusiones',
};

// Lo que se dice cuando el tema no aparece.
const ABSENT = {
  'huevo-crudo': 'No aparece huevo.',
  listeria: 'No aparecen lácteos sin pasteurizar, fiambres ni ahumados.',
  toxoplasmosis: 'No aparece embutido curado ni carne cruda.',
  mercurio: 'No aparece pescado con mercurio.',
  'pescado-crudo': 'No aparece pescado crudo ni ahumado.',
  alcohol: 'No aparece alcohol.',
  cafeina: 'No aparece cafeína.',
  hierbas: 'No aparecen hierbas desaconsejadas.',
};
const PLURAL = new Set(['hierbas']);

export function listWords(ids) {
  const words = [...new Set(ids.map((id) => WORD[id]).filter(Boolean))];
  if (words.length <= 1) return words[0] || '';
  return `${words.slice(0, -1).join(', ')} o ${words[words.length - 1]}`;
}

export const LABEL_BUTTON = 'Fotografiar los ingredientes';
export const LABEL_HELP = 'Acerca la etiqueta, con buena luz, hasta que se lean las letras.';
export const LABEL_HREF = '#/super?ingredientes=1';

// «Datos encontrados en internet (Fuente). Compruébalos con la etiqueta.»
export function webNotice(web) {
  if (!web) return null;
  const name = (web.name || '').trim();
  const url = (web.url || '').trim();
  const source = name
    ? url
      ? h('a', { class: 'ext-link', href: url, target: '_blank', rel: 'noopener noreferrer' }, name, h('span', { class: 'visually-hidden' }, ' (se abre en otra pestaña)'), icon('external', 15, 1.6))
      : name
    : null;
  return h(
    'p',
    { class: 'web-notice' },
    'Datos encontrados en internet',
    source ? [' (', source, ')'] : null,
    '. Compruébalos con la etiqueta.',
  );
}

// «Me faltan los ingredientes» + botón. kind: 'sin' (el producto no trae ingredientes) | 'web' (vienen de internet).
export function needLabelBlock({ missing = [], kind = 'sin', noProduct = false }) {
  const list = listWords(missing);
  const title = kind === 'web' ? 'Compruébalo con la etiqueta' : 'Me faltan los ingredientes';
  const opening =
    kind === 'web'
      ? 'Los ingredientes que he encontrado vienen de internet y no están confirmados.'
      : noProduct
        ? 'No tengo este producto.'
        : 'He encontrado el producto por su nombre, pero no trae la lista de ingredientes.';
  return h(
    'section',
    { class: 'need-label', 'aria-labelledby': 'need-label-t' },
    h('h2', { class: 'need-label-title', id: 'need-label-t' }, title),
    kind === 'web' ? null : h('p', null, opening),
    list ? h('p', null, `Voy a mirar si lleva: ${list}.`) : null,
    h('p', null, 'Con la foto de la etiqueta te lo digo mejor.'),
    h('a', { class: 'btn btn--primary', href: LABEL_HREF }, icon('camera', 20, 1.6), LABEL_BUTTON),
    h('p', { class: 'need-label-help' }, LABEL_HELP),
  );
}

function pasteurizado(ev) {
  return /\b(leche|nata|mantequilla|mozzarella|burrata|ricotta|yema|clara|crema|cuajada|feta)\b/i.test(ev) ? 'pasteurizada' : 'pasteurizado';
}

function join(list) {
  return list.slice(0, 2).join(', ');
}

// Una fila por tema. Devuelve { kind: 'found' | 'ok' | 'doubt' | 'absent', text }.
export function rowFor(r, level = null) {
  const ev = Array.isArray(r.evidence) ? r.evidence.filter(Boolean) : [];
  const verbo = PLURAL.has(r.topic) ? 'Aparecen' : 'Aparece';
  if (r.status === 'aparece') {
    if (r.matiz === 'pasteurizado' && ev.length) {
      const first = ev[0];
      return { kind: 'ok', text: /pasteuri/i.test(first) ? `Aparece ${first}: bien.` : `Aparece ${first}, ${pasteurizado(first)}: bien.` };
    }
    if (r.matiz === 'duda') return { kind: 'doubt', text: `${verbo}: ${join(ev)}. Con esto no lo puedo descartar.` };
    if (r.matiz === 'poca') return { kind: 'found', text: `${verbo}: ${join(ev)}, en poca cantidad.` };
    // Veredicto «Sí» (producto cocinado): lo que aparece no es un problema; que el aviso no choque con el verde.
    if (level === 'si') return { kind: 'ok', soft: true, text: `${verbo}: ${join(ev)}. Va cocinado en el producto, así que no es un problema.` };
    return { kind: 'found', text: `${verbo}: ${join(ev)}.` };
  }
  if (r.matiz === 'pasteurizado' && ev.length) {
    const first = ev[0];
    return { kind: 'ok', text: /pasteuri/i.test(first) ? `Aparece ${first}: bien.` : `Aparece ${first}, ${pasteurizado(first)}: bien.` };
  }
  return { kind: 'absent', text: ABSENT[r.topic] || 'No aparece.' };
}

// «Lo que he mirado en la etiqueta». `heading` cambia si los ingredientes no vienen de una foto.
export function labelChecks({ ingredientsText, topics, profile, level = null, heading = 'Lo que he mirado en la etiqueta' }) {
  const ids = [...new Set(topics)].filter((id) => CLAVE_BY_ID[id]);
  if (!ids.length || !String(ingredientsText || '').trim()) return null;
  let results = [];
  try {
    results = checkLabel(ingredientsText, ids, profile);
  } catch (err) {
    console.warn('No he podido comprobar la etiqueta:', err);
    return null;
  }
  if (!results.length) return null;
  const rows = results.map((r) => ({ r, ...rowFor(r, level) }));
  const rank = { found: 0, doubt: 1, ok: 2, absent: 3 };
  rows.sort((a, b) => rank[a.kind] - rank[b.kind]);

  const items = rows.map(({ r, kind, text, soft }) =>
    h(
      'li',
      { class: `check-row check-row--${kind}`, dataset: { topic: r.topic, status: r.status } },
      h('span', { class: 'check-mark', 'aria-hidden': 'true' }, icon(kind === 'found' || kind === 'doubt' ? 'alert' : 'check', 20, 1.7)),
      h(
        'span',
        { class: 'check-text' },
        h('span', null, text),
        kind === 'found' || kind === 'doubt' || soft
          ? h(
              'a',
              { class: 'check-link', href: `#/claves/${encodeURIComponent(r.topic)}`, 'aria-label': `Por qué importa: ${CLAVE_BY_ID[r.topic].titulo}` },
              'Por qué importa',
            )
          : null,
      ),
    ),
  );
  const found = rows.filter((x) => x.kind === 'found' || x.kind === 'doubt').length;
  const summary = found
    ? `He comprobado la etiqueta. ${found === 1 ? 'Hay 1 cosa a mirar.' : `Hay ${found} cosas a mirar.`}`
    : 'He comprobado la etiqueta. No aparece nada de lo que buscaba.';
  setTimeout(() => announce(summary), 400);

  return h(
    'section',
    { class: 'label-check', 'aria-labelledby': 'label-check-t', 'aria-live': 'polite' },
    h('h2', { class: 'label-check-title', id: 'label-check-t' }, heading),
    h('ul', { class: 'check-list' }, items),
  );
}
