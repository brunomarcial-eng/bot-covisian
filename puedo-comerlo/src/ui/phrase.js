// La frase de un veredicto, sin repetir la palabra del nivel que ya se ve encima.
// «Sí: va horneada…» con la palabra «Sí» ya mostrada pasa a «Va horneada…».
// Solo quita el arranque cuando coincide con el nivel; «Has marcado leche.» o
// «No estoy segura de la lectura.» se respetan tal cual. Vive en la interfaz: el motor no se toca.

const LABEL = { si: 'Sí', cuidado: 'Con cuidado', no: 'Mejor no', duda: 'No estoy segura' };

export function trimPhrase(phrase, level) {
  const text = String(phrase || '').trim();
  const label = LABEL[level];
  if (!text || !label) return text;
  if (text.slice(0, label.length).toLocaleLowerCase('es-ES') !== label.toLocaleLowerCase('es-ES')) return text;

  const rest = text.slice(label.length);
  // «Sí:», «Sí,», «Con cuidado:», «Mejor no,»…  Y «Mejor no por el mercurio…».
  let m = rest.match(/^\s*[:,]\s*(\S[\s\S]*)$/);
  if (!m && level === 'no') m = rest.match(/^\s+(por\s[\s\S]*)$/i);
  if (!m) return text;

  const out = m[1].trim();
  if (!out) return text;
  return out.charAt(0).toLocaleUpperCase('es-ES') + out.slice(1);
}
