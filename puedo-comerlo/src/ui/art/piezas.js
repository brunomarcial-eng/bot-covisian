// Los platos, uno por función, dibujados vistos desde arriba y centrados en (0,0).
// Cada uno devuelve { svg, sh, R }: el dibujo, la silueta para la sombra y su radio.

import { C, n, r0, rng, T, disco, puntos, hebras, loza, lozaOval, gajo, ramita } from './base.js';

const circ = (r) => `<circle r="${r}"/>`;

// Mejillón abierto y gamba cocida (se reutilizan en «marisco» y «arroz»).
export const mej = (x, y, a, k = 1) =>
`<g transform="${T(x, y, a, k)}"><path d="M-10 0C-9-6 5-7 11 0C5 7-9 6-10 0Z" fill="#2b2e3f"/><path d="M-8 0C-7-4.5 4-5 9 0C4 5-7 4.5-8 0Z" fill="#eaa25d"/><path d="M-5 -.5C-2-2.5 2-2.5 4 -.5" stroke="#f6cf9b" stroke-width="1.3" fill="none" stroke-linecap="round"/></g>`;

export const gamba = (x, y, a, k = 1) =>
  `<g transform="${T(x, y, a, k)}"><path d="M-11 -2C-11-11 7-12 11-3C14 3 9 9 2 9" fill="none" stroke="#e2693d" stroke-width="7" stroke-linecap="round"/>` +
  `<path d="M-11 -2C-11-11 7-12 11-3C14 3 9 9 2 9" fill="none" stroke="#a8431f" stroke-width="7" stroke-dasharray="1 3.6"/>` +
  `<path d="M-9 -8C-3-12 4-11 8-6" fill="none" stroke="#f3a07a" stroke-width="1.4" stroke-linecap="round"/>` +
  `<path d="M2 9l-5 3M2 9l-1 6M2 9l4 4" stroke="#d65a30" stroke-width="2.2" stroke-linecap="round"/>` +
  `<path d="M-11 -2l-8-6M-11 -2l-9 2" stroke="#a8431f" stroke-width=".9" stroke-linecap="round"/><circle cx="-10" cy="-3" r="1.2" fill="#241f1a"/></g>`;

// 1 · Paella ---------------------------------------------------------------------
export function paella({ ligera = false } = {}) {
  const r = rng(7);
  let s = '';
  s += `<g fill="#3b342d"><rect x="-93" y="-5.5" width="32" height="11" rx="5.5"/><rect x="61" y="-5.5" width="32" height="11" rx="5.5"/></g>`;
  s += `<circle r="70" fill="#3b342d"/><circle r="66.5" fill="#5b5145"/><circle r="63" fill="#dba92f"/>`;
  s += `<circle r="60" fill="none" stroke="#a8701c" stroke-width="6" stroke-opacity=".5" stroke-dasharray="16 3 7 5 24 4"/>`;
  s += `<circle cx="-6" cy="-4" r="40" fill="#e9bd42" fill-opacity=".7"/>`;
  s += hebras(r, disco(r, ligera ? 20 : 50, 58, 0), '#c68a22', 2.6, 4);
  s += hebras(r, disco(r, ligera ? 24 : 58, 58, 0), '#f1d271', 2.6, 4);
  s += hebras(r, disco(r, ligera ? 10 : 28, 58, 0), '#b8532a', 2, 3, ' stroke-opacity=".6"');
  // pimiento en tiras
  s += `<g fill="none" stroke="#c63b2b" stroke-width="3.6" stroke-linecap="round">` +
    `<path d="M-30 -12q8-8 18-5"/><path d="M8 -26q10 2 16 10"/><path d="M-4 20q9 6 18 0"/><path d="M-44 6q4 10 14 12"/><path d="M30 6q10 0 14 10"/><path d="M-12 -46q8-3 15 2"/></g>`;
  s += puntos(disco(r, ligera ? 8 : 14, 50, 6), '#6d9c3b', 3.6);
  s += mej(-40, -30, 30) + mej(28, -42, -50) + mej(46, 14, 100) + mej(-8, 48, 8);
  if (!ligera) s += mej(-50, 24, -35) + mej(10, -8, 70);
  s += gamba(-14, -22, 20) + gamba(24, -6, -40) + gamba(-26, 20, 140);
  if (!ligera) s += gamba(14, 30, -10);
  s += gajo(58, -22, 70, 10);
  if (!ligera) s += gajo(-56, 36, -110, 10);
  if (!ligera) s += hebras(r, disco(r, 20, 52, 5), '#3f6d2f', 1.4, 3);
  return {
    svg: s,
    sh: `${circ(70)}<rect x="-93" y="-5.5" width="186" height="11" rx="5.5"/>`,
    R: 70,
    vapor:
      `<g class="art-vapor" style="--v:0" opacity=".35" fill="none" stroke="${C.hoja}" stroke-width="2.4" stroke-linecap="round">` +
      `<path d="M-22 -76c-9-9 7-13-2-23"/><path d="M-2 -80c-9-9 7-13-2-23"/><path d="M18 -77c-9-9 7-13-2-23"/></g>`,
  };
}

