// Arranque: 6 pasos, una sola vez. Se guarda el perfil al avanzar cada paso.
// PROHIBIDO cualquier pregunta clínica.

import { getProfile, saveProfile, setOnboarded } from '../store.js';
import { h, icon } from './dom.js';
import { pill } from './components.js';
import { navigate } from './router.js';
import {
  EMBUTIDO_ALTERNATIVAS,
  embutidoFieldset,
  embutidosFieldset,
  alergiasFieldset,
  otraField,
  dietaFieldset,
  checkedValues,
  radioValue,
} from './profile-fields.js';

const TOTAL = 6;

function prevStep(n, profile) {
  if (n === 4 && profile.embutido === 'no') return 2;
  return Math.max(1, n - 1);
}

function nextStep(n, profile) {
  if (n === 2 && profile.embutido === 'no') return 4;
  return Math.min(TOTAL, n + 1);
}

function header(n, profile) {
  const back =
    n > 1
      ? h(
          'button',
          {
            type: 'button',
            class: 'link-btn',
            onclick: () => navigate(`#/arranque/${prevStep(n, getProfile())}`),
          },
          icon('chevron-left', 20),
          'Atrás',
        )
      : h('span');
  const bar = h(
    'div',
    { class: 'steps-bar', 'aria-hidden': 'true' },
    Array.from({ length: TOTAL }, (_, i) => h('span', { class: i < n ? 'is-done' : '' })),
  );
  return h(
    'div',
    { class: 'steps' },
    h('div', { class: 'steps-head' }, back, h('p', { class: 'steps-count' }, `Paso ${n} de ${TOTAL}`)),
    bar,
  );
}

function stepForm(onSubmit, children, { label = 'Seguir', disabled = false, hint = null } = {}) {
  const hintEl = hint ? h('p', { class: 'hint', id: 'seguir-ayuda' }, hint) : null;
  const button = h(
    'button',
    { type: 'submit', class: 'btn btn--primary', disabled, 'aria-describedby': hint ? 'seguir-ayuda' : null },
    label,
  );
  const form = h('form', { novalidate: true }, children, h('div', { class: 'actions' }, button, hintEl));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (button.disabled) return;
    onSubmit(form);
  });
  return { form, button, hintEl };
}

function goNext(n) {
  navigate(`#/arranque/${nextStep(n, getProfile())}`);
}

// ---------- Pasos ----------

function step1() {
  const legend = h(
    'div',
    { class: 'sheet stack mt-lg' },
    h('p', { class: 'm-0' }, 'Verás siempre una de estas cuatro respuestas, con su palabra:'),
    h('div', { class: 'actions-row' }, pill('si'), pill('cuidado'), pill('no'), pill('duda')),
  );
  const { form } = stepForm(
    () => goNext(1),
    [
      h('h1', { class: 'cover-title' }, '¿Puedo comerlo?'),
      h('p', { class: 'lead' }, 'Para la carta y para el súper. Una respuesta corta, y el motivo solo si lo abres.'),
      h(
        'div',
        { class: 'notice' },
        icon('info', 22),
        h(
          'p',
          null,
          'Es una guía orientativa, no una app médica. No hay un médico detrás y no sustituye a tu matrona, a tu ginecólogo ni a tu médico.',
        ),
      ),
      legend,
    ],
  );
  return [form];
}

