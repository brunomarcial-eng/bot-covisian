// Comprobación de la etiqueta: dado el texto de los ingredientes y los temas que no se podían descartar
// (`Verdict.missing`), dice cuáles aparecen en la lista y con qué palabras. Léxico propio, por palabra completa,
// sobre texto normalizado; respeta negaciones («sin alcohol», «sin huevo», «0,0»). Puro y determinista.
//
//   checkLabel(ingredientsText, topicIds, profile) → [{ topic, status, evidence, matiz? }]
//
// - status: 'aparece' | 'no-aparece'.
// - evidence: hasta 3 fragmentos literales de la lista (el ingrediente tal como está escrito).
// - matiz (solo cuando procede):
//     'pasteurizado' → lo que aparece (o, en listeria, lo único que aparece) va pasteurizado.
//     'duda'         → aparece, pero la palabra no basta para saberlo («atún», «alcohol de caña», «queso fresco»).
//     'poca'         → aparece, normalmente en poca cantidad («cacao», «hinojo»).
//   Si hay varios fragmentos, el matiz solo se da si vale para todos; con uno sin matiz, no hay matiz.
// - listeria: la leche o el queso «pasteurizada» sin ningún otro riesgo da status 'no-aparece' con
//   matiz 'pasteurizado' y esos fragmentos como evidence (señal tranquilizadora, la UI decide cómo contarlo).
// - `profile` se acepta por coherencia con el resto del motor y por ahora no cambia el resultado.

import { normalize } from './normalize.js';
import { wordRe, CTX } from './lexicon.js';
import { CLAVE_IDS } from './temas.js';

const sig = (src, opts = {}) => ({ re: wordRe(src, ''), ...opts });

// ---------------------------------------------------------------------------
// Negaciones y exclusiones (se quitan del texto antes de buscar)
// ---------------------------------------------------------------------------

const NEG_LEAD = '(?:sin|libres? de|exent[oa]s? de|no contiene|no lleva|cero|0 de|free of|without)';
// Hasta tres palabras de relleno («sin gluten ni huevo»), pero nunca cruzando un «con»: «sin lactosa con huevo».
const NEG_FILL = '(?: (?!(?:con|contiene|lleva|incluye|tiene|pero|with)(?![a-z]))[a-z]+){0,3}?';
const neg = (words) => new RegExp(`(?<![a-z0-9])${NEG_LEAD}${NEG_FILL} (?:${words})(?![a-z0-9])`, 'g');
const strip = (src) => new RegExp(`(?<![a-z0-9])(?:${src})(?![a-z0-9])`, 'g');

const PAST = wordRe('(?<!(?:sin|no|un) )pasteuri[sz]ad[oa]s?|pasteuri[sz]ed', '');
const FISH_OR_SHELLFISH = new RegExp(`${CTX.fish.source}|${CTX.marisco.source}`);

// ---------------------------------------------------------------------------
// Definiciones por tema
// ---------------------------------------------------------------------------

