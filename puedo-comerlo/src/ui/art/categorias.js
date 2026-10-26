// Una ilustración por categoría de alimento (plato visto desde arriba, 160×160) para las
// pantallas de respuesta. Mismo estilo que la mesa: plano, sombras duras desplazadas, paleta de la app.
//
// Sin <style> dentro del SVG: las animaciones viven en ART_CSS (art-css.js) y se activan con la clase
// `art-anim` del <svg>. Los detalles vivos llevan `data-anim` = vapor | brillo | gota | destello.

import { C, n, T, puntos, loza, gajo, ramita } from './base.js';
import { mej, gamba, paella, ensalada, tortilla, fruta, gazpacho, lentejas, pescado, verduras } from './piezas.js';
import { tenedor, cuchillo, cuchara } from './extras.js';

const TINTA = C.tinta;
const BLANCO = C.hoja;
const STAR = 'M0-10C1-3 3-1 10 0C3 1 1 3 0 10C-1 3-3 1-10 0C-3-1-1-3 0-10Z';

// ---- detalles vivos (coordenadas del cuadro de 160, origen en el centro) -------------------------
const vapor = (x, y, v = 0, k = 1) =>
  `<g transform="${T(x, y, 0, k)}"><g data-anim="vapor" style="--v:${v}" opacity=".4" fill="none" stroke-linecap="round">` +
  `<path d="M0 0c-6-6 5-9-1-16M9 2c-6-6 5-9-1-16" stroke="${TINTA}" stroke-opacity=".16" stroke-width="3.8"/>` +
  `<path d="M0 0c-6-6 5-9-1-16M9 2c-6-6 5-9-1-16" stroke="${BLANCO}" stroke-width="2.2"/></g></g>`;
const brillo = (d, v = 0, w = 2.2) =>
  `<path data-anim="brillo" style="--v:${v}" d="${d}" fill="none" stroke="${BLANCO}" stroke-width="${w}" stroke-linecap="round" opacity=".6"/>`;
const chispa = (x, y, s = 1, v = 0) =>
  `<g transform="${T(x, y, 0, s)}"><g data-anim="destello" style="--v:${v}" opacity=".9"><path d="${STAR}" fill="${BLANCO}"/></g></g>`;
const gota = (x, y, col, v = 0) =>
  `<g transform="translate(${x} ${y})"><g data-anim="gota" style="--v:${v}" opacity=".95"><path d="M0-5C3-1 4 1 4 3A4 4 0 0 1-4 3C-4 1-3-1 0-5Z" fill="${col}"/><path d="M-1.6 2.4Q-1.6 .6-.4-.6" stroke="${BLANCO}" stroke-width="1" fill="none" stroke-linecap="round"/></g></g>`;

// ---- piezas pequeñas ---------------------------------------------------------------------------------
const patata = (x, y, a) =>
  `<g transform="${T(x, y, a)}"><path d="M-8 2C-9-5-2-8 6-6C11-4 10 4 6 6C0 8-7 7-8 2Z" fill="#c68a2c"/><path d="M-6 1C-6-4-1-6 5-4C8-3 7 2 4 3C-1 5-5 4-6 1Z" fill="#ebbf5e"/></g>`;
const limon = (x, y, R = 8) =>
  `<g transform="translate(${x} ${y})"><circle r="${R + 0.4}" fill="${TINTA}" opacity=".1" transform="translate(1 1.5)"/><circle r="${R}" fill="#f4e7a1"/><circle r="${R - 1.5}" fill="${C.limon}"/><path d="M0 0V${-R + 1.8}M0 0L${n(R * 0.7)} ${n(-R * 0.3)}M0 0L${n(R * 0.5)} ${n(R * 0.6)}M0 0L${n(-R * 0.5)} ${n(R * 0.6)}M0 0L${n(-R * 0.7)} ${n(-R * 0.3)}" stroke="${C.limonL}" stroke-width=".8"/></g>`;
