// Filas de historial (Inicio «Lo último» y pantalla Historial).

import { h } from './dom.js';
import { row, relTime, VIA_LABEL } from './components.js';
import { refreshEntry, entryTarget, reopenResult } from './recalc.js';

export function entryRow(entry, profile, { withTime = false, headingLevel = null } = {}) {
  const fresh = refreshEntry(entry, profile);
  const target = entryTarget(entry);
  const meta = withTime
    ? h(
        'span',
        { class: 'row-meta' },
        `${VIA_LABEL[entry.via] || 'Consulta'} · `,
        h('time', { datetime: new Date(entry.at).toISOString() }, relTime(entry.at)),
      )
    : null;
  return row({
    href: target ? target.href : null,
    level: fresh.level,
    title: entry.title || 'Sin nombre',
    phrase: fresh.phrase,
    meta,
    headingLevel,
    onClick: target && target.reopen ? () => reopenResult(entry, profile) : null,
  });
}
