// Lista de la compra: lo que has dejado de platos y productos, para comprarlo y marcarlo al meterlo en el
// carro. Se recalcula con los ajustes de ahora. «Pendiente» arriba (ordenado por semáforo), «En el carro»
// debajo (plegable). Se comparte solo lo pendiente, en texto plano y sin semáforo.

import { verdictForFood, FOOD_BY_ID } from '../engine/index.js';
import { LEVEL_LABEL } from '../engine/levels.js';
import { getList, removeFromList, getFavorites, setListDone, clearListDone } from '../store.js';
import { h, icon, announce, fill } from './dom.js';
import { entryLink, entries, sectionHead, verdictMore, phraseOf, ojoLine, ojoLines } from './components.js';
import { refreshEntry } from './recalc.js';
import { emptyState, categoryFor, thumbArt } from './art-ui.js';
import { lineaCompartir, hayFirma, URL_APP } from './firma.js';

const RANK = { si: 0, cuidado: 1, duda: 2, no: 3 };
const KNOWN = ['si', 'cuidado', 'no', 'duda'];
const capFirst = (t) => {
  const x = String(t || '');
  return x.charAt(0).toLocaleUpperCase('es-ES') + x.slice(1);
};

export const SHARE_TITLE = 'Mi lista de la compra';

// Texto plano de lo pendiente: sin semáforo, sin frases y sin mención al embarazo.
export function shareText(titles) {
  const out = [SHARE_TITLE, ...titles.map((t) => `- ${capFirst(t)}`)];
  // Al final, de dónde viene la lista (la firma y el enlace). Nada más: ni semáforo ni embarazo.
  if (hayFirma()) out.push('', lineaCompartir(), URL_APP);
  return out.join('\n');
}

