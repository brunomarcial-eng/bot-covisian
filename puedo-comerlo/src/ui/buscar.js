// Buscar: el campo y la respuesta. Nada más. Lo que sabe el motor no se enseña como lista:
// la persona solo quiere la respuesta.

import { classifyText, LEVEL_LABEL } from '../engine/index.js';
import { addHistory } from '../store.js';
import { h, icon, debounce, fill } from './dom.js';
import { verdictAnswer, addToListButton, shortcutList, sectionHead } from './components.js';
import { ATAJOS_FUERA } from './fuera.js';
import { buildHash, replaceQuietly } from './router.js';
import { setTone, clearTone } from './tone.js';

// Apunta una búsqueda enviada en el historial. Devuelve el veredicto.
export function recordSearch(q, profile) {
  const text = String(q || '').trim();
  if (!text) return null;
  const v = classifyText(text, {}, profile);
  addHistory({
    via: 'busqueda',
    title: text,
    level: v.level,
    phrase: v.phrase,
    foodId: v.foodId || null,
    payload: { kind: 'texto', text },
  });
  return v;
}

export function render({ main, params, profile }) {
  let q = (params.get('q') || '').slice(0, 120);

  const input = h('input', {
    id: 'buscar-q',
    class: 'field-input',
    type: 'search',
    name: 'q',
    placeholder: 'Sushi, tortilla, jamón…',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    enterkeyhint: 'search',
    maxlength: 120,
    'aria-controls': 'buscar-resultados',
  });
  input.value = q;

  const form = h(
    'form',
    { role: 'search', novalidate: true },
    h('label', { class: 'label', for: 'buscar-q' }, 'Plato o alimento'),
    h(
      'div',
      { class: 'field-box' },
      input,
      h('button', { type: 'submit', class: 'field-go', 'aria-label': 'Buscar' }, icon('search', 22, 1.7)),
    ),
  );

  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { id: 'buscar-resultados' });

  main.append(h('h1', null, 'Buscar'), form, live, results);

  const syncUrl = () => {
    replaceQuietly(buildHash('buscar', { q: q.trim() }));
  };

  function paint() {
    const text = q.trim();

    if (!text) {
      fill(
        results,
        h('p', { class: 'help' }, 'Escribe un plato, un alimento o una bebida.'),
        h(
          'section',
          { class: 'section', 'aria-labelledby': 'atajos-buscar' },
          sectionHead('Atajos', 'atajos-buscar'),
          shortcutList(ATAJOS_FUERA),
        ),
      );
      live.textContent = '';
      clearTone();
      return;
    }

    let v = null;
    try {
      v = classifyText(text, {}, profile);
    } catch (err) {
      console.error(err);
    }
    if (!v) {
      fill(results, h('p', { class: 'help' }, 'No he podido responder a esto. Prueba con otra palabra.'));
      live.textContent = '';
      clearTone();
      return;
    }

    // «Ver la ficha» solo si la respuesta sale de un único alimento de la guía.
    const single = v.foodId && Array.isArray(v.foodIds) && v.foodIds.length === 1;
    const entry = {
      via: 'busqueda',
      title: text,
      level: v.level,
      phrase: v.phrase,
      foodId: v.foodId || null,
      payload: { kind: 'texto', text },
    };
    const actions = [
      addToListButton(entry, { small: true, variant: 'secondary', inline: true }),
      single
        ? h('a', { class: 'text-link', href: `#/ficha/${encodeURIComponent(v.foodId)}` }, 'Ver la ficha', icon('arrow-right', 18, 1.5))
        : null,
    ];

    fill(
      results,
      h(
        'section',
        { class: 'answer-wrap', 'aria-label': 'Tu respuesta' },
        verdictAnswer(v, {
          level: 2,
          title: text.charAt(0).toLocaleUpperCase('es-ES') + text.slice(1),
          fichaLink: false,
          actions,
        }),
      ),
    );
    // Toda la pantalla toma el color de la respuesta (de crema a color se «enciende»; de un color a otro, fundido).
    setTone(v.level, { anchor: results.querySelector('.answer-word') });
    live.textContent = `Tu respuesta: ${LEVEL_LABEL[v.level] || ''}.`;
  }

  const onType = debounce(() => {
    q = input.value.slice(0, 120);
    syncUrl();
    paint();
  }, 180);
  input.addEventListener('input', onType);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onType.cancel();
    q = input.value.slice(0, 120);
    syncUrl();
    paint();
    if (q.trim()) recordSearch(q, profile);
  });

  paint();

  return () => onType.cancel();
}
