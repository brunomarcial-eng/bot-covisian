// Inicio: «¿Qué vas a comer?»

import { getHistory } from '../store.js';
import { h, icon } from './dom.js';
import { rows } from './components.js';
import { entryRow } from './entries.js';
import { recordSearch } from './buscar.js';
import { buildHash, navigate } from './router.js';

function tile(href, iconName, title, sub) {
  return h(
    'a',
    { class: 'tile', href },
    h('span', { class: 'tile-icon' }, icon(iconName, 24)),
    h('span', { class: 'tile-text' }, h('span', { class: 'tile-title' }, title), h('span', { class: 'tile-sub' }, sub)),
    h('span', { class: 'tile-go' }, icon('chevron-right', 24)),
  );
}

export function render({ main, profile }) {
  const input = h('input', {
    id: 'plato',
    class: 'input',
    type: 'search',
    name: 'q',
    placeholder: 'Sushi, tortilla, jamón…',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    enterkeyhint: 'search',
    maxlength: 120,
  });
  const form = h(
    'form',
    { class: 'search-form', role: 'search', novalidate: true },
    h('label', { class: 'label label--title', for: 'plato' }, 'O escribe el plato'),
    h(
      'div',
      { class: 'search-row' },
      input,
      h('button', { type: 'submit', class: 'btn btn--secondary btn--icon', 'aria-label': 'Buscar' }, icon('search', 22)),
    ),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) recordSearch(q, profile);
    navigate(buildHash('buscar', { q }));
  });

  main.append(
    h('h1', null, '¿Qué vas a comer?'),
    h('p', { class: 'lead' }, 'En la mesa o en el súper. La respuesta, primero.'),
    h(
      'div',
      { class: 'tiles' },
      tile('#/fuera', 'fork', 'Comer fuera', 'Foto de la carta o el plato'),
      tile('#/super', 'basket', 'En el súper', 'Código de barras o etiqueta'),
    ),
    form,
  );

  const history = getHistory().slice(0, 3);
  if (history.length) {
    main.append(
      h(
        'section',
        { 'aria-labelledby': 'lo-ultimo' },
        h(
          'div',
          { class: 'section-head' },
          h('h2', { id: 'lo-ultimo' }, 'Lo último'),
          h('a', { href: '#/historial' }, 'Ver el historial'),
        ),
        rows(history.map((e) => entryRow(e, profile, { headingLevel: 3 }))),
      ),
    );
  }
}
