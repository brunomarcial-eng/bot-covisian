// Piezas compartidas. Una respuesta única (Buscar, ficha, producto) enseña la palabra del
// semáforo en grande; una lista (carta, lista, historial) son filas con filetes y una marca
// lateral del color del nivel. La pastilla rellena solo aparece donde resume (la carta).

import { LEVEL_LABEL } from '../engine/levels.js';
import { claveLabel, CLAVE_BY_ID } from '../engine/claves.js';
import { addToList, isInList } from '../store.js';
import { h, icon, levelMark, uid, announce, fill } from './dom.js';
import { trimPhrase } from './phrase.js';

const KNOWN = ['si', 'cuidado', 'no', 'duda'];
const capFirst = (t) => { const x = String(t || ''); return x.charAt(0).toLocaleUpperCase('es-ES') + x.slice(1); };
const norm = (level) => (KNOWN.includes(level) ? level : 'duda');

// Pastilla rellena: color + palabra + marca no cromática. Solo para resúmenes y leyendas.
export function pill(level, { small = false, text = null } = {}) {
  const lv = norm(level);
  return h(
    'span',
    { class: `pill pill--${lv}${small ? ' pill--sm' : ''}`, dataset: { level: lv } },
    levelMark(lv),
    h('span', null, text || LEVEL_LABEL[lv]),
  );
}

// Frase del veredicto sin repetir la palabra del nivel.
export function phraseOf(v) {
  return trimPhrase(v.phrase || '', v.level);
}

// Enlace «Por qué importa» a la clave de un tema.
export function claveLink(id, { small = true } = {}) {
  const c = CLAVE_BY_ID[id];
  return h(
    'a',
    {
      class: `text-link${small ? ' text-link--small' : ''}`,
      href: `#/claves/${encodeURIComponent(id)}`,
      'aria-label': `Por qué importa: ${c ? c.titulo : id}`,
    },
    'Por qué importa',
    icon('arrow-right', 18, 1.5),
  );
}

// Botón «Añadir a la lista». Cuando ya está, «En la lista» (aria-disabled, para no perder el foco).
export function addToListButton(entry, { small = true, variant = 'secondary', inline = true } = {}) {
  const btn = h('button', {
    type: 'button',
    class: `btn btn--${variant}${small ? ' btn--small' : ''}${inline ? ' btn--inline' : ''}`,
    dataset: { action: 'add-to-list' },
  });
  const paint = (inList) => {
    fill(btn, inList ? icon('check', 18, 1.8) : null, inList ? 'En la lista' : 'Añadir a la lista');
    if (inList) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  };
  paint(isInList(entry));
  btn.addEventListener('click', () => {
    if (btn.getAttribute('aria-disabled') === 'true') return;
    addToList(entry);
    paint(true);
    announce('Añadido a la lista.');
  });
  return btn;
}

// «Ver más»: botón (aria-expanded) + panel con detalle, pregunta, alternativa, notas y fuente.
export function verdictMore(v, opts = {}) {
  const { level = 2, fichaLink = true, listEntry = null, startOpen = false, extraMore = null, listButtonOpts = {}, ojoRest = null, hideQuestion = false } = opts;
  const moreId = uid('mas');
  const sub = `h${Math.min(level + 1, 6)}`;
  const parts = [];

  if (v.detail) parts.push(h('p', null, v.detail));
  if (Array.isArray(v.ingredients) && v.ingredients.length) {
    parts.push(h(sub, { class: 'more-label' }, 'Ingredientes leídos'));
    parts.push(h('p', null, v.ingredients.join(', ')));
  }
  if (Array.isArray(ojoRest) && ojoRest.length) {
    parts.push(h(sub, { class: 'more-label' }, 'Ojo con esto'));
    parts.push(h('ul', { class: 'more-notes' }, ojoRest.map((t) => h('li', null, t))));
  }
  if (v.question && !hideQuestion) {
    parts.push(h(sub, { class: 'more-label' }, 'Qué preguntar o mirar'));
    parts.push(h('p', null, v.question));
  }
  if (v.alternative) {
    parts.push(h(sub, { class: 'more-label' }, 'Alternativa'));
    parts.push(h('p', null, v.alternative));
  }
  if (Array.isArray(v.notes) && v.notes.length) {
    parts.push(h(sub, { class: 'more-label' }, 'Forma de comer'));
    parts.push(h('ul', { class: 'more-notes' }, v.notes.map((n) => h('li', null, n))));
  }
  if (Array.isArray(v.topics) && v.topics.length) {
    // Chips neutros (no son veredictos): llevan a la clave del tema. Después, el enlace «Por qué importa».
    parts.push(h(sub, { class: 'more-label' }, 'Para saber más'));
    parts.push(
      h(
        'ul',
        { class: 'chips', 'aria-label': 'Temas' },
        v.topics.map((id) => h('li', null, h('a', { class: 'chip', href: `#/claves/${encodeURIComponent(id)}` }, claveLabel(id)))),
      ),
    );
    parts.push(claveLink(v.topics[0]));
  }
  if (extraMore) parts.push(extraMore);
  if (v.source) parts.push(h('p', { class: 'more-source' }, `Fuente: ${v.source}`));

  const actions = [];
  if (listEntry) actions.push(addToListButton(listEntry, listButtonOpts));
  if (fichaLink && v.foodId) {
    actions.push(
      h('a', { class: 'text-link', href: `#/ficha/${encodeURIComponent(v.foodId)}` }, 'Abrir la ficha', icon('arrow-right', 18, 1.5)),
    );
  }
  if (actions.length) parts.push(h('div', { class: 'more-actions' }, actions));

  if (!parts.length) return { button: null, panel: null };
  const panel = h('div', { class: 'more', id: moreId, hidden: !startOpen }, parts);
  const button = h(
    'button',
    { type: 'button', class: 'more-btn', 'aria-expanded': String(!!startOpen), 'aria-controls': moreId },
    'Ver más',
  );
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
  return { button, panel };
}

