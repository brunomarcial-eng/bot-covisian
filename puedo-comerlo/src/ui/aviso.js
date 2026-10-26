// Aviso legal y privacidad: en español llano, sereno y exacto. Sin datos de contacto ni NIF: antes de
// comercializar hay que añadir la identidad y el contacto, y este texto debe revisarlo un abogado.

import { isOnboarded } from '../store.js';
import { h, icon } from './dom.js';
import { navigate } from './router.js';
import { hayFirma, copyright } from './firma.js';

const bullets = (items) => h('ul', { class: 'legal-list' }, items.map((t) => h('li', null, t)));

function section(title, ...body) {
  const id = `legal-${title.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-')}`;
  return h('section', { class: 'legal-sec', 'aria-labelledby': id }, h('h2', { id }, title), ...body);
}

export function render({ main }) {
  // Desde el arranque (paso 4) se vuelve al arranque; desde Ajustes, a Ajustes.
  const backTo = isOnboarded() ? '#/ajustes' : '#/arranque/4';
  const back = h('button', { type: 'button', class: 'back-btn', onclick: () => navigate(backTo) }, icon('arrow-left', 18, 1.5), 'Atrás');

  main.append(
    h('div', { class: 'legal-top' }, back),
    h('h1', null, 'Aviso legal y privacidad'),
    h('p', { class: 'lead' }, 'En palabras sencillas: qué hace esta aplicación con tus datos y qué no hace.'),

    section(
      'Qué es esta aplicación',
      h(
        'p',
        null,
        '«¿Puedo comerlo?» es una guía orientativa para la carta y el súper durante el embarazo. No es una aplicación médica, no hay un médico detrás y no sustituye el consejo de tu matrona, de tu ginecólogo ni de tu médico. Ante cualquier duda sobre tu caso, pregúntales a ellos.',
      ),
    ),

    section(
      'Qué se guarda, y dónde',
      h(
        'p',
        null,
        'Lo que configuras y lo que haces se guarda solo en este móvil, en el almacenamiento del navegador: tus alergias y restricciones, la lista de la compra, los favoritos, el historial y el último resultado. No hay cuentas, no usamos cookies y no hay analítica ni publicidad: no sabemos quién eres ni qué consultas.',
      ),
      h(
        'p',
        null,
        'Puedes borrarlo todo en Ajustes, con «Borrar los datos de este móvil». Si borras los datos del navegador, también se pierde.',
      ),
    ),

    section(
      'Qué sale de tu móvil',
      h('p', null, 'Para dos cosas la aplicación necesita internet. Esto es lo único que sale de tu móvil:'),
      bullets([
        'La foto de una carta o de una etiqueta. Se envía, a través del servidor de la aplicación (alojado en Vercel, en EE. UU.), a Anthropic (EE. UU.), solo para transcribir el texto. No se guarda ni se registra.',
        'Un código de barras. Se consulta en Open Food Facts, una base de datos abierta y colaborativa. Si el producto no está o no trae ingredientes, el servidor de la aplicación lo busca en internet con Claude, de Anthropic; para eso envía el código y, si lo hay, el nombre y la marca del producto.',
        'Las librerías de lectura. El lector de códigos y el lector de texto de las fotos se descargan de jsDelivr, una red de distribución de código abierto, solo cuando hacen falta.',
        'Datos técnicos. Como cualquier servidor, el proveedor de alojamiento puede registrar datos técnicos de la conexión, como la dirección IP. La aplicación no los usa.',
      ]),
      h('p', null, 'Las letras de la aplicación se sirven desde la propia aplicación: no se piden a Google ni a otros servicios.'),
    ),

    section(
      'Lo que no hacemos',
      bullets([
        'No te pedimos datos de salud: ni semana de embarazo, ni fecha de parto, ni analíticas.',
        'No guardamos tus alergias, tu lista ni tu historial en ningún servidor.',
        'El semáforo (Sí, Con cuidado, Mejor no y No estoy segura) lo calculan reglas fijas, en tu móvil. La foto y la búsqueda en internet solo aportan texto (nombres e ingredientes); no deciden nada.',
      ]),
    ),

    section(
      'Tus derechos',
      h(
        'p',
        null,
        'La aplicación no guarda datos personales tuyos fuera de tu móvil, así que no hay nada que consultar, corregir ni suprimir en un servidor. Lo único que existe está en tu móvil y puedes borrarlo tú cuando quieras, desde Ajustes. Si algún día esto cambiara, este texto lo diría antes de empezar.',
      ),
    ),

    section(
      'De dónde sale la información',
      h(
        'p',
        null,
        'Las respuestas se basan en las recomendaciones de la AESAN (Agencia Española de Seguridad Alimentaria y Nutrición) y en notas del Ministerio de Sanidad, resumidas por la propia aplicación. Son orientativas, pueden no recoger tu caso y no sustituyen la valoración de un profesional. Los datos de productos son de Open Food Facts y de sus colaboradores.',
      ),
    ),

    section(
      'Derechos de autor',
      hayFirma() ? h('p', null, copyright()) : null,
      h('p', null, 'Las letras Fraunces y Source Sans 3 se usan con la licencia SIL Open Font License 1.1.'),
      h('p', { class: 'legal-date' }, 'Última revisión: octubre de 2026.'),
    ),
  );
}
