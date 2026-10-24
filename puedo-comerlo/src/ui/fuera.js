// Comer fuera: foto de la carta, o el plato escrito.

import { addHistory, setResult } from '../store.js';
import { h, icon, fill } from './dom.js';
import { notice } from './components.js';
import { classifyItem, worstOf, platosLeidos, NOTICE_CARTA_OCR } from './recalc.js';
import { galleryInput, photoFlow, readingView } from './photo.js';
import { navigate, replaceQuietly } from './router.js';

export const ATAJOS_FUERA = [
  ['Jamón curado', 'jamon-curado'],
  ['Pescado crudo', 'pescado-crudo'],
  ['Tortilla', 'tortilla-patata'],
  ['Ensalada César', 'ensalada-cesar'],
  ['Ensaladilla', 'ensaladilla'],
  ['Tarta de queso', 'tarta-queso'],
  ['Gazpacho', 'gazpacho'],
  ['Mayonesa casera', 'mayonesa-casera'],
  ['Queso blando', 'queso-blando-corteza'],
  ['Paella', 'paella'],
];

export function atajos(list, headingId) {
  return h(
    'section',
    { 'aria-labelledby': headingId },
    h('h2', { id: headingId }, 'Atajos'),
    h(
      'ul',
      { class: 'chips' },
      list.map(([label, id]) => h('li', null, h('a', { class: 'chip', href: `#/ficha/${id}` }, label))),
    ),
  );
}

export function cleanItems(items, max) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && String(it.name || '').trim())
    .slice(0, max)
    .map((it) => ({
      name: String(it.name).trim(),
      ingredients: Array.isArray(it.ingredients) ? it.ingredients.map((x) => String(x)).filter(Boolean) : [],
      uncertain: !!it.uncertain,
    }));
}

export function render(ctx) {
  const { main, signal, params, profile } = ctx;
  const intro = h('p', { class: 'lead' }, 'Foto de la carta, o el plato escrito. Si no se lee, no lo invento.');
  const body = h('div', { class: 'fuera-body' });
  const gallery = galleryInput((file) => readPhoto(file));
  main.append(h('h1', null, 'Comer fuera'), intro, body, gallery);

  let flow = null;

  function showHome(message = null) {
    flow = null;
    intro.hidden = false;
    fill(body, 
      message,
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn--primary', onclick: startCamera }, icon('camera', 22), 'Hacer una foto'),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => gallery.click() }, icon('image', 22), 'Elegir una foto'),
        h('a', { class: 'btn btn--secondary', href: '#/buscar' }, icon('search', 22), 'Buscar un plato'),
      ),
      atajos(ATAJOS_FUERA, 'atajos-fuera'),
    );
    if (message) message.focus();
  }

  function startCamera() {
    intro.hidden = true;
    flow = photoFlow(body, {
      signal,
      subject: 'la carta',
      onPhoto: (blob) => readPhoto(blob),
      onCancel: () => showHome(),
      openGallery: () => gallery.click(),
    });
  }

  function failure() {
    const msg = h(
      'div',
      { class: 'notice notice--problem', tabindex: '-1' },
      icon('info', 22),
      h(
        'div',
        null,
        h('p', null, 'No he podido leer la carta. Acércala, o escribe el plato.'),
        h('p', { class: 'mt-sm' }, h('a', { href: '#/buscar' }, 'Escribir el plato')),
      ),
    );
    showHome(msg);
  }

  async function readPhoto(blob) {
    if (flow) flow.destroy();
    flow = null;
    intro.hidden = true;
    const view = readingView(body, blob, 'Preparando la foto…');
    let res = null;
    try {
      const { readImage } = await import('../capture/reader.js');
      if (signal.aborted) return;
      res = await readImage(blob, 'carta', {
        signal,
        onStatus: (t) => {
          if (!signal.aborted) view.set(t);
        },
      });
    } catch (err) {
      console.error('No he podido leer la carta:', err);
      res = null;
    } finally {
      view.done();
    }
    if (signal.aborted) return;

    let items = res && res.readable ? cleanItems(res.items, 20) : [];
    if (!items.length) {
      failure();
      return;
    }
    let verdicts = items.map((it) => classifyItem(it, profile));
    // Máximo 12 platos. Si sobran (lectura aproximada con títulos o el nombre del local),
    // se quitan primero las líneas que la guía no reconoce, empezando por el final.
    if (items.length > 12) {
      const keep = new Set(items.map((_, i) => i));
      for (let i = items.length - 1; i >= 0 && keep.size > 12; i--) {
        if (!verdicts[i].foodId) keep.delete(i);
      }
      for (let i = items.length - 1; i >= 0 && keep.size > 12; i--) keep.delete(i);
      items = items.filter((_, i) => keep.has(i));
      verdicts = verdicts.filter((_, i) => keep.has(i));
    }
    const payload = { kind: 'carta', items };
    setResult({
      title: 'La carta',
      via: 'foto',
      items: verdicts,
      notice: res.via === 'ocr' ? NOTICE_CARTA_OCR : null,
      payload,
    });
    addHistory({
      via: 'foto',
      title: 'La carta',
      level: worstOf(verdicts),
      phrase: platosLeidos(verdicts.length),
      foodId: null,
      payload,
    });
    navigate('#/resultado');
  }

  showHome();

  // #/fuera?camara=1 (desde «Hacer otra foto») abre la cámara directamente.
  if (params.get('camara') === '1') {
    replaceQuietly('#/fuera');
    startCamera();
  }
}
