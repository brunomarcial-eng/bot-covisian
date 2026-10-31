// Pantalla entera del color del veredicto.
//
// Una pantalla de UNA respuesta (Buscar con respuesta, ficha, producto, etiqueta) toma el color
// del semáforo a sangre: fondo de página, barra superior e inferior. El estado se expone en
// `document.body.dataset.verdict` = si | cuidado | no | duda mientras la pantalla está coloreada.
// Los colores y el estilo viven en styles.css (`body[data-verdict]`); aquí solo se orquesta:
//   · «iluminación»: de crema a color, el fondo se expande desde la palabra (~420 ms) y el texto
//     aparece después. De un color a otro (Buscar mientras se escribe) es un fundido de 300 ms.
//   · signos de interrogación decorativos en «No estoy segura» y, más discretos, en «Con cuidado».
//   · la meta theme-color (barra de estado del móvil).
// Con prefers-reduced-motion todo es instantáneo y los «?» no se mueven.

const CREAM = '#f3eee6';
const TONE = { si: '#245443', cuidado: '#b04f10', no: '#7a332c', duda: '#86672a' };
const RIPPLE_MS = 420;
const FADE_MS = 300;

// «?» decorativos: tamaño, posición (en la columna), giro, opacidad. Asimétricos y de escalas distintas.
const MARKS = {
  duda: [
    { size: '21rem', bottom: '5.5rem', right: '-3.25rem', rot: '9deg', o: 0.2 },
    { size: '10rem', top: '47%', left: '-1.5rem', rot: '-12deg', o: 0.14 },
    { size: '6.5rem', top: '5.25rem', right: '0.5rem', rot: '14deg', o: 0.16 },
    { size: '4.25rem', bottom: '11rem', left: '22%', rot: '-6deg', o: 0.18 },
    { size: '14rem', top: '-4.5rem', left: '36%', rot: '-9deg', o: 0.1 },
  ],
  cuidado: [
    { size: '15rem', bottom: '6rem', right: '-2.25rem', rot: '8deg', o: 0.13 },
    { size: '5.5rem', top: '5.5rem', right: '0.75rem', rot: '-11deg', o: 0.1 },
  ],
};

let claimed = false; // ¿alguna pantalla ha pedido color en esta navegación?
let marksToken = 0;
let rippleTimer = null;
let igniteTimer = null;
let rippleAnim = null;

const root = () => document.getElementById('tone');
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function setThemeColor(hex) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', hex);
}

// ---------- Navegación ----------
// El router llama a begin antes de pintar una pantalla y a end después: si ninguna pantalla pidió
// color, todo vuelve a crema al instante (sin fundido, sin destellos).
export function beginNavigation() {
  claimed = false;
}
export function endNavigation() {
  if (!claimed) clearTone({ instant: true });
}

// ---------- Color ----------
// `anchor`: la palabra del veredicto (el color se expande desde ahí).
export function setTone(level, { anchor = null } = {}) {
  claimed = true;
  if (!TONE[level]) {
    clearTone();
    return;
  }
  const body = document.body;
  const prev = body.dataset.verdict || null;
  if (prev === level) {
    setThemeColor(TONE[level]);
    return;
  }

  const reduced = reducedMotion();
  const ignite = !prev && !reduced;
  const ripple = root() && root().querySelector('.tone-ripple');

  if (ignite && ripple) {
    startRipple(ripple, level, anchor);
  } else if (prev && rippleTimer && ripple) {
    // Cambio de color mientras aún se está encendiendo: el fondo que se expande toma el color nuevo.
    ripple.style.backgroundColor = TONE[level];
    keepRippleUntil(ripple, RIPPLE_MS + 60);
  }

  clearTimeout(igniteTimer);
  if (ignite) {
    body.classList.add('is-igniting');
    igniteTimer = setTimeout(() => body.classList.remove('is-igniting'), 1500);
  } else if (!(prev && rippleTimer)) {
    body.classList.remove('is-igniting');
  } else {
    igniteTimer = setTimeout(() => body.classList.remove('is-igniting'), 1500);
  }

  body.dataset.verdict = level;
  setThemeColor(TONE[level]);
  setMarks(level, { ignite });
}

