// Piezas de interfaz que usan la ilustración (src/ui/art/): la mesa de la portada, el plato suelto
// de los estados vacíos y el plato que gira mientras se lee una foto o se consulta Open Food Facts.
// Los estilos de movimiento de la ilustración están en styles.css (sección «Ilustración»): así el SVG no
// lleva <style> dentro y el texto de la pantalla (y de la región viva) queda limpio.
// Todo es decorativo (aria-hidden): el texto de al lado dice lo mismo y es lo que oyen los lectores.

import { h } from './dom.js';
import { normalize, FOOD_BY_ID } from '../engine/index.js';
import { mesaSvg } from './art/mesa.js';
import { platoSvg, cargandoSvg } from './art/platos.js';
import { categoriaSvg } from './art/categorias.js';
import { destellosSvg } from './art/destellos.js';

function svgNode(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

// Portada: la mesa a sangre, recortada por los bordes y alineada abajo (xMidYMax), para que asome la
// servilleta de lino con el perfil bordado. El borde de arriba se funde con el crema (máscara en CSS).
export function coverArt() {
  const svg = svgNode(mesaSvg({ animada: false, decorativa: true, encuadre: 'xMidYMax' }));
  return h('div', { class: 'cover-art', 'aria-hidden': 'true' }, svg);
}

// Estado vacío: un plato suelto (tortilla | ensalada | fruta | cuenco) y la línea de microcopy.
export function emptyState(tipo, ...text) {
  return h(
    'div',
    { class: 'empty empty--art' },
    h('div', { class: 'empty-art', 'aria-hidden': 'true' }, svgNode(platoSvg(tipo, { decorativa: true }))),
    h('div', { class: 'empty-text' }, text),
  );
}

// Inicio: un cuenco pequeño con vapor junto al título (decorativo, ligero: tres trazos que suben y se apagan).
export function homePlate() {
  const wrap = h('div', { class: 'home-plate', 'aria-hidden': 'true' });
  wrap.append(svgNode(platoSvg('cuenco', { decorativa: true })));
  wrap.insertAdjacentHTML(
    'beforeend',
    '<svg class="home-vapor" viewBox="0 0 60 44" width="60" height="44" aria-hidden="true" focusable="false"><path d="M16 40c-6-8 6-12 0-20"/><path d="M30 42c-6-8 6-12 0-24"/><path d="M44 40c-6-8 6-12 0-20"/></svg>',
  );
  return wrap;
}

// «Leyendo…»: el plato con tenedor y cuchillo que giran, y el texto de estado (región viva).
export function loadingStatus(firstText) {
  const text = h('span', { class: 'status-text' }, firstText);
  const el = h(
    'div',
    { class: 'status status--art', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'status-art', 'aria-hidden': 'true' }, svgNode(cargandoSvg({ decorativa: true, animada: false }))),
    // Texto de estado y dos barras de «shimmer» (no son texto: vacías y aria-hidden)
    h(
      'span',
      { class: 'status-body' },
      text,
      h('span', { class: 'skel', 'aria-hidden': 'true' }),
      h('span', { class: 'skel skel--short', 'aria-hidden': 'true' }),
    ),
  );
  return { el, text };
}


// ---------- Ilustración por categoría de comida ----------
// Dieciocho categorías de la ilustradora (categorias.js) y un «generico» de respaldo. El mapeo es de la
// interfaz: por palabras del nombre (lo más específico primero), después por las categorías de Open Food
// Facts y, si no, por el grupo de la guía. Nunca decide el semáforo.

const RULES = [
  ['embutido', /jamon|chorizo|salchichon|fuet|lomo embuchado|sobrasada|fiambre|embutido|salami|mortadela|chopped|york|panceta|butifarra|morcilla|pate\b|foie|paleta/],
  ['marisco', /marisco|gamba|langostino|mejillon|almeja|ostra|cangrejo|calamar|pulpo|sepia|berberecho|surimi|gulas|bogavante|percebe|navaja/],
  ['pescado', /pescado|merluza|lubina|dorada|salmon|atun|bacalao|sardina|boquer|anchoa|rape\b|trucha|lenguado|pez espada|emperador|caballa|sushi|sashimi|ceviche|tiburon|cazon|lucio|mero\b|rodaballo|ahumado/],
  ['ave', /pollo|pavo|pato|gallina|codorniz|ave\b|aves\b|pechuga/],
  ['carne', /carne|ternera|filete|solomillo|cerdo|chuleta|chuleton|hamburguesa|cordero|costilla|entrecot|cochinillo|tartar|carpaccio|higado|caza|albondiga|cachopo|san jacobo|flamenquin/],
  ['huevo', /huevo|tortilla|revuelto|mayonesa|alioli|poche|yema/],
  ['queso', /queso|brie|camembert|roquefort|gorgonzola|cabrales|mozzarella|burrata|requeson|feta|rulo|mantequilla|nata\b|leche|yogur|horchata/],
  ['postre', /tarta|flan|helado|natilla|tiramisu|pastel|bizcocho|mousse|coulant|brownie|panna|chocolate|dulce|mermelada|miel\b|galleta|bolleria|donut|churro|torrija|postre|crema catalana|profiterol|gelatina/],
  ['pasta', /pasta|macarron|espagueti|lasana|canelon|noqui|pizza|ravioli|fideo|tallarin|carbonara|bolonesa|gyoza|pad thai|cuscus|empanada|burrito|taco\b|tacos/],
  ['arroz', /arroz|paella|risotto|fideua|sushi arroz|poke/],
  ['legumbres', /legumbre|lenteja|garbanzo|alubia|fabada|hummus|falafel|soja|tofu|seitan|cocido/],
  ['cuenco', /sopa|crema de|gazpacho|salmorejo|caldo|puré|pure\b|potaje|guiso|pringa/],
  ['ensalada', /ensalada|ensaladilla|germinado|brote|guacamole/],
  ['verdura', /verdura|hortaliza|brocoli|calabac|espinaca|berenjena|champinon|seta\b|setas|judia verde|pimiento|alcachofa|esparrago|coliflor|zanahoria|patata|tomate|cebolla|acelga|puerro/],
  ['fruta', /fruta|manzana|naranja|platano|fresa|uva\b|uvas|pera\b|melon|sandia|kiwi|melocoton|cereza|mandarina|limon|frutos secos|pipas|aguacate/],
  ['pan', /pan\b|tostada|bocadillo|bocata|sandwich|croissant|cereal|muesli|avena|harina|tortita|bollo|empanado|rebozado/],
  ['bebida', /cafe|\bte\b|cerveza|vino|cava|sidra|agua\b|refresco|cola\b|infusion|zumo|batido|licor|alcohol|vermut|sangria|mojito|cubata|manzanilla|tila|tonica|bebida|kombucha|descafeinado|energetica|poleo|rooibos|jengibre|edulcorante/],
];

