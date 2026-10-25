// Resultado de una foto (carta o etiqueta) o de un código de barras.

import { getResult } from '../store.js';
import { h } from './dom.js';
import { verdictAnswer, entryItem, entries, notice, pill, addToListButton } from './components.js';
import { verdictsForPayload, platosLeidos } from './recalc.js';
import { LEVEL_LABEL } from '../engine/levels.js';
import { setTone } from './tone.js';

// Resumen de la carta: cuántos platos hay de cada nivel, del peor al mejor.
function summary(items) {
  const order = ['no', 'cuidado', 'duda', 'si'];
  const count = Object.fromEntries(order.map((k) => [k, 0]));
  for (const v of items) if (v.level in count) count[v.level] += 1;
  const pills = order
    .filter((k) => count[k])
    .map((k) => pill(k, { small: true, text: `${count[k]} ${LEVEL_LABEL[k].toLocaleLowerCase('es-ES')}` }));
  return h('div', { class: 'summary', role: 'group', 'aria-label': 'Resumen' }, pills);
}

export function render({ main, profile, setTab }) {
  const result = getResult();

  if (!result || !Array.isArray(result.items)) {
    main.append(
      h('h1', null, 'Todavía no hay resultado'),
      h('p', { class: 'lead' }, 'Cuando fotografíes una carta o una etiqueta, o consultes un código, la respuesta aparecerá aquí.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: '#/' }, 'Ir a Inicio')),
    );
    return;
  }

  const payload = result.payload || null;
  const kind = payload?.kind || null;
  if (kind === 'carta') setTab('fuera');
  else if (kind === 'etiqueta' || kind === 'producto' || result.via === 'codigo') setTab('super');

  // Recalcula con el perfil actual si se puede.
  let items = result.items;
  try {
    const fresh = verdictsForPayload(payload, profile);
    if (fresh && fresh.length) items = fresh;
  } catch (err) {
    console.warn('No he podido recalcular el resultado; muestro el guardado.', err);
  }

  const isProduct = kind === 'producto';

  // Un producto es una sola respuesta: la palabra grande y el nombre como h1 de la propia respuesta.
  if (!isProduct) main.append(h('h1', null, result.title || 'Resultado'));

  if (kind === 'carta') {
    main.append(h('p', { class: 'meta' }, platosLeidos(items.length)));
    main.append(summary(items));
  }

  if (result.notice) main.append(notice(result.notice));

  const entryFor = (v, i) => {
    if (kind === 'producto') {
      return {
        via: 'codigo',
        title: result.title,
        level: v.level,
        phrase: v.phrase,
        foodId: v.foodId || null,
        payload: { kind: 'producto', product: payload.product },
      };
    }
    const item = payload?.items?.[i];
    const name = item?.name || v.title || 'Sin nombre';
    return {
      via: result.via || 'foto',
      title: v.title || name,
      level: v.level,
      phrase: v.phrase,
      foodId: v.foodId || null,
      payload: {
        kind: 'item',
        name,
        ingredients: Array.isArray(item?.ingredients) ? item.ingredients : v.ingredients || [],
        uncertain: !!(item ? item.uncertain : v.uncertain),
      },
    };
  };

  if (isProduct) {
    const v = items[0];
    const p = payload.product || {};
    const bits = [];
    const brand = String(p.brand || '').trim();
    if (brand && brand.toLowerCase() !== String(result.title || '').trim().toLowerCase()) bits.push(brand);
    if (p.code) bits.push(`Código ${p.code}`);
    main.append(
      verdictAnswer(v, {
        level: 1,
        title: result.title,
        eyebrow: bits.length ? bits.join(' · ') : null,
        actions: addToListButton(entryFor(v, 0), { small: true, variant: 'secondary', inline: true }),
      }),
    );
  } else if (kind === 'etiqueta' && items.length === 1) {
    const v = items[0];
    main.append(
      verdictAnswer(v, {
        level: 2,
        title: v.title,
        actions: addToListButton(entryFor(v, 0), { small: true, variant: 'secondary', inline: true }),
      }),
    );
  } else {
    main.append(
      entries(
        items.map((v, i) =>
          entryItem(v, {
            level: 2,
            title: v.title,
            listEntry: kind ? entryFor(v, i) : null,
          }),
        ),
        'Platos',
      ),
    );
  }

  // Una sola respuesta (producto o etiqueta): toda la pantalla toma el color del veredicto.
  // La carta, que son varias, se queda en crema y lleva el color en cada fila.
  const single = main.querySelector('.answer');
  if (single) setTone(single.dataset.level, { anchor: single.querySelector('.answer-word') });

  let action = null;
  if (kind === 'carta') action = ['#/fuera?camara=1', 'Hacer otra foto'];
  else if (kind === 'etiqueta') action = ['#/super?etiqueta=1', 'Fotografiar otra etiqueta'];
  else if (kind === 'producto' || result.via === 'codigo') action = ['#/super?escanear=1', 'Escanear otro código'];
  if (action) {
    main.append(h('div', { class: 'actions actions--end' }, h('a', { class: 'btn btn--primary', href: action[0] }, action[1])));
  }
}
