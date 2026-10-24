// Utilidades mínimas de DOM. Todo el texto que viene de fuera (lo escrito, lo leído en
// una foto, Open Food Facts) entra como nodo de texto, nunca como HTML.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'html') el.innerHTML = value; // solo para cadenas propias (iconos)
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

// Sustituye el contenido de `el` ignorando null/false (replaceChildren pintaría «null»).
export function fill(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

let counter = 0;
export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function debounce(fn, ms = 160) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

// Región viva global para avisos breves («Añadido a la lista», «Guardado»…).
export function announce(text) {
  const el = document.getElementById('announcer');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => {
    el.textContent = text;
  }, 60);
}

// ---------- Iconos SVG de línea (24×24) ----------

const PATHS = {
  camera:
    '<path d="M4 8.5h3.2L8.8 6h6.4l1.6 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17.5 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  barcode:
    '<path d="M3.5 7.5v-3h3M20.5 7.5v-3h-3M3.5 16.5v3h3M20.5 16.5v3h-3"/><path d="M7.5 8v8M10.5 8v8M13 8v8M16.5 8v8"/>',
  label:
    '<path d="M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5"/>',
  'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  bookmark: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  'bookmark-filled':
    '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trash:
    '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.9v.1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  phone: '<rect x="6.5" y="3" width="11" height="18" rx="2.5"/><path d="M11 18h2"/>',
  scan:
    '<path d="M3.5 7.5v-3h3M20.5 7.5v-3h-3M3.5 16.5v3h3M20.5 16.5v3h-3"/><path d="M8 12h8"/>',
  rules:
    '<path d="M5 4.5h14M5 9.5h14M5 14.5h9M5 19.5h6"/>',
  repeat:
    '<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15M4.5 19.5V15H9"/>',
  fork:
    '<path d="M7.5 3v5.5M5 3v5a2.5 2.5 0 0 0 5 0V3M7.5 10.5V21"/><path d="M18 21V3c-2.2 1.3-3.2 4.2-3.2 7.8V13H18"/>',
  basket:
    '<path d="M3.5 9h17l-1.7 9.3a1.6 1.6 0 0 1-1.6 1.2H6.8a1.6 1.6 0 0 1-1.6-1.2z"/><path d="M8.5 9 11 4.5M15.5 9 13 4.5M9.5 12.5v4M14.5 12.5v4"/>',
};

export function icon(name, size = 24) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
  return t.content.firstElementChild;
}

// Marca no cromática de cada nivel (12×12): lleno, mitad, tachado, discontinuo.
const MARKS = {
  si: '<circle cx="6" cy="6" r="4.5" fill="currentColor"/>',
  cuidado:
    '<circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor"/>',
  no: '<circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.2 8.8 8.8 3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  duda: '<circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.2 1.6"/>',
};

export function levelMark(level) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">${MARKS[level] || MARKS.duda}</svg>`;
  return t.content.firstElementChild;
}