// 2 · Tortilla de patatas con una cuña cortada --------------------------------------
export function tortilla() {
  const R = 54;
  const t = 33;
  const cx = -6;
  const cy = -5;
  const a1 = 14;
  const a2 = 76;
  const p = (a, rr = t) => [n(rr * Math.cos((a * Math.PI) / 180)), n(rr * Math.sin((a * Math.PI) / 180))];
  const [x1, y1] = p(a1);
  const [x2, y2] = p(a2);
  const cuerpo = `M0 0L${x2} ${y2}A${t} ${t} 0 1 1 ${x1} ${y1}Z`;
  let s = loza(R, { band: C.salvia });
  s += `<g transform="translate(${cx} ${cy})">`;
  s += `<path d="${cuerpo}" fill="#c98d2e"/>`;
  s += `<path d="${cuerpo}" fill="#ecbd50" transform="scale(.91)"/>`;
  // dorado de la sartén, motas y brillos
  s += `<path d="M-22 -14A27 27 0 0 1 4 -28" fill="none" stroke="#f6d985" stroke-width="2.4" stroke-linecap="round"/>`;
  s += `<path d="M-26 8A28 28 0 0 0 -14 24" fill="none" stroke="#f6d985" stroke-width="1.6" stroke-linecap="round"/>`;
  const r = rng(21);
  s += puntos(disco(r, 22, 28, 4).filter(([x, y]) => !(y > 0 && x > 0 && Math.atan2(y, x) < 1.45 && Math.atan2(y, x) > 0.2)), '#c98d2e', 2.6, ' stroke-opacity=".55"');
  s += puntos(disco(r, 12, 26, 6), '#f4d27a', 2.2, ' stroke-opacity=".8"');
  // cortes: la cara del corte se ve clara con las capas de patata
  for (const [xx, yy] of [[x1, y1], [x2, y2]]) {
    s += `<path d="M0 0L${xx} ${yy}" stroke="#f6e3a0" stroke-width="4.4"/><path d="M0 0L${xx} ${yy}" stroke="#d8b25a" stroke-width="1.3" stroke-dasharray="2.4 2.6"/>`;
  }
  s += `</g>`;
  // la cuña apartada
  const m = ((a1 + a2) / 2) * (Math.PI / 180);
  const sx = cx + Math.cos(m) * 19;
  const sy = cy + Math.sin(m) * 19;
  const cuña = `M0 0L${x2} ${y2}A${t} ${t} 0 0 0 ${x1} ${y1}Z`;
  s += `<g transform="translate(${n(sx)} ${n(sy)}) rotate(9)">`;
  s += `<path d="${cuña}" fill="#241f1a" opacity=".1" transform="translate(1.8 2.4)"/>`;
  s += `<path d="${cuña}" fill="#c98d2e"/><path d="${cuña}" fill="#ecbd50" transform="scale(.9) translate(2 3)"/>`;
  s += `<path d="M0 0L${x1} ${y1}M0 0L${x2} ${y2}" stroke="#f6e3a0" stroke-width="4"/>`;
  s += `<path d="M2 3L${n(x1 * 0.93)} ${n(y1 * 0.93)}" stroke="#d8b25a" stroke-width="1.2" stroke-dasharray="2 2.4"/>`;
  s += `</g>`;
  s += ramita(-34, 30, -150, C.hojaV, 0.9);
  return { svg: s, sh: circ(R), R };
}

