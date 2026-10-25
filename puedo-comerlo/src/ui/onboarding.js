// Arranque: 4 pasos, una sola vez. Se guarda el perfil al avanzar cada paso.
// PROHIBIDO cualquier pregunta clínica.

import { getProfile, saveProfile, setOnboarded } from '../store.js';
import { h, icon } from './dom.js';
import { navigate } from './router.js';
import { alergiasFieldset, otraField, dietaFieldset, checkedValues } from './profile-fields.js';

const TOTAL = 4;

function header(n) {
  const back =
    n > 1
      ? h(
          'button',
          {
            type: 'button',
            class: 'back-btn',
            onclick: () => navigate(`#/arranque/${Math.max(1, n - 1)}`),
          },
          icon('arrow-left', 18, 1.5),
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

function stepForm(onSubmit, children, { label = 'Seguir' } = {}) {
  const button = h('button', { type: 'submit', class: 'btn btn--primary' }, label);
  const form = h('form', { novalidate: true }, children, h('div', { class: 'actions' }, button));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit(form);
  });
  return { form, button };
}

function goNext(n) {
  navigate(`#/arranque/${Math.min(TOTAL, n + 1)}`);
}

// ---------- Pasos ----------

function step1() {
  const { form } = stepForm(
    () => goNext(1),
    [
      h('h1', { class: 'cover-title' }, '¿Puedo comerlo?'),
      h('p', { class: 'lead' }, 'Para la carta y para el súper. Una respuesta corta, y el motivo solo si lo abres.'),
      h(
        'p',
        { class: 'disclaimer-note' },
        'Es una guía orientativa, no una app médica. No hay un médico detrás y no sustituye a tu matrona, a tu ginecólogo ni a tu médico.',
      ),
    ],
  );
  return [form];
}

function step2(profile) {
  const { form } = stepForm(
    (f) => {
      const otra = (f.querySelector('input[name="otra"]')?.value || '').trim();
      saveProfile({ ...getProfile(), alergias: checkedValues(f, 'alergias'), otra });
      goNext(2);
    },
    [
      h('h1', null, 'Alergias e intolerancias'),
      h('p', { class: 'lead' }, 'Opcional. Si marcas algo, un plato que lo lleve saldrá como «Mejor no».'),
      alergiasFieldset(profile.alergias, { legend: 'Alergias', hideLegend: true }),
      h('div', { class: 'mt-lg' }, otraField(profile.otra)),
    ],
  );
  return [form];
}

function step3(profile) {
  const { form } = stepForm(
    (f) => {
      saveProfile({ ...getProfile(), dieta: checkedValues(f, 'dieta') });
      goNext(3);
    },
    [
      h('h1', null, 'Dietas y restricciones'),
      h('p', { class: 'lead' }, 'Opcional. Puedes marcar varias.'),
      dietaFieldset(profile.dieta, { legend: 'Dietas y restricciones', hideLegend: true }),
      h(
        'p',
        { class: 'hint' },
        'No cambia el semáforo. Solo añade una nota en la respuesta, como «No encaja con vegana» o «Lleva cerdo».',
      ),
    ],
  );
  return [form];
}

function step4() {
  const items = [
    'No te pedimos la semana de embarazo ni analíticas.',
    'Tus alergias y tu lista se quedan en este móvil, y no hay cuenta.',
    'La foto se envía solo para leer el texto, no se guarda, y el semáforo lo calculan reglas fijas.',
  ];
  const { form } = stepForm(
    () => {
      saveProfile(getProfile());
      setOnboarded(true);
      navigate('#/', { replace: true });
    },
    [h('h1', null, 'Tu privacidad'), h('ul', { class: 'privacy-list' }, items.map((text) => h('li', null, text)))],
    { label: 'Empezar' },
  );
  return [form];
}

const STEPS = { 1: step1, 2: step2, 3: step3, 4: step4 };

export function render({ main, segs }) {
  const n = parseInt(segs[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > TOTAL) {
    navigate('#/arranque/1', { replace: true });
    return;
  }
  main.append(header(n), ...STEPS[n](getProfile()));
}
