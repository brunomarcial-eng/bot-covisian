// Platos sueltos (160×160) para estados vacíos y el plato que gira mientras la app lee la carta.
// Mismo estilo que la mesa: plano, cenital, con sombra desplazada. Sin texto incrustado.

import { C } from './base.js';
import { tortilla, ensalada, fruta, gazpacho } from './piezas.js';
import { tenedor, cuchillo } from './extras.js';

const TIPOS = {
  tortilla: { dibujo: tortilla, aria: 'Plato con tortilla de patatas' },
  ensalada: { dibujo: ensalada, aria: 'Plato con ensalada' },
  fruta: { dibujo: fruta, aria: 'Plato con fruta' },
  cuenco: { dibujo: gazpacho, aria: 'Cuenco de gazpacho' },
};

const a11y = (decorativa, texto) =>
  decorativa ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${texto}"`;

// platoSvg('tortilla' | 'ensalada' | 'fruta' | 'cuenco', { decorativa })
export function platoSvg(tipo = 'cuenco', { decorativa = false } = {}) {
  const t = TIPOS[tipo] || TIPOS.cuenco;
  const p = t.dibujo();
  const k = Math.round((68 / p.R) * 1000) / 1000;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="art-plato-suelto" viewBox="0 0 160 160" ${a11y(decorativa, t.aria)}>` +
    `<g transform="translate(80 80) scale(${k})"><g fill="${C.tinta}" opacity=".13" transform="translate(2.6 3.8)">${p.sh}</g>${p.svg}</g></svg>`
  );
}

// Plato con tenedor y cuchillo que giran despacio (una vuelta cada 2,4 s).
const CSS_CARGANDO =
  `.art-cargando .art-gira{transform-origin:80px 80px;animation:art-gira 2.4s linear infinite}` +
  `@keyframes art-gira{to{transform:rotate(360deg)}}` +
  `@media (prefers-reduced-motion:reduce){.art-cargando .art-gira{animation:none}}`;

export function cargandoSvg({ decorativa = false, animada = true } = {}) {
  const p = tortilla();
  const k = Math.round((52 / p.R) * 1000) / 1000;
  const sombra = `fill="${C.tinta}" opacity=".13"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="art-cargando" viewBox="0 0 160 160" ${a11y(decorativa, 'Plato con tenedor y cuchillo que giran')}>` +
    (animada ? `<style>${CSS_CARGANDO}</style>` : '') +
    `<g transform="translate(80 80)"><g transform="scale(${k})"><g ${sombra} transform="translate(2.6 3.8)">${p.sh}</g>${p.svg}</g></g>` +
    `<g class="art-gira">` +
    `<g transform="translate(14 80) scale(1.35)"><g ${sombra} transform="translate(1.4 2)">${tenedor().replace(/(fill|stroke)="[^"]*"/g, '')}</g>${tenedor()}</g>` +
    `<g transform="translate(146 80) scale(1.35)"><g ${sombra} transform="translate(1.4 2)">${cuchillo().replace(/(fill|stroke)="[^"]*"/g, '')}</g>${cuchillo()}</g>` +
    `</g></svg>`
  );
}
