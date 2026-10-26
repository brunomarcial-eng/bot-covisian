// Las claves del embarazo: los ocho temas que se repiten (listeria, toxoplasmosis, mercurio…), explicados
// una sola vez. Consulta, no curso: sin progreso ni cuenta atrás. #/claves/<id> abre ese tema y baja a él.

import { CLAVES, CLAVE_BY_ID } from '../engine/claves.js';
import { h, uid } from './dom.js';
import { replaceQuietly } from './router.js';

function list(items, cls) {
  return h('ul', { class: cls }, items.map((t) => h('li', null, t)));
}

function section(label, body) {
  return h('div', { class: 'clave-sec' }, h('h3', { class: 'more-label' }, label), body);
}

function panelFor(c) {
  return [
    h('p', { class: 'clave-porque' }, c.porque),
    section('Qué mirar en la etiqueta', list(c.donde, 'more-notes')),
    section('Qué preguntar en la carta', list(c.carta.map((q) => `«${q}»`), 'more-notes')),
    section('Dónde suele aparecer', h('p', null, c.ejemplos.join(', ') + '.')),
    section('Una alternativa', h('p', null, c.alternativa)),
    h('p', { class: 'more-source' }, `Fuente: ${c.fuente}`),
  ];
}

export function render({ main, segs }) {
  const wanted = segs[1] && CLAVE_BY_ID[segs[1]] ? segs[1] : null;
  const cards = [];

  const setOpen = (card, open) => {
    card.btn.setAttribute('aria-expanded', String(open));
    card.el.classList.toggle('is-open', open);
    card.state.textContent = open ? 'Cerrar' : 'Abrir';
  };

  for (const c of CLAVES) {
    const panelId = uid('clave');
    const state = h('span', { class: 'clave-state' }, 'Abrir');
    const btn = h(
      'button',
      { type: 'button', class: 'clave-head', id: `${panelId}-t`, 'aria-expanded': 'false', 'aria-controls': panelId },
      h('span', { class: 'clave-head-text' }, h('span', { class: 'clave-title' }, c.titulo), h('span', { class: 'clave-resumen' }, c.resumen)),
      state,
    );
    // El panel crece y se encoge en altura (rejilla 0fr → 1fr); cerrado, no se ve ni se enfoca (visibility).
    const panel = h('div', { class: 'clave-panel', id: panelId, role: 'region', 'aria-labelledby': `${panelId}-t` }, h('div', { class: 'clave-panel-in' }, panelFor(c)));
    const el = h('li', { class: 'clave', id: `clave-${c.id}`, dataset: { clave: c.id } }, h('h2', { class: 'clave-h' }, btn), panel);
    const card = { id: c.id, el, btn, panel, state };
    cards.push(card);
    btn.addEventListener('click', () => {
      const willOpen = btn.getAttribute('aria-expanded') !== 'true';
      for (const other of cards) setOpen(other, other === card && willOpen);
      replaceQuietly(willOpen ? `#/claves/${c.id}` : '#/claves');
    });
  }

  main.append(
    h('h1', null, 'Las claves del embarazo'),
    h('p', { class: 'lead' }, 'Son los ocho temas que más se repiten durante el embarazo. Sirven para saber qué mirar en una etiqueta y qué preguntar en la carta.'),
    h('ul', { class: 'claves' }, cards.map((c) => c.el)),
    h('p', { class: 'help claves-cierre' }, 'Si tienes una duda sobre tu caso, pregúntasela a tu matrona.'),
  );

  if (wanted) {
    const card = cards.find((c) => c.id === wanted);
    setOpen(card, true);
    // El router sube al principio justo después de pintar: se baja a la clave en el fotograma siguiente.
    requestAnimationFrame(() => {
      const quick = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.el.scrollIntoView({ block: 'start', behavior: quick ? 'auto' : 'smooth' });
    });
  }
}
