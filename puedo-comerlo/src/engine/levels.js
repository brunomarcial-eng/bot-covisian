// Semáforo. Orden de gravedad, de menos a más: sí < no estoy segura < con cuidado < mejor no.
export const LEVELS = ['si', 'duda', 'cuidado', 'no'];

export const LEVEL_LABEL = {
  si: 'Sí',
  cuidado: 'Con cuidado',
  no: 'Mejor no',
  duda: 'No estoy segura',
};

const RANK = { si: 0, duda: 1, cuidado: 2, no: 3 };

export function levelRank(level) {
  return RANK[level] ?? RANK.duda;
}

// Devuelve el peor de los dos niveles.
export function worstLevel(a, b) {
  if (!a) return b;
  if (!b) return a;
  return levelRank(b) > levelRank(a) ? b : a;
}
