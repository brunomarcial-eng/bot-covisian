// Destellos del veredicto: chispas, interrogaciones y puntos flotando, y trazos que se dibujan.
// Crema y dorado suave para leerse sobre los cuatro fondos de color (verde, naranja, vino y ocre).
// Sin <style>: la animación está en ART_CSS (art-css.js) y se activa con la clase `art-anim`.

const CREMA = '#fffdf8';
const ORO = '#f6dc8a';
const STAR = 'M0-10C1-3 3-1 10 0C3 1 1 3 0 10C-1 3-3 1-10 0C-3-1-1-3 0-10Z';
const INT = 'M-4-6Q-4-11 0-11Q4-11 4-7Q4-4 0-2Q-1-1-1 2';

const chispa = (x, y, s, c, d, t) =>
  `<g transform="translate(${x} ${y})"><g data-anim="chispa" style="--d:${d}s;--t:${t}s" opacity=".85"><path d="${STAR}" fill="${c}" transform="scale(${s})"/></g></g>`;

const interrogante = (x, y, s, c, d) =>
  `<g transform="translate(${x} ${y})"><g data-anim="flota" style="--d:${d}s" opacity=".7"><g transform="scale(${s})" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${INT}"/><path d="M-1 6.6h.1"/></g></g></g>`;

const punto = (x, y, r, d) =>
  `<g transform="translate(${x} ${y})"><g data-anim="flota" style="--d:${d}s" opacity=".7"><circle r="${r}" fill="${CREMA}"/></g></g>`;

const trazo = (d, c, w, retraso) =>
  `<path data-anim="traza" pathLength="1" style="--d:${retraso}s" d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const CONTENIDO = {
  // chispas de cuatro puntas de tamaños distintos, doradas y crema (centro libre para la palabra)
  si: () =>
    chispa(28, 34, 1.5, ORO, 0, 3.2) + chispa(128, 24, 0.9, CREMA, 0.9, 2.6) + chispa(140, 112, 1.2, ORO, 1.6, 3) +
    chispa(24, 120, 0.8, CREMA, 0.5, 2.8) + chispa(84, 142, 0.55, ORO, 2.1, 2.4),
  // puntos suspensivos que suben y un interrogante pequeño
  cuidado: () =>
    punto(30, 112, 3, 0) + punto(44, 112, 3, 0.35) + punto(58, 112, 3, 0.7) +
    punto(112, 60, 2.4, 1.4) + punto(124, 60, 2.4, 1.75) + punto(136, 60, 2.4, 2.1) +
    interrogante(120, 128, 1.4, ORO, 0.5) + interrogante(34, 40, 1.1, CREMA, 2),
  // interrogantes de trazo fino flotando, de varios tamaños
  duda: () =>
    interrogante(32, 120, 1.9, CREMA, 0) + interrogante(124, 40, 1.5, ORO, 1.1) + interrogante(116, 128, 1.1, CREMA, 2.1) +
    interrogante(40, 44, 1.2, ORO, 3),
  // cruz fina que se dibuja
  no: () => trazo('M52 52L108 108', CREMA, 5, 0) + trazo('M108 52L52 108', CREMA, 5, 0.22),
  // check que se dibuja, con una chispa dorada al terminar
  'si-check': () => trazo('M46 84L72 110L118 52', CREMA, 6, 0) + chispa(128, 42, 0.8, ORO, 0.6, 2.8) + chispa(38, 122, 0.55, ORO, 1.4, 2.6),
};

const ARIA = {};

// destellosSvg('si' | 'cuidado' | 'duda' | 'no' | 'si-check', { decorativa = true, animada = true })
export function destellosSvg(tipo = 'si', { decorativa = true, animada = true } = {}) {
  const clave = CONTENIDO[tipo] ? tipo : 'si';
  const a11y = decorativa ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${ARIA[clave] || 'Destellos'}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="art-dz${animada ? ' art-anim' : ''}" data-dz="${clave}" viewBox="0 0 160 160" ${a11y}>` +
    CONTENIDO[clave]() +
    `</svg>`
  );
}
