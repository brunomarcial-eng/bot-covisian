// Todo lo que la persona configura vive solo en este navegador (localStorage).
// No hay cuentas ni servidor de usuarios. Si borra los datos del navegador, se pierde.

const PREFIX = 'pc.v1.';
const KEYS = {
  profile: PREFIX + 'profile',
  onboarded: PREFIX + 'onboarded',
  list: PREFIX + 'list',
  history: PREFIX + 'history',
  favs: PREFIX + 'favs',
  result: PREFIX + 'result',
};

export const HISTORY_MAX = 40;
export const OTRA_MAX = 200;

export const EMBUTIDOS = {
  jamon: 'Jamón curado',
  chorizo: 'Chorizo o sobrasada',
  salchichon: 'Salchichón, fuet o salami',
  lomo: 'Lomo embuchado',
};

export const ALERGIAS = {
  leche: 'Leche',
  huevo: 'Huevo',
  gluten: 'Gluten',
  frutos_secos: 'Frutos secos',
  pescado: 'Pescado',
  marisco: 'Marisco',
  soja: 'Soja',
  sesamo: 'Sésamo',
};

export const DIETAS = {
  vegetariana: 'Vegetariana',
  vegana: 'Vegana',
  sin_cerdo: 'Sin cerdo',
  sin_lactosa: 'Sin lactosa',
};

export const DEFAULT_PROFILE = Object.freeze({
  embutido: null, // 'no' | 'cocinados' | 'los_como'
  embutidos: [],
  alergias: [],
  otra: '',
  dieta: [],
});

// Memoria de respaldo por si localStorage no está disponible (modo privado estricto).
const memory = new Map();

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return memory.has(key) ? memory.get(key) : fallback;
    return JSON.parse(raw);
  } catch {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}

function write(key, value) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: seguimos en memoria durante esta visita.
  }
}

function pick(list, allowed) {
  return Array.isArray(list) ? [...new Set(list.filter((x) => x in allowed))] : [];
}

export function sanitizeProfile(p = {}) {
  return {
    // La pregunta sobre embutidos se retiró del arranque (25-10-2026): el motor aplica siempre su
    // regla por defecto (crudo, «Mejor no»; cocinado dentro del plato, «Sí»). Se ignora cualquier
    // valor antiguo guardado en el móvil.
    embutido: null,
    embutidos: [],
    alergias: pick(p.alergias, ALERGIAS),
    otra: typeof p.otra === 'string' ? p.otra.slice(0, OTRA_MAX) : '',
    dieta: pick(p.dieta, DIETAS),
  };
}

// ---- Perfil y arranque ----

export function getProfile() {
  return sanitizeProfile({ ...DEFAULT_PROFILE, ...read(KEYS.profile, {}) });
}

export function saveProfile(profile) {
  const clean = sanitizeProfile(profile);
  write(KEYS.profile, clean);
  return clean;
}

export function isOnboarded() {
  return read(KEYS.onboarded, false) === true;
}

export function setOnboarded(value = true) {
  write(KEYS.onboarded, value === true);
}

// ---- Historial (últimas 40 consultas) ----

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function entryFrom(e) {
  return {
    id: e.id || newId(),
    at: e.at || Date.now(),
    via: e.via || 'busqueda',
    title: String(e.title || ''),
    level: e.level || 'duda',
    phrase: String(e.phrase || ''),
    foodId: e.foodId || null,
    payload: e.payload || null,
  };
}

export function getHistory() {
  const h = read(KEYS.history, []);
  return Array.isArray(h) ? h : [];
}

// Apunta una consulta. Si la última entrada es el mismo alimento de la guía
// (o el mismo texto por la misma vía), no la duplica: solo la actualiza.
export function addHistory(entry) {
  const e = entryFrom(entry);
  const history = getHistory();
  const last = history[0];
  // Las fotos nunca se funden: dos cartas seguidas son dos consultas distintas.
  const same =
    last &&
    e.via !== 'foto' &&
    last.via === e.via &&
    last.title === e.title &&
    (last.foodId || null) === (e.foodId || null);
  if (same) history.shift();
  history.unshift(e);
  write(KEYS.history, history.slice(0, HISTORY_MAX));
  return e;
}

export function clearHistory() {
  write(KEYS.history, []);
}

// ---- Lista de la compra ----

export function getList() {
  const l = read(KEYS.list, []);
  return Array.isArray(l) ? l : [];
}

export function isInList(match) {
  return getList().some((x) => sameThing(x, match));
}

function sameThing(a, b) {
  if (a.foodId && b.foodId && !a.payload && !b.payload) return a.foodId === b.foodId;
  return a.title === b.title && (a.foodId || null) === (b.foodId || null);
}

export function addToList(entry) {
  const e = entryFrom(entry);
  const list = getList().filter((x) => !sameThing(x, e));
  list.unshift(e);
  write(KEYS.list, list);
  return e;
}

export function removeFromList(id) {
  write(
    KEYS.list,
    getList().filter((x) => x.id !== id),
  );
}

// ---- Favoritos (ids de la guía) ----

export function getFavorites() {
  const f = read(KEYS.favs, []);
  return Array.isArray(f) ? f : [];
}

export function isFavorite(foodId) {
  return getFavorites().includes(foodId);
}

export function toggleFavorite(foodId) {
  const favs = getFavorites();
  const next = favs.includes(foodId) ? favs.filter((x) => x !== foodId) : [foodId, ...favs];
  write(KEYS.favs, next);
  return next.includes(foodId);
}

// ---- Último resultado publicado (pantalla Resultado) ----
// { title, via, notice: string|null, items: Verdict[], payload: Payload|null, at }

export function setResult(result) {
  write(KEYS.result, { at: Date.now(), notice: null, payload: null, items: [], ...result });
}

export function getResult() {
  return read(KEYS.result, null);
}

// ---- Borrar todo lo de este móvil ----

export function clearAll() {
  memory.clear();
  try {
    const toRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('pc.')) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // nada que borrar
  }
}
