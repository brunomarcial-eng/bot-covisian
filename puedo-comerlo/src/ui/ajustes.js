// Ajustes: cambiar lo del arranque y borrar los datos de este móvil.

import { getProfile, saveProfile, clearAll } from '../store.js';
import { h, icon, announce, fill } from './dom.js';
import { confirmBox } from './components.js';
import { navigate } from './router.js';
import {
  embutidoFieldset,
  embutidosFieldset,
  alergiasFieldset,
  otraField,
  dietaFieldset,
  checkedValues,
  radioValue,
} from './profile-fields.js';

export function render({ main }) {
  const profile = getProfile();

  const embutidosBox = h(
    'div',
    { class: 'embutidos-box' },
    embutidosFieldset(profile.embutidos, {
      legend: '¿Cuáles comes?',
      hint: 'Los que no marques saldrán como «Mejor no». Si no marcas ninguno, se aplican todos.',
    }),
  );
  embutidosBox.hidden = profile.embutido === 'no';

  const saved = h('p', { class: 'saved-msg', role: 'status', 'aria-live': 'polite' });
  const form = h(
    'form',
    { novalidate: true, class: 'ajustes-form' },
    embutidoFieldset(profile.embutido, {
      legend: 'Embutido y jamón curado',
      hint: 'Jamón, chorizo, salchichón, fuet o lomo embuchado, en crudo. El fiambre de bandeja sale siempre como «Mejor no».',
    }),
    embutidosBox,
    alergiasFieldset(profile.alergias, { legend: 'Alergias', hint: 'Lo que las lleve saldrá como «Mejor no».' }),
    h('div', { class: 'mt-lg' }, otraField(profile.otra)),
    dietaFieldset(profile.dieta, {
      legend: 'Forma de comer',
      hint: 'No cambia el semáforo. Solo añade una nota en la ficha.',
    }),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn--primary' }, 'Guardar')),
    saved,
  );

  form.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'embutido') {
      embutidosBox.hidden = e.target.value === 'no';
    }
    saved.textContent = '';
  });
  form.addEventListener('input', () => {
    saved.textContent = '';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const embutido = radioValue(form, 'embutido') || getProfile().embutido;
    saveProfile({
      embutido,
      embutidos: embutido === 'no' ? [] : checkedValues(form, 'embutidos'),
      alergias: checkedValues(form, 'alergias'),
      otra: (form.querySelector('input[name="otra"]')?.value || '').trim(),
      dieta: checkedValues(form, 'dieta'),
    });
    saved.textContent = 'Guardado. Las fichas ya usan estos ajustes.';
  });

  // Borrar los datos de este móvil
  const dangerArea = h('div', { class: 'actions' });
  const clearBtn = h('button', { type: 'button', class: 'btn btn--danger' }, icon('trash', 22), 'Borrar los datos de este móvil');
  clearBtn.addEventListener('click', () => {
    const box = confirmBox({
      text: '¿Borrar todos los datos de este móvil?',
      detail: 'Se borran tus ajustes, la lista, los favoritos y el historial. No se puede deshacer y volverás al arranque.',
      confirmLabel: 'Borrar todo',
      onConfirm: () => {
        clearAll();
        announce('Datos borrados.');
        navigate('#/arranque/1', { replace: true });
      },
      onCancel: () => {
        fill(dangerArea, clearBtn);
        clearBtn.focus();
      },
    });
    fill(dangerArea, box);
    box.focusMessage();
  });
  dangerArea.append(clearBtn);

  main.append(
    h('h1', null, 'Ajustes'),
    h('p', { class: 'lead' }, 'Lo que cambies aquí se aplica a todas las fichas. Se queda en este móvil.'),
    form,
    h('hr', { class: 'divider' }),
    h('h2', { class: 'mt-0' }, 'Historial'),
    h('p', null, 'Tus últimas consultas, con su semáforo.'),
    h('a', { class: 'btn btn--secondary', href: '#/historial' }, icon('clock', 22), 'Ver el historial'),
    h('h2', null, 'Tus datos'),
    h('p', null, 'Todo está guardado solo en este móvil. No hay cuenta y no lo vemos.'),
    dangerArea,
  );
}
