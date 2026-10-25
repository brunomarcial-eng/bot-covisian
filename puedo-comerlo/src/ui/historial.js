// Historial: las últimas 40 consultas, con semáforo.

import { getHistory, clearHistory, HISTORY_MAX } from '../store.js';
import { h, announce, fill } from './dom.js';
import { entries, confirmBox } from './components.js';
import { entryRow } from './entries.js';
import { emptyState } from './art-ui.js';

export function render({ main, profile }) {
  const h1 = h('h1', null, 'Historial');
  const host = h('div');
  main.append(h1, h('p', { class: 'lead' }, `Tus últimas ${HISTORY_MAX} consultas. Se quedan en este móvil.`), host);

  function paint() {
    const history = getHistory().slice(0, HISTORY_MAX);
    if (!history.length) {
      fill(
        host,
        emptyState('tortilla', h('p', null, 'Todavía no has consultado nada. Lo que busques o fotografíes aparecerá aquí.')),
      );
      return;
    }
    const clearArea = h('div', { class: 'actions actions--end' });
    const clearBtn = h('button', { type: 'button', class: 'btn btn--danger' }, 'Borrar el historial');
    clearBtn.addEventListener('click', () => {
      const box = confirmBox({
        text: '¿Borrar todo el historial?',
        detail: 'La lista y los favoritos se quedan como están.',
        confirmLabel: 'Borrar el historial',
        onConfirm: () => {
          clearHistory();
          paint();
          announce('Historial borrado.');
          h1.focus();
        },
        onCancel: () => {
          fill(clearArea, clearBtn);
          clearBtn.focus();
        },
      });
      fill(clearArea, box);
      box.focusMessage();
    });
    clearArea.append(clearBtn);

    fill(host, entries(history.map((e) => entryRow(e, profile, { withTime: true, headingLevel: 2 }))), clearArea);
  }

  paint();
}