function step2(profile) {
  const fs = embutidoFieldset(profile.embutido);
  const { form, button, hintEl } = stepForm(
    (f) => {
      const embutido = radioValue(f, 'embutido');
      if (!embutido) return;
      const p = getProfile();
      saveProfile({ ...p, embutido, embutidos: embutido === 'no' ? [] : p.embutidos });
      goNext(2);
    },
    [
      h('h1', null, 'Embutido y jamón curado'),
      h(
        'div',
        { class: 'prose' },
        h(
          'p',
          null,
          'El jamón, el chorizo, el salchichón, el fuet o el lomo embuchado, en crudo, son un cárnico sin cocinar. AESAN los señala por toxoplasmosis y, si van loncheados, también por listeria.',
        ),
        h('p', null, 'Aquí no te preguntamos por analíticas: tú dices si entran o no en tu mesa.'),
        h(
          'p',
          null,
          'El fiambre de bandeja (york, pavo, chopped) va aparte: en frío sale como «Mejor no», aunque el jamón curado te dé igual; cocinado dentro del plato (pizza, sándwich mixto, croqueta), sí.',
        ),
      ),
      h('h2', null, 'Alternativas'),
      h('ul', { class: 'alt-list' }, EMBUTIDO_ALTERNATIVAS.map((t) => h('li', null, t))),
      fs,
    ],
    { disabled: !profile.embutido, hint: profile.embutido ? null : 'Elige una opción para seguir.' },
  );
  form.addEventListener('change', () => {
    if (radioValue(form, 'embutido')) {
      button.disabled = false;
      button.removeAttribute('aria-describedby');
      if (hintEl) hintEl.hidden = true;
    }
  });
  return [form];
}

function step3(profile) {
  const { form } = stepForm(
    (f) => {
      saveProfile({ ...getProfile(), embutidos: checkedValues(f, 'embutidos') });
      goNext(3);
    },
    [
      h('h1', null, '¿Cuáles comes?'),
      h('p', { class: 'lead' }, 'Los que no marques saldrán como «Mejor no».'),
      embutidosFieldset(profile.embutidos, { legend: 'Embutidos que comes', hideLegend: true }),
      h('p', { class: 'hint' }, 'Si no marcas ninguno, se aplican todos.'),
    ],
  );
  return [form];
}

function step4(profile) {
  const { form } = stepForm(
    (f) => {
      const otra = (f.querySelector('input[name="otra"]')?.value || '').trim();
      saveProfile({ ...getProfile(), alergias: checkedValues(f, 'alergias'), otra });
      goNext(4);
    },
    [
      h('h1', null, 'Alergias'),
      h('p', { class: 'lead' }, 'Opcional. Lo que lleve algo de lo que marques saldrá como «Mejor no».'),
      alergiasFieldset(profile.alergias, { legend: 'Alergias', hideLegend: true }),
      h('div', { class: 'mt-xl' }, otraField(profile.otra)),
    ],
  );
  return [form];
}

function step5(profile) {
  const { form } = stepForm(
    (f) => {
      saveProfile({ ...getProfile(), dieta: checkedValues(f, 'dieta') });
      goNext(5);
    },
    [
      h('h1', null, 'Forma de comer'),
      h('p', { class: 'lead' }, 'Opcional. Puedes marcar varias.'),
      dietaFieldset(profile.dieta, { legend: 'Forma de comer', hideLegend: true }),
      h(
        'div',
        { class: 'notice mt-lg' },
        icon('info', 22),
        h(
          'p',
          null,
          'No cambia el semáforo. Solo añade una nota en la ficha, como «No encaja con vegana» o «Lleva cerdo».',
        ),
      ),
    ],
  );
  return [form];
}

function step6() {
  const items = [
    ['lock', 'No te pedimos la semana de embarazo ni analíticas.'],
    ['phone', 'Tus alergias y tu lista se quedan en este móvil, y no hay cuenta.'],
    ['camera', 'La foto se envía solo para leer el texto, no se guarda, y el semáforo lo calculan reglas fijas.'],
  ];
  const { form } = stepForm(
    () => {
      saveProfile(getProfile());
      setOnboarded(true);
      navigate('#/', { replace: true });
    },
    [
      h('h1', null, 'Tu privacidad'),
      h('ul', { class: 'privacy-list' }, items.map(([ic, text]) => h('li', null, icon(ic, 24), h('span', null, text)))),
    ],
    { label: 'Empezar' },
  );
  return [form];
}

const STEPS = { 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6 };

export function render({ main, segs }) {
  let n = parseInt(segs[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > TOTAL) {
    navigate('#/arranque/1', { replace: true });
    return;
  }
  const profile = getProfile();
  if (n >= 3 && !profile.embutido) {
    navigate('#/arranque/2', { replace: true });
    return;
  }
  if (n === 3 && profile.embutido === 'no') {
    navigate('#/arranque/4', { replace: true });
    return;
  }
  main.append(header(n, profile), ...STEPS[n](profile));
}