// 3 · Ensalada mixta ------------------------------------------------------------------
export function ensalada({ ligera = false } = {}) {
  const R = 56;
  const r = rng(33);
  let s = loza(R, { band: C.salvia });
  const hoja = (x, y, a, c, k = 1) =>
    `<g transform="${T(x, y, a, k)}"><path d="M-15 0q1-8 8-8q5-5 10 1q8-1 9 6q3 7-5 9q-5 5-10 0q-8 3-11-3q-3-3-1-5Z" fill="${c}"/><path d="M-12 0Q0 -2 12 1" stroke="#dfeaa8" stroke-width=".9" fill="none" stroke-opacity=".8"/></g>`;
  const verdes = ['#7fa545', '#6c9a3c', '#a2c15f', '#5c8a38', '#8db652'];
  const hs = disco(r, ligera ? 8 : 11, 30, 11);
  hs.forEach(([x, y], i) => (s += hoja(x, y, r() * 360, verdes[i % 5], 0.85 + r() * 0.35)));
  // tomate en gajos
  const tom = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><path d="M-10 3Q0-13 10 3Q0-2 -10 3Z" fill="${C.tomate}"/><path d="M-7.5 2.4Q0-8.5 7.5 2.4Q0 0 -7.5 2.4Z" fill="${C.tomateL}"/>${puntos([[-3, -1], [0, -3], [3, -1]], '#f8e3a6', 1.5)}</g>`;
  s += tom(-20, -12, -20) + tom(16, -22, 30) + tom(8, 16, 190) + tom(-26, 18, 80);
  // pepino
  const pep = (x, y) => `<g transform="translate(${x} ${y})"><circle r="6.6" fill="#8fb35a"/><circle r="5.2" fill="#d4e6a6"/><circle r="2.7" fill="#e9f2c8"/>${puntos([[-2, 0], [2, 1], [0, -2.4]], '#a9c47a', 1)}</g>`;
  s += pep(-4, -4) + pep(22, 4) + pep(-14, 26);
  // cebolla en aros
  if (!ligera) s += `<g fill="none" stroke="#e1bfd3" stroke-width="1.6" stroke-linecap="round"><path d="M-8 -24a9 9 0 0 1 14 2"/><path d="M12 24a8 8 0 0 1 11-4"/><path d="M-30 -2a8 8 0 0 1 3-10"/></g>`;
  // huevo duro, atún, aceitunas, maíz
  s += `<g transform="${T(-2, 22, 20)}"><ellipse rx="8" ry="6.2" fill="${C.hoja}" stroke="#d6ccb8"/><circle r="3.4" fill="#f0c43a"/></g>`;
  s += `<g transform="${T(24, -8, 15)}"><ellipse rx="8" ry="6.2" fill="${C.hoja}" stroke="#d6ccb8"/><circle r="3.4" fill="#f0c43a"/></g>`;
  s += `<path d="M-16 -30c4-4 9-3 10 1c-2 4-8 5-10-1ZM28 18c4-3 8-2 8 2c-3 3-8 3-8-2Z" fill="#ebcfa7" stroke="#cfa877" stroke-width=".8"/>`;
  s += `<g fill="#2f2a24"><circle cx="-34" cy="14" r="3.4"/><circle cx="30" cy="-24" r="3.4"/><circle cx="8" cy="-8" r="3.4"/></g><g fill="#8a7d6e"><circle cx="-34" cy="14" r="1.2"/><circle cx="30" cy="-24" r="1.2"/><circle cx="8" cy="-8" r="1.2"/></g>`;
  if (!ligera) s += puntos(disco(r, 7, 32, 7), '#f2cf45', 2.4);
  return { svg: s, sh: circ(R), R };
}

// 4 · Gazpacho en cuenco, con un hilo de aceite -----------------------------------
export function gazpacho() {
  const R = 46;
  let s = '';
  s += `<circle r="${R}" fill="${C.hoja}" stroke="${C.loza}"/>`;
  s += `<circle r="42" fill="none" stroke="${C.arcilla}" stroke-width="2"/>`;
  s += `<circle r="36" fill="#e9dfcd" stroke="#d6cbb7" stroke-width=".7"/>`;
  s += `<circle r="31" fill="#e2603a"/><circle r="22" fill="#ea7249"/>`;
  s += `<path d="M-24 -10A26 26 0 0 1 -6 -26" fill="none" stroke="#f39a72" stroke-width="2" stroke-linecap="round"/>`;
  // hilo de aceite en espiral
  s += `<path d="M-17 -3C-17 -17 15 -17 16 -3C17 12 -11 15 -11 2C-11 -7 5 -7 5 0" fill="none" stroke="#f1cf5c" stroke-width="2.2" stroke-linecap="round"/>`;
  s += `<path d="M-17 -3C-17 -17 15 -17 16 -3" fill="none" stroke="#fbeaa4" stroke-width=".8" stroke-linecap="round" transform="translate(0 -.6)"/>`;
  s += puntos([[-22, 12], [20, 14], [24, -14], [-4, 24]], '#f1cf5c', 2.6);
  // daditos de guarnición
  const dado = (x, y, c, a) => `<rect x="-2.2" y="-2.2" width="4.4" height="4.4" rx=".8" fill="${c}" transform="${T(x, y, a)}"/>`;
  s += dado(-8, 10, '#86ae52', 20) + dado(10, 8, '#c2402c', 40) + dado(2, -14, '#e8c27a', 10) + dado(18, -4, '#86ae52', 60) + dado(-20, 4, '#c2402c', 15) + dado(-2, 18, '#e8c27a', 70);
  return { svg: s, sh: circ(R), R };
}

// 5 · Lentejas en cazuela de barro --------------------------------------------------
export function lentejas() {
  const R = 50;
  const r = rng(51);
  let s = '';
  s += `<g fill="#9a4a27"><rect x="-52" y="-6" width="16" height="12" rx="6"/><rect x="36" y="-6" width="16" height="12" rx="6"/></g>`;
  s += `<circle r="46" fill="#b85f35"/><circle r="43" fill="#a3512c"/><circle r="38" fill="#8d4324"/>`;
  s += `<circle r="35" fill="#a8723a"/>`;
  s += `<path d="M-40 -14A44 44 0 0 1 -20 -40" fill="none" stroke="#d98a5c" stroke-width="2" stroke-linecap="round"/>`;
  s += puntos(disco(r, 52, 32, 3.4), '#7c5026', 3.6);
  s += puntos(disco(r, 54, 32, 3.4), '#c18a46', 3.4);
  s += puntos(disco(r, 36, 32, 3.4), '#5e3b1d', 3.2);
  s += puntos(disco(r, 30, 32, 3.4), '#d7a85a', 3);
  const zan = (x, y) => `<g transform="translate(${x} ${y})"><circle r="5.6" fill="#e2802a"/><circle r="3.4" fill="#f0a24d"/></g>`;
  s += zan(-14, -12) + zan(14, -6) + zan(-4, 14) + zan(18, 18) + zan(-24, 10);
  const pat = (x, y, a) => `<rect x="-4.4" y="-4.4" width="8.8" height="8.8" rx="2" fill="#e9d398" stroke="#c9a85a" stroke-width=".8" transform="${T(x, y, a)}"/>`;
  s += pat(6, -20, 20) + pat(-22, -4, 40) + pat(8, 6, 5);
  s += `<g transform="${T(-6, 24, -30)}"><path d="M-9 0C-4-6 4-6 9 0C4 6-4 6-9 0Z" fill="#6a8f3a"/><path d="M-9 0H9" stroke="#a9c777" stroke-width=".8"/></g>`;
  s += hebras(r, disco(r, 14, 30, 5), '#4f7d3a', 1.4, 3);
  return {
    svg: s,
    sh: `${circ(46)}<rect x="-52" y="-6" width="104" height="12" rx="6"/>`,
    R,
    vapor:
      `<g class="art-vapor" style="--v:1" opacity=".35" fill="none" stroke="${C.hoja}" stroke-width="2.2" stroke-linecap="round">` +
      `<path d="M-12 -28c-8-8 6-12-2-21"/><path d="M8 -30c-8-8 6-12-2-21"/></g>`,
  };
}

// 6 · Pan con tomate en tabla de madera ---------------------------------------------
export function panConTomate() {
  const r = rng(61);
  let s = '';
  s += `<rect x="-56" y="-35" width="112" height="70" rx="10" fill="#d9b886" stroke="#b8905a"/>`;
  s += `<circle cx="-47" cy="0" r="3.2" fill="#b8905a"/>`;
  s += `<g fill="none" stroke="#c39d68" stroke-width=".9" stroke-linecap="round"><path d="M-36 -29H40"/><path d="M-30 -22Q0 -24 44 -21"/><path d="M-34 26Q4 28 46 24"/><path d="M-26 32H36"/><path d="M-8 -6q14-3 30 0"/></g>`;
  const reb = (x, y, a) => {
    const f = 'M-15 -3C-17-12 -4-14 6-13C16-13 18-5 16 2C14 10 4 12 -6 11C-14 10 -15 4 -15 -3Z';
    return (
      `<g transform="${T(x, y, a, 1.2)}"><path d="${f}" fill="#241f1a" opacity=".12" transform="translate(1.2 1.8)"/><path d="${f}" fill="#bd7e36"/>` +
      `<path d="${f}" fill="#f2d99c" transform="scale(.86)"/>` +
      `<path d="M-9 -2C-9-8 -1-9 5-8C11-7 12-2 10 3C7 7 0 7 -5 6C-9 5 -9 1 -9 -2Z" fill="#e4623d"/>` +
      `<path d="M-6 -4C-3-6 3-6 6-4" fill="none" stroke="#f08a66" stroke-width="1.6" stroke-linecap="round"/>` +
      puntos([[-4, 2], [1, 0], [5, 2], [-1, 4]], '#f6df9c', 1.2) +
      puntos([[-12, 4], [12, -8], [9, 7]], '#c9983f', 1.5, ' stroke-opacity=".6"') +
      `<path d="M-4 -9L4 -9" stroke="#fff4c0" stroke-width="1" stroke-linecap="round" opacity=".8"/></g>`
    );
  };
  s += reb(-34, -14, -6) + reb(0, -17, 4) + reb(34, -13, -3) + reb(-18, 15, 6) + reb(16, 16, -5);
  // medio tomate
  s += `<g transform="translate(44 15)"><circle r="9.4" fill="#241f1a" opacity=".12" transform="translate(1.2 1.8)"/><circle r="9" fill="#d3402b"/><circle r="6.8" fill="#ee6a4a"/>${puntos([[-3, -2], [3, -2], [0, 3]], '#f6dca0', 2.2)}<circle r="1.1" fill="#f6e3c0"/></g>`;
  s += `<g transform="${T(-41, 26, -20)}"><path d="M0 0C-2-5 1-9 4-8C7-7 6-2 3 1C2 2 1 2 0 0Z" fill="#f2e8d2" stroke="#d6c9ac" stroke-width=".7"/></g>`;
  s += puntos(disco(r, 14, 46, 6).map(([x, y]) => [x * 1.1, y * 0.6]), '#fffdf8', 1.2);
  return { svg: s, sh: `<rect x="-56" y="-35" width="112" height="70" rx="10"/>`, R: 62 };
}

// 7 · Pescado a la plancha con limón ---------------------------------------------------
export function pescado() {
  let s = lozaOval(66, 46, { band: C.arcilla });
  const cuerpo = 'M-43 1C-38-16 -12-21 14-13C24-9 30-5 35-8L50-18L47 0L50 18L35 8C30 5 24 9 14 13C-12 21 -38 17 -43 1Z';
  s += `<path d="${cuerpo}" fill="#241f1a" opacity=".1" transform="translate(1.5 2.2)"/>`;
  s += `<path d="${cuerpo}" fill="#dcc592"/>`;
  s += `<path d="M-42 0C-37-15 -12-20 14-12C24-8 30-4 35-7C20-4 -4-9 -42 0Z" fill="#b48d55" opacity=".6"/>`;
  s += `<path d="M-40 6C-20 12 6 8 30 4C20 12 -6 18 -30 15Z" fill="#f2e6c8" opacity=".75"/>`;
  // aleta dorsal y cola
  s += `<path d="M-14 -17C-4 -22 10 -19 16 -12" fill="none" stroke="#9c7a45" stroke-width="1.2"/><path d="M38 -6L49 -14M38 0H46M38 6L49 14" stroke="#b08a55" stroke-width=".9"/>`;
  // marcas de la plancha
  s += `<g stroke="#5e3a20" stroke-width="2.4" stroke-linecap="round" opacity=".85"><path d="M-14 -13L-8 12"/><path d="M-2 -14L4 12"/><path d="M10 -12L16 10"/><path d="M22 -8L27 6"/></g>`;
  // cabeza
  s += `<path d="M-28 -9Q-23 0 -28 9" fill="none" stroke="#8a6a3e" stroke-width="1.2"/><circle cx="-34" cy="-3.5" r="3" fill="${C.hoja}"/><circle cx="-34.4" cy="-3.5" r="1.5" fill="#241f1a"/>`;
  s += puntos([[-5, 6], [18, -4], [28, 2]], '#fffdf8', 1.2, ' stroke-opacity=".7"');
  // limón: mitad y gajo
  s += `<g transform="translate(34 24)"><circle r="10.4" fill="#241f1a" opacity=".1" transform="translate(1 1.6)"/><circle r="10" fill="#f4e7a1"/><circle r="8.4" fill="${C.limon}"/><path d="M0 0L0 -7.5M0 0L7 -2.5M0 0L5 6M0 0L-5 6M0 0L-7 -2.5" stroke="${C.limonL}" stroke-width=".9"/></g>`;
  s += gajo(-26, 28, 12, 11);
  s += ramita(8, 28, 100, C.hojaV, 1) + ramita(-44, -24, -30, C.hojaV, 0.9);
  s += `<path d="M44 -26q4 2 6 7" fill="none" stroke="#f1cf5c" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>`;
  return { svg: s, sh: `<ellipse rx="66" ry="46"/>`, R: 62 };
}

// 8 · Croquetas ---------------------------------------------------------------------------
export function croquetas() {
  const R = 46;
  const r = rng(81);
  let s = loza(R, { band: C.vino });
  const cro = (x, y, a, k = 1) =>
    `<g transform="${T(x, y, a, k)}"><rect x="-11.4" y="-7.4" width="22.8" height="14.8" rx="7.2" fill="#241f1a" opacity=".12" transform="translate(1.2 1.8)"/>` +
    `<rect x="-11.4" y="-7.4" width="22.8" height="14.8" rx="7.2" fill="#b9771f"/><rect x="-10" y="-6.2" width="20" height="12" rx="6" fill="#d9962f"/>` +
    `<path d="M-6-4C-2-5.5 4-5.5 7-3" fill="none" stroke="#f0bb55" stroke-width="1.6" stroke-linecap="round"/>` +
    puntos([[-6, 2], [0, 3], [6, 1], [2, -1], [-3, -1]], '#a9701c', 1.1, ' stroke-opacity=".7"') + `</g>`;
  s += cro(-16, -15, -18) + cro(8, -19, 12) + cro(-26, 5, 24) + cro(0, -2, -35) + cro(23, -5, 40);
  s += cro(-8, 20, 5) + cro(16, 17, -20);
  // una croqueta abierta: se ve la bechamel
  s += `<g transform="${T(-26, 26, -30)}"><ellipse rx="9" ry="7" fill="#b9771f"/><ellipse rx="7.6" ry="5.7" fill="#f7ebbd"/>${puntos([[-3, -1], [2, 1], [0, -3.4], [4, -2]], '#e5cf8c', 1.3)}</g>`;
  s += gajo(32, 22, 30, 9) + ramita(30, -26, 40, C.hojaV, 0.9);
  return { svg: s, sh: circ(R), R };
}

// 9 · Verduras a la plancha ------------------------------------------------------------------
export function verduras() {
  const r = rng(91);
  let s = lozaOval(60, 46, { fill: '#cddacd', well: '#dde7dd', edge: '#a9bba9', band: '#fffdf8' });
  // espárragos
  s += `<g stroke="#7ba33f" stroke-width="4" stroke-linecap="round"><path d="M-34 -20L8 -26"/><path d="M-36 -13L10 -19"/><path d="M-34 -6L12 -12"/></g>`;
  s += `<g stroke="#4e7b34" stroke-width="4.6" stroke-linecap="round"><path d="M10 -26h2"/><path d="M12 -19h2"/><path d="M14 -12h2"/></g>`;
  // pimiento
  s += `<g fill="none" stroke="#c63a2b" stroke-width="5" stroke-linecap="round"><path d="M-26 8q14-10 34-3"/><path d="M-22 18q16-8 36-1"/></g>`;
  s += `<path d="M-14 5l3 1M2 7l3-1M10 14l3 1M-10 12l2 1" stroke="#5b2218" stroke-width="1.6" stroke-linecap="round"/>`;
  // calabacín
  const cal = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><ellipse rx="15" ry="6.6" fill="#8fb04a"/><ellipse rx="13.4" ry="5.2" fill="#d6e7a2"/>${puntos([[-6, 0], [-1, 1], [5, -1], [9, 1]], '#bfd57e', 1)}<path d="M-8-4L-5 4M0-4.6L3 4.6M8-4L10 3" stroke="#4b3a1f" stroke-width="1.8" stroke-linecap="round" opacity=".7"/></g>`;
  s += cal(30, 8, -14) + cal(24, 24, 8) + cal(34, -10, 24);
  // berenjena
  const ber = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><ellipse rx="11" ry="7.4" fill="#4b3144"/><ellipse rx="9.6" ry="6" fill="#d8c897"/>${puntos([[-3, -1], [2, 1], [4, -2]], '#bda96f', 1)}<path d="M-6-4L-3 4M1-5L4 5M7-3L8 3" stroke="#4b3a2a" stroke-width="1.6" stroke-linecap="round" opacity=".75"/></g>`;
  s += ber(-24, 28, 10) + ber(-6, 30, -6) + ber(-38, 20, 30);
  s += `<g stroke="#5d7a45" stroke-width="1.2" stroke-linecap="round" fill="none"><path d="M-6 -2L12 -8M0 -4l2 -4M4 -5l1 -4M8 -6l3 -3M-2 -2l-1-4"/></g>`;
  s += puntos(disco(r, 10, 38, 6).map(([x, y]) => [x * 1.4, y]), '#fffdf8', 1.2);
  return { svg: s, sh: `<ellipse rx="60" ry="46"/>`, R: 56 };
}

// 10 · Fruta: naranjas, peras y fresas ------------------------------------------------------------
export function fruta() {
  const R = 52;
  const r = rng(101);
  let s = loza(R, { fill: '#efe3cd', well: '#f7efe0', edge: '#d3c3a5', band: C.salvia });
  const naranja = (x, y, k = 1) =>
    `<g transform="translate(${x} ${y}) scale(${k})"><circle r="13.4" fill="#241f1a" opacity=".12" transform="translate(1.4 2)"/><circle r="13" fill="#ec8326"/><path d="M-9-7A11 11 0 0 1 3-11" fill="none" stroke="#f8b05a" stroke-width="2.2" stroke-linecap="round"/>${puntos(disco(r, 9, 9, 3.6), '#cd6a17', 1.1, ' stroke-opacity=".7"')}<circle cx="2" cy="2" r="1.8" fill="#7d4d1f"/><path d="M2 2c4-4 8-3 9-1c-3 3-7 3-9 1Z" fill="#5c8a38"/></g>`;
  s += naranja(-16, -12) + naranja(14, 16, 0.94);
  // media naranja
  s += `<g transform="translate(15 -18)"><circle r="11.4" fill="#241f1a" opacity=".12" transform="translate(1.2 1.8)"/><circle r="11" fill="#f9d98a"/><circle r="9.4" fill="#f4a237"/><path d="M0 0L0 -9.2M0 0L8 -4.6M0 0L8 4.6M0 0L0 9.2M0 0L-8 4.6M0 0L-8 -4.6" stroke="#fbe1a4" stroke-width=".9"/><circle r="1.2" fill="#fbe1a4"/></g>`;
  // peras
  const pera = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><path d="M-3-17C3-17 4-11 7-6C11 0 11 10 3 12C-4 14 -11 11 -10 3C-9-3 -5-6 -4-11C-4-14 -4-17 -3-17Z" fill="#241f1a" opacity=".12" transform="translate(1.4 2)"/><path d="M-3-17C3-17 4-11 7-6C11 0 11 10 3 12C-4 14 -11 11 -10 3C-9-3 -5-6 -4-11C-4-14 -4-17 -3-17Z" fill="#c9c457"/><path d="M3-9C8-3 9 6 3 10C5 4 5-3 3-9Z" fill="#e0a456" opacity=".75"/>${puntos([[-5, 4], [-1, 8], [-4, -2], [1, 2]], '#8d8a3a', 1, ' stroke-opacity=".7"')}<path d="M-3-17C-3-20 -1-22 1-23" stroke="#6a4a22" stroke-width="1.6" stroke-linecap="round" fill="none"/></g>`;
  s += pera(-30, 14, -50) + pera(0, 2, 70);
  // fresas
  const fresa = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><path d="M-6-6C-6-9 6-9 6-6C6 2 2 9 0 10C-2 9 -6 2 -6-6Z" fill="#241f1a" opacity=".12" transform="translate(1 1.6)"/><path d="M-6-6C-6-9 6-9 6-6C6 2 2 9 0 10C-2 9 -6 2 -6-6Z" fill="#d93a3f"/>${puntos([[-3, -2], [1, -3], [3, 1], [-1, 2], [0, 6], [-3, 3]], '#f4d97a', 1)}<path d="M-6-7L-2-5L0-9L2-5L6-7L3-4L-3-4Z" fill="#5c8a38"/></g>`;
  s += fresa(30, 6, 30) + fresa(4, 30, -20) + fresa(-6, -30, 160) + fresa(32, 28, 60) + fresa(-35, -14, 100);
  return { svg: s, sh: circ(R), R };
}

// 11 · Yogur con frutos rojos -----------------------------------------------------------------------
export function yogur() {
  const R = 40;
  const r = rng(111);
  let s = '';
  s += `<circle r="${R}" fill="${C.hoja}" stroke="${C.loza}"/>`;
  s += `<circle r="36.5" fill="none" stroke="${C.vino}" stroke-width="1.6"/>`;
  s += `<circle r="31" fill="#e9dfcd" stroke="#d6cbb7" stroke-width=".7"/>`;
  s += `<circle r="27" fill="#fbf5e6"/>`;
  s += `<path d="M-16 -4C-16 -14 8 -16 14 -6C18 2 6 10 -4 8" fill="none" stroke="#eee3cb" stroke-width="2.4" stroke-linecap="round"/>`;
  // miel
  s += `<path d="M-20 10C-12 4 -2 14 8 8C14 5 18 8 22 12" fill="none" stroke="#e0a93a" stroke-width="2.2" stroke-linecap="round"/><circle cx="22" cy="14" r="2" fill="#e0a93a"/>`;
  // frambuesas
  const fram = (x, y) => `<g transform="translate(${x} ${y})"><circle r="6.6" fill="#241f1a" opacity=".12" transform="translate(.8 1.2)"/>${puntos([[-3, -3], [0, -4], [3, -3], [-4, 0], [-1, 0], [2, 0], [4, 1], [-2, 3], [1, 3.4]], '#b8344b', 3.4)}${puntos([[-1, -3], [-2, 1], [2, 2]], '#e0627a', 1.4)}</g>`;
  s += fram(-8, -10) + fram(10, -2) + fram(-14, 8);
  // arándanos
  const ar = (x, y) => `<g transform="translate(${x} ${y})"><circle r="4.4" fill="#241f1a" opacity=".12" transform="translate(.8 1.2)"/><circle r="4.2" fill="#46507f"/><path d="M-1.6 -1.2l1.6-1.2l1.6 1.2l-.6 1.8h-2Z" fill="#2d3358"/><path d="M-3 -2A3.6 3.6 0 0 1 0 -3.6" stroke="#8d96c4" stroke-width=".9" fill="none" stroke-linecap="round"/></g>`;
  s += ar(4, -16) + ar(0, 2) + ar(16, -10) + ar(-4, 15) + ar(-20, -4);
  s += `<g transform="${T(12, 12, 40)}"><path d="M0 0C-3-5 1-9 5-9C6-5 4-1 0 0Z" fill="${C.hojaV}"/><path d="M0 0L4-7" stroke="#a9c777" stroke-width=".7"/></g>`;
  s += puntos(disco(r, 7, 22, 6), '#c9974a', 1.8);
  return { svg: s, sh: circ(R), R };
}

// 12 · Aceitunas y queso curado -------------------------------------------------------------------------
export function aceitunas() {
  const R = 46;
  let s = loza(R, { fill: '#ebdfc8', well: '#f4ebd9', edge: '#cdbd9f', band: C.arcilla });
  s += puntos([[-30, -10], [-20, 20], [10, -28], [26, 12], [30, -6], [-8, 28]], '#c9b895', 1.1);
  // tacos de queso curado, con su corteza
  const taco = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><rect x="-6.4" y="-6.4" width="12.8" height="12.8" rx="1.6" fill="${C.tinta}" opacity=".12" transform="translate(1 1.6)"/>` +
    `<rect x="-6.4" y="-6.4" width="12.8" height="12.8" rx="1.6" fill="#c19a45"/><rect x="-5.2" y="-5.2" width="10.4" height="10.4" rx="1" fill="#f1da92"/>` +
    puntos([[-2, -2], [2, 1], [-1, 3]], '#d9bb68', 1.5) + `</g>`;
  s += taco(-26, 12, 10) + taco(-14, 20, -14) + taco(-24, -4, 24) + taco(-8, 6, 40) + taco(-4, -10, -8) + taco(-14, -18, 18);
  // aceitunas con anchoa roja (pimiento) en un extremo
  const ac = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><ellipse rx="6.2" ry="4.6" fill="#241f1a" opacity=".12" transform="translate(.8 1.2)"/><ellipse rx="6" ry="4.4" fill="#7f9437"/><ellipse rx="4.6" ry="3" cy="-.4" fill="#a1b24a"/><circle cx="5" cy="0" r="1.7" fill="#d1402e"/><path d="M-3-2.4Q0-3.4 2-2.6" stroke="#d3de8a" stroke-width=".8" fill="none" stroke-linecap="round"/></g>`;
  s += ac(22, -6, 20) + ac(29, 7, 70) + ac(15, 5, -30) + ac(23, 19, 10) + ac(12, -20, -60) + ac(28, -19, 100) + ac(9, 26, 160);
  s += `<g transform="${T(32, 28, 40)}"><ellipse rx="5.4" ry="4" fill="#2f2a24"/><ellipse rx="3.4" ry="2.4" fill="#4a423a"/></g>`;
  s += ramita(-36, -20, -30, C.hojaV, 0.8);
  return { svg: s, sh: circ(R), R };
}

export const PLATOS = {
  paella,
  tortilla,
  ensalada,
  gazpacho,
  lentejas,
  'pan-con-tomate': panConTomate,
  pescado,
  croquetas,
  verduras,
  fruta,
  yogur,
  aceitunas,
};
