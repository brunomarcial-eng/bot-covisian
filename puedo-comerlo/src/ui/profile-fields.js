// Campos del perfil, compartidos entre el arranque y Ajustes.
// Nada clínico: solo alergias, una cosa libre y dietas.

import { ALERGIAS, DIETAS, OTRA_MAX } from '../store.js';
import { h, uid } from './dom.js';

// Rótulos de pantalla. Los ids (sin_lactosa…) no cambian.
const DIETA_LABEL = { sin_lactosa: 'Sin lactosa (intolerancia)' };

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
    legend: opts.legend || 'Dietas y restricciones',
    legendClass: opts.legendClass || 'legend',
    hideLegend: !!opts.hideLegend,
    hint: opts.hint ?? null,
    columns: 2,
    children: Object.entries(DIETAS).map(([id, label]) =>
      choice({ type: 'checkbox', name: 'dieta', value: id, checked: selected.includes(id), title: DIETA_LABEL[id] || label }),
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
