// Normalización de texto para el motor de reglas. Pura y determinista.
//
// - minúsculas
// - sin acentos ni diacríticos (ñ → n, ç → c, ü → u…)
// - «0,0», «0.0», «0'0» (cerveza 0,0) → «00», para que siga detectable
// - decimales «4,5» → «4.5» (el punto entre cifras se conserva)
// - el resto de puntuación y símbolos → espacio
// - espacios colapsados y recortados

const EXTRA_FOLD = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ı: 'i',
};

export function normalize(text) {
  if (text === null || text === undefined) return '';
  let s = String(text).toLowerCase();
  // Separa letras y diacríticos (NFKD también pliega ligaduras y formas de ancho completo).
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[øæœßłđı]/g, (c) => EXTRA_FOLD[c] || c);
  // Cerveza 0,0 / 0.0 / 0'0 / 0´0 / 0,00 → 00 (antes de tocar la puntuación).
  s = s.replace(/(?<![0-9])0\s?[,.'´`’]\s?0+(?![0-9])/g, '00');
  // Decimales: 4,5 → 4.5 (se conserva el punto entre cifras).
  s = s.replace(/([0-9])[,']([0-9])/g, '$1.$2');
  // Todo lo que no sea letra, cifra o un punto decimal → espacio.
  s = s.replace(/[^a-z0-9.]+/g, ' ');
  s = s.replace(/\.(?![0-9])|(?<![0-9])\./g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