// «Ojo con esto»: avisos cortos del motor (`verdict.ojo`, 0–3) y, en «Con cuidado», la pregunta para el
// camarero. Si el veredicto no trae `ojo` (motor antiguo), no sale nada. Devuelve { node, hasQuestion }.
export function ojoBlock(v, { level = 2 } = {}) {
  if (!v || !Array.isArray(v.ojo)) return { node: null, hasQuestion: false };
  const lines = v.ojo.map((t) => String(t || '').trim()).filter(Boolean);
  const askQ = v.level === 'cuidado' && typeof v.question === 'string' && v.question.trim() !== '';
  if (!lines.length && !askQ) return { node: null, hasQuestion: false };
  const id = uid('ojo');
  const sub = `h${Math.min(level + 1, 6)}`;
  const node = h(
    'section',
    { class: 'ojo', 'aria-labelledby': lines.length ? id : null, 'aria-label': lines.length ? null : 'Pregunta' },
    lines.length
      ? [
          h(sub, { class: 'ojo-title', id }, icon('eye', 20, 1.6), h('span', null, 'Ojo con esto')),
          h('ul', { class: 'ojo-list' }, lines.map((t) => h('li', null, t))),
        ]
      : null,
    askQ ? [h(sub, { class: 'ojo-q-title' }, h('span', null, 'Pregunta')), h('p', { class: 'ojo-q' }, v.question.trim())] : null,
  );
  return { node, hasQuestion: askQ };
}

// Segunda línea discreta de una fila de lista: el primer aviso, en una sola línea con elipsis.
export function ojoLine(ojo) {
  const first = Array.isArray(ojo) ? String(ojo[0] || '').trim() : '';
  if (!first) return null;
  return h('span', { class: 'entry-ojo' }, icon('eye', 15, 1.6), h('span', { class: 'entry-ojo-text' }, first));
}

// Respuesta única: la palabra grande en su color, el nombre como contexto, la frase debajo.
//   eyebrow: línea pequeña encima (grupo de la guía)   sheet: dentro de una hoja
//   actions: nodos bajo la frase (antes de «Ver más»)   listEntry: añade «Añadir a la lista» en «Ver más»
export function verdictAnswer(v, opts = {}) {
  const { level = 2, title = v.title, eyebrow = null, sheet = false, actions = null, hideName = false, afterPhrase = null } = opts;
  const lv = norm(v.level);
  const nameId = uid('nombre');
  const phrase = phraseOf(v);
  const ojo = ojoBlock(v, { level });
  const { button, panel } = verdictMore(v, { ...opts, hideQuestion: ojo.hasQuestion });
  return h(
    'article',
    { class: `answer lv-${lv}${sheet ? ' answer--sheet' : ''}`, 'aria-labelledby': nameId, dataset: { level: lv } },
    eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
    h('p', { class: 'answer-word' }, LEVEL_LABEL[lv]),
    h(`h${level}`, { class: hideName ? 'visually-hidden' : 'answer-name', id: nameId }, capFirst(title) || 'Sin nombre'),
    phrase ? h('p', { class: 'answer-phrase' }, phrase) : null,
    ojo.node,
    afterPhrase,
    actions ? h('div', { class: 'answer-actions' }, actions) : null,
    button ? h('div', { class: 'more-bar' }, button) : null,
    panel,
  );
}

