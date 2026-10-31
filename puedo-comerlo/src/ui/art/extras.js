// Lo que acompaña a los platos: cubiertos, servilleta, jarra, vaso, aceitera, cesta de pan
// y el mantel. Todo vista cenital, centrado en (0,0) salvo el mantel.

import { C, n, rng, T, disco, puntos, hebras } from './base.js';

// Cubiertos de acero apuntando hacia arriba (y negativa), largo ~48.
export function tenedor() {
  return (
    `<g><path d="M-5.1-24H-3.3V-15H-2.3V-24H-.5V-15H.5V-24H2.3V-15H3.3V-24H5.1V-13C5.1-8 2.2-6.5 2.2-2V22Q0 25-2.2 22V-2C-2.2-6.5-5.1-8-5.1-13Z" fill="${C.acero}" stroke="${C.aceroL}" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M0-4V21" stroke="${C.hoja}" stroke-width=".9" stroke-linecap="round"/></g>`
  );
}
export function cuchillo() {
  return (
    `<g><path d="M-2.8-26C4-26 5.2-10 3.4-3H-2.8Z" fill="${C.acero}" stroke="${C.aceroL}" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M-2.8-3H3.4V22Q.3 25 -2.8 22Z" fill="#e1dbcf" stroke="${C.aceroL}" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M-1-22C1-18 1.6-10 1.2-5" stroke="${C.hoja}" stroke-width=".9" stroke-linecap="round" fill="none"/></g>`
  );
}
export function cuchara() {
  return (
    `<g><ellipse cy="-15" rx="6.2" ry="8.6" fill="${C.acero}" stroke="${C.aceroL}" stroke-width=".8"/>` +
    `<path d="M-2.2-5.6H2.2L1.6 22Q0 24.4 -1.6 22Z" fill="${C.acero}" stroke="${C.aceroL}" stroke-width=".8" stroke-linejoin="round"/>` +
    `<ellipse cx="-1.6" cy="-17" rx="2" ry="4.6" fill="${C.hoja}" opacity=".7"/></g>`
  );
}
// Un cubierto con su sombra desplazada (la sombra va hacia abajo a la derecha en el mundo).
export function cubierto(tipo, x, y, rot, k = 1) {
  const f = { tenedor, cuchillo, cuchara }[tipo]();
  return (
    `<g transform="translate(${n(x)} ${n(y)})"><g fill="${C.tinta}" opacity=".16" transform="translate(2 3) rotate(${n(rot)}) scale(${k})">${f.replace(/fill="[^"]*"/g, '').replace(/stroke="[^"]*"/g, '')}</g>` +
    `<g transform="rotate(${n(rot)}) scale(${k})">${f}</g></g>`
  );
}

// Servilleta de lino doblada, con dos rayas de salvia.
export function servilleta(x, y, rot) {
  return (
    `<g transform="${T(x, y, rot)}"><rect x="-27" y="-20" width="54" height="40" rx="2.5" fill="${C.tinta}" opacity=".14" transform="translate(2.4 3.4)"/>` +
    `<rect x="-27" y="-20" width="54" height="40" rx="2.5" fill="#e4ebe2" stroke="#b9c9bb" stroke-width=".8"/>` +
    `<rect x="-27" y="-20" width="54" height="19" rx="2.5" fill="#f3f6f0"/>` +
    `<path d="M-27 -1H27" stroke="#b9c9bb" stroke-width=".9"/>` +
    `<path d="M-22-15H22M-22-12.4H22" stroke="${C.salvia}" stroke-width="1" stroke-opacity=".75"/><path d="M-22 13H22M-22 15.6H22" stroke="${C.salvia}" stroke-width="1" stroke-opacity=".75"/></g>`
  );
}

// Jarra de agua con rodajas de limón (hielo y asa).
export function jarra(x, y, rot = 0) {
  return (
    `<g transform="${T(x, y, rot)}"><g fill="${C.tinta}" opacity=".12" transform="translate(2.4 3.6)"><circle r="23"/><circle cx="31" r="9"/></g>` +
    `<circle cx="31" r="8.6" fill="none" stroke="#a8c4be" stroke-width="3"/>` +
    `<path d="M-21-6Q-30 0 -21 6Z" fill="#dbeae6" stroke="#a8c4be" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<circle r="22" fill="#dbeae6" stroke="#a8c4be" stroke-width="1.6"/><circle r="18.4" fill="#c7dfda"/>` +
    `<g transform="translate(-4 3)"><circle r="8.6" fill="#f4e7a1"/><circle r="7.2" fill="${C.limon}"/><path d="M0 0V-6M0 0L5.5-2.4M0 0L4 5M0 0L-4 5M0 0L-5.5-2.4" stroke="${C.limonL}" stroke-width=".8"/></g>` +
    `<g transform="translate(8 -8) rotate(25)"><rect x="-3.6" y="-3.6" width="7.2" height="7.2" rx="1.6" fill="#fffdf8" opacity=".6"/></g>` +
    `<path d="M-14-10A17 17 0 0 1 2-17" fill="none" stroke="#fffdf8" stroke-width="2" stroke-linecap="round" opacity=".85"/></g>`
  );
}

