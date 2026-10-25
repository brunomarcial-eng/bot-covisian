// En el súper: código de barras (Open Food Facts) o foto de la etiqueta.

import { classifyProduct } from '../engine/index.js';
import { addHistory, setResult, getResult } from '../store.js';
import { h, fill } from './dom.js';
import { classifyItem, NOTICE_ETIQUETA_OCR } from './recalc.js';
import { galleryInput, photoFlow, readingView } from './photo.js';
import { atajos, cleanItems } from './fuera.js';
import { loadingStatus } from './art-ui.js';
import { LABEL_BUTTON, DEFAULT_TOPICS } from './etiqueta-ui.js';
import { navigate, replaceQuietly } from './router.js';

export const ATAJOS_SUPER = [
  ['Atún en lata', 'atun-lata'],
  ['Loncheados', 'fiambre-loncheado'],
  ['Queso rallado', 'queso-loncheado-rallado'],
  ['Paté', 'pate'],
  ['Ahumado', 'pescado-ahumado'],
  ['Café', 'cafe'],
  ['Alcohol', 'alcohol'],
  ['Cerveza 0,0', 'cerveza-00'],
];

const MSG_NO_ESTA = 'No lo encuentro. Fotografía los ingredientes y lo miro por ti.';
const MSG_INGREDIENTES = 'No he podido leer los ingredientes. Acércala, con buena luz.';
const MSG_RED = 'No he podido consultar Open Food Facts. Revisa la conexión o fotografía los ingredientes.';
const MSG_ETIQUETA = 'No he podido leer la etiqueta. Acércala, con buena luz.';

function messageBox(text, kind = 'problem') {
  return h('div', { class: `notice${kind === 'problem' ? ' notice--problem' : ''}`, tabindex: '-1' }, h('p', null, text));
}

async function codeIsValid(code) {
  try {
    const { isValidCode } = await import('../capture/barcode.js');
    return isValidCode(code);
  } catch {
    return /^\d{8,14}$/.test(code);
  }
}

