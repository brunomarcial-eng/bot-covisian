// Lista: lo que ha ido guardando, recalculado con el perfil actual. Y sus favoritos.

import { verdictForFood, FOOD_BY_ID } from '../engine/index.js';
import { getList, removeFromList, getFavorites } from '../store.js';
import { h, announce, fill } from './dom.js';
import { entryItem, entryLink, entries, sectionHead } from './components.js';
import { refreshEntry } from './recalc.js';
import { emptyState } from './art-ui.js';

export function render({ main, profile }) {
  const h1 = h('h1', null, 'Lista');
  const listHost = h('div', { class: 'lista' });
  const favHost = h('div');
  main.append(h1, h('p', { class: 'lead' }, 'Lo que has guardado. Se recalcula con tus ajustes de ahora.'), listHost, favHost);

  function quitarButton(entry, index) {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'quiet-btn',
        'aria-label': `Quitar ${entry.title}`,
        dataset: { index: String(index) },
      },
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
      fill(
        listHost,
        emptyState('ensalada', h('p', null, 'Todavía no hay nada. Cuando mires un plato o un producto, puedes dejarlo aquí.')),
      );
      return;
    }
    const items = list.map((entry, i) => {
      const fresh = refreshEntry(entry, profile);
      const aside = quitarButton(entry, i);
      if (fresh.verdict) {
        return entryItem(fresh.verdict, { level: 2, title: entry.title, aside });
      }
      // Sin veredicto completo (p. ej. una carta guardada): solo el nivel y la frase.
      return entryItem({ level: fresh.level, phrase: fresh.phrase }, { level: 2, title: entry.title, aside, fichaLink: false });
    });
    fill(listHost, entries(items, 'Lo guardado'));
  }

  function paintFavs() {
    const favs = getFavorites().filter((id) => FOOD_BY_ID[id]);
    if (!favs.length) {
      favHost.replaceChildren();
      return;
    }
    fill(
      favHost,
      h(
        'section',
        { class: 'section', 'aria-labelledby': 'favoritos' },
        sectionHead('Favoritos', 'favoritos'),
        entries(
          favs.map((id) => {
            const food = FOOD_BY_ID[id];
            let v;
            try {
              v = verdictForFood(id, profile);
            } catch {
              v = { level: food.level, phrase: food.phrase };
            }
            return entryLink({ href: `#/ficha/${encodeURIComponent(id)}`, level: v.level, title: food.name, phrase: v.phrase, headingLevel: 3 });
          }),
        ),
      ),
    );
  }

  paintList();
  paintFavs();
}