export function vaso(x, y) {
  return (
    `<g transform="translate(${x} ${y})"><circle r="13" fill="${C.tinta}" opacity=".12" transform="translate(2 3)"/>` +
    `<circle r="12.6" fill="#dbeae6" stroke="#a8c4be" stroke-width="1.4"/><circle r="9.4" fill="#c7dfda"/>` +
    `<path d="M-7-5A9 9 0 0 1 0-9" fill="none" stroke="#fffdf8" stroke-width="1.8" stroke-linecap="round"/>` +
    `<circle cx="3.4" cy="3" r="3" fill="#fffdf8" opacity=".5"/></g>`
  );
}

export function aceitera(x, y) {
  return (
    `<g transform="translate(${x} ${y})"><circle r="11" fill="${C.tinta}" opacity=".14" transform="translate(2 3)"/>` +
    `<circle r="10.6" fill="#4f6b36"/><circle r="8.2" fill="#5f7f42"/><circle r="4.4" fill="#3e5629"/><circle r="2.8" fill="${C.mostaza}"/>` +
    `<path d="M-7-4A8 8 0 0 1 -2-8" fill="none" stroke="#cfe0a8" stroke-width="1.6" stroke-linecap="round"/></g>`
  );
}

// Cesta de pan con una barra, un panecillo y dos rebanadas.
export function cesta(x, y, rot = 0) {
  const r = rng(5);
  return (
    `<g transform="${T(x, y, rot)}"><ellipse rx="52" ry="31" fill="${C.tinta}" opacity=".13" transform="translate(3 4.4)"/>` +
    `<ellipse rx="52" ry="31" fill="#b98b52"/><ellipse rx="52" ry="31" fill="url(#art-mimbre)"/><ellipse rx="52" ry="31" fill="none" stroke="#8f6a38" stroke-width="1.2"/>` +
    `<ellipse rx="44" ry="23.6" fill="#8f6a38" opacity=".55"/>` +
    `<ellipse rx="42.6" ry="22.2" fill="#efe3c8"/><path d="M-36-12C-12-17 16-17 36-12M-40-4C-14-9 16-9 40-4" stroke="${C.salvia}" stroke-opacity=".5" stroke-width="1" fill="none"/>` +
    // barra
    `<g transform="rotate(-9)"><rect x="-37" y="-8" width="74" height="16" rx="8" fill="#241f1a" opacity=".13" transform="translate(1 2)"/><rect x="-37" y="-8" width="74" height="16" rx="8" fill="#c98539"/><rect x="-35" y="-7" width="70" height="10" rx="5" fill="#dca04c"/>` +
    `<path d="M-26-6L-22 5M-14-6L-10 5M-2-6L2 5M10-6L14 5M22-6L26 5" stroke="#f3d28f" stroke-width="2.6" stroke-linecap="round"/>` +
    puntos(disco(r, 14, 30, 5).map(([a, b]) => [a * 1.15, b * 0.22]), '#fff2cf', 1.1, ' stroke-opacity=".8"') + `</g>` +
    // rebanadas
    `<g transform="translate(16 12) rotate(14)"><rect x="-9" y="-7" width="18" height="14" rx="5" fill="#bd7e36"/><rect x="-7.4" y="-5.6" width="14.8" height="11.2" rx="4" fill="#f4dfa8"/>${puntos([[-3, -1], [2, 2], [3, -2]], '#e3c47d', 1.2)}</g>` +
    `<g transform="translate(-14 11) rotate(-8)"><rect x="-9" y="-7" width="18" height="14" rx="5" fill="#bd7e36"/><rect x="-7.4" y="-5.6" width="14.8" height="11.2" rx="4" fill="#f4dfa8"/>${puntos([[-3, 1], [2, -2], [3, 2]], '#e3c47d', 1.2)}</g>` +
    `</g>`
  );
}

