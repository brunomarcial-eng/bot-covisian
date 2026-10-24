// Piezas compartidas: pastilla de semáforo, ficha mínima, filas, avisos y estados.

import { LEVEL_LABEL } from '../engine/levels.js';
import { addToList, isInList } from '../store.js';
import { h, icon, levelMark, uid, announce, fill } from './dom.js';

const KNOWN = ['si', 'cuidado', 'no', 'duda'];

// Pastilla: color + palabra, siempre. Y una marca no cromática.
export function pill(level, { small = false } = {}) {
  const lv = KNOWN.includes(level) ? level : 'duda';
  return h(
    'span',
    { class: `pill pill--${lv}${small ? ' pill--sm' : ''}`, dataset: { level: lv } },
    levelMark(lv),
    h('span', null, LEVEL_LABEL[lv]),
  );
}

// Botón «Añadir a la lista». Cuando ya está, «En la lista» desactivado.
// Usa aria-disabled para no perder el foco al pulsarlo.
export function addToListButton(entry, { small = true, variant = 'secondary', inline = true } = {}) {
  const btn = h('button', {
    type: 'button',
    class: `btn btn--${variant}${small ? ' btn--small' : ''}${inline ? ' btn--inline' : ''}`,
    dataset: { action: 'add-to-list' },
  });
  const paint = (inList) => {
    fill(btn, icon(inList ? 'check' : 'plus', 20), inList ? 'En la lista' : 'Añadir a la lista');
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
  const { level = 2, fichaLink = true, listEntry = null, startOpen = false, extraMore = null, listButtonOpts = {} } = opts;
  const moreId = uid('mas');
  const sub = `h${Math.min(level + 1, 6)}`;
  const parts = [];

  if (v.detail) parts.push(h('p', null, v.detail));
  if (Array.isArray(v.ingredients) && v.ingredients.length) {
    parts.push(h(sub, { class: 'card-label' }, 'Ingredientes leídos'));
    parts.push(h('p', null, v.ingredients.join(', ')));
  }
  if (v.question) {
    parts.push(h(sub, { class: 'card-label' }, 'Qué preguntar o mirar'));
    parts.push(h('p', null, v.question));
  }
  if (v.alternative) {
    parts.push(h(sub, { class: 'card-label' }, 'Alternativa'));
    parts.push(h('p', null, v.alternative));
  }
  if (Array.isArray(v.notes) && v.notes.length) {
    parts.push(h(sub, { class: 'card-label' }, 'Forma de comer'));
    parts.push(h('ul', { class: 'card-notes' }, v.notes.map((n) => h('li', null, n))));
  }
  if (extraMore) parts.push(extraMore);
  if (v.source) parts.push(h('p', { class: 'card-source' }, `Fuente: ${v.source}`));

  const actions = [];
  if (listEntry) actions.push(addToListButton(listEntry, listButtonOpts));
  if (fichaLink && v.foodId) {
    actions.push(
      h('a', { class: 'link-btn', href: `#/ficha/${encodeURIComponent(v.foodId)}` }, 'Abrir la ficha', icon('chevron-right', 20)),
    );
  }
  if (actions.length) parts.push(h('div', { class: 'card-actions' }, actions));

  const panel = h('div', { class: 'card-more', id: moreId, hidden: !startOpen }, parts);
  const button = h(
    'button',
    { type: 'button', class: 'link-btn', 'aria-expanded': String(!!startOpen), 'aria-controls': moreId },
    'Ver más',
    icon('chevron-down', 20),
  );
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
  return { button, panel };
}

// Ficha mínima: pastilla, nombre, una frase. «Ver más» despliega el resto.
// `aside` se pinta en la misma línea que «Ver más» (p. ej. «Quitar» en la lista).
export function verdictCard(v, opts = {}) {
  const { level = 2, title = v.title, hero = false, aside = null } = opts;
  const { button, panel } = verdictMore(v, opts);
  const nameId = uid('nombre');
  return h(
    'article',
    { class: `card${hero ? ' card--hero' : ''}`, 'aria-labelledby': nameId, dataset: { level: v.level } },
    pill(v.level),
    h(`h${level}`, { class: 'card-name', id: nameId }, title || 'Sin nombre'),
    h('p', { class: 'card-phrase' }, v.phrase || ''),
    h('div', { class: 'card-bar' }, button, aside),
    panel,
  );
}

// Fila compacta (dentro de una lista .rows). Si hay href, toda la fila es un enlace.
export function row({ href = null, level, title, phrase, meta = null, onClick = null, headingLevel = null }) {
  const titleEl = headingLevel
    ? h(`h${headingLevel}`, { class: 'row-title' }, title)
    : h('span', { class: 'row-title' }, title);
  const main = h(
    'span',
    { class: 'row-main' },
    pill(level, { small: true }),
    titleEl,
    phrase ? h('span', { class: 'row-phrase' }, phrase) : null,
    meta,
  );
  if (href) {
    const a = h('a', { class: 'row', href }, main, h('span', { class: 'row-chevron' }, icon('chevron-right', 20)));
    if (onClick) a.addEventListener('click', onClick);
    return h('li', null, a);
  }
  return h('li', null, h('div', { class: 'row' }, main));
}

export function rows(items, label = null) {
  return h('ul', { class: 'rows', 'aria-label': label }, items);
}

export function notice(text, kind = 'info') {
  const cls = kind === 'problem' ? ' notice--problem' : kind === 'ok' ? ' notice--ok' : '';
  return h('div', { class: `notice${cls}` }, icon('info', 22), h('p', null, text));
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
  guia: 'Guía',
};
