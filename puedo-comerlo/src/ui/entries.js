// Filas de historial (Inicio «Lo último» y pantalla Historial).

import { h } from './dom.js';
import { entryLink, relTime, VIA_LABEL } from './components.js';
import { refreshEntry, entryTarget, reopenResult } from './recalc.js';

export function entryRow(entry, profile, { withTime = false, headingLevel = null } = {}) {
  const fresh = refreshEntry(entry, profile);
  const target = entryTarget(entry);
  const meta = withTime
    ? h(
        'span',
        { class: 'entry-meta' },
        `${VIA_LABEL[entry.via] || 'Consulta'} · `,
        h('time', { datetime: new Date(entry.at).toISOString() }, relTime(entry.at)),
      )
    : null;
  return entryLink({
    href: target ? target.href : null,
    level: fresh.level,
    title: entry.title || 'Sin nombre',
    phrase: fresh.phrase,
    meta,
    headingLevel,
    ojo: fresh.verdict ? fresh.verdict.ojo : null,
    onClick: target && target.reopen ? () => reopenResult(entry, profile) : null,
  });
}
