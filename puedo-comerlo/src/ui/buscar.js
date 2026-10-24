// Buscar: arriba «Tu respuesta» (la respuesta, primero); debajo «En la guía».

import { classifyText, searchFoods, verdictForFood, GROUPS, LEVEL_LABEL } from '../engine/index.js';
import { addHistory } from '../store.js';
import { h, icon, debounce, fill } from './dom.js';
import { verdictCard, row, rows } from './components.js';
import { buildHash, replaceQuietly } from './router.js';

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

function groupIds() {
  return (GROUPS || []).map((g) => g.id);
}

export function render({ main, params, profile }) {
  let q = (params.get('q') || '').slice(0, 120);
  let g = params.get('g') || 'todo';
  if (!groupIds().includes(g)) g = 'todo';

  const input = h('input', {
    id: 'buscar-q',
    class: 'input',
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
      { class: 'search-row' },
      input,
      h('button', { type: 'submit', class: 'btn btn--primary btn--icon', 'aria-label': 'Buscar' }, icon('search', 22)),
    ),
  );

  const chipButtons = (GROUPS || []).map((grp) =>
    h(
      'button',
      { type: 'button', class: 'chip', 'aria-pressed': String(grp.id === g), dataset: { group: grp.id } },
      grp.label,
    ),
  );
  const chips = h(
    'div',
    { class: 'chips chips--scroll mt-md', role: 'group', 'aria-label': 'Filtrar por grupo' },
    chipButtons,
  );

  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { id: 'buscar-resultados' });

  main.append(h('h1', null, 'Buscar'), form, chips, live, results);

  const syncUrl = () => {
    replaceQuietly(buildHash('buscar', { q: q.trim(), g: g === 'todo' ? '' : g }));
  };

  function paint() {
    const text = q.trim();
    const parts = [];
    let liveText = '';

    if (text) {
      let v = null;
      try {
        v = classifyText(text, {}, profile);
      } catch (err) {
        console.error(err);
      }
      if (v) {
        parts.push(
          h(
            'section',
            { 'aria-labelledby': 'tu-respuesta' },
            h('h2', { id: 'tu-respuesta' }, 'Tu respuesta'),
            verdictCard(v, {
              level: 3,
              title: text.charAt(0).toLocaleUpperCase('es-ES') + text.slice(1),
              hero: true,
              listEntry: {
                via: 'busqueda',
                title: text,
                level: v.level,
                phrase: v.phrase,
                foodId: v.foodId || null,
                payload: { kind: 'texto', text },
              },
            }),
          ),
        );
        liveText = `Tu respuesta: ${LEVEL_LABEL[v.level] || ''}.`;
      }
    }

    let foods = [];
    try {
      foods = searchFoods(text, g) || [];
    } catch (err) {
      console.error(err);
    }
    const groupLabel = (GROUPS || []).find((x) => x.id === g)?.label || 'Todo';
    const guideItems = foods.map((f) => {
      let v = null;
      try {
        v = verdictForFood(f.id, profile);
      } catch {
        v = { level: f.level, phrase: f.phrase };
      }
      return row({ href: `#/ficha/${encodeURIComponent(f.id)}`, level: v.level, title: f.name, phrase: v.phrase, headingLevel: 3 });
    });

    const count = foods.length;
    const countText = count === 1 ? '1 alimento' : `${count} alimentos`;
    let guideBody;
    if (count) {
      guideBody = rows(guideItems);
    } else if (text) {
      guideBody = h(
        'div',
        { class: 'empty' },
        h('p', null, `En la guía no aparece «${text}»${g !== 'todo' ? ` dentro de ${groupLabel}` : ''}.`),
        h(
          'p',
          null,
          g !== 'todo'
            ? 'Prueba con otra palabra, o mira en «Todo».'
            : 'Prueba con otra palabra, o con una parte del nombre. Arriba tienes la respuesta para lo que has escrito.',
        ),
      );
    } else {
      guideBody = h('div', { class: 'empty' }, h('p', null, 'No hay alimentos en este grupo.'));
    }

    parts.push(
      h(
        'section',
        { 'aria-labelledby': 'en-la-guia' },
        h(
          'div',
          { class: 'section-head' },
          h('h2', { id: 'en-la-guia' }, 'En la guía'),
          count ? h('span', { class: 'muted small' }, countText) : null,
        ),
        guideBody,
      ),
    );
    liveText += ` En la guía: ${count ? countText : 'nada'}.`;

    fill(results, ...parts);
    live.textContent = liveText.trim();
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

  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-group]');
    if (!btn) return;
    g = btn.dataset.group;
    for (const b of chipButtons) b.setAttribute('aria-pressed', String(b.dataset.group === g));
    syncUrl();
    paint();
  });

  paint();

  // Lleva a la vista el filtro activo.
  const active = chipButtons.find((b) => b.dataset.group === g);
  if (active && g !== 'todo') {
    requestAnimationFrame(() => {
      chips.scrollLeft = Math.max(0, active.offsetLeft - chips.offsetLeft - 16);
    });
  }

  return () => onType.cancel();
}
