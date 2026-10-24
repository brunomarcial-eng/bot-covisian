// ¿Puedo comerlo? — arranque de la interfaz y router.
// El semáforo lo calcula siempre el motor local (src/engine). La captura se carga a demanda.

import { isOnboarded, getProfile } from './store.js';
import { parseHash, navigate } from './ui/router.js';
import { h } from './ui/dom.js';
import * as onboarding from './ui/onboarding.js';
import * as home from './ui/home.js';
import * as fuera from './ui/fuera.js';
import * as superScreen from './ui/super.js';
import * as resultado from './ui/resultado.js';
import * as buscar from './ui/buscar.js';
import * as ficha from './ui/ficha.js';
import * as lista from './ui/lista.js';
import * as historial from './ui/historial.js';
import * as ajustes from './ui/ajustes.js';
import * as instalar from './ui/instalar.js';

const SCREENS = {
  '': home,
  arranque: onboarding,
  fuera,
  super: superScreen,
  resultado,
  buscar,
  ficha,
  lista,
  historial,
  ajustes,
  instalar,
};

// Pestaña de la navegación inferior que se marca en cada ruta.
const TAB_FOR = { '': 'inicio', buscar: 'inicio', fuera: 'fuera', super: 'super', lista: 'lista' };

const APP_NAME = '¿Puedo comerlo?';
let current = null;
let firstRender = true;

function setTab(tab) {
  for (const a of document.querySelectorAll('#tabbar a[data-tab]')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function setSettingsCurrent(on) {
  const link = document.getElementById('settings-link');
  if (!link) return;
  if (on) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
}

function errorView(main) {
  main.replaceChildren(
    h('h1', null, 'Algo no ha ido bien'),
    h('p', { class: 'lead' }, 'No he podido mostrar esta pantalla. Vuelve a Inicio e inténtalo otra vez.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: '#/' }, 'Ir a Inicio')),
  );
}

function render() {
  const { segs, params } = parseHash();
  const name = segs[0] || '';

  // Sin arranque hecho → siempre al arranque. Con arranque hecho, el arranque no vuelve.
  if (!isOnboarded()) {
    if (name !== 'arranque') {
      navigate('#/arranque/1', { replace: true });
      return;
    }
  } else if (name === 'arranque') {
    navigate('#/', { replace: true });
    return;
  }

  const screen = SCREENS[name];
  if (!screen) {
    navigate('#/', { replace: true });
    return;
  }

  // Cierra la pantalla anterior (cámara, escáner, temporizadores…).
  if (current) {
    current.controller.abort();
    try {
      if (typeof current.cleanup === 'function') current.cleanup();
    } catch (err) {
      console.warn(err);
    }
  }

  const controller = new AbortController();
  const main = document.getElementById('main');
  main.replaceChildren();
  document.body.classList.toggle('is-onboarding', name === 'arranque');
  document.body.dataset.screen = name || 'inicio';
  setTab(TAB_FOR[name] || null);
  setSettingsCurrent(name === 'ajustes');

  const ctx = {
    main,
    segs,
    params,
    profile: getProfile(),
    signal: controller.signal,
    setTab,
  };

  let cleanup = null;
  try {
    cleanup = screen.render(ctx);
  } catch (err) {
    console.error('Error al pintar la pantalla:', err);
    errorView(main);
  }
  current = { controller, cleanup };

  // Título del documento y foco en el h1.
  const h1 = main.querySelector('h1');
  if (h1) {
    h1.setAttribute('tabindex', '-1');
    const t = h1.textContent.trim();
    document.title = t && t !== APP_NAME ? `${t} · ${APP_NAME}` : APP_NAME;
  } else {
    document.title = APP_NAME;
  }
  window.scrollTo(0, 0);
  if (!firstRender && h1 && !main.contains(document.activeElement)) {
    h1.focus({ preventScroll: true });
  }
  firstRender = false;
}

// Alto real de la barra inferior para que nada quede tapado.
function watchDock() {
  const dock = document.getElementById('dock');
  if (!dock) return;
  const apply = () => {
    document.documentElement.style.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
  };
  apply();
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(dock);
  else window.addEventListener('resize', apply);
}

instalar.listenForInstall();
window.addEventListener('hashchange', render);
watchDock();
render();