// Perfil de mujer embarazada en trazo continuo, mirando a la derecha. Caja ~ x -14…30, y -52…52.
function perfil(color, w) {
  const l = `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  return (
    // cabeza y moño
    `<circle cx="2" cy="-44" r="6" ${l}/><path d="M-4-47C-9-50-8-41-5-40" ${l}/>` +
    // espalda (con la curva lumbar) y vestido
    `<path d="M0-38C-1-34-2-32-5-30C-10-27-12-20-12-12C-12-6-10-2-11 3C-12 9-14 13-14 20L-17 44" ${l}/>` +
    // pecho, vientre y falda
    `<path d="M5-38C5-35 6-33 9-30C13-26 12-22 13-19C24-14 30-2 25 10C22 17 14 20 9 21C8 27 10 36 13 44" ${l}/>` +
    `<path d="M-17 44Q-2 47 13 44" ${l}/>` +
    // brazo sobre el vientre
    `<path d="M-4-30C-6-22-6-12-1-6C5-2 12-6 18-2" ${l}/>`
  );
}

// El detalle de embarazo: servilleta de lino con el perfil de una mujer embarazada bordado en
// hilo de salvia (la candidata elegida; ver docs/DECISIONES.md, N7).
export function servilletaBordada(x, y, rot = 0, W = 126, H = 96) {
  const w = W / 2;
  const h = H / 2;
  return (
    `<g transform="${T(x, y, rot)}"><rect x="${-w}" y="${-h}" width="${W}" height="${H}" rx="3" fill="${C.tinta}" opacity=".14" transform="translate(2.8 4)"/>` +
    `<rect x="${-w}" y="${-h}" width="${W}" height="${H}" rx="3" fill="#f1f4ec" stroke="#c4d1c4" stroke-width=".9"/>` +
    `<rect x="${-w}" y="${-h}" width="${W}" height="${H}" rx="3" fill="url(#art-lino)"/>` +
    `<path d="M${-w} ${n(h * 0.62)}H${w}" stroke="#c4d1c4" stroke-width=".9"/><rect x="${-w}" y="${n(h * 0.62)}" width="${W}" height="${n(h * 0.38)}" rx="3" fill="#e4ebe2" opacity=".7"/>` +
    `<rect x="${-w + 6}" y="${-h + 6}" width="${W - 12}" height="${H - 12}" rx="1.5" fill="none" stroke="${C.salvia}" stroke-width=".9" stroke-dasharray="2.6 2.4" opacity=".7"/>` +
    `<g transform="translate(-3 -3) scale(.78)">${perfil(C.salvia, 2)}</g></g>`
  );
}

// El mantel: lino con tejido sutil, hilos más gruesos al azar y un doblez de planchado.
export function mantel(W, H) {
  const r = rng(3);
  let hilos = '';
  for (let i = 0; i < 90; i++) {
    const x = Math.round(r() * W);
    const y = Math.round(r() * H);
    const l = 6 + Math.round(r() * 16);
    hilos += r() > 0.5 ? `M${x} ${y}h${l}` : `M${x} ${y}v${l}`;
  }
  return (
    `<defs>` +
    `<pattern id="art-lino" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 .4H3M.4 0V3" stroke="#8f7a52" stroke-width=".4" opacity=".1"/></pattern>` +
    `<pattern id="art-mimbre" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 3.5H7M3.5 0V7" stroke="#7d5a2c" stroke-width="1.1" opacity=".5"/></pattern>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="#ebe0cb"/>` +
    `<path d="${hilos}" stroke="#cdbd9b" stroke-width=".9" stroke-linecap="round" opacity=".5"/>` +
    `<rect x="46" width="9" height="${H}" fill="#cdbd9b" opacity=".16"/><rect x="214" width="9" height="${H}" fill="#cdbd9b" opacity=".16"/><rect x="330" width="9" height="${H}" fill="${C.salvia}" opacity=".05"/>` +
    `<rect width="${W}" height="${H}" fill="url(#art-lino)"/>` +
    puntos([[196, 284], [204, 290], [187, 296], [262, 306], [270, 312], [330, 150], [150, 244], [160, 250], [244, 440], [236, 450], [316, 292], [20, 196], [110, 346], [292, 150]], '#c4a266', 1.7) +
    puntos([[200, 288], [266, 308], [153, 247], [240, 445]], '#fffdf8', 1.1) +
    `<path d="M-6 392C80 380 150 396 230 378S350 372 ${W + 6} 380" fill="none" stroke="#fffaf0" stroke-width="2.4" opacity=".6"/>` +
    `<path d="M-6 395C80 383 150 399 230 381S350 375 ${W + 6} 383" fill="none" stroke="#cdbd9b" stroke-width="1.2" opacity=".6"/>`
  );
}