export function render(ctx) {
  const { main, signal, params, profile } = ctx;
  const intro = h('p', { class: 'lead' }, 'El código consulta Open Food Facts. Si no está, fotografía los ingredientes.');
  const body = h('div', { class: 'super-body' });
  const gallery = galleryInput((file) => readLabel(file));
  main.append(h('h1', null, 'En el súper'), intro, body, gallery);

  let scanner = null;
  let flow = null;
  let lastCode = '';
  // Escaneo guiado: el producto del código (o null si no se encontró) al que se le fotografían los ingredientes.
  let labelCtx = null;
  let backToResult = false;

  const stopScanner = () => {
    if (scanner) {
      try {
        scanner.stop();
      } catch {
        /* nada */
      }
      scanner = null;
    }
  };
  signal.addEventListener('abort', stopScanner, { once: true });

  // ---------- Vista inicial ----------
  function showHome({ message = null, labelFirst = false, ingredients = false } = {}) {
    stopScanner();
    flow = null;
    backToResult = false;
    if (!ingredients) labelCtx = null;
    intro.hidden = false;

    const scanBtn = h(
      'button',
      { type: 'button', class: `btn ${labelFirst ? 'btn--secondary' : 'btn--primary'}`, onclick: startScan },
      labelFirst ? 'Escanear otro código' : 'Escanear el código',
    );
    const labelBtn = h(
      'button',
      { type: 'button', class: 'btn btn--primary', onclick: startLabel },
      ingredients ? LABEL_BUTTON : 'Fotografiar la etiqueta',
    );

    const input = h('input', {
      id: 'codigo',
      class: 'field-input',
      type: 'text',
      name: 'codigo',
      inputmode: 'numeric',
      autocomplete: 'off',
      pattern: '[0-9]{8,14}',
      maxlength: 20,
      enterkeyhint: 'search',
      'aria-describedby': 'codigo-ayuda',
    });
    input.value = lastCode;
    const error = h('p', { class: 'field-error', id: 'codigo-error', hidden: true });
    const form = h(
      'form',
      { novalidate: true, class: 'code-form' },
      h('label', { class: 'label', for: 'codigo' }, 'O escribe el código'),
      h('div', { class: 'field-box' }, input, h('button', { type: 'submit', class: 'field-go field-go--text' }, 'Consultar')),
      h('p', { class: 'hint', id: 'codigo-ayuda' }, 'Los números de debajo de las barras, de 8 a 14 cifras.'),
      error,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.replace(/[\s.-]+/g, '');
      if (!(await codeIsValid(code))) {
        error.textContent = 'Escribe entre 8 y 14 números, sin letras.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'codigo-ayuda codigo-error');
        input.focus();
        return;
      }
      lookup(code);
    });
    input.addEventListener('input', () => {
      if (!error.hidden) {
        error.hidden = true;
        input.removeAttribute('aria-invalid');
        input.setAttribute('aria-describedby', 'codigo-ayuda');
      }
    });

    fill(body, 
      message,
      h('div', { class: 'actions' }, labelFirst ? [labelBtn, scanBtn] : [scanBtn]),
      form,
      labelFirst
        ? null
        : h('p', { class: 'mt-sm' }, h('button', { type: 'button', class: 'text-link text-link--button', onclick: startLabel }, '¿Sin código? Fotografía la etiqueta')),
      atajos(ATAJOS_SUPER, 'atajos-super'),
    );
    if (message) message.focus();
  }

  // ---------- Escáner ----------
  async function startScan() {
    intro.hidden = true;
    const video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-label': 'Vista de la cámara' });
    video.muted = true;
    const heading = h('h2', { class: 'visually-hidden', tabindex: '-1' }, 'Escanear el código');
    const hint = h('p', { class: 'camera-hint', role: 'status', 'aria-live': 'polite' }, 'Abriendo la cámara…');
    fill(body, 
      heading,
      h('div', { class: 'camera-frame' }, video, h('div', { class: 'scan-guide', 'aria-hidden': 'true' })),
      hint,
      h(
        'div',
        { class: 'camera-actions camera-actions--1' },
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => showHome() }, 'Cancelar'),
      ),
    );
    heading.focus();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showHome({ message: messageBox('No encuentro la cámara. Puedes escribir el código.') });
      return;
    }
    try {
      const { startScanner } = await import('../capture/barcode.js');
      if (signal.aborted) return;
      let done = false;
      const handle = await startScanner(video, (code) => {
        if (done || signal.aborted) return;
        done = true;
        stopScanner();
        lookup(String(code));
      });
      if (signal.aborted || done) {
        handle?.stop?.();
        return;
      }
      scanner = handle;
      hint.textContent = 'Apunta al código de barras. Lo leo solo.';
    } catch (err) {
      if (signal.aborted) return;
      const code = err && err.code;
      const text =
        code === 'denied'
          ? 'No tengo permiso para usar la cámara. Puedes darlo en los ajustes del navegador, o escribir el código.'
          : code === 'no-camera'
            ? 'No encuentro la cámara. Puedes escribir el código.'
            : code === 'no-scanner'
              ? 'Este navegador no sabe leer códigos de barras. Puedes escribir el código.'
              : 'No he podido abrir el lector de códigos. Puedes escribir el código.';
      showHome({ message: messageBox(text) });
    }
  }

  // ---------- Open Food Facts y, si no está o no trae ingredientes, internet ----------
  async function lookup(code) {
    stopScanner();
    lastCode = code;
    labelCtx = null;
    intro.hidden = false;
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const { el: status, text } = loadingStatus('Buscando en Open Food Facts…');
    const cancel = h(
      'button',
      {
        type: 'button',
        class: 'btn btn--secondary',
        onclick: () => {
          ctl.abort();
          showHome({ labelFirst: true });
        },
      },
      'Cancelar',
    );
    fill(body, status, h('p', { class: 'meta mt-sm' }, `Código ${code}`), h('div', { class: 'actions' }, cancel));

    let res = null;
    try {
      const { lookupProduct } = await import('../capture/producto.js');
      res = await lookupProduct(code, {
        signal: ctl.signal,
        onStatus: (t) => {
          if (!ctl.signal.aborted) text.textContent = t;
        },
      });
    } catch (err) {
      if (signal.aborted || ctl.signal.aborted || (err && err.name === 'AbortError')) return;
      console.warn('Consulta del producto:', err);
      showHome({ message: messageBox(MSG_RED), labelFirst: true });
      return;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    if (signal.aborted || ctl.signal.aborted) return;

    if (!res || !res.found || !res.product) {
      // No está en ningún sitio: se fotografían los ingredientes y se mira por ella.
      labelCtx = { product: null, code, topics: DEFAULT_TOPICS };
      showHome({ message: messageBox(MSG_NO_ESTA, 'info'), labelFirst: true, ingredients: true });
      return;
    }
    // El producto lleva de dónde salen sus ingredientes (el motor rebaja los de internet sin confirmar).
    const product = { ...res.product };
    if (res.ingredientsSource) product.ingredientsSource = res.ingredientsSource;
    const web =
      res.source === 'web' || res.productSource === 'web'
        ? { name: res.sourceName || '', url: res.sourceUrl || '' }
        : null;
    const verdict = classifyProduct(product, profile);
    const title = (product.name && String(product.name).trim()) || 'Producto sin nombre';
    const payload = { kind: 'producto', product, web };
    setResult({ title, via: 'codigo', items: [verdict], notice: null, payload });
    addHistory({ via: 'codigo', title, level: verdict.level, phrase: verdict.phrase, foodId: verdict.foodId || null, payload });
    navigate('#/resultado');
  }

  // ---------- Foto de la etiqueta (suelta o de los ingredientes de un producto) ----------
  function startLabel() {
    stopScanner();
    intro.hidden = true;
    flow = photoFlow(body, {
      signal,
      subject: labelCtx ? 'los ingredientes' : 'la etiqueta',
      onPhoto: (blob) => readLabel(blob),
      onCancel: () => {
        if (backToResult) navigate('#/resultado');
        else showHome({ labelFirst: !!lastCode, ingredients: !!labelCtx });
      },
      openGallery: () => gallery.click(),
    });
  }

  async function readLabel(blob) {
    if (flow) flow.destroy();
    flow = null;
    stopScanner();
    intro.hidden = true;
    const view = readingView(body, blob, 'Preparando la foto…');
    let res = null;
    try {
      const { readImage } = await import('../capture/reader.js');
      if (signal.aborted) return;
      res = await readImage(blob, 'etiqueta', {
        signal,
        onStatus: (t) => {
          if (!signal.aborted) view.set(t);
        },
      });
    } catch (err) {
      console.error('No he podido leer la etiqueta:', err);
      res = null;
    } finally {
      view.done();
    }
    if (signal.aborted) return;

    if (labelCtx) {
      readIngredients(res);
      return;
    }

    const items = res && res.readable ? cleanItems(res.items, 1) : [];
    if (!items.length) {
      showHome({ message: messageBox(MSG_ETIQUETA), labelFirst: true });
      return;
    }
    const verdicts = items.map((it) => classifyItem(it, profile));
    const v = verdicts[0];
    const payload = { kind: 'etiqueta', items };
    setResult({
      title: 'La etiqueta',
      via: 'foto',
      items: verdicts,
      notice: res.via === 'ocr' ? NOTICE_ETIQUETA_OCR : null,
      payload,
    });
    addHistory({ via: 'foto', title: 'La etiqueta', level: v.level, phrase: v.phrase, foodId: v.foodId || null, payload });
    navigate('#/resultado');
  }

  // Los ingredientes de la foto se unen al producto del código (nombre y marca del código) y se vuelve a
  // clasificar. El resultado dice qué se ha mirado (los temas que faltaban antes de la foto).
  function readIngredients(res) {
    const ctx = labelCtx;
    const first = res && res.readable && Array.isArray(res.items) ? res.items[0] : null;
    const ingredients = first && Array.isArray(first.ingredients) ? first.ingredients.map((x) => String(x).trim()).filter(Boolean) : [];
    if (!ingredients.length) {
      showHome({ message: messageBox(MSG_INGREDIENTES), labelFirst: true, ingredients: true });
      return;
    }
    const base = ctx.product || { code: ctx.code || '', name: '', brand: '', allergens: [], traces: [], categories: [], labels: [] };
    const product = { ...base, ingredientsText: ingredients.join(', '), ingredientsSource: 'etiqueta' };
    delete product.ingredientsLang;
    if (!String(product.name || '').trim()) product.name = String((first && first.name) || '').trim();
    if (product.name === 'La etiqueta') product.name = '';
    if (!product.name) product.name = 'Producto de la foto';
    const verdict = classifyProduct(product, profile);
    const title = product.name;
    const payload = { kind: 'producto', product, web: null, label: { topics: ctx.topics || [] } };
    const via = product.code ? 'codigo' : 'foto';
    setResult({ title, via, items: [verdict], notice: res.via === 'ocr' ? NOTICE_ETIQUETA_OCR : null, payload });
    addHistory({ via, title, level: verdict.level, phrase: verdict.phrase, foodId: verdict.foodId || null, payload });
    navigate('#/resultado');
  }

  showHome();

  // Accesos directos desde Resultado.
  if (params.get('escanear') === '1') {
    replaceQuietly('#/super');
    startScan();
  } else if (params.get('etiqueta') === '1') {
    replaceQuietly('#/super');
    startLabel();
  } else if (params.get('ingredientes') === '1') {
    // Desde un resultado que pide los ingredientes: se fotografían y se unen a ese producto.
    replaceQuietly('#/super');
    const stored = getResult();
    const product = stored && stored.payload && stored.payload.kind === 'producto' ? stored.payload.product : null;
    if (product) {
      let missing = [];
      try {
        missing = classifyProduct(product, profile).missing || [];
      } catch {
        /* se usan los temas por defecto */
      }
      lastCode = product.code || '';
      labelCtx = { product, code: product.code || '', topics: missing.length ? missing : DEFAULT_TOPICS };
      backToResult = true;
    }
    startLabel();
  }

  return stopScanner;
}
