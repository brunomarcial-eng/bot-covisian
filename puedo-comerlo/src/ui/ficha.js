// Ficha de un alimento de la guía, con el perfil aplicado.

import { verdictForFood, FOOD_BY_ID, GROUPS } from '../engine/index.js';
import { addHistory, isFavorite, toggleFavorite } from '../store.js';
import { h, icon, announce, fill } from './dom.js';
import { verdictAnswer, addToListButton } from './components.js';

export function render({ main, segs, profile }) {
  const id = segs[1] || '';
  const food = FOOD_BY_ID[id];

  if (!food) {
    main.append(
      h('h1', null, 'No encuentro este alimento'),
      h('p', { class: 'lead' }, 'Puede que el enlace esté incompleto. Búscalo por su nombre.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: '#/buscar' }, 'Buscar')),
    );
    return;
  }

  const v = verdictForFood(id, profile);
  addHistory({ via: 'guia', title: food.name, level: v.level, phrase: v.phrase, foodId: id });

  const group = (GROUPS || []).find((g) => g.id === (food.groups || [])[0]);

  const favBtn = h('button', { type: 'button', class: 'btn btn--secondary', dataset: { action: 'favorito' } });
  const paintFav = (on) => {
    fill(favBtn, on ? icon('bookmark-filled', 20) : null, on ? 'Quitar de favoritos' : 'Guardar en favoritos');
  };
  paintFav(isFavorite(id));
  favBtn.addEventListener('click', () => {
    const on = toggleFavorite(id);
    paintFav(on);
    announce(on ? 'Guardado en favoritos.' : 'Quitado de favoritos.');
  });

  main.append(
    verdictAnswer(v, {
      level: 1,
      title: food.name,
      eyebrow: group ? group.label : null,
      fichaLink: false,
    }),
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
