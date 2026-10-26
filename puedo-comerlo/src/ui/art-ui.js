// Piezas de interfaz que usan la ilustración (src/ui/art/): la mesa de la portada, el plato suelto
// de los estados vacíos y el plato que gira mientras se lee una foto o se consulta Open Food Facts.
// Los estilos de movimiento de la ilustración están en styles.css (sección «Ilustración»): así el SVG no
// lleva <style> dentro y el texto de la pantalla (y de la región viva) queda limpio.
// Todo es decorativo (aria-hidden): el texto de al lado dice lo mismo y es lo que oyen los lectores.

import { h } from './dom.js';
import { mesaSvg } from './art/mesa.js';
import { platoSvg, cargandoSvg } from './art/platos.js';

function svgNode(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

// Portada: la mesa a sangre, recortada por los bordes y alineada abajo (xMidYMax), para que asome la
// servilleta de lino con el perfil bordado. El borde de arriba se funde con el crema (máscara en CSS).
export function coverArt() {
  const svg = svgNode(mesaSvg({ animada: false, decorativa: true, encuadre: 'xMidYMax' }));
  return h('div', { class: 'cover-art', 'aria-hidden': 'true' }, svg);
}

// Estado vacío: un plato suelto (tortilla | ensalada | fruta | cuenco) y la línea de microcopy.
export function emptyState(tipo, ...text) {
  return h(
    'div',
    { class: 'empty empty--art' },
    h('div', { class: 'empty-art', 'aria-hidden': 'true' }, svgNode(platoSvg(tipo, { decorativa: true }))),
    h('div', { class: 'empty-text' }, text),
  );
}

// Inicio: un cuenco pequeño con vapor junto al título (decorativo, ligero: tres trazos que suben y se apagan).
export function homePlate() {
  const wrap = h('div', { class: 'home-plate', 'aria-hidden': 'true' });
  wrap.append(svgNode(platoSvg('cuenco', { decorativa: true })));
  wrap.insertAdjacentHTML(
    'beforeend',
    '<svg class="home-vapor" viewBox="0 0 60 44" width="60" height="44" aria-hidden="true" focusable="false"><path d="M16 40c-6-8 6-12 0-20"/><path d="M30 42c-6-8 6-12 0-24"/><path d="M44 40c-6-8 6-12 0-20"/></svg>',
  );
  return wrap;
}

// «Leyendo…»: el plato con tenedor y cuchillo que giran, y el texto de estado (región viva).
export function loadingStatus(firstText) {
  const text = h('span', { class: 'status-text' }, firstText);
  const el = h(
    'div',
    { class: 'status status--art', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'status-art', 'aria-hidden': 'true' }, svgNode(cargandoSvg({ decorativa: true, animada: false }))),
    // Texto de estado y dos barras de «shimmer» (no son texto: vacías y aria-hidden)
    h(
      'span',
      { class: 'status-body' },
      text,
      h('span', { class: 'skel', 'aria-hidden': 'true' }),
      h('span', { class: 'skel skel--short', 'aria-hidden': 'true' }),
    ),
  );
  return { el, text };
}
