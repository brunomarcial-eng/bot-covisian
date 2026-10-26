// Inicio: «¿Qué vas a comer?»

import { getHistory } from '../store.js';
import { h, icon } from './dom.js';
import { entries, sectionHead } from './components.js';
import { entryRow } from './entries.js';
import { recordSearch } from './buscar.js';
import { buildHash, navigate } from './router.js';
import { installHint } from './instalar.js';
import { emptyState, homePlate } from './art-ui.js';

// Dos accesos grandes: la tipografía manda; no hay icono ni círculo.
function tile(href, title, kicker, variant = '') {
  return h(
    'a',
    { class: `tile${variant ? ` tile--${variant}` : ''}`, href },
    h('span', { class: 'tile-kicker' }, kicker),
    h('span', { class: 'tile-title' }, title),
    h('span', { class: 'tile-arrow' }, icon('arrow-right', 28, 1.4)),
  );
}

export function render({ main, profile }) {
  const input = h('input', {
    id: 'plato',
    class: 'field-input',
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
    h('label', { class: 'label', for: 'plato' }, 'O escribe el plato'),
    h(
      'div',
      { class: 'field-box' },
      input,
      h('button', { type: 'submit', class: 'field-go', 'aria-label': 'Buscar' }, icon('search', 22, 1.7)),
    ),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) recordSearch(q, profile);
    navigate(buildHash('buscar', { q }));
  });

  main.append(
    homePlate(),
    h('h1', null, '¿Qué vas a comer?'),
    h('p', { class: 'lead' }, 'En la mesa o en el súper. La respuesta, primero.'),
    h(
      'div',
      { class: 'tiles' },
      tile('#/fuera', 'Comer fuera', 'Foto de la carta o el plato'),
      tile('#/super', 'En el súper', 'Código de barras o etiqueta', 'light'),
    ),
    form,
  );

  const history = getHistory().slice(0, 3);
  if (!history.length) {
    main.append(
      h(
        'section',
        { class: 'section section--last-empty', 'aria-labelledby': 'lo-ultimo' },
        sectionHead('Lo último', 'lo-ultimo'),
        emptyState('fruta', h('p', null, 'Aquí irán tus últimas respuestas.')),
      ),
    );
  }
  if (history.length) {
    main.append(
      h(
        'section',
        { class: 'section', 'aria-labelledby': 'lo-ultimo' },
        sectionHead('Lo último', 'lo-ultimo', h('a', { class: 'text-link text-link--small', href: '#/historial' }, 'Ver el historial')),
        entries(history.map((e) => entryRow(e, profile, { headingLevel: 3 }))),
      ),
    );
  }

  // Las claves: una línea discreta (no es un quinto destino de la barra).
  main.append(
    h(
      'a',
      { class: 'claves-link', href: '#/claves' },
      h('span', null, 'Las claves del embarazo: los 8 temas que más se repiten'),
      icon('arrow-right', 20, 1.4),
    ),
  );

  // Una línea discreta, solo si no está instalada y no la ha cerrado.
  const hint = installHint();
  if (hint) main.append(hint);
}