// Categorías de Open Food Facts (en:cheeses, es:quesos-frescos…) → categoría de la ilustración.
const OFF_RULES = [
  ['embutido', /cured-?meat|sausage|ham\b|charcuter|embutid|jamon|fiambre|cold-cut|pate/],
  ['marisco', /seafood|shellfish|crustacean|marisco|surimi/],
  ['pescado', /fish|pescado|tuna|salmon|sardine/],
  ['queso', /chees|queso|dairy|lacteo|yogurt|milk|butter|cream/],
  ['huevo', /\beggs?\b|huevo/],
  ['pasta', /pasta|noodle|pizza|gnocchi|lasagn/],
  ['arroz', /\brice\b|arroz/],
  ['legumbres', /legume|pulse|lentil|chickpea|bean|hummus/],
  ['cuenco', /soup|sopa|broth|gazpacho/],
  ['ensalada', /salad|ensalada/],
  ['postre', /dessert|biscuit|cookie|cake|chocolate|sweet|candy|confection|ice-cream|galleta|dulce/],
  ['pan', /bread|cereal|breakfast|pan\b|bakery|cracker/],
  ['fruta', /fruit|fruta/],
  ['verdura', /vegetable|verdura|legumbre/],
  ['ave', /poultry|chicken|turkey|\bpollo|pavo/],
  ['carne', /\bmeat|carne|beef|pork/],
  ['bebida', /beverage|drink|juice|coffee|tea\b|beer|wine|water|soda|bebida|cerveza|vino|zumo|cafe/],
];

const GROUP_FALLBACK = { embutidos: 'embutido', lacteos: 'queso', huevos: 'huevo', carne: 'carne', pescado: 'pescado', bebidas: 'bebida', supermercado: 'generico', restaurante: 'generico' };

const first = (rules, text) => {
  const hit = rules.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
};

// foodId (guía), título escrito o leído y, para un producto, sus `categories` de Open Food Facts.
export function categoryFor({ foodId = null, title = '', product = null } = {}) {
  const food = foodId ? FOOD_BY_ID[foodId] : null;
  const names = [title, product && product.name, food && food.name, foodId ? String(foodId).replace(/-/g, ' ') : ''].filter(Boolean);
  const text = normalize(names.join(' | '));
  const byName = first(RULES, text);
  if (byName) return byName;
  const tags = product && Array.isArray(product.categories) ? product.categories.join(' ').toLowerCase().replace(/-/g, ' ') : '';
  const byOff = tags ? first(OFF_RULES, tags) : null;
  if (byOff) return byOff;
  const group = food && Array.isArray(food.groups) ? food.groups[0] : null;
  return GROUP_FALLBACK[group] || 'generico';
}

// Ilustración de una respuesta: la categoría (con «pop») y, detrás, los destellos del veredicto.
// «Mejor no» lleva su propia cruz (tone.js), así que no usa destellos.
export function answerArt(category, level) {
  const art = svgNode(categoriaSvg(category, { decorativa: true, animada: true }));
  const fx = level === 'no' || !level ? null : svgNode(destellosSvg(level, { decorativa: true, animada: true }));
  return h('div', { class: 'answer-art', 'aria-hidden': 'true', dataset: { cat: category } }, fx ? h('div', { class: 'answer-fx' }, fx) : null, art);
}

// Miniatura de una fila de lista (quieta: sin bucles en listas largas).
export function thumbArt(category) {
  return h('span', { class: 'entry-thumb', 'aria-hidden': 'true', dataset: { cat: category } }, svgNode(categoriaSvg(category, { decorativa: true, animada: false })));
}
