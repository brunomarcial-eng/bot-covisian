// Instalar en el móvil: cómo poner la app en la pantalla de inicio.
// No hay modo sin conexión (descartado): solo icono, nombre y apertura sin la barra del navegador.
// Nada de capturas ni logos de sistemas: pasos escritos y dibujos de línea genéricos.

import { h, icon, announce, fill, append } from './dom.js';

const HINT_KEY = 'pc.v1.installHint';

// ---------- Estado de instalación (se escucha desde el arranque de la app) ----------

let deferredPrompt = null; // evento beforeinstallprompt guardado (Chrome/Edge/Samsung en Android)
let installedNow = false; // se ha instalado en esta visita (appinstalled)
let listening = false;
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch (err) {
      console.warn(err);
    }
  }
}

function onInstallChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// Llamar una vez al arrancar: el aviso del navegador puede llegar antes de abrir esta pantalla.
export function listenForInstall() {
  if (listening) return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin la barrita automática de Chrome: la instalación se ofrece aquí, cuando ella quiera.
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    notify();
  });
}

export function isStandalone() {
  try {
    if (window.matchMedia) {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    }
  } catch {
    /* sin matchMedia */
  }
  return window.navigator.standalone === true;
}

// 'ios' | 'android' | 'other'. Solo para ordenar las instrucciones; no se guarda ni se envía.
export function detectPlatform(nav = window.navigator) {
  const ua = nav.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPad con iPadOS se presenta como Mac, pero con pantalla táctil.
  if (/Macintosh/i.test(ua) && (nav.maxTouchPoints || 0) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function isIosOtherBrowser(nav = window.navigator) {
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram/i.test(nav.userAgent || '');
}

// ---------- Aviso discreto en Inicio ----------

const memoryHint = { closed: false };

function hintClosed() {
  if (memoryHint.closed) return true;
  try {
    return window.localStorage.getItem(HINT_KEY) != null;
  } catch {
    return false;
  }
}

function closeHint() {
  memoryHint.closed = true;
  try {
    window.localStorage.setItem(HINT_KEY, JSON.stringify({ closed: true, at: Date.now() }));
  } catch {
    /* modo privado: basta con la memoria de esta visita */
  }
}

// Una línea en Inicio. null si ya está instalada o si la cerró.
export function installHint() {
  if (isStandalone() || installedNow || hintClosed()) return null;
  const close = h(
    'button',
    { type: 'button', class: 'install-hint-close', 'aria-label': 'Cerrar este aviso' },
    icon('close', 20),
  );
  const box = h(
    'aside',
    { class: 'install-hint', 'aria-label': 'Instalar en el móvil' },
    h('span', { class: 'install-hint-icon' }, icon('install', 22)),
    h(
      'p',
      { class: 'install-hint-text' },
      'Tenla a mano: ',
      h('a', { href: '#/instalar' }, 'ponla en la pantalla de inicio'),
      '.',
    ),
    close,
  );
  close.addEventListener('click', () => {
    closeHint();
    const h1 = document.querySelector('#main h1');
    box.remove();
    announce('Aviso cerrado. Lo tienes también en Ajustes.');
    if (h1) h1.focus({ preventScroll: true });
  });
  return box;
}

// ---------- Pantalla ----------

const GUIDES = {
  ios: {
    title: 'En iPhone, con Safari',
    steps: [
      {
        icon: 'share',
        title: 'Toca el botón Compartir',
        detail: 'El cuadrado con una flecha hacia arriba. Si no lo ves, toca antes los tres puntos de la barra de Safari.',
      },
      {
        icon: 'add-square',
        title: 'Elige «Añadir a pantalla de inicio»',
        detail: 'Si no aparece, desliza la lista hacia arriba o toca «Ver más».',
      },
      {
        icon: 'check',
        title: 'Toca «Añadir»',
        detail: 'Arriba a la derecha. Si sale «Abrir como app web», déjalo activado.',
      },
    ],
    note: 'Tiene que ser desde Safari. En otros navegadores del iPhone puede que la opción no salga.',
  },
  android: {
    title: 'En Android, con Chrome',
    steps: [
      {
        icon: 'dots-vertical',
        title: 'Toca el menú ⋮',
        detail: 'Los tres puntos, arriba a la derecha.',
      },
      {
        icon: 'add-square',
        title: 'Elige «Instalar aplicación» o «Añadir a pantalla de inicio»',
        detail: 'El nombre cambia según la versión de Chrome.',
      },
      {
        icon: 'check',
        title: 'Confirma',
        detail: 'Toca «Instalar» o «Añadir» en el aviso que sale.',
      },
    ],
    note: 'En otros navegadores la opción suele estar en su menú, con un nombre parecido.',
  },
};

function guideSection(key, { mine = false, warn = null } = {}) {
  const g = GUIDES[key];
  const headId = `guia-${key}`;
  return h(
    'section',
    { class: 'sheet install-guide', 'aria-labelledby': headId, dataset: { os: key } },
    h(
      'div',
      { class: 'install-guide-head' },
      h('h2', { id: headId }, g.title),
      mine ? h('span', { class: 'install-tag' }, 'Tu móvil') : null,
    ),
    warn ? h('div', { class: 'notice notice--problem' }, icon('info', 22), h('p', null, warn)) : null,
    h(
      'ol',
      { class: 'install-steps' },
      g.steps.map((s) =>
        h(
          'li',
          null,
          h('span', { class: 'install-step-icon' }, icon(s.icon, 24)),
          h(
            'span',
            { class: 'install-step-text' },
            h('span', { class: 'install-step-title' }, s.title),
            h('span', { class: 'install-step-detail' }, s.detail),
          ),
        ),
      ),
    ),
    h('p', { class: 'install-note' }, g.note),
  );
}

export function render({ main, signal }) {
  const platform = detectPlatform();
  const top = h('div', { class: 'install-top' });
  const status = h('p', { class: 'install-status', role: 'status', 'aria-live': 'polite' });

  function paintTop() {
    if (isStandalone() || installedNow) {
      fill(
        top,
        h(
          'div',
          { class: 'notice notice--ok' },
          icon('check', 22),
          h(
            'p',
            null,
            isStandalone()
              ? 'Ya la tienes en la pantalla de inicio. La estás usando desde ahí.'
              : 'Hecho. La encontrarás en la pantalla de inicio.',
          ),
        ),
      );
      return;
    }
    if (deferredPrompt) {
      const btn = h('button', { type: 'button', class: 'btn btn--primary' }, icon('install', 22), 'Instalar');
      btn.addEventListener('click', async () => {
        const ev = deferredPrompt;
        if (!ev) return;
        deferredPrompt = null; // el aviso del navegador solo se puede usar una vez
        btn.disabled = true;
        let outcome = 'dismissed';
        try {
          await ev.prompt();
          const choice = await ev.userChoice;
          outcome = choice && choice.outcome;
        } catch (err) {
          console.warn(err);
        }
        if (outcome === 'accepted') {
          installedNow = true;
          status.textContent = 'Instalándose. La encontrarás en la pantalla de inicio.';
        } else {
          status.textContent = 'Sin problema. Puedes hacerlo cuando quieras con los pasos de abajo.';
        }
        paintTop();
      });
      fill(top, h('p', null, 'Este navegador deja instalarla con un toque.'), h('div', { class: 'actions actions--tight' }, btn));
      return;
    }
    fill(top);
  }

  const order = platform === 'ios' ? ['ios', 'android'] : ['android', 'ios'];
  const iosWarn =
    platform === 'ios' && isIosOtherBrowser()
      ? 'Parece que no estás en Safari. Abre esta misma dirección en Safari y sigue los pasos.'
      : null;

  const guides = h(
    'div',
    { class: 'install-guides' },
    order.map((k) => guideSection(k, { mine: k === platform, warn: k === 'ios' ? iosWarn : null })),
  );

  append(main, [
    h('h1', null, 'Instalar en el móvil'),
    h('p', { class: 'lead' }, 'Ponla en la pantalla de inicio y se abrirá como una app, sin la barra del navegador.'),
    platform === 'other'
      ? h('p', null, 'Estás en un ordenador. Abre esta misma dirección en el móvil y sigue los pasos.')
      : null,
    top,
    status,
    isStandalone() ? null : guides,
    h(
      'div',
      { class: 'notice notice--ok mt-lg' },
      icon('lock', 22),
      h('p', null, 'No ocupa espacio ni pide permisos al instalarla. Tus datos siguen solo en este móvil.'),
    ),
    h('p', { class: 'install-note' }, 'Necesita internet para abrirse, igual que en el navegador.'),
  ]);

  paintTop();
  const off = onInstallChange(paintTop);
  if (signal) signal.addEventListener('abort', off, { once: true });
  return off;
}
