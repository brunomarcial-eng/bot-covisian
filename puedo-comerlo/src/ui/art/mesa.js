// «Mesa»: una comida compartida vista desde arriba, con doce platos servidos a la vez.
// SVG inline, sin imágenes ni fuentes externas. Pensada para 390×520 (móvil en vertical) y para
// recortarse por los bordes.

import { C, n } from './base.js';
import { PLATOS } from './piezas.js';
import { mantel, cubierto, servilleta, jarra, vaso, cesta, servilletaBordada } from './extras.js';

export const MESA_W = 390;
export const MESA_H = 520;

// id, x, y, rotación, escala
const DISPOSICION = [
  ['paella', 108, 150, 70, 1],
  ['tortilla', 312, 100, 20, 1],
  ['aceitunas', 222, 80, 0, 0.92],
  ['ensalada', 352, 224, 0, 1],
  ['gazpacho', 228, 214, 0, 1],
  ['lentejas', 40, 290, 0, 1],
  ['pan-con-tomate', 150, 316, -14, 1],
  ['pescado', 300, 344, -18, 1],
  ['croquetas', 62, 408, 0, 1],
  ['verduras', 196, 396, 6, 0.95],
  ['fruta', 352, 442, 0, 1],
  ['yogur', 28, 482, 0, 1],
];

const CENTRO = [195, 260];

function plato(id, x, y, rot, k, i) {
  const p = PLATOS[id]();
  const vx = x - CENTRO[0];
  const vy = y - CENTRO[1];
  const d = Math.hypot(vx, vy) || 1;
  const dx = n((vx / d) * 12);
  const dy = n((vy / d) * 12);
  return (
    `<g class="art-plato" data-plato="${id}" style="--i:${i};--dx:${dx}px;--dy:${dy}px">` +
    `<g transform="translate(${x} ${y})">` +
    `<g fill="${C.tinta}" opacity=".13" transform="translate(3.4 5) rotate(${rot}) scale(${k})">${p.sh}</g>` +
    `<g transform="rotate(${rot}) scale(${k})">${p.svg}</g>` +
    (p.vapor ? `<g transform="scale(${k})">${p.vapor}</g>` : '') +
    `</g></g>`
  );
}

const CSS =
  `.art-mesa .art-plato,.art-mesa .art-extra{animation:art-entra .56s cubic-bezier(.22,.7,.2,1) both;animation-delay:calc(var(--i,0)*70ms + 40ms);transform-box:fill-box;transform-origin:center}` +
  `.art-mesa .art-extra{animation-name:art-aparece}` +
  `.art-mesa .art-vapor{animation:art-vapor 5.2s ease-in-out infinite;animation-delay:calc(1.6s + var(--v,0)*1.7s);transform-box:fill-box;transform-origin:center bottom;opacity:.4}` +
  `@keyframes art-entra{from{opacity:0;transform:translate(var(--dx,0),var(--dy,10px)) scale(.88)}to{opacity:1;transform:none}}` +
  `@keyframes art-aparece{from{opacity:0}to{opacity:1}}` +
  `@keyframes art-vapor{0%,100%{opacity:.18;transform:translateY(2px) scaleY(.94)}50%{opacity:.5;transform:translateY(-3px) scaleY(1.04)}}` +
  `@media (prefers-reduced-motion:reduce){.art-mesa .art-plato,.art-mesa .art-extra,.art-mesa .art-vapor{animation:none!important}.art-mesa .art-vapor{opacity:.35}}`;

export function mesaSvg({ animada = true, decorativa = false, embarazo = true, encuadre = 'xMidYMid' } = {}) {
  const a11y = decorativa
    ? 'aria-hidden="true" focusable="false"'
    : 'role="img" aria-label="Mesa vista desde arriba con doce platos de comida casera"';
  let i = 0;
  const ex = (idx, markup) => `<g class="art-extra" style="--i:${idx}">${markup}</g>`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="art-mesa" viewBox="0 0 ${MESA_W} ${MESA_H}" preserveAspectRatio="${encuadre} slice" ${a11y}>`;
  if (animada) s += `<style>${CSS}</style>`;
  s += mantel(MESA_W, MESA_H);
  s += ex(1, jarra(26, 40, -20) + vaso(168, 30) + servilleta(358, 22, 18));
  s += ex(5, cesta(92, 246, -12));
  let plates = '';
  for (const [id, x, y, rot, k] of DISPOSICION) plates += plato(id, x, y, rot, k, i++);
  s += plates;
  s += ex(10, cubierto('tenedor', 290, 166, 96) + cubierto('cuchillo', 292, 180, 92) + cubierto('cuchara', 258, 262, -12) + cubierto('tenedor', 112, 372, 74));
  if (embarazo) s += ex(11, servilletaBordada(196, 481, -2, 126, 90));
  s += `</svg>`;
  return s;
}
