// Resultado de una foto (carta o etiqueta) o de un código de barras.

import { getResult } from '../store.js';
import { h, icon } from './dom.js';
import { verdictCard, notice } from './components.js';
import { verdictsForPayload, platosLeidos } from './recalc.js';

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

  main.append(h('h1', null, result.title || 'Resultado'));

  if (kind === 'producto' && payload.product) {
    const p = payload.product;
    const bits = [];
    const brand = String(p.brand || '').trim();
    if (brand && brand.toLowerCase() !== String(result.title || '').trim().toLowerCase()) bits.push(brand);
    if (p.code) bits.push(`Código ${p.code}`);
    if (bits.length) main.append(h('p', { class: 'meta' }, bits.join(' · ')));
  } else if (kind === 'carta') {
    main.append(h('p', { class: 'meta' }, platosLeidos(items.length)));
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

  const list = h('div', { class: 'result-list', role: 'region', 'aria-label': 'Fichas' });
  items.forEach((v, i) => {
    list.append(
      verdictCard(v, {
        level: 2,
        title: kind === 'producto' ? result.title : v.title,
        // Un producto ya tiene su nombre en el h1: la ficha no lo repite a la vista.
        hideName: kind === 'producto',
        hero: kind === 'producto',
        listEntry: kind ? entryFor(v, i) : null,
      }),
    );
  });
  main.append(list);

  let action = null;
  if (kind === 'carta') action = ['#/fuera?camara=1', 'camera', 'Hacer otra foto'];
  else if (kind === 'etiqueta') action = ['#/super?etiqueta=1', 'label', 'Fotografiar otra etiqueta'];
  else if (kind === 'producto' || result.via === 'codigo') action = ['#/super?escanear=1', 'barcode', 'Escanear otro código'];
  if (action) {
    main.append(
      h('div', { class: 'actions mt-xl' }, h('a', { class: 'btn btn--primary', href: action[0] }, icon(action[1], 22), action[2])),
    );
  }
}