const DEFS = {
  'huevo-crudo': {
    pasteurizable: true,
    strip: [neg('huevos?|ovoproductos?|yemas?|claras?|mayonesas?|mahonesas?|egg|eggs')],
    signals: [
      sig('huevos?|huevitos?|yemas?|claras?|ovoproductos?|ovoalbumina|albumina|albumen|lisozima|mayonesas?|mahonesas?'),
      sig('eggs?|egg whites?|egg yolks?|yolks?|mayonnaise'),
    ],
  },

  listeria: {
    pasteurizable: true,
    strip: [neg('leches? crudas?|ahumad[oa]s?|germinados?')],
    // Lo que, dicho solo, ya es una señal; «raw» = la pasteurización no lo cambia.
    signals: [
      sig('leches? crudas?|(?:de|con) leche cruda|sin pasteurizar|no pasteurizad[oa]s?|unpasteuri[sz]ed|raw milk', { raw: true }),
      sig(
        'quesos? azul(?:es)?|quesos? de pasta azul|roquefort|gorgonzola|cabrales|valdeon|stilton|danablu|blue cheese|' +
          'brie|camembert|coulommiers|reblochon|rulos? de cabra|queso de rulo|quesos? blandos?',
      ),
      sig('(?:pates?|foie(?: gras)?|micuit|mi cuit|rillettes?)'),
      sig('germinados?|brotes? de (?:alfalfa|soja|rabanos?|rabanitos?|brocoli|judias?|mungo|lentejas?|trebol|girasol)'),
      sig('fiambres?|jamon (?:cocido|york|dulce|en dulce)|mortadela|chopped|surimi|palitos de cangrejo|salchichas? (?:tipo )?frankfurt'),
      // Ahumado solo cuenta en pescado («pimentón ahumado» o «sabor ahumado» no son listeria).
      sig('ahumad[oa]s?|smoked', { fish: true, raw: true }),
      // Quesos frescos: sin decir «pasteurizada», la palabra no basta.
      sig(
        'quesos? fresc[oa]s?|requeson|burrata|mozzarella|mozarella|mozzarela|feta|ricotta|mascarpone|queso de burgos|' +
          'quesos? blanc[oa]s?|quesos? tiern[oa]s?|queso batido|queso de cabra|quesos? de oveja',
        { matiz: 'duda' },
      ),
    ],
    // Señal tranquilizadora: lácteo pasteurizado y nada más.
    reassure: wordRe('leches?|quesos?|natas?|lacteos?|yogur(?:es)?|mantequilla|cream|milk|cheese', ''),
  },

  toxoplasmosis: {
    strip: [neg('carne cruda|embutidos?|jamon')],
    signals: [
      sig('jamon(?:es)?(?! (?:de )?(?:cocido|york|dulce|en dulce|de pavo|de pato|de pollo))'),
      sig('paletas? (?:iberica|serrana|curada|de bellota|de cebo)|paletillas? (?:iberica|serrana|curada)'),
      sig('chorizos?(?! (?:de pavo|vegano|vegetal))|choricitos?|chistorra|sobrasadas?|salchichon(?:es)?(?! de pavo)|fuets?|salamis?|pepperoni|cecina|longanizas?|espetec'),
      sig('lomos? (?:embuchad[oa]s?|curad[oa]s?|iberico)|cana de lomo'),
      sig('embutidos?|ibericos'),
      sig('carnes? crud[oa]s?|tartar de (?:ternera|buey|vaca|carne)|steak tartar|carpaccio de (?:ternera|buey|vaca|carne)|raw meat'),
      sig('carnes? picad[oa]s?|picadillo|minced meat', { matiz: 'duda' }),
      sig('lomos?(?! (?:de|embuchad|curad|iberic))', { matiz: 'duda' }),
    ],
  },

  mercurio: {
    strip: [neg('pez espada|atun(?:es)?|emperador|tiburon(?:es)?')],
    signals: [
      sig('pez espada|espadon|emperador|atun(?:es)? rojos?|tiburon(?:es)?|cazon|marrajos?|mielgas?|pintarrojas?|tintoreras?|lucios?|swordfish|sharks?|bluefin tuna'),
      sig('atun(?:es)?|tuna', { matiz: 'duda' }),
    ],
  },

  'pescado-crudo': {
    strip: [neg('pescado crudo|ahumad[oa]s?|marinad[oa]s?')],
    signals: [
      sig('sushis?|sashimis?|nigiris?|makis?|ceviches?|cebiches?|tiraditos?|pokes?|gravlax|esqueixada|leche de tigre'),
      sig('(?:carpaccios?|tartar(?:e|es)?) de (?:pescado|salmon|atun|bacalao|lubina|dorada|corvina|gamba|gambas|langostino|langostinos|vieira|vieiras)'),
      sig('(?:boquerones?|anchoas?|sardinas?|bocartes?|caballas?)(?: [a-z]+){0,2} (?:en |al )?(?:vinagre(?:ta)?|salazon|marinad[oa]s?)'),
      sig('crud[oa]s?|marinad[oa]s?|ahumad[oa]s?|raw|smoked', { fish: true }),
      sig('anchoas?', { matiz: 'duda' }),
    ],
  },

  alcohol: {
    strip: [
      // Bebidas sin alcohol («cerveza sin alcohol», «vino desalcoholizado», «cerveza 0,0»).
      strip(
        '(?:cervezas?|birras?|vinos?|cavas?|sidras?|vermut|champan|espumosos?|tintos?|bebidas?|mosto|clara)(?: [a-z0-9.]+){0,2}? (?:sin alcohol|desalcoholizad[oa]s?|00|0 0|alcohol free|non alcoholic)',
      ),
      strip('(?:00|0) ?alcohol|alcohol (?:00|0)(?![0-9.])|desalcoholizad[oa]s?|non alcoholic'),
      // Vinagres (de vino, de alcohol, de jerez…) no son alcohol.
      strip(
        'vinagres?(?: (?:de |del )?(?:vino|alcohol|jerez|sidra|cava|champan|champagne|arroz|manzana|modena|malta|cana|frutas?|balsamico|blanco|tinto|pedro ximenez|cerveza|frambuesa|ron|whisky))*|vinagreta',
      ),
      strip('levaduras? de cerveza|alcoholes? (?:de )?azucar(?:es)?|azucares? alcohol|polialcoholes?|alcoholes? grasos?'),
      neg('alcohol(?:es)?|vinos?|cervezas?|licor(?:es)?'),
    ],
    signals: [
      sig('alcohol de cana', { matiz: 'duda' }),
      sig(
        'vinos?|cervezas?|birras?|licor(?:es)?|brandy|conac|cognac|whisky|whiskey|ginebra|vodka|tequila|ron|cavas?|champan|champagne|' +
          'sidras?|vermut|vermouth|jerez|oporto|marsala|madeira|pedro ximenez|moscatel|amaretto|kirsch|pacharan|orujo|aguardientes?|' +
          'sake|calvados|cointreau|baileys|alcohol(?:es)?(?! de cana)|etanol|alcohol etilico|alcoholic[oa]s?|' +
          'wine|beer|rum|liqueur|gin|ethanol|alcohol(?! de cana)',
      ),
    ],
  },

  cafeina: {
    strip: [
      strip('(?:cafes?|tes?|colas?|coca cola|cacao|chocolates?|bebidas?)(?: [a-z]+){0,2} (?:descafeinad[oa]s?|descaf|decaf|sin cafeina|sin teina)'),
      strip('descafeinad[oa]s?|descaf|decaf|desteinad[oa]s?|decaffeinated|caffeine free'),
      neg('cafeina|teina|cafes?|tes?|caffeine'),
      // No llevan cafeína: la manteca de cacao, el chocolate blanco, las infusiones, la cola de pescado.
      strip('manteca de cacao|mantequilla de cacao|cocoa butter|chocolates? blanc[oa]s?|white chocolate'),
      strip('(?:infusion(?:es)?|tes?|tisanas?)(?: de| con)? (?:menta|tila|poleo|manzanilla|jengibre|rooibos|frutas|hierbas|frutos rojos|hibisco|limon)'),
      strip('colas? de (?:pescado|rape|langosta|langostinos?|cerdo|toro|buey|caballo|gambas?|cangrejo|vaca|ternera)'),
    ],
    signals: [
      sig('cafes?|cafeina|teina|tes?|guarana|mate|yerba mate|nuez de cola|kola|colas?|coca cola|coffee|caffeine|tea|cola'),
      sig('cacao(?: [a-z]+){0,2}|chocolates?|cocoa|chocolate', { matiz: 'poca' }),
    ],
  },

  hierbas: {
    strip: [neg('regaliz|ruda|sen|poleo|hinojo|tila')],
    signals: [
      sig('regaliz|glicirricina|glycyrrhiza|licorice|liquorice|ruda|sen|poleo(?: menta)?|menta poleo|pennyroyal'),
      sig('hinojo|fennel|tilas?|tilo|flor(?:es)? de tilo', { matiz: 'poca' }),
    ],
  },
};