const tabla = (R, handle = true) =>
  `<circle r="${R}" fill="#d9b886" stroke="#b8905a"/><circle r="${R - 4}" fill="none" stroke="#c9a470" stroke-width=".8"/>` +
  `<g fill="none" stroke="#c39d68" stroke-width=".9" stroke-linecap="round"><path d="M-38-20Q0-26 38-18"/><path d="M-44 6Q0 0 44 8"/><path d="M-36 30Q0 24 36 32"/></g>` +
  (handle ? `<rect x="-9" y="${-R - 8}" width="18" height="12" rx="6" fill="#d9b886" stroke="#b8905a"/><circle cy="${-R - 2}" r="2.6" fill="#b8905a"/>` : '');

// ---- las piezas: { svg, sh, k, extra } ------------------------------------------------------------------
// svg y sh en unidades propias del dibujo (se escalan con k); extra en coordenadas del cuadro de 160.

function carne() {
  const fil = 'M-30-6C-33-20-16-30 2-27C18-25 32-17 33-3C34 10 22 22 6 24C-10 26-27 16-30-6Z';
  let s = loza(56, { band: C.arcilla });
  s +=
    `<g transform="translate(-7 -7) rotate(-14)"><path d="${fil}" fill="${TINTA}" opacity=".14" transform="translate(1.5 2.2)"/>` +
    `<path d="${fil}" fill="#4f2616"/><path d="${fil}" fill="#7d4126" transform="scale(.9)"/>` +
    `<path d="M-22-12L-9 10M-9-17L4 8M5-17L18 6M17-11L26 3" stroke="#3a1c10" stroke-width="2.8" stroke-linecap="round"/>` +
    `<path d="M-26 9C-16 22 6 25 22 18" fill="none" stroke="#ead2a6" stroke-width="2.2" stroke-linecap="round"/>` +
    puntos([[-14, 0], [2, -8], [12, 8], [-2, 12]], BLANCO, 1.1) +
    brillo('M-22-18Q-8-26 10-23', 0) + `</g>`;
  s += patata(24, 24, 20) + patata(36, 12, -30) + patata(14, 36, 70);
  s += `<g fill="none" stroke="#5f8f2f" stroke-width="4.6" stroke-linecap="round"><path d="M-42 26Q-32 40-12 40"/><path d="M-44 14Q-38 24-28 26"/></g>`;
  s += puntos([[-38, 36], [-26, 37], [-40, 22]], '#2f4d1a', 1.4) + ramita(34, -30, 40, C.hojaV, 0.9);
  return { svg: s, sh: `<circle r="56"/>`, k: 1.18, extra: vapor(-10, -52, 0, 0.9) };
}

function ave() {
  let s = loza(58, { band: C.vino });
  const ala = (x, y, a) => `<ellipse rx="10" ry="5.4" fill="#a85b1c" transform="${T(x, y, a)}"/>`;
  s +=
    `<g transform="translate(-6 -3) rotate(-18)">` +
    `<g fill="${TINTA}" opacity=".14" transform="translate(1.6 2.4)"><ellipse rx="28" ry="20"/><ellipse cx="32" cy="-9" rx="12" ry="7"/><ellipse cx="32" cy="9" rx="12" ry="7"/></g>` +
    ala(-16, -17, -30) + ala(-16, 17, 30) +
    `<ellipse cx="31" cy="-10" rx="12" ry="7" fill="#b8651f" transform="rotate(-14 31 -10)"/><ellipse cx="31" cy="10" rx="12" ry="7" fill="#b8651f" transform="rotate(14 31 10)"/>` +
    `<g fill="#f3e6cc"><circle cx="43" cy="-14" r="2.8"/><circle cx="46" cy="-11" r="2.4"/><circle cx="43" cy="14" r="2.8"/><circle cx="46" cy="11" r="2.4"/></g>` +
    `<ellipse rx="28" ry="20" fill="#b3631d"/><ellipse rx="25.5" ry="17.5" fill="#d38f3a"/><ellipse cx="-3" cy="-3" rx="15" ry="9" fill="#e6af58" opacity=".85"/>` +
    puntos([[-14, 4], [-6, 9], [6, 6], [10, -4], [-10, -12], [8, 12], [16, 2]], '#8f4e17', 1.7, ' stroke-opacity=".7"') +
    brillo('M-18-8Q-6-16 8-13', 0) + `</g>`;
  s += patata(-30, 28, 10) + patata(-18, 38, -20) + patata(-42, 14, 50) + patata(8, 38, 40);
  s += limon(34, -32, 9) + ramita(38, 20, 120, C.hojaV, 1) + ramita(-40, -30, -40, C.hojaV, 0.9);
  return { svg: s, sh: `<circle r="58"/>`, k: 1.14, extra: vapor(-8, -56, 0, 0.9) };
}

