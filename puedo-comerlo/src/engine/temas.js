// Temas conflictivos del embarazo («claves»): los que se repiten durante todo el embarazo y que la persona
// puede aprender a vigilar. Aquí solo viven los ids y qué temas afectan a cada alimento de la guía; el texto
// de cada tema (título, por qué, dónde mirar…) está en `claves.js`.
//
// - `topicsForFood`: temas por los que un alimento NO es un «Sí» (para `Verdict.topics`).
// - `missingForFood`: temas que NO se pueden descartar sin ver la etiqueta (para `Verdict.missing`).
//
// Todo puro y determinista.

export const CLAVE_IDS = Object.freeze([
  'listeria',
  'toxoplasmosis',
  'mercurio',
  'huevo-crudo',
  'pescado-crudo',
  'alcohol',
  'cafeina',
  'hierbas',
]);

// Lo que no se reconoce: la regla 7 de la especificación (ante la duda, lo que más se esconde en un plato).
export const MISSING_UNKNOWN = Object.freeze(['huevo-crudo', 'listeria', 'toxoplasmosis', 'alcohol', 'pescado-crudo']);

// Máximo de temas que se devuelven en `missing` (más es ruido para quien lee).
export const MISSING_MAX = 5;

// ---------------------------------------------------------------------------
// Temas por alimento (solo alimentos que no son «Sí»). Orden = relevancia: el primero es el motivo principal.
// ---------------------------------------------------------------------------

const TOPICS_BY_FOOD = {
  // Embutidos curados: toxoplasmosis (la listeria del loncheado se explica en el tema de la listeria).
  'jamon-curado': ['toxoplasmosis'],
  chorizo: ['toxoplasmosis'],
  sobrasada: ['toxoplasmosis'],
  salchichon: ['toxoplasmosis'],
  'lomo-embuchado': ['toxoplasmosis'],
  'tabla-embutidos': ['toxoplasmosis'],
  'fiambre-loncheado': ['listeria'],
  // Lácteos
  'queso-fresco': ['listeria'],
  'queso-curado': ['listeria'],
  'queso-blando-corteza': ['listeria'],
  'queso-azul': ['listeria'],
  'queso-loncheado-rallado': ['listeria'],
  'leche-cruda': ['listeria'],
  horchata: ['listeria'],
  'horchata-artesana': ['listeria'],
  // Huevo
  'huevo-poco-hecho': ['huevo-crudo'],
  'tortilla-poco-cuajada': ['huevo-crudo'],
  'mayonesa-casera': ['huevo-crudo'],
  'mayonesa-dudosa': ['huevo-crudo'],
  'tarta-queso-fria': ['listeria', 'huevo-crudo'],
  'helado-casero': ['huevo-crudo', 'listeria'],
  'tortilla-patata': ['huevo-crudo'],
  revuelto: ['huevo-crudo'],
  tiramisu: ['huevo-crudo', 'cafeina'],
  'mousse-casera': ['huevo-crudo'],
  coulant: ['huevo-crudo'],
  carbonara: ['huevo-crudo'],
  'ensalada-cesar': ['huevo-crudo'],
  ensaladilla: ['huevo-crudo'],
  paella: ['huevo-crudo'],
  'tarta-queso': ['listeria', 'huevo-crudo'],
  helado: ['huevo-crudo', 'listeria'],
  // Carne
  'carne-poco-hecha': ['toxoplasmosis'],
  tartar: ['toxoplasmosis', 'huevo-crudo'],
  carpaccio: ['toxoplasmosis'],
  chuleton: ['toxoplasmosis'],
  hamburguesa: ['toxoplasmosis'],
  pate: ['listeria'],
  'perrito-caliente': ['listeria'],
  'salchichas-frankfurt': ['listeria'],
  // Pescado y marisco
  'pescado-crudo': ['pescado-crudo', 'listeria'],
  'pescado-ahumado': ['listeria', 'pescado-crudo'],
  'boquerones-vinagre': ['pescado-crudo'],
  'marisco-crudo': ['pescado-crudo'],
  'anchoas-salazon': ['pescado-crudo'],
  surimi: ['listeria'],
  'pescado-mercurio': ['mercurio'],
  'atun-lata': ['mercurio'],
  'atun-plancha': ['mercurio'],
  // Verdura cruda
  germinados: ['listeria'],
  ensalada: ['toxoplasmosis'],
  gazpacho: ['toxoplasmosis'],
  // Bebidas
  alcohol: ['alcohol'],
  'cerveza-sin': ['alcohol'],
  'salsa-vino': ['alcohol'],
  kombucha: ['alcohol', 'cafeina'],
  cafe: ['cafeina'],
  te: ['cafeina'],
  cola: ['cafeina'],
  'bebida-energetica': ['cafeina'],
  'infusiones-evitar': ['hierbas'],
  'poleo-menta': ['hierbas'],
  tila: ['hierbas'],
  'infusion-jengibre': ['hierbas'],
};

// Alimentos que no son «Sí» y a propósito no llevan tema: el motivo es otro (vitamina A, plomo de la munición) y no es uno de los temas que se repiten durante el embarazo.
export const NO_TOPIC_FOODS = Object.freeze(['higado', 'caza']);

