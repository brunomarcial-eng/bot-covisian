// Ajustes: cambiar lo del arranque y borrar los datos de este móvil.

import { getProfile, saveProfile, clearAll } from '../store.js';
import { h, announce, fill } from './dom.js';
import { confirmBox } from './components.js';
import { navigate } from './router.js';
import { isStandalone } from './instalar.js';
import { alergiasFieldset, otraField, dietaFieldset, checkedValues } from './profile-fields.js';

export function render({ main }) {
  const profile = getProfile();

  const saved = h('p', { class: 'saved-msg', role: 'status', 'aria-live': 'polite' });
  const form = h(
    'form',
    { novalidate: true, class: 'ajustes-form' },
    alergiasFieldset(profile.alergias, { legend: 'Alergias', hint: 'Lo que las lleve saldrá como «Mejor no».' }),
    h('div', { class: 'mt-lg' }, otraField(profile.otra)),
    dietaFieldset(profile.dieta, {
      legend: 'Dietas y restricciones',
      hint: 'No cambia el semáforo. Solo añade una nota en la respuesta.',
    }),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn--primary' }, 'Guardar')),
    saved,
  );

  form.addEventListener('change', () => {
    saved.textContent = '';
  });
  form.addEventListener('input', () => {
    saved.textContent = '';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile({
      alergias: checkedValues(form, 'alergias'),
      otra: (form.querySelector('input[name="otra"]')?.value || '').trim(),
      dieta: checkedValues(form, 'dieta'),
    });
    saved.textContent = 'Guardado. Las respuestas ya usan estos ajustes.';
  });

  // Borrar los datos de este móvil
  const dangerArea = h('div', { class: 'actions' });
  const clearBtn = h('button', { type: 'button', class: 'btn btn--danger' }, 'Borrar los datos de este móvil');
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

  const standalone = isStandalone();
  main.append(
    h('h1', null, 'Ajustes'),
    h('p', { class: 'lead' }, 'Lo que cambies aquí se aplica a todas las respuestas. Se queda en este móvil.'),
    form,
    h(
      'section',
      { class: 'section section--settings', 'aria-labelledby': 'aj-historial' },
      h('h2', { id: 'aj-historial' }, 'Historial'),
      h('p', null, 'Tus últimas consultas, con su semáforo.'),
      h('a', { class: 'btn btn--secondary', href: '#/historial' }, 'Ver el historial'),
    ),
    h(
      'section',
      { class: 'section section--settings', 'aria-labelledby': 'aj-claves' },
      h('h2', { id: 'aj-claves' }, 'Las claves del embarazo'),
      h('p', null, 'Los ocho temas que más se repiten, explicados una sola vez.'),
      h('a', { class: 'btn btn--secondary', href: '#/claves' }, 'Ver las claves'),
    ),
    h(
      'section',
      { class: 'section section--settings', 'aria-labelledby': 'aj-instalar' },
      h('h2', { id: 'aj-instalar' }, 'En la pantalla de inicio'),
      standalone
        ? h('p', null, 'Ya la tienes instalada en este móvil.')
        : h('p', null, 'Ponla junto a tus apps y ábrela sin pasar por el navegador.'),
      ...(standalone ? [] : [h('a', { class: 'btn btn--secondary', href: '#/instalar' }, 'Instalar en el móvil')]),
    ),
    h(
      'section',
      { class: 'section section--settings', 'aria-labelledby': 'aj-datos' },
      h('h2', { id: 'aj-datos' }, 'Tus datos'),
      h('p', null, 'Todo está guardado solo en este móvil. No hay cuenta y no lo vemos.'),
      dangerArea,
    ),
  );
}