// ---------------------------------------------------------------------------
// Texto → fragmentos
// ---------------------------------------------------------------------------

const MAX_EVIDENCE = 3;
const MAX_FRAGMENT = 80;

// Separa por comas, punto y coma, dos puntos, viñetas y puntos (no decimales), fuera de paréntesis.
function topLevelSegments(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    const between = /[0-9]/.test(s[i - 1] || '') && /[0-9]/.test(s[i + 1] || '');
    const dot = ch === '.' && !between;
    if (depth === 0 && ((ch === ',' && !between) || ch === ';' || ch === ':' || ch === '·' || ch === '•' || ch === '\n' || ch === '\r' || dot)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Todos los trozos, a cualquier nivel de paréntesis (para acortar un ingrediente largo a lo que dice).
function flatFragments(text) {
  return String(text || '')
    .split(/[,;:()[\]{}·•\n\r]+|\.(?!\d)/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const tidy = (s) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Búsqueda de un tema en un fragmento (texto ya normalizado)
// ---------------------------------------------------------------------------

const MATIZ_RANK = { pasteurizado: 1, poca: 2, duda: 3 };

// → { hit: false, reassure?: true } | { hit: true, matiz: null | 'pasteurizado' | 'duda' | 'poca' }
function scan(def, norm) {
  let s = norm;
  for (const re of def.strip) s = s.replace(re, ' ');
  const found = def.signals.filter((g) => {
    if (g.fish && !FISH_OR_SHELLFISH.test(s)) return false;
    return g.re.test(s);
  });
  const pasteurized = PAST.test(s);
  if (!found.length) {
    return def.reassure && pasteurized && def.reassure.test(s) ? { hit: false, reassure: true } : { hit: false };
  }
  const plain = found.filter((g) => !g.matiz);
  let matiz = null;
  if (!plain.length) {
    matiz = found.reduce((best, g) => (!best || MATIZ_RANK[g.matiz] > MATIZ_RANK[best] ? g.matiz : best), null);
  }
  if (def.pasteurizable && pasteurized && !found.some((g) => g.raw)) {
    // Un queso fresco que dice «pasteurizada» ya no es una duda: es la señal tranquilizadora.
    if (matiz === 'duda' && def.reassure) return { hit: false, reassure: true };
    if (!matiz) matiz = 'pasteurizado';
  }
  return { hit: true, matiz };
}

// Lo que se enseña del ingrediente: tal cual está escrito; si es muy largo, el trozo que lo dice.
function evidenceOf(def, segment) {
  const text = tidy(segment).replace(/[.;,:]+$/, '');
  if (text.length <= MAX_FRAGMENT) return text;
  const inner = flatFragments(segment).find((f) => scan(def, normalize(f)).hit);
  const pick = inner ? tidy(inner) : text;
  return pick.length <= MAX_FRAGMENT ? pick : `${pick.slice(0, MAX_FRAGMENT - 1).trimEnd()}…`;
}

function checkTopic(id, segments) {
  const def = DEFS[id];
  const hits = [];
  const reassuring = [];
  for (const segment of segments) {
    const r = scan(def, normalize(segment));
    if (r.hit) hits.push({ ev: evidenceOf(def, segment), matiz: r.matiz });
    else if (r.reassure) reassuring.push(evidenceOf(def, segment));
  }
  const uniq = (list) => [...new Set(list)].slice(0, MAX_EVIDENCE);
  if (!hits.length) {
    if (reassuring.length) return { topic: id, status: 'no-aparece', evidence: uniq(reassuring), matiz: 'pasteurizado' };
    return { topic: id, status: 'no-aparece', evidence: [] };
  }
  const out = { topic: id, status: 'aparece', evidence: uniq(hits.map((h) => h.ev)) };
  // Matiz solo si vale para todos los fragmentos; el menos tranquilizador manda.
  if (hits.every((h) => h.matiz)) {
    out.matiz = hits.reduce((best, h) => (!best || MATIZ_RANK[h.matiz] > MATIZ_RANK[best] ? h.matiz : best), null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

// Temas que checkLabel sabe comprobar (todos los ids de claves).
export const LABEL_TOPICS = Object.freeze(CLAVE_IDS.filter((id) => DEFS[id]));

export function checkLabel(ingredientsText, topicIds, _profile) {
  const requested = topicIds === undefined || topicIds === null ? LABEL_TOPICS : [].concat(topicIds);
  const ids = [...new Set(requested.filter((id) => typeof id === 'string' && DEFS[id]))];
  const segments = topLevelSegments(ingredientsText);
  return ids.map((id) => checkTopic(id, segments));
}
