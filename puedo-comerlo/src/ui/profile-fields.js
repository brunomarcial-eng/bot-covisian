// Campos del perfil, compartidos entre el arranque y Ajustes.
// Nada clínico: solo embutido, alergias, una cosa libre y forma de comer.

import { EMBUTIDOS, ALERGIAS, DIETAS, OTRA_MAX } from '../store.js';
import { h, uid } from './dom.js';

export const EMBUTIDO_OPTIONS = [
  {
    id: 'no',
    title: 'No quiero comer embutidos',
    desc: 'Jamón, chorizo, salchichón, fuet o lomo salen como «Mejor no», también en croqueta o pizza.',
  },
  {
    id: 'cocinados',
    title: 'Solo si van cocinados',
    desc: 'En crudo, mejor no. Cocinados dentro del plato (croqueta, guiso, pizza al horno), sí.',
  },
  {
    id: 'los_como',
    title: 'Los como, y quiero ver el riesgo',
    desc: 'En crudo no pasan a «Sí»: verás una línea con el motivo y siguen saliendo «Mejor no». Cocinados dentro del plato, sí. La decisión, en la mesa, es tuya.',
  },
];

export const EMBUTIDO_ALTERNATIVAS = [
  'El mismo embutido bien cocinado dentro del plato (croqueta, sofrito, pizza al horno), no solo apoyado al servir.',
  'Un fiambre recién hecho en caliente, mejor que una bandeja loncheada abierta en la nevera.',
  'Otras proteínas: huevo bien cuajado, pollo o ternera hechos del todo, legumbres, o pescado hecho que no sea pez espada, atún rojo, tiburón o lucio.',
];

export function choice({ type, name, value, checked = false, title, desc = null }) {
  const id = uid(`${name}-${value}`);
  const titleId = `${id}-t`;
  const descId = desc ? `${id}-d` : null;
  const input = h('input', {
    type,
    name,
    value,
    id,
    checked,
    'aria-labelledby': titleId,
    'aria-describedby': descId,
  });
  return h(
    'label',
    { class: 'choice', for: id },
    input,
    h(
      'span',
      { class: 'choice-text' },
      h('span', { class: 'choice-title', id: titleId }, title),
      desc ? h('span', { class: 'choice-desc', id: descId }, desc) : null,
    ),
  );
}

function fieldset({ legend, legendClass = 'legend', hint = null, columns = 1, children, hideLegend = false, name }) {
  const hintId = hint ? uid('ayuda') : null;
  return h(
    'fieldset',
    { 'aria-describedby': hintId, dataset: { field: name } },
    h('legend', { class: hideLegend ? 'visually-hidden' : legendClass }, legend),
    hint ? h('p', { class: 'fieldset-hint', id: hintId }, hint) : null,
    h('div', { class: `choices${columns === 2 ? ' choices--2' : ''}` }, children),
  );
}

export function embutidoFieldset(value, { legend = '¿Qué has decidido?', legendClass = 'legend', hint = null } = {}) {
  return fieldset({
    name: 'embutido',
    legend,
    legendClass,
    hint,
    children: EMBUTIDO_OPTIONS.map((o) =>
      choice({ type: 'radio', name: 'embutido', value: o.id, checked: value === o.id, title: o.title, desc: o.desc }),
    ),
  });
}

export function embutidosFieldset(selected = [], opts = {}) {
  return fieldset({
    name: 'embutidos',
    legend: opts.legend || '¿Cuáles comes?',
    legendClass: opts.legendClass || 'legend',
    hideLegend: !!opts.hideLegend,
    hint: opts.hint ?? null,
    children: Object.entries(EMBUTIDOS).map(([id, label]) =>
      choice({ type: 'checkbox', name: 'embutidos', value: id, checked: selected.includes(id), title: label }),
    ),
  });
}

export function alergiasFieldset(selected = [], opts = {}) {
  return fieldset({
    name: 'alergias',
    legend: opts.legend || 'Alergias',
    legendClass: opts.legendClass || 'legend',
    hideLegend: !!opts.hideLegend,
    hint: opts.hint ?? null,
    columns: 2,
    children: Object.entries(ALERGIAS).map(([id, label]) =>
      choice({ type: 'checkbox', name: 'alergias', value: id, checked: selected.includes(id), title: label }),
    ),
  });
}

export function dietaFieldset(selected = [], opts = {}) {
  return fieldset({
    name: 'dieta',
    legend: opts.legend || 'Forma de comer',
    legendClass: opts.legendClass || 'legend',
    hideLegend: !!opts.hideLegend,
    hint: opts.hint ?? null,
    columns: 2,
    children: Object.entries(DIETAS).map(([id, label]) =>
      choice({ type: 'checkbox', name: 'dieta', value: id, checked: selected.includes(id), title: label }),
    ),
  });
}

// Campo libre corto con contador.
export function otraField(value = '', { labelClass = 'label' } = {}) {
  const id = uid('otra');
  const hintId = `${id}-ayuda`;
  const countId = `${id}-cuenta`;
  const input = h('input', {
    id,
    name: 'otra',
    type: 'text',
    class: 'input',
    maxlength: OTRA_MAX,
    autocomplete: 'off',
    'aria-describedby': `${hintId} ${countId}`,
    placeholder: 'Por ejemplo: cilantro',
  });
  input.value = value || '';
  const counter = h('p', { class: 'counter', id: countId });
  const paint = () => {
    counter.textContent = `${input.value.length} de ${OTRA_MAX} caracteres`;
  };
  input.addEventListener('input', paint);
  paint();
  return h(
    'div',
    { class: 'field field--otra' },
    h('label', { class: labelClass, for: id }, 'Otra cosa que no quieras comer'),
    h('p', { class: 'fieldset-hint', id: hintId }, 'Opcional. Si aparece en el plato, saldrá como «Mejor no».'),
    input,
    counter,
  );
}

export function checkedValues(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
}

export function radioValue(form, name) {
  const el = form.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}