function marisco() {
  let s = loza(56, { fill: '#cddacd', well: '#dde7dd', edge: '#a9bba9', band: BLANCO });
  s += mej(-36, 12, 20, 1.2) + mej(30, 30, -30, 1.2) + mej(38, -6, 80, 1.15) + mej(-4, -38, 5, 1.15) + mej(-36, -18, -40, 1.1);
  s += gamba(-14, -10, 15, 1.3) + gamba(16, 4, -30, 1.25) + gamba(-8, 24, 170, 1.2);
  s += gajo(-2, 40, 8, 11) + gajo(40, -30, 60, 9) + ramita(-40, 28, -120, C.hojaV, 1) + ramita(8, 26, 70, C.hojaV, 0.9);
  return { svg: s, sh: `<circle r="56"/>`, k: 1.16, extra: vapor(-6, -54, 0, 0.9) };
}

function pescadoCat() {
  const p = pescado();
  return {
    svg: p.svg,
    sh: p.sh,
    k: 1.04,
    extra: brillo('M-34-22Q-14-30 6-25', 0, 2.4) + chispa(30, 30, 0.5, 1) + vapor(-8, -50, 0, 0.9),
  };
}

function verdura() {
  const p = verduras();
  return { svg: p.svg, sh: p.sh, k: 1.12, extra: brillo('M-34 8Q-20-2 4 3', 0, 2.2) + chispa(36, -6, 0.5, 1) + vapor(0, -52, 0, 0.9) };
}

function ensaladaCat() {
  const p = ensalada({ ligera: true });
  return { svg: p.svg, sh: p.sh, k: 1.17, extra: chispa(22, -26, 0.55, 0) + gota(-26, -14, '#f1cf5c', 1) };
}

function frutaCat() {
  const p = fruta();
  return { svg: p.svg, sh: p.sh, k: 1.25, extra: chispa(-26, -38, 0.6, 0) + chispa(34, 22, 0.45, 1.4) };
}

function queso() {
  let s = tabla(56);
  const cuña = (x, y, a, k, c) =>
    `<g transform="${T(x, y, a, k)}"><path d="M0 0L-17-34Q0-40 17-34Z" fill="${TINTA}" opacity=".12" transform="translate(1.4 2)"/>` +
    `<path d="M0 0L-17-34Q0-40 17-34Z" fill="${c}"/><path d="M-17-34Q0-40 17-34L16-31Q0-36-16-31Z" fill="#b98a3c"/>` +
    puntos([[-4, -18], [4, -24], [0, -11], [8, -15]], '#d3b25c', 1.8) + `</g>`;
  s += cuña(10, 32, -52, 1.2, '#f0d68a') + cuña(30, 4, 34, 0.86, '#e6c36a');
  const taco = (x, y, a) => `<g transform="${T(x, y, a)}"><rect x="-6" y="-6" width="12" height="12" rx="1.6" fill="#b98a3c"/><rect x="-4.8" y="-4.8" width="9.6" height="9.6" rx="1" fill="#f1da92"/>${puntos([[-1, -1], [2, 2]], '#d3b25c', 1.4)}</g>`;
  s += taco(-4, -8, 12) + taco(8, -16, -14) + taco(-10, 6, 30);
  // membrillo
  s +=
    `<g transform="${T(-28, -26, -10)}"><rect x="-13" y="-8" width="26" height="16" rx="3" fill="${TINTA}" opacity=".12" transform="translate(1 1.6)"/><rect x="-13" y="-8" width="26" height="16" rx="3" fill="#a9521f"/>` +
    `<rect x="-11.4" y="-6.6" width="22.8" height="13.2" rx="2" fill="#c06a2d"/><path d="M-8-3.6H5" stroke="#e3a366" stroke-width="1.6" stroke-linecap="round"/></g>`;
  // uvas
  const uva = (x, y, c) => `<circle cx="${x}" cy="${y}" r="4.7" fill="${c}"/><path d="M${x - 2.6} ${y - 1.4}Q${x - 1} ${y - 3} ${x + 1} ${y - 3}" stroke="${BLANCO}" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>`;
  s +=
    `<g transform="translate(30 34) scale(1.1)">` +
    [[-8, -6], [0, -8], [8, -6], [-4, 0], [4, 0], [0, 7], [-10, 3], [10, 3], [-5, 8]].map(([x, y], i) => uva(x, y, i % 3 === 0 ? '#6a8b3a' : '#5b3a63')).join('') +
    `<path d="M0-12C-3-16-8-17-10-14C-6-12-3-12 0-12Z" fill="${C.hojaV}"/></g>`;
  return { svg: s, sh: `<circle r="56"/><rect x="-9" y="-64" width="18" height="12" rx="6"/>`, k: 1.12, extra: brillo('M16 20Q22 15 28 17', 0, 1.8) + chispa(34, 38, 0.4, 1) };
}

