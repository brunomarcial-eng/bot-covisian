// La firma de la aplicación, en UN solo sitio. «Hecho por Bruno Marcial»: permanente mientras no se
// comercialice. Para quitarla: vaciar AUTOR (desaparecen la línea de la barra superior, la de la portada,
// el bloque de Ajustes y la línea de «Compartir la lista») y quitar a mano la meta «author» de index.html
// y la mención en la `description` de manifest.webmanifest.

export const AUTOR = 'Bruno Marcial';
export const ANIO = '2026';
export const URL_APP = 'https://puedo-comerlo.vercel.app';

export const hayFirma = () => AUTOR.trim() !== '';
export const byline = () => (hayFirma() ? `by ${AUTOR}` : '');
export const hechoPor = () => (hayFirma() ? `Hecho por ${AUTOR}` : '');
export const hechoPorAnio = () => (hayFirma() ? `Hecho por ${AUTOR} · ${ANIO}` : '');
export const copyright = () => `© ${ANIO} ${AUTOR}. Todos los derechos reservados.`;

// Última línea del texto de «Compartir la lista».
export const lineaCompartir = () => (hayFirma() ? `Hecha con ¿Puedo comerlo? · by ${AUTOR}` : '');

// Pinta la línea de la barra superior (index.html tiene el hueco vacío) y la meta author.
export function aplicarFirma() {
  const el = document.getElementById('byline');
  if (el) {
    el.textContent = byline();
    el.hidden = !hayFirma();
  }
  const meta = document.querySelector('meta[name="author"]');
  if (meta && hayFirma()) meta.setAttribute('content', AUTOR);
}
