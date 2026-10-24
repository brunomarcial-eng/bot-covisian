// Ficha de un alimento de la guía, con el perfil aplicado.

import { verdictForFood, FOOD_BY_ID, GROUPS } from '../engine/index.js';
import { addHistory, isFavorite, toggleFavorite } from '../store.js';
import { h, icon, announce, fill } from './dom.js';
import { pill, verdictMore, addToListButton } from './components.js';

export function render({ main, segs, profile }) {
  const id = segs[1] || '';
  const food = FOOD_BY_ID[id];

  if (!food) {
    main.append(
      h('h1', null, 'No encuentro este alimento'),
      h('p', { class: 'lead' }, 'Puede que el enlace esté incompleto. Búscalo en la guía por su nombre.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: '#/buscar' }, icon('search', 22), 'Buscar en la guía')),
    );
    return;
  }

  const v = verdictForFood(id, profile);
  addHistory({ via: 'guia', title: food.name, level: v.level, phrase: v.phrase, foodId: id });

  const group = (GROUPS || []).find((g) => g.id === (food.groups || [])[0]);
  const { button: moreBtn, panel } = verdictMore(v, { level: 1, fichaLink: false });

  const favBtn = h('button', { type: 'button', class: 'btn btn--secondary', dataset: { action: 'favorito' } });
  const paintFav = (on) => {
    fill(favBtn, icon(on ? 'bookmark-filled' : 'bookmark', 22), on ? 'Quitar de favoritos' : 'Guardar en favoritos');
  };
  paintFav(isFavorite(id));
  favBtn.addEventListener('click', () => {
    const on = toggleFavorite(id);
    paintFav(on);
    announce(on ? 'Guardado en favoritos.' : 'Quitado de favoritos.');
  });

  main.append(
    group ? h('p', { class: 'eyebrow' }, group.label) : null,
    h(
      'article',
      { class: 'ficha', 'aria-labelledby': 'ficha-nombre', dataset: { level: v.level } },
      h('div', { class: 'ficha-pill' }, pill(v.level)),
      h('h1', { id: 'ficha-nombre', class: 'ficha-name' }, food.name),
      h('p', { class: 'ficha-phrase' }, v.phrase),
      h('div', { class: 'ficha-more' }, moreBtn, panel),
    ),
    h(
      'div',
      { class: 'actions' },
      addToListButton(
        { via: 'guia', title: food.name, level: v.level, phrase: v.phrase, foodId: id },
        { small: false, variant: 'primary', inline: false },
      ),
      favBtn,
    ),
  );
}