// Fila de lista con «Ver más» (carta, lista). Sin caja: filetes y marca lateral.
// `aside` va en la misma línea que «Ver más» (p. ej. «Quitar»).
export function entryItem(v, opts = {}) {
  const { level = 2, title = v.title, aside = null } = opts;
  const lv = norm(v.level);
  const { button, panel } = verdictMore(v, { ...opts, ojoRest: Array.isArray(v.ojo) ? v.ojo.slice(1) : null });
  const nameId = uid('nombre');
  const phrase = phraseOf(v);
  return h(
    'li',
    { class: `entry lv-${lv}`, dataset: { level: lv } },
    h(
      'div',
      { class: 'entry-body' },
      h('span', { class: 'lvl' }, LEVEL_LABEL[lv]),
      h(`h${level}`, { class: 'entry-name', id: nameId }, capFirst(title) || 'Sin nombre'),
      phrase ? h('p', { class: 'entry-phrase' }, phrase) : null,
      ojoLine(v.ojo),
      button || aside ? h('div', { class: 'more-bar' }, button, aside) : null,
      panel,
    ),
  );
}

// Fila de lista que es un enlace entero (historial, «Lo último», favoritos).
export function entryLink({ href = null, level, title, phrase, meta = null, onClick = null, headingLevel = null, ojo = null }) {
  const lv = norm(level);
  const text = trimPhrase(phrase || '', lv);
  const name = headingLevel
    ? h(`h${headingLevel}`, { class: 'entry-name' }, capFirst(title))
    : h('span', { class: 'entry-name' }, capFirst(title));
  const body = [
    h('span', { class: 'lvl' }, LEVEL_LABEL[lv]),
    name,
    text ? h('span', { class: 'entry-phrase' }, text) : null,
    ojoLine(ojo),
    meta,
  ];
  if (href) {
    const a = h('a', { class: 'entry-body entry-link', href }, body);
    if (onClick) a.addEventListener('click', onClick);
    return h('li', { class: `entry lv-${lv}` }, a);
  }
  return h('li', { class: `entry lv-${lv}` }, h('div', { class: 'entry-body' }, body));
}

// rise: las filas entran una a una (solo donde llegan de golpe, como la carta leída).
export function entries(items, label = null, { rise = false } = {}) {
  return h('ul', { class: `entries${rise ? ' entries--rise' : ''}`, 'aria-label': label }, items);
}

// Lista tipográfica de atajos: texto + flecha fina.
export function shortcutList(list) {
  return h(
    'ul',
    { class: 'shortcuts' },
    list.map(([label, id]) =>
      h('li', null, h('a', { href: `#/ficha/${id}` }, h('span', null, label), icon('arrow-right', 16, 1.4))),
    ),
  );
}

// Cabecera de sección: filete fino y rótulo en versalitas; `aside` a la derecha.
export function sectionHead(text, id, aside = null) {
  return h('div', { class: 'section-head' }, h('h2', { id }, text), aside);
}

// Nota serena: una línea con filete lateral. kind: info | problem | ok
export function notice(text, kind = 'info') {
  const cls = kind === 'problem' ? ' notice--problem' : kind === 'ok' ? ' notice--ok' : '';
  return h('div', { class: `notice${cls}` }, h('p', null, text));
}

// Caja de estado con región viva («Leyendo la carta…»).
export function statusBox() {
  const text = h('span', { class: 'status-text' });
  const el = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), text);
  return {
    el,
    set(msg) {
      text.textContent = msg;
    },
  };
}

// Confirmación en línea, con foco en el texto. onConfirm/onCancel.
export function confirmBox({ text, detail = null, confirmLabel, cancelLabel = 'Cancelar', onConfirm, onCancel }) {
  const id = uid('confirmar');
  const msg = h('p', { id, tabindex: '-1' }, h('strong', null, text));
  const box = h(
    'div',
    { class: 'confirm', role: 'group', 'aria-labelledby': id },
    msg,
    detail ? h('p', { class: 'small' }, detail) : null,
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn--danger-solid', onclick: onConfirm }, confirmLabel),
      h('button', { type: 'button', class: 'btn btn--secondary', onclick: onCancel }, cancelLabel),
    ),
  );
  box.focusMessage = () => {
    msg.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'nearest' });
  };
  return box;
}

// Fecha relativa breve, en español.
export function relTime(ts, now = Date.now()) {
  const d = new Date(ts);
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60000);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  const today = new Date(now);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return `Hoy, ${time}`;
  const yesterday = new Date(now - 86400000);
  if (sameDay(d, yesterday)) return `Ayer, ${time}`;
  if (diff < 6 * 86400000) {
    const wd = d.toLocaleDateString('es-ES', { weekday: 'long' });
    return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${time}`;
  }
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export const VIA_LABEL = {
  foto: 'Foto',
  codigo: 'Código',
  busqueda: 'Búsqueda',
  guia: 'Ficha',
};
