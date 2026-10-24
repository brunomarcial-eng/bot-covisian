// Lista: lo que ha ido guardando, recalculado con el perfil actual. Y sus favoritos.

import { verdictForFood, FOOD_BY_ID } from '../engine/index.js';
import { getList, removeFromList, getFavorites } from '../store.js';
import { h, icon, announce, fill } from './dom.js';
import { verdictCard, pill, row, rows } from './components.js';
import { refreshEntry } from './recalc.js';

export function render({ main, profile }) {
  const h1 = h('h1', null, 'Lista');
  const listHost = h('div', { class: 'lista' });
  const favHost = h('div');
  main.append(h1, h('p', { class: 'lead' }, 'Lo que has guardado, con el semáforo según tus ajustes de ahora.'), listHost, favHost);

  function quitarButton(entry, index) {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn--quiet btn--small btn--inline',
        'aria-label': `Quitar ${entry.title}`,
        dataset: { index: String(index) },
      },
      icon('close', 20),
      'Quitar',
    );
    btn.addEventListener('click', () => {
      removeFromList(entry.id);
      paintList();
      announce(`${entry.title}: quitado de la lista.`);
      const buttons = listHost.querySelectorAll('button[aria-label^="Quitar"]');
      const next = buttons[Math.min(index, buttons.length - 1)];
      if (next) next.focus();
      else h1.focus();
    });
    return btn;
  }

  function paintList() {
    const list = getList();
    if (!list.length) {
      fill(listHost, 
        h('div', { class: 'empty' }, h('p', null, 'Todavía no hay nada. Cuando mires un plato o un producto, puedes dejarlo aquí.')),
      );
      return;
    }
    const cards = list.map((entry, i) => {
      const fresh = refreshEntry(entry, profile);
      const aside = quitarButton(entry, i);
      if (fresh.verdict) {
        return verdictCard(fresh.verdict, { level: 2, title: entry.title, aside });
      }
      return h(
        'article',
        { class: 'card', dataset: { level: fresh.level } },
        pill(fresh.level),
        h('h2', { class: 'card-name' }, entry.title || 'Sin nombre'),
        h('p', { class: 'card-phrase' }, fresh.phrase),
        h('div', { class: 'card-bar card-bar--end' }, aside),
      );
    });
    fill(listHost, ...cards);
  }

  function paintFavs() {
    const favs = getFavorites().filter((id) => FOOD_BY_ID[id]);
    if (!favs.length) {
      favHost.replaceChildren();
      return;
    }
    fill(favHost, 
      h(
        'section',
        { 'aria-labelledby': 'favoritos' },
        h('h2', { id: 'favoritos' }, 'Favoritos'),
        rows(
          favs.map((id) => {
            const food = FOOD_BY_ID[id];
            let v;
            try {
              v = verdictForFood(id, profile);
            } catch {
              v = { level: food.level, phrase: food.phrase };
            }
            return row({ href: `#/ficha/${encodeURIComponent(id)}`, level: v.level, title: food.name, phrase: v.phrase, headingLevel: 3 });
          }),
        ),
      ),
    );
  }

  paintList();
  paintFavs();
}