function huevo() {
  const p = tortilla();
  return { svg: p.svg, sh: p.sh, k: 1.22, extra: brillo('M-26-26Q-6-38 16-32', 0, 2.4) + vapor(-8, -56, 0, 0.9) };
}

function pan() {
  let s = tabla(58);
  s +=
    `<g transform="${T(-6, -16, -26)}"><rect x="-42" y="-8" width="84" height="16" rx="8" fill="${TINTA}" opacity=".13" transform="translate(1.5 2.4)"/><rect x="-42" y="-8" width="84" height="16" rx="8" fill="#c98539"/><rect x="-40" y="-7" width="80" height="10" rx="5" fill="#dca04c"/>` +
    `<path d="M-28-6L-24 5M-15-6L-11 5M-2-6L2 5M11-6L15 5M24-6L28 5" stroke="#f3d28f" stroke-width="2.6" stroke-linecap="round"/>` +
    puntos([[-30, 3], [-6, 4], [18, 3], [30, 2]], '#fff2cf', 1.1) + `</g>`;
  const tost = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><rect x="-14" y="-11" width="28" height="22" rx="7" fill="${TINTA}" opacity=".13" transform="translate(1.2 2)"/><rect x="-14" y="-11" width="28" height="22" rx="7" fill="#b9772f"/><rect x="-12" y="-9.2" width="24" height="18.4" rx="5.5" fill="#e6b966"/>` +
    `<path d="M-8-2C-8-6-2-7 3-6C8-5 9-1 7 3C4 6-3 6-6 4C-8 3-8 0-8-2Z" fill="#d9482c" opacity=".85"/>` + puntos([[-3, 0], [3, -1], [0, 3]], '#f3d49a', 1.2) + `</g>`;
  s += tost(14, 20, 10) + tost(-14, 30, -8) + tost(38, 4, 24);
  s += `<g transform="translate(-36 18)"><circle r="14" fill="${TINTA}" opacity=".12" transform="translate(1.4 2)"/><circle r="13" fill="${BLANCO}" stroke="${C.loza}"/><circle r="9.6" fill="#d9b43a"/><circle r="9.6" fill="none" stroke="#b8932a" stroke-width=".8"/></g>`;
  return { svg: s, sh: `<circle r="58"/><rect x="-9" y="-66" width="18" height="12" rx="6"/>`, k: 1.1, extra: brillo('M-41 14Q-36 10-30 11', 1, 2) + chispa(-36, 6, 0.4, 0.6) };
}

function pasta() {
  let s = loza(56, { band: C.salvia });
  const h = (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  s +=
    `<ellipse cx="1.5" cy="2.5" rx="32" ry="26" fill="${TINTA}" opacity=".12"/>` +
    h('M-28 2C-28-20 26-24 29 0C31 20-20 26-28 6', '#dcb55c', 4) +
    h('M-22 4C-22-14 20-18 23 0C25 15-16 20-22 6', '#efd28a', 4) +
    h('M-16 4C-15-9 14-12 16 1C18 12-9 14-15 4', '#e3bf6b', 4) +
    h('M-9 2C-9-5 8-7 10 1C11 7-5 8-9 2', '#f2d68e', 4) +
    h('M-30-6C-20-26 16-30 28-12M24 22C10 30-14 28-26 16', '#efd28a', 2.6) +
    `<path d="M-12-8C-4-17 12-15 14-5C16 4 2 10-8 6C-16 3-16-4-12-8Z" fill="#c9392a"/><path d="M-8-8C-2-13 8-12 10-6" fill="none" stroke="#e5694c" stroke-width="2.2" stroke-linecap="round"/>` +
    puntos([[-6, 0], [4, -2], [0, 4], [8, 2]], '#8f2418', 1.6) + puntos([[-14, -14], [18, 4], [-2, 18], [12, -16]], '#f6e8c8', 1.6);
  const alb = (x, y, a) => `<g transform="${T(x, y, a)}"><path d="M0 0C-3-5 0-10 5-10C8-6 6-1 0 0Z" fill="${C.hojaV}"/><path d="M0 0L4-8" stroke="#a9c777" stroke-width=".8"/></g>`;
  s += alb(-2, -2, -10) + alb(8, 6, 120);
  return { svg: s, sh: `<circle r="56"/>`, k: 1.17, extra: vapor(0, -54, 0, 0.9) + brillo('M-12-12Q-2-18 8-14', 1, 2) };
}

function arroz() {
  const p = paella({ ligera: true });
  return { svg: p.svg, sh: p.sh, k: 0.78, extra: vapor(-6, -58, 0, 0.9) + chispa(20, 10, 0.4, 1) };
}

function cuenco() {
  const p = gazpacho();
  return { svg: p.svg, sh: p.sh, k: 1.42, extra: brillo('M-24-18Q-8-30 14-24', 0, 2.2) + gota(2, 4, '#f1cf5c', 0.6) };
}

function legumbres() {
  const p = lentejas();
  return { svg: p.svg, sh: p.sh, k: 1.2, extra: vapor(6, -54, 1, 0.9) };
}

function postre() {
  let s = loza(54, { band: C.vino });
  s +=
    `<path d="M-34 2C-34-18-14-34 4-33C26-32 36-14 33 6C30 26 8 35-10 32C-26 29-34 18-34 2Z" fill="#9c4a15" opacity=".6"/>` +
    `<circle cx="-1" cy="0" r="27" fill="${TINTA}" opacity=".12" transform="translate(1.6 2.4)"/><circle cx="-1" cy="0" r="27" fill="#b4601e"/><circle cx="-1" cy="0" r="21.5" fill="#c9772a"/>` +
    `<path d="M-18-8A19 19 0 0 1 -2-19" fill="none" stroke="#f2b663" stroke-width="3" stroke-linecap="round"/>` +
    puntos([[-30, 22], [34, 22], [28, -26]], '#9c4a15', 3);
  s += `<g transform="${T(40, 18, 38, 1.15)}"><g fill="${TINTA}" opacity=".14" transform="translate(1.6 2.4)">${cuchara().replace(/(fill|stroke)="[^"]*"/g, '')}</g>${cuchara()}</g>`;
  s += `<g transform="${T(-28, -28, -30)}"><path d="M0 0C-3-6 1-11 6-10C8-5 5-1 0 0Z" fill="${C.hojaV}"/><path d="M0 0L5-8" stroke="#a9c777" stroke-width=".8"/></g>`;
  return { svg: s, sh: `<circle r="54"/>`, k: 1.2, extra: brillo('M-24-14Q-12-26 2-25', 0, 2.6) + gota(32, 8, '#9c4a15', 0.8) + chispa(-14, -20, 0.45, 1.2) };
}

function bebida() {
  let s = `<circle r="64" fill="#c9a06a" stroke="#a97f4a"/><circle r="58" fill="#dcb98a"/><circle r="58" fill="none" stroke="#c39d68" stroke-width=".9"/>`;
  const pl = `<circle cx="-14" cy="-8" r="31"/>`;
  s += `<g fill="${TINTA}" opacity=".13" transform="translate(2.4 3.6)">${pl}<circle cx="-14" cy="-8" r="21"/><circle cx="32" cy="30" r="17"/></g>`;
  s +=
    `<circle cx="-14" cy="-8" r="30" fill="${BLANCO}" stroke="${C.loza}"/><circle cx="-14" cy="-8" r="25" fill="#f6f1e6" stroke="${C.loza}" stroke-opacity=".6" stroke-width=".7"/>` +
    `<path d="M5-12Q18-12 18-1Q18 10 5 10" fill="none" stroke="${C.loza}" stroke-width="6" stroke-linecap="round"/><path d="M5-12Q18-12 18-1Q18 10 5 10" fill="none" stroke="${BLANCO}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="-14" cy="-8" r="20" fill="${BLANCO}" stroke="${C.loza}"/><circle cx="-14" cy="-8" r="16.4" fill="#4a2a1a"/><circle cx="-14" cy="-8" r="14" fill="#7a4a2a"/><circle cx="-15" cy="-9" r="9" fill="#8d5a34"/>` +
    `<path d="M-23-14A12 12 0 0 1 -14-19" fill="none" stroke="#c89a63" stroke-width="1.8" stroke-linecap="round"/>` +
    `<g transform="${T(-34, 22, 62, 0.62)}">${cuchara()}</g>`;
  s +=
    `<circle cx="32" cy="30" r="17" fill="#dbeae6" stroke="#a8c4be" stroke-width="1.5"/><circle cx="32" cy="30" r="13.4" fill="#c7dfda"/><circle cx="36" cy="33" r="3.4" fill="${BLANCO}" opacity=".5"/>` +
    `<g transform="translate(32 30)"><g transform="rotate(20)"><rect x="-4" y="-4" width="8" height="8" rx="1.8" fill="${BLANCO}" opacity=".55"/></g></g>`;
  return {
    svg: s,
    sh: `<circle r="64"/>`,
    k: 1.1,
    extra: vapor(-24, -50, 0, 1) + brillo('M14 18Q18 12 26 11', 0, 2) + chispa(44, 18, 0.45, 1),
  };
}

function embutido() {
  let s = tabla(58);
  const ch = (x, y) => `<g transform="translate(${x} ${y})"><circle r="9.4" fill="${TINTA}" opacity=".13" transform="translate(1.2 1.8)"/><circle r="9" fill="#7d2b1c"/><circle r="7.8" fill="#a63f2b"/>${puntos([[-3, -2], [2, -3], [3, 2], [-2, 3], [0, 0]], '#f1c9a2', 1.6)}</g>`;
  const sa = (x, y) => `<g transform="translate(${x} ${y})"><circle r="10.4" fill="${TINTA}" opacity=".13" transform="translate(1.2 1.8)"/><circle r="10" fill="#9c5448"/><circle r="8.8" fill="#c37b6c"/>${puntos([[-3, -3], [3, -2], [4, 3], [-3, 3], [0, 0]], '#f3d9cf', 1.8)}</g>`;
  s += ch(-32, -22) + ch(-14, -34) + ch(8, -34) + ch(28, -26) + ch(40, -8);
  s += sa(-36, 0) + sa(-20, -12) + sa(34, 12);
  const jam = (x, y, a) =>
    `<g transform="${T(x, y, a)}"><ellipse rx="17" ry="9" fill="${TINTA}" opacity=".13" transform="translate(1.2 2)"/><ellipse rx="17" ry="9" fill="#f3d6c8"/><ellipse rx="15" ry="7.6" fill="#d9807a"/><path d="M-10 0C-4-4 4 4 10 0" fill="none" stroke="#ef9f98" stroke-width="2.2" stroke-linecap="round"/></g>`;
  s += jam(-18, 20, -12) + jam(4, 8, 8) + jam(-4, 32, 6);
  const pn = (x, y, a) => `<g transform="${T(x, y, a)}"><rect x="-10" y="-9" width="20" height="18" rx="6" fill="#c98a3a"/><rect x="-8.2" y="-7.4" width="16.4" height="14.8" rx="4.6" fill="#f4dfa8"/>${puntos([[-3, -1], [2, 2], [3, -3]], '#e3c47d', 1.2)}</g>`;
  s += pn(26, 30, 14) + pn(40, 40, -10);
  return { svg: s, sh: `<circle r="58"/><rect x="-9" y="-66" width="18" height="12" rx="6"/>`, k: 1.1, extra: brillo('M-36-28Q-26-34-18-31', 0, 2) + brillo('M-26 14Q-14 10-2 12', 1.2, 2) };
}

function generico() {
  let s = loza(46, { band: C.salvia });
  s += `<g transform="translate(0 0)">`;
  const tom = (x, y, a) => `<g transform="${T(x, y, a)}"><circle r="11" fill="${TINTA}" opacity=".12" transform="translate(1 1.6)"/><circle r="11" fill="${C.tomate}"/><circle r="8.6" fill="${C.tomateL}"/>${puntos([[-3, -2], [3, -2], [0, 3], [-4, 3], [4, 3]], '#f8e3a6', 1.6)}<circle r="1.4" fill="#f6e3c0"/></g>`;
  s += tom(-12, -10, 0) + tom(11, -4, 0) + tom(-2, 14, 0);
  s += `<path d="M-6-22C-12-26-6-34 0-30C4-26 0-22-6-22Z" fill="${C.hojaV}" transform="translate(6 12) scale(.8)"/>`;
  s += puntos([[-20, 8], [18, 14], [12, -18], [-18, -20]], '#f1cf5c', 2.6) + puntos([[-6, -2], [4, 6], [8, -12]], BLANCO, 1.2);
  s += `</g>`;
  return {
    svg: s,
    sh: `<circle r="46"/>`,
    k: 1.18,
    extra:
      `<g transform="translate(-66 0) scale(1.3)"><g fill="${TINTA}" opacity=".13" transform="translate(1.4 2)">${tenedor().replace(/(fill|stroke)="[^"]*"/g, '')}</g>${tenedor()}</g>` +
      `<g transform="translate(66 0) scale(1.3)"><g fill="${TINTA}" opacity=".13" transform="translate(1.4 2)">${cuchillo().replace(/(fill|stroke)="[^"]*"/g, '')}</g>${cuchillo()}</g>` +
      brillo('M-22-22Q-10-30 4-26', 0, 2) + chispa(26, -28, 0.5, 1),
  };
}

const PIEZAS = {
  carne,
  ave,
  pescado: pescadoCat,
  marisco,
  verdura,
  ensalada: ensaladaCat,
  fruta: frutaCat,
  queso,
  huevo,
  pan,
  pasta,
  arroz,
  cuenco,
  legumbres,
  postre,
  bebida,
  embutido,
  generico,
};

export const CATEGORIAS = Object.keys(PIEZAS);

const ARIA = {
  carne: 'Plato de carne a la plancha',
  ave: 'Plato de pollo asado',
  pescado: 'Plato de pescado a la plancha con limón',
  marisco: 'Plato de gambas y mejillones',
  verdura: 'Plato de verduras a la plancha',
  ensalada: 'Plato de ensalada',
  fruta: 'Plato de fruta',
  queso: 'Tabla de quesos curados con uvas',
  huevo: 'Plato de tortilla',
  pan: 'Tabla con pan y tostadas',
  pasta: 'Plato de pasta',
  arroz: 'Paella',
  cuenco: 'Cuenco de sopa',
  legumbres: 'Cazuela de lentejas',
  postre: 'Plato de flan',
  bebida: 'Taza de café y vaso de agua',
  embutido: 'Tabla de fiambres con pan',
  generico: 'Plato con cubiertos',
};

// categoriaSvg(id, { decorativa = true, animada = true })
// Con animada, el <svg> lleva la clase art-anim y los detalles [data-anim] se mueven (ver art-css.js).
export function categoriaSvg(id, { decorativa = true, animada = true } = {}) {
  const clave = PIEZAS[id] ? id : 'generico';
  const p = PIEZAS[clave]();
  const a11y = decorativa ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${ARIA[clave]}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="art-cat${animada ? ' art-anim' : ''}" data-cat="${clave}" viewBox="0 0 160 160" ${a11y}>` +
    `<g class="art-pop"><g transform="translate(80 80)">` +
    `<g transform="scale(${p.k})"><g fill="${TINTA}" opacity=".13" transform="translate(${n(2.6 / p.k)} ${n(3.8 / p.k)})">${p.sh}</g>${p.svg}</g>` +
    `${p.extra || ''}</g></g></svg>`
  );
}