export function render({ main, profile }) {
  const h1 = h('h1', { id: 'lista-h1' }, 'Lista de la compra');
  const lead = h('p', { class: 'lead' }, 'Lo que vas a comprar. Márcalo cuando lo metas en el carro y compártela con quien vaya a la tienda.');
  const toolbar = h('div', { class: 'shop-bar' });
  const listHost = h('div', { class: 'lista' });
  const favHost = h('div');
  main.append(h1, lead, toolbar, listHost, favHost);

  let carroOpen = true;
  let arrivingId = null; // la fila que acaba de pasar al carro (o de volver) llega deslizándose
  const shareMsg = h('p', { class: 'share-msg', role: 'status', 'aria-live': 'polite' });

  // ---- datos ----
  function rows() {
    return getList().map((entry, i) => {
      const fresh = refreshEntry(entry, profile);
      const level = KNOWN.includes(fresh.level) ? fresh.level : 'duda';
      return { entry, fresh, level, i };
    });
  }

  // ---- fila ----
  function shopRow(item, focusAfter) {
    const { entry, fresh, level } = item;
    const done = !!entry.done;
    const verdict = fresh.verdict || { level: fresh.level, phrase: fresh.phrase };
    const { button, panel } = verdictMore(verdict, { level: 2, fichaLink: !!fresh.verdict, ojoRest: Array.isArray(verdict.ojo) ? ojoLines(verdict).slice(1) : null });
    const title = capFirst(entry.title) || 'Sin nombre';
    const phrase = phraseOf(verdict);
    const topics = Array.isArray(verdict.topics) ? verdict.topics : [];

    const tick = h('span', { class: 'buy-tick', 'aria-hidden': 'true' }, icon('check', 28, 3));
    tick.querySelector('path').setAttribute('pathLength', '1'); // para dibujar el check al marcarlo
    const box = h('input', {
      type: 'checkbox',
      class: 'buy-box',
      checked: done,
      'aria-label': done ? `Devolver ${entry.title} a pendiente` : `Marcar ${entry.title} como comprado`,
      dataset: { action: 'comprado', id: entry.id },
    });
    box.checked = done;
    box.addEventListener('change', () => {
      setListDone(entry.id, box.checked);
      announce(box.checked ? `${entry.title}: en el carro.` : `${entry.title}: otra vez pendiente.`);
      arrivingId = entry.id;
      focusAfter(entry.id);
      arrivingId = null;
    });

    const quitar = h('button', { type: 'button', class: 'quiet-btn', 'aria-label': `Quitar ${entry.title}`, dataset: { id: entry.id } }, 'Quitar');
    quitar.addEventListener('click', () => {
      removeFromList(entry.id);
      announce(`${entry.title}: quitado de la lista.`);
      focusAfter(entry.id);
    });

    // «Mejor no» sin un tema general detrás: lo decide lo que la persona marcó en sus ajustes.
    const note =
      level === 'no' && !done && !topics.length ? h('p', { class: 'entry-note' }, `Sale «${LEVEL_LABEL.no}» con tus ajustes`) : null;

    return h(
      'li',
      { class: `entry entry--shop has-thumb lv-${level}${done ? ' is-done' : ''}${arrivingId === entry.id ? ' is-arriving' : ''}`, dataset: { level, done: String(done) } },
      thumbArt(categoryFor({ foodId: fresh.foodId || entry.foodId, title: entry.title, product: entry.payload && entry.payload.product })),
      h('label', { class: 'buy' }, h('span', { class: 'buy-wrap' }, box, tick), h('span', { class: 'buy-text' }, 'Comprado')),
      h(
        'div',
        { class: 'entry-body' },
        h('span', { class: 'lvl' }, LEVEL_LABEL[level]),
        h('h3', { class: 'entry-name' }, title),
        phrase ? h('p', { class: 'entry-phrase' }, phrase) : null,
        ojoLine(ojoLines(verdict)),
        note,
        h('div', { class: 'more-bar' }, button, quitar),
        panel,
      ),
    );
  }

  // Tras marcar o quitar, el foco va a la fila que ocupa su sitio (o al título si no queda ninguna).
  function focusAfter(id) {
    const el = [...listHost.querySelectorAll('.entry--shop')].find((li) => li.querySelector(`[data-id="${CSS.escape(id)}"]`));
    const inCarro = !!el && el.parentElement.classList.contains('shop-list--carro');
    const idx = el ? [...el.parentElement.children].indexOf(el) : 0;
    paintList();
    const boxes = [...listHost.querySelectorAll(`${inCarro ? '.shop-list--carro' : '.shop-list--pend'} .buy-box`)];
    (boxes[Math.min(idx, boxes.length - 1)] || h1).focus();
  }

  // ---- compartir ----
  async function share(pending) {
    const text = shareText(pending.map((x) => x.entry.title));
    shareMsg.textContent = '';
    try {
      if (navigator.share) {
        await navigator.share({ title: SHARE_TITLE, text });
        shareMsg.textContent = 'Lista compartida.';
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // la persona lo cerró
    }
    try {
      await navigator.clipboard.writeText(text);
      shareMsg.textContent = 'Lista copiada.';
    } catch {
      // Último recurso: copia con un campo temporal.
      try {
        const ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', class: 'visually-hidden' });
        ta.value = text;
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        shareMsg.textContent = ok ? 'Lista copiada.' : 'No he podido compartir la lista.';
      } catch {
        shareMsg.textContent = 'No he podido compartir la lista.';
      }
    }
  }

  // ---- pintado ----
  function paintList() {
    const all = rows();
    if (!all.length) {
      fill(toolbar);
      fill(
        listHost,
        emptyState('ensalada', h('p', null, 'Todavía no hay nada. Cuando mires un plato o un producto, puedes dejarlo aquí.')),
      );
      return;
    }
    const pending = all.filter((x) => !x.entry.done).sort((a, b) => RANK[a.level] - RANK[b.level] || a.i - b.i);
    const inCart = all.filter((x) => x.entry.done);

    // Barra: cuántas faltan y compartir (solo si hay algo pendiente)
    const count = h('p', { class: 'shop-count', role: 'status', 'aria-live': 'polite' }, `${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'}`);
    const shareBtn = pending.length
      ? h('button', { type: 'button', class: 'btn btn--secondary btn--inline', dataset: { action: 'compartir' }, onclick: () => share(pending) }, icon('share', 20, 1.6), 'Compartir la lista')
      : null;
    fill(toolbar, count, shareBtn, shareMsg);

    // Pendiente
    const pendSection = h(
      'section',
      { class: 'section section--shop', 'aria-labelledby': 'lista-pendiente' },
      sectionHead('Pendiente', 'lista-pendiente'),
      pending.length
        ? h('ul', { class: 'entries shop-list shop-list--pend', 'aria-label': 'Pendiente' }, pending.map((x) => shopRow(x, focusAfter)))
        : h('p', { class: 'help mt-0' }, 'No queda nada pendiente.'),
    );

    // En el carro (plegable)
    const carroId = 'lista-carro-panel';
    const toggle = h(
      'button',
      { type: 'button', class: 'carro-toggle', 'aria-expanded': String(carroOpen), 'aria-controls': carroId },
      h('span', null, `En el carro (${inCart.length})`),
      icon('chevron-down', 20, 1.6),
    );
    const clearBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn--secondary btn--small btn--inline',
        dataset: { action: 'vaciar-comprado' },
        onclick: () => {
          clearListDone();
          announce('Lo comprado, fuera de la lista.');
          paintList();
          h1.focus();
        },
      },
      'Vaciar lo comprado',
    );
    const carroPanel = h(
      'div',
      { id: carroId, class: 'carro-panel', hidden: !carroOpen },
      h('ul', { class: 'entries shop-list shop-list--carro', 'aria-label': 'En el carro' }, inCart.map((x) => shopRow(x, focusAfter))),
      h('div', { class: 'carro-actions' }, clearBtn),
    );
    toggle.addEventListener('click', () => {
      carroOpen = !carroOpen;
      toggle.setAttribute('aria-expanded', String(carroOpen));
      carroPanel.hidden = !carroOpen;
    });
    const carroSection = inCart.length
      ? h('section', { class: 'section section--shop section--carro', 'aria-labelledby': 'lista-carro' }, h('h2', { id: 'lista-carro', class: 'carro-h' }, toggle), carroPanel)
      : null;

    fill(listHost, pendSection, carroSection);
  }

  function paintFavs() {
    const favs = getFavorites().filter((id) => FOOD_BY_ID[id]);
    if (!favs.length) {
      favHost.replaceChildren();
      return;
    }
    fill(
      favHost,
      h(
        'section',
        { class: 'section', 'aria-labelledby': 'favoritos' },
        sectionHead('Favoritos', 'favoritos'),
        entries(
          favs.map((id) => {
            const food = FOOD_BY_ID[id];
            let v;
            try {
              v = verdictForFood(id, profile);
            } catch {
              v = { level: food.level, phrase: food.phrase };
            }
            return entryLink({ href: `#/ficha/${encodeURIComponent(id)}`, level: v.level, title: food.name, phrase: v.phrase, headingLevel: 3 });
          }),
        ),
      ),
    );
  }

  paintList();
  paintFavs();
}