// Etiquetas libres de la guía → tema, para alimentos nuevos que aún no estén en la tabla.
function topicsFromTags(food) {
  const tags = new Set(food.tags || []);
  const out = [];
  const add = (t) => out.push(t);
  if (tags.has('listeria')) add('listeria');
  if (tags.has('toxoplasma')) add('toxoplasmosis');
  if (tags.has('mercurio')) add('mercurio');
  if (tags.has('crudo') && tags.has('huevo')) add('huevo-crudo');
  if (tags.has('crudo') && (tags.has('pescado') || tags.has('marisco'))) add('pescado-crudo');
  if (tags.has('alcohol')) add('alcohol');
  if (tags.has('cafeina')) add('cafeina');
  return out;
}

// Temas por los que este alimento (de la guía) pide cuidado o es «Mejor no». Un «Sí» no lleva ninguno.
export function topicsForFood(food) {
  if (!food || (food.level !== 'cuidado' && food.level !== 'no')) return [];
  if (NO_TOPIC_FOODS.includes(food.id)) return [];
  const own = TOPICS_BY_FOOD[food.id];
  return (own ? own.slice() : topicsFromTags(food)).filter((t) => CLAVE_IDS.includes(t));
}

// ---------------------------------------------------------------------------
// Qué mirar en la etiqueta cuando no hay ingredientes o no se pueden fiar
// ---------------------------------------------------------------------------

// Sustituyen a la regla por categoría (sin mezclar con ella).
const MISSING_BY_FOOD = {
  agua: [],
  zumo: [],
  manzanilla: [],
  tonica: [],
  edulcorantes: [],
  'bebida-avena': [],
  'bebida-soja': [],
  'bebida-almendras': [],
  'bebida-vegetal': [],
  'cerveza-00': ['alcohol'],
  'guiso-vino': ['alcohol'],
  'tarta-queso-fria': ['huevo-crudo', 'listeria'],
  'helado-casero': ['huevo-crudo', 'listeria'],
  descafeinado: ['cafeina'],
  cafe: ['cafeina'],
  te: ['cafeina'],
  cola: ['cafeina'],
  chocolate: ['cafeina'],
  'bebida-energetica': ['cafeina'],
  kombucha: ['alcohol', 'cafeina'],
  alcohol: ['alcohol'],
  'cerveza-sin': ['alcohol'],
  'salsa-vino': ['alcohol'],
  rooibos: ['hierbas'],
  tila: ['hierbas'],
  'poleo-menta': ['hierbas'],
  'infusion-jengibre': ['hierbas'],
  'infusiones-evitar': ['hierbas'],
  horchata: ['listeria'],
  'horchata-pasteurizada': ['listeria'],
  'horchata-artesana': ['listeria'],
  // Platos y masas
  pizza: ['listeria', 'toxoplasmosis'],
  'lasana-canelones': ['huevo-crudo', 'listeria'],
  pasta: ['huevo-crudo'],
  gyozas: ['huevo-crudo'],
  'salsas-bote': ['huevo-crudo'],
  croquetas: [],
  ensalada: ['listeria', 'toxoplasmosis'],
  'ensalada-cesar': ['huevo-crudo', 'listeria'],
  gazpacho: ['toxoplasmosis'],
  germinados: ['listeria'],
  'germinados-cocinados': [],
  'tarta-queso': ['huevo-crudo', 'listeria'],
  helado: ['huevo-crudo', 'listeria'],
  'mousse-casera': ['huevo-crudo'],
  tiramisu: ['huevo-crudo', 'listeria'],
  paella: ['huevo-crudo'],
  'perrito-caliente': ['listeria'],
  surimi: ['listeria'],
  gulas: ['listeria'],
};

// Por categoría de la guía (grupos y etiquetas), en el orden de la especificación.
function missingByCategory(food) {
  const g = new Set(food.groups || []);
  const tags = new Set(food.tags || []);
  const out = [];
  const add = (...t) => t.forEach((x) => out.push(x));
  if (g.has('embutidos') || tags.has('embutido')) add('listeria', 'toxoplasmosis');
  if (g.has('pescado')) add('mercurio', 'pescado-crudo', 'listeria');
  if (g.has('lacteos')) add('listeria');
  if (g.has('huevos') || tags.has('huevo')) add('huevo-crudo');
  if (g.has('carne')) add('toxoplasmosis');
  if (g.has('bebidas')) add('alcohol', 'cafeina', 'hierbas');
  if (tags.has('listeria')) add('listeria');
  if (tags.has('toxoplasma')) add('toxoplasmosis');
  return out;
}

function uniq(list) {
  return [...new Set(list)];
}

// Temas que no se pueden descartar de este alimento sin ver la etiqueta.
export function missingForFood(food) {
  if (!food) return [];
  const own = MISSING_BY_FOOD[food.id];
  return uniq((own ? own : missingByCategory(food)).filter((t) => CLAVE_IDS.includes(t)));
}

// Une listas de temas (ya ordenadas por relevancia) sin repetir.
export function mergeTopics(lists, max = Infinity) {
  return uniq(lists.flat()).slice(0, max);
}