export function clearTone({ instant = false } = {}) {
  const body = document.body;
  const had = body.dataset.verdict || null;
  claimed = false;
  if (!had) {
    setThemeColor(CREAM);
    clearMarks(true);
    return;
  }
  const quick = instant || reducedMotion();
  if (quick) body.classList.add('tone-instant');
  stopRipple();
  clearTimeout(igniteTimer);
  body.classList.remove('is-igniting');
  delete body.dataset.verdict;
  setThemeColor(CREAM);
  clearMarks(quick);
  if (quick) {
    void body.offsetWidth; // aplica el estado sin transición antes de quitar la marca
    body.classList.remove('tone-instant');
  }
}

// ---------- Iluminación ----------
function startRipple(ripple, level, anchor) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let x = W / 2;
  let y = H * 0.35;
  if (anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    if (r.width || r.height) {
      x = Math.min(Math.max(r.left + Math.min(r.width, 160) / 2, 0), W);
      y = Math.min(Math.max(r.top + r.height / 2, 0), H);
    }
  }
  const radius = Math.ceil(Math.hypot(Math.max(x, W - x), Math.max(y, H - y))) + 8;
  stopRipple();
  ripple.style.backgroundColor = TONE[level];
  ripple.hidden = false;
  if (typeof ripple.animate === 'function') {
    rippleAnim = ripple.animate(
      [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${radius}px at ${x}px ${y}px)` }],
      { duration: RIPPLE_MS, easing: 'cubic-bezier(0.22, 0.7, 0.2, 1)', fill: 'forwards' },
    );
  }
  keepRippleUntil(ripple, RIPPLE_MS + 70);
}

// El fondo de la página toma el color justo al acabar la expansión (transición con retraso en CSS);
// la capa se retira un poco después, cuando ya no se distingue.
function keepRippleUntil(ripple, ms) {
  clearTimeout(rippleTimer);
  rippleTimer = setTimeout(() => {
    rippleTimer = null;
    if (rippleAnim) {
      rippleAnim.cancel();
      rippleAnim = null;
    }
    ripple.hidden = true;
  }, ms);
}

function stopRipple() {
  clearTimeout(rippleTimer);
  rippleTimer = null;
  if (rippleAnim) {
    rippleAnim.cancel();
    rippleAnim = null;
  }
  const ripple = root() && root().querySelector('.tone-ripple');
  if (ripple) ripple.hidden = true;
}

// ---------- Signos de interrogación ----------
function marksHost() {
  return root() && root().querySelector('.tone-marks');
}

function buildMarks(level, ignite) {
  const host = marksHost();
  if (!host) return;
  const list = MARKS[level] || [];
  host.classList.remove('is-out');
  host.dataset.level = level;
  host.replaceChildren();
  if (level === 'no') {
    // «Mejor no»: una cruz fina que se dibuja (dos trazos), oscura y tenue como los «?».
    const cross = document.createElement('span');
    cross.className = 'tcross';
    cross.setAttribute('aria-hidden', 'true');
    cross.style.setProperty('--d', `${ignite ? 520 : 160}ms`);
    cross.innerHTML = '<i></i><i></i>';
    host.append(cross);
    return;
  }
  list.forEach((m, i) => {
    const s = document.createElement('span');
    s.className = 'tm';
    s.textContent = '?';
    s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--size', m.size);
    s.style.setProperty('--rot', m.rot);
    s.style.setProperty('--o', String(m.o));
    s.style.setProperty('--d', `${(ignite ? 340 : 120) + i * 130}ms`);
    for (const side of ['top', 'right', 'bottom', 'left']) if (m[side] != null) s.style[side] = m[side];
    host.append(s);
  });
}

function setMarks(level, { ignite }) {
  const host = marksHost();
  if (!host) return;
  const token = ++marksToken;
  const has = host.childElementCount > 0 && host.dataset.level;
  if (!MARKS[level] && level !== 'no') {
    clearMarks(false);
    return;
  }
  if (has && host.dataset.level !== level) {
    // De unos «?» a otros: los viejos se funden y luego «surgen» los nuevos.
    host.classList.add('is-out');
    setTimeout(() => {
      if (token === marksToken) buildMarks(level, false);
    }, reducedMotion() ? 0 : 220);
    return;
  }
  if (!has) buildMarks(level, ignite);
}

function clearMarks(instant) {
  const host = marksHost();
  if (!host) return;
  marksToken += 1;
  const token = marksToken;
  if (!host.childElementCount) return;
  if (instant) {
    host.replaceChildren();
    delete host.dataset.level;
    host.classList.remove('is-out');
    return;
  }
  host.classList.add('is-out');
  setTimeout(() => {
    if (token === marksToken) {
      host.replaceChildren();
      delete host.dataset.level;
      host.classList.remove('is-out');
    }
  }, FADE_MS);
}
