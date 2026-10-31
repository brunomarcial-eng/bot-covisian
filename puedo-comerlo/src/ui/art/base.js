// Utilidades comunes de la ilustración: paleta, azar con semilla (el dibujo sale igual
// siempre) y pequeños constructores de formas. Sin dependencias.

export const C = {
  hoja: '#fffdf8',
  crema: '#f3eee6',
  tinta: '#241f1a',
  salvia: '#245443',
  salviaM: '#5f8a73',
  salviaL: '#cbd9cd',
  arcilla: '#8d4324',
  vino: '#7a332c',
  tomate: '#d6452c',
  tomateL: '#ea7a52',
  limon: '#f2cd3a',
  limonL: '#f8eaa0',
  naranja: '#ee8a26',
  hojaV: '#6f9a3d',
  hojaL: '#9cbd5a',
  mostaza: '#d9a62f',
  dorado: '#d9962f',
  loza: '#d6cbb7',
  acero: '#d5cec2',
  aceroL: '#8f877b',
};

export const n = (v) => Math.round(v * 10) / 10;
export const r0 = (v) => Math.round(v);

// Azar determinista (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const T = (x, y, rot = 0, s = 1) =>
  `translate(${n(x)} ${n(y)})${rot ? ` rotate(${n(rot)})` : ''}${s !== 1 ? ` scale(${s})` : ''}`;

// Puntos dentro de un disco, con separación mínima (rechazo simple).
export function disco(rand, cuenta, R, sep = 0, intentos = 40) {
  const pts = [];
  for (let i = 0; i < cuenta; i++) {
    for (let k = 0; k < intentos; k++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * R;
      const p = [Math.cos(a) * d, Math.sin(a) * d];
      if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= sep)) {
        pts.push(p);
        break;
      }
    }
  }
  return pts;
}

// Puntos redondos de un solo trazo (trazo de longitud cero con extremo redondo).
export const puntos = (pts, color, w, extra = '') =>
  `<path d="${pts.map(([x, y]) => `M${r0(x)} ${r0(y)}h0`).join('')}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"${extra}/>`;

// Granos o hebras cortas orientadas al azar.
export function hebras(rand, pts, color, w, largo, extra = '') {
  const d = pts
    .map(([x, y]) => {
      const a = rand() * Math.PI;
      return `M${r0(x)} ${r0(y)}l${r0(Math.cos(a) * largo)} ${r0(Math.sin(a) * largo)}`;
    })
    .join('');
  return `<path d="${d}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"${extra}/>`;
}

// Loza redonda vista desde arriba: borde, banda opcional y fondo hondo.
export function loza(R, { fill = C.hoja, well = '#f6f1e6', edge = C.loza, band = null, bandW = 0.035 } = {}) {
  let s = `<circle r="${R}" fill="${fill}" stroke="${edge}" stroke-width="1"/>`;
  if (band) s += `<circle r="${n(R * 0.915)}" fill="none" stroke="${band}" stroke-width="${n(R * bandW)}"/>`;
  s += `<circle r="${n(R * 0.74)}" fill="${well}" stroke="${edge}" stroke-opacity=".55" stroke-width=".7"/>`;
  return s;
}

export function lozaOval(rx, ry, { fill = C.hoja, well = '#f6f1e6', edge = C.loza, band = null } = {}) {
  let s = `<ellipse rx="${rx}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="1"/>`;
  if (band) s += `<ellipse rx="${n(rx * 0.925)}" ry="${n(ry * 0.915)}" fill="none" stroke="${band}" stroke-width="1.6"/>`;
  s += `<ellipse rx="${n(rx * 0.78)}" ry="${n(ry * 0.74)}" fill="${well}" stroke="${edge}" stroke-opacity=".55" stroke-width=".7"/>`;
  return s;
}

// Gajo de limón (medio disco con sus gajos).
export function gajo(x, y, a, R = 9) {
  const seg = [30, 60, 90, 120, 150]
    .map((g) => `M0 -.5L${n(Math.cos((g * Math.PI) / 180) * -(R - 2))} ${n(-Math.sin((g * Math.PI) / 180) * (R - 2))}`)
    .join('');
  return (
    `<g transform="${T(x, y, a)}"><path d="M${-R} 0A${R} ${R} 0 0 1 ${R} 0Z" fill="#f6ecb4"/>` +
    `<path d="M${n(1.5 - R)} -.6A${n(R - 1.5)} ${n(R - 1.5)} 0 0 1 ${n(R - 1.5)} -.6Z" fill="${C.limon}"/>` +
    `<path d="${seg}" stroke="${C.limonL}" stroke-width=".8" fill="none"/></g>`
  );
}

// Ramita de perejil/hierbas: unas pocas hojas pequeñas.
export function ramita(x, y, a, col = C.hojaV, s = 1) {
  return (
    `<g transform="${T(x, y, a, s)}" fill="${col}"><path d="M0 0C-1 -4 -1 -8 0 -12" stroke="${col}" stroke-width=".9" fill="none"/>` +
    `<path d="M0 -3C-5 -3 -7 -7 -6 -9C-2 -8 0 -6 0 -3ZM0 -6C5 -6 7 -10 6 -12C2 -11 0 -9 0 -6ZM0 -10C-3 -12 -3 -15 -1 -17C1 -15 1 -12 0 -10Z"/></g>`
  );
}
