// Motor de reglas: puro y determinista (sin DOM, sin red, sin fecha, sin aleatoriedad).
// Mismo texto + mismo perfil → mismo resultado.

import { FOODS, GROUPS, FOOD_BY_ID } from './foods.js';
import { LEVEL_LABEL, levelRank } from './levels.js';
import { normalize } from './normalize.js';
import {
  KEYWORD_RULES,
  ruleOrderIndex,
  CTX,
  EMBUTIDO_TYPE_RES,
  ALLERGEN_LEXICON,
  DIET_LEXICON,
  ALLERGY_IDS,
  ALLERGY_LABEL,
  DIET_NOTES,
  NEGATION_RES,
  NEGATION_EXTRA,
  OFF_ALLERGEN_MAP,
  OFF_CATEGORY_MAP,
  OFF_LABEL_NEGATIONS,
} from './lexicon.js';

// ---------------------------------------------------------------------------
// Textos fijos
// ---------------------------------------------------------------------------

export const UNKNOWN = Object.freeze({
  phrase: 'No lo tengo claro. No lo doy por seguro.',
  detail:
    'La app no reconoce este plato en su guía y no se inventa lo que lleva: no te da un «sí» por defecto. ' +
    'Pregunta cómo está hecho o mira la etiqueta antes de decidir.',
  question: '¿Lleva huevo crudo, embutido, queso sin pasteurizar, alcohol o pescado sin hacer?',
  source: 'La propia app: no reconozco este plato',
});

export const PHRASES = Object.freeze({
  embutidoNo: 'Has decidido no comer embutidos.',
  embutidoNoMarcado: 'No está entre los embutidos que has marcado.',
  embutidoCrudoCocinados: 'En crudo, mejor no. Solo si va cocinado dentro del plato.',
  embutidoCrudoLosComo: 'Va sin cocinar: AESAN lo señala por toxoplasmosis y, loncheado, por listeria. La decisión es tuya.',
  embutidoCocinado: 'Solo si se cocina de verdad dentro del plato, no apoyado al servir.',
  quesoPasteurizado: 'Leche pasteurizada. Quita la corteza si la tiene.',
  lecturaIncierta: 'No estoy segura de la lectura.',
});

const PASTEURIZABLE_CHEESE = new Set(['queso-fresco', 'queso-curado', 'queso-blando-corteza']);
// En la lista de ingredientes estas coincidencias no dicen nada del producto («agua», «zumo de limón»).
const NAME_ONLY_IDS = new Set(['agua', 'zumo']);

// ---------------------------------------------------------------------------
// Índices precalculados
// ---------------------------------------------------------------------------

const RULE_ORDER = ruleOrderIndex();
const FOOD_INDEX = new Map(FOODS.map((f, i) => [f.id, i]));

function idOrder(id) {
  return RULE_ORDER.has(id) ? RULE_ORDER.get(id) : KEYWORD_RULES.length + (FOOD_INDEX.get(id) ?? 0);
}

const ALIAS_INDEX = FOODS.map((f) => ({
  id: f.id,
  terms: [...new Set([f.name, ...(f.aliases || [])].map(normalize).filter(Boolean))].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  ),
}));

function resolveSlot(slot) {
  const options = Array.isArray(slot) ? slot : [slot];
  return options.find((id) => FOOD_BY_ID[id]) || null;
}

function isCurado(food) {
  if (!food || food.id === 'embutido-cocinado' || food.id === 'fiambre-loncheado') return false;
  return !!food.embutido || (Array.isArray(food.tags) && food.tags.includes('embutido'));
}

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

const isWordChar = (c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');

// Todas las apariciones de `needle` como palabra(s) completa(s) en `hay`.
function wordOccurrences(hay, needle) {
  const out = [];
  if (!needle) return out;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) break;
    const before = i === 0 ? ' ' : hay[i - 1];
    const after = i + needle.length >= hay.length ? ' ' : hay[i + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) out.push(i);
    from = i + 1;
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

// Documento: segmentos normalizados unidos por « | » (ninguna regla cruza un separador).
function buildDoc(parts) {
  const segs = [];
  let text = '';
  for (const p of parts) {
    const norm = normalize(p.text);
    if (!norm) continue;
    if (text) text += ' | ';
    segs.push({ start: text.length, end: text.length + norm.length, kind: p.kind, norm });
    text += norm;
  }
  return { text, segs };
}

function segAt(doc, pos) {
  return doc.segs.find((s) => pos >= s.start && pos < s.end) || doc.segs[0];
}

// ---------------------------------------------------------------------------
// Emparejamiento
// ---------------------------------------------------------------------------

// Puntuación de un alias contra un segmento (ambos normalizados).
// 100 = igualdad. Alias contenido como palabra(s) completas: 50–99 según la parte del texto que cubre.
// Texto contenido en un alias más largo: 80 × proporción (≥ 50 si cubre ≥ 62,5 % del alias).
export function aliasScore(alias, text) {
  if (!alias || !text) return { score: 0, at: -1, len: 0 };
  if (alias === text) return { score: 100, at: 0, len: text.length };
  const occ = wordOccurrences(text, alias);
  if (occ.length) return { score: 50 + Math.round((49 * alias.length) / text.length), at: occ[0], len: alias.length, occ };
  if (wordOccurrences(alias, text).length) {
    return { score: Math.round((80 * text.length) / alias.length), at: 0, len: text.length };
  }
  return { score: 0, at: -1, len: 0 };
}

// Texto escrito a medias: «sush» → «sushi». Solo una palabra de ≥ 4 letras y solo si nada más encaja.
function prefixScore(alias, text) {
  if (text.length < 4 || text.includes(' ')) return 0;
  const first = alias.split(' ')[0];
  if (first === text || !first.startsWith(text)) return 0;
  return 50 + Math.round((30 * text.length) / alias.length);
}

function strictlyInside(spans, start, end, id) {
  return spans.some(
    (c) => c.start <= start && end <= c.end && c.end - c.start > end - start && !c.ids.includes(id),
  );
}

function findMatches(doc, context) {
  const consumed = [];
  const matches = [];
  // 1) Palabras clave, de más específica a más general.
  for (const rule of KEYWORD_RULES) {
    if (rule.context && rule.context !== context) continue;
    const re = rule.re;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(doc.text))) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      const seg = segAt(doc, start);
      if (rule.nameOnly && seg.kind === 'ingredient') continue;
      if (consumed.some((c) => c.start <= start && end <= c.end)) continue;
      const ids = rule.ids.map(resolveSlot).filter(Boolean);
      consumed.push({ start, end, ids });
      for (const id of ids) matches.push({ id, order: rule.index, start, end, where: seg.kind, via: 'kw' });
    }
  }
  // 2) Alias de la guía (palabras completas, puntuación ≥ 50).
  for (const seg of doc.segs) {
    for (const entry of ALIAS_INDEX) {
      if (seg.kind === 'ingredient' && NAME_ONLY_IDS.has(entry.id)) continue;
      let found = null;
      for (const term of entry.terms) {
        const r = aliasScore(term, seg.norm);
        if (r.score < 50) continue;
        const positions = r.occ || [r.at];
        for (const at of positions) {
          const start = seg.start + at;
          const end = start + r.len;
          if (strictlyInside(consumed, start, end, entry.id)) continue;
          if (!found || r.score > found.score) found = { score: r.score, start, end };
          break;
        }
        if (found && found.score === 100) break;
      }
      if (found) {
        matches.push({
          id: entry.id,
          order: idOrder(entry.id),
          start: found.start,
          end: found.end,
          where: seg.kind,
          via: 'alias',
        });
      }
    }
  }
  // 3) Escrito a medias (solo texto libre y solo si no hay nada más).
  if (!matches.length && context === 'text') {
    const seg = doc.segs.find((s) => s.kind === 'name');
    if (seg) {
      for (const entry of ALIAS_INDEX) {
        if (entry.terms.some((t) => prefixScore(t, seg.norm) >= 50)) {
          matches.push({ id: entry.id, order: idOrder(entry.id), start: seg.start, end: seg.end, where: 'name', via: 'prefix' });
        }
      }
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Reglas de contexto y anulaciones
// ---------------------------------------------------------------------------

function applyContext(matches, doc, context) {
  const text = doc.text;
  let list = matches.slice();
  const has = (id) => list.some((m) => m.id === id);
  const add = (id, extra = {}) => {
    if (FOOD_BY_ID[id] && !list.some((m) => m.id === id && !m.K)) {
      list.push({ id, order: idOrder(id), start: -1, end: -1, where: 'name', via: 'ctx', ...extra });
    }
  };
  const remove = (...ids) => {
    list = list.filter((m) => !ids.includes(m.id));
  };
  const fish = CTX.fish.test(text);
  const marisco = CTX.marisco.test(text);

  // Crudo: pescado o marisco → crudo; embutido, huevo o lácteo ya tienen su regla; verdura cruda no es carne.
  if (CTX.crudo.test(text)) {
    if (fish) add('pescado-crudo');
    else if (marisco) add('marisco-crudo');
    else if (CTX.embutido.test(text) || CTX.huevo.test(text) || CTX.lacteo.test(text)) {
      // «jamón crudo» es embutido curado; «huevo crudo» y «leche cruda» tienen su propia regla.
    } else if (CTX.vegetal.test(text) && !CTX.carne.test(text)) {
      // Verdura o fruta cruda: no es carne poco hecha.
    } else add('carne-poco-hecha');
  }
  // «Atún al punto», «pescado poco hecho» → pescado sin hacer, no carne.
  if (has('carne-poco-hecha') && (fish || marisco) && !CTX.carne.test(text) && CTX.pocoHecho.test(text)) {
    remove('carne-poco-hecha');
    add(fish ? 'pescado-crudo' : 'marisco-crudo');
  }
  if (fish && CTX.ahumado.test(text)) add('pescado-ahumado');
  if (fish && CTX.vinagre.test(text)) add('boquerones-vinagre');
  if (fish && CTX.marinado.test(text) && !has('boquerones-vinagre')) add('pescado-crudo');

  // Alcohol solo en salsa o guiso (sin bebida en la mesa) → salsa o guiso con vino.
  if (has('alcohol')) {
    const cooking = CTX.alcoholCooking.test(text) && !CTX.alcoholDrink.test(text);
    const onlyIngredient =
      context === 'product' && list.filter((m) => m.id === 'alcohol').every((m) => m.where === 'ingredient');
    if (cooking || onlyIngredient) {
      remove('alcohol');
      add('salsa-vino');
    }
  }

  // Anulaciones.
  if (has('cerveza-00')) remove('alcohol', 'cerveza-sin');
  if (CTX.sinAlcohol.test(text)) remove('alcohol');
  if (has('descafeinado')) remove('cafe', 'te');
  if (has('mayonesa-bote')) remove('mayonesa-casera');
  if (has('pescado-mercurio')) remove('atun-plancha', 'atun-lata', 'pescado-blanco-plancha', 'pescado-azul-pequeno', 'salmon-hecho');
  if (has('pescado-ahumado') || has('pescado-crudo') || has('boquerones-vinagre')) {
    remove('pescado-blanco-plancha', 'pescado-azul-pequeno', 'salmon-hecho', 'atun-plancha');
  }
  if (has('marisco-crudo')) remove('marisco-cocido');
  if (has('tortilla-poco-cuajada')) remove('tortilla-patata');
  if (has('huevo-poco-hecho')) remove('huevo-bien-hecho', 'revuelto');
  if (has('carne-poco-hecha') || has('tartar') || has('carpaccio')) remove('carne-bien-hecha');
  if (has('leche-cruda')) remove('leche-pasteurizada');

  // Embutido curado cocinado de verdad dentro del plato → embutido cocinado, conservando el tipo.
  const cooked = CTX.cookedDish.test(text) || CTX.cookedNextToEmbutido.test(text) || has('embutido-cocinado');
  if (cooked && FOOD_BY_ID['embutido-cocinado']) {
    list = list.map((m) => {
      const food = FOOD_BY_ID[m.id];
      if (!isCurado(food)) return m;
      return { ...m, id: 'embutido-cocinado', order: idOrder('embutido-cocinado'), K: food.embutido || null, from: m.id };
    });
  }
  // Tipo de embutido para «embutido cocinado» que llega sin tipo (alias «fabada», «croquetas de jamón»…).
  const typed = list.filter((m) => m.id === 'embutido-cocinado' && m.K);
  if (list.some((m) => m.id === 'embutido-cocinado' && !m.K) && !typed.length) {
    const kinds = Object.keys(EMBUTIDO_TYPE_RES).filter((k) => EMBUTIDO_TYPE_RES[k].test(text));
    if (kinds.length) {
      const base = list.find((m) => m.id === 'embutido-cocinado');
      list = list.filter((m) => m.id !== 'embutido-cocinado');
      for (const K of kinds) list.push({ ...base, K });
    }
  } else if (typed.length) {
    list = list.filter((m) => !(m.id === 'embutido-cocinado' && !m.K && !m.from));
  }

  // Sin duplicados (id + tipo de embutido); se queda la de menor orden.
  const seen = new Map();
  for (const m of list) {
    const key = `${m.id}|${m.K || ''}`;
    const prev = seen.get(key);
    if (!prev || m.order < prev.order) seen.set(key, m);
  }
  return [...seen.values()].sort((a, b) => a.order - b.order || (a.K || '').localeCompare(b.K || ''));
}

// ---------------------------------------------------------------------------
// Piezas de veredicto, perfil y fusión
// ---------------------------------------------------------------------------

function sanitizeProfile(profile) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const arr = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);
  return {
    embutido: ['no', 'cocinados', 'los_como'].includes(p.embutido) ? p.embutido : null,
    embutidos: arr(p.embutidos),
    alergias: arr(p.alergias),
    otra: typeof p.otra === 'string' ? p.otra.slice(0, 200) : '',
    dieta: arr(p.dieta),
  };
}

function pieceFromFood(food, extra = {}) {
  return {
    id: food.id,
    order: extra.order ?? idOrder(food.id),
    level: food.level,
    phrase: food.phrase,
    detail: food.detail,
    question: food.question ?? null,
    alternative: food.alternative ?? null,
    source: food.source,
    K: extra.K ?? null,
  };
}

// Perfil de embutido, por coincidencia (antes de fusionar).
function applyEmbutidoProfile(piece, food, profile) {
  const cocinado = food.id === 'embutido-cocinado';
  if (!cocinado && !isCurado(food)) return piece;
  const K = piece.K || food.embutido || null;
  const out = { ...piece };
  if (profile.embutido === 'no') {
    out.level = 'no';
    out.phrase = PHRASES.embutidoNo;
  } else if (profile.embutidos.length && K && !profile.embutidos.includes(K)) {
    out.level = 'no';
    out.phrase = PHRASES.embutidoNoMarcado;
  } else if (profile.embutido === 'cocinados') {
    out.level = cocinado ? 'cuidado' : 'no';
    out.phrase = cocinado ? PHRASES.embutidoCocinado : PHRASES.embutidoCrudoCocinados;
  } else if (profile.embutido === 'los_como') {
    out.level = cocinado ? 'cuidado' : 'no';
    out.phrase = cocinado ? PHRASES.embutidoCocinado : PHRASES.embutidoCrudoLosComo;
  }
  return out;
}

function applyPasteurized(piece, text) {
  if (!PASTEURIZABLE_CHEESE.has(piece.id) || piece.level === 'no') return piece;
  if (!CTX.pasteurizado.test(text) || CTX.noPasteurizado.test(text)) return piece;
  return { ...piece, level: 'si', phrase: PHRASES.quesoPasteurizado };
}

function mergePieces(pieces) {
  let best = null;
  for (const p of pieces) {
    if (!best || levelRank(p.level) > levelRank(best.level) || (levelRank(p.level) === levelRank(best.level) && p.order < best.order)) {
      best = p;
    }
  }
  return best;
}

function unknownPiece() {
  return {
    id: null,
    level: 'duda',
    phrase: UNKNOWN.phrase,
    detail: UNKNOWN.detail,
    question: UNKNOWN.question,
    alternative: null,
    source: UNKNOWN.source,
  };
}

// ---------------------------------------------------------------------------
// Alergias, «otra cosa», forma de comer
// ---------------------------------------------------------------------------

function negatedSet(text, labels = []) {
  const neg = new Set();
  for (const [k, re] of Object.entries(NEGATION_RES)) if (re.test(text)) neg.add(k);
  for (const { re, negates } of NEGATION_EXTRA) if (re.test(text)) negates.forEach((k) => neg.add(k));
  for (const l of labels) (OFF_LABEL_NEGATIONS[l] || []).forEach((k) => neg.add(k));
  return neg;
}

function lexiconHits(lexicon, text) {
  return Object.keys(lexicon).filter((k) => lexicon[k].test(text));
}

// Trozos del texto libre «otra cosa»: por comas, punto y coma, « y », saltos de línea; ≥ 3 letras.
function otraChunks(otra) {
  if (!otra) return [];
  return String(otra)
    .slice(0, 200)
    .split(/[,;\n\r]+|\s+y\s+|\s+e\s+|\s+o\s+/i)
    .map((raw) => raw.trim())
    .filter((raw) => (normalize(raw).match(/[a-z]/g) || []).length >= 3);
}

function otraRegex(norm) {
  const variants = new Set([norm]);
  if (norm.length > 4 && norm.endsWith('es')) variants.add(norm.slice(0, -2));
  if (norm.length > 3 && norm.endsWith('s')) variants.add(norm.slice(0, -1));
  const body = [...variants].map(escapeRe).join('|');
  return new RegExp(`(?<![a-z0-9])(?<!(?:sin|ni) )(?:${body})(?:es|s)?(?![a-z0-9])`);
}

function otraHits(otra, texts) {
  const hits = [];
  for (const raw of otraChunks(otra)) {
    const re = otraRegex(normalize(raw));
    if (texts.some((t) => re.test(t))) hits.push(raw);
  }
  return hits;
}

function dietNotes(profile, categories, lactosaNegated) {
  const notes = [];
  for (const d of ['vegetariana', 'vegana', 'sin_cerdo', 'sin_lactosa']) {
    if (!profile.dieta.includes(d)) continue;
    if (d === 'sin_lactosa' && lactosaNegated) continue;
    if (DIET_NOTES[d].tags.some((t) => categories.has(t))) notes.push(DIET_NOTES[d].note);
  }
  return notes;
}

// Aplica alergias, «otra cosa», trazas y lectura incierta sobre el veredicto fusionado.
function finish(base, { title, foodIds, profile, allergyFound, otraFound, traces = [], uncertain = false, notes, ingredients }) {
  let level = base.level;
  const prefixes = [];
  const allergyHits = ALLERGY_IDS.filter((a) => profile.alergias.includes(a) && allergyFound.has(a));
  if (allergyHits.length) {
    level = 'no';
    prefixes.push(`Has marcado ${joinList(allergyHits.map((a) => ALLERGY_LABEL[a]))}.`);
  }
  if (otraFound.length) {
    level = 'no';
    prefixes.push(`Has marcado ${joinList(otraFound.map((x) => `«${x}»`))}.`);
  }
  const traceHits = ALLERGY_IDS.filter((a) => profile.alergias.includes(a) && traces.includes(a) && !allergyFound.has(a));
  if (traceHits.length && level === 'si') {
    level = 'cuidado';
    prefixes.push(`Puede llevar trazas de ${joinList(traceHits.map((a) => ALLERGY_LABEL[a]))}.`);
  }
  if (uncertain && level === 'si') {
    level = 'duda';
    prefixes.push(PHRASES.lecturaIncierta);
  }
  return {
    title,
    level,
    label: LEVEL_LABEL[level],
    phrase: [...prefixes, base.phrase].join(' '),
    detail: base.detail,
    question: base.question,
    alternative: base.alternative,
    source: base.source,
    foodId: base.id || null,
    foodIds,
    notes,
    uncertain: !!uncertain,
    ingredients,
  };
}

// Núcleo común de classifyText y classifyProduct.
function classifyDoc(doc, { title, profile, context, extraMatches = [], declared = [], traces = [], labels = [], uncertain = false, ingredients = [] }) {
  const p = sanitizeProfile(profile);
  const text = doc.text;
  const matches = applyContext([...findMatches(doc, context), ...extraMatches], doc, context);

  const pieces = matches.map((m) => {
    const food = FOOD_BY_ID[m.id];
    let piece = pieceFromFood(food, { order: m.order, K: m.K });
    piece = applyEmbutidoProfile(piece, food, p);
    piece = applyPasteurized(piece, text);
    return piece;
  });
  const base = pieces.length ? mergePieces(pieces) : unknownPiece();
  const foodIds = [...new Set(matches.map((m) => m.id))];

  // Alergias y forma de comer: etiquetas de los alimentos + léxico del texto, menos negaciones;
  // los alérgenos declarados (Open Food Facts) cuentan siempre.
  const neg = negatedSet(text, labels);
  const tags = new Set(foodIds.flatMap((id) => FOOD_BY_ID[id].tags || []));
  const allergyFound = new Set();
  for (const a of ALLERGY_IDS) {
    if (neg.has(a)) continue;
    if (tags.has(a) || ALLERGEN_LEXICON[a].test(text)) allergyFound.add(a);
  }
  // «sin lactosa» no quita la leche: el léxico de leche incluye «lactosa».
  declared.forEach((a) => allergyFound.add(a));

  const categories = new Set();
  for (const t of tags) if (!neg.has(t)) categories.add(t);
  for (const k of lexiconHits(DIET_LEXICON, text)) if (!neg.has(k)) categories.add(k);
  for (const a of declared) if (['leche', 'huevo', 'pescado', 'marisco'].includes(a)) categories.add(a);
  const lactosaNegated = neg.has('lactosa') || CTX.sinLactosa.test(text);

  const otraFound = otraHits(p.otra, [text]);
  return finish(base, {
    title,
    foodIds,
    profile: p,
    allergyFound,
    otraFound,
    traces,
    uncertain,
    notes: dietNotes(p, categories, lactosaNegated),
    ingredients,
  });
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function classifyText(name, { ingredients = [], uncertain = false } = {}, profile) {
  const ingr = (Array.isArray(ingredients) ? ingredients : [ingredients]).filter((x) => typeof x === 'string' && x.trim());
  const title = String(name ?? '').trim();
  const doc = buildDoc([{ text: title, kind: 'name' }, ...ingr.map((t) => ({ text: t, kind: 'ingredient' }))]);
  return classifyDoc(doc, {
    title: title || (ingr.length ? ingr.join(', ') : ''),
    profile,
    context: 'text',
    uncertain: !!uncertain,
    ingredients: ingr.slice(),
  });
}

function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(text || '')) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim().replace(/\.$/, ''));
  return out;
}

const stripLang = (tag) => String(tag || '').replace(/^[a-z]{2,3}:/, '');

export function classifyProduct(product, profile) {
  const pr = product && typeof product === 'object' ? product : {};
  const name = typeof pr.name === 'string' ? pr.name.trim() : '';
  const ingredientsText = typeof pr.ingredientsText === 'string' ? pr.ingredientsText : '';
  const list = (x) => (Array.isArray(x) ? x.filter((t) => typeof t === 'string') : []);
  const categories = list(pr.categories);
  const labels = list(pr.labels);

  const ingrSegments = ingredientsText
    .split(/[,;:()[\]{}·•\n\r]+|\.(?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Categorías en español (es:quesos-frescos) pasan por el mismo léxico; el resto, por el mapa.
  const esCategories = categories.filter((c) => c.startsWith('es:')).map((c) => stripLang(c).replace(/-/g, ' '));
  const doc = buildDoc([
    { text: name, kind: 'name' },
    ...esCategories.map((t) => ({ text: t, kind: 'category' })),
    ...ingrSegments.map((t) => ({ text: t, kind: 'ingredient' })),
  ]);

  const extraMatches = [];
  for (const c of categories) {
    const id = OFF_CATEGORY_MAP[stripLang(c)];
    if (id && FOOD_BY_ID[id]) extraMatches.push({ id, order: idOrder(id), start: -1, end: -1, where: 'category', via: 'cat' });
  }
  const mapAllergens = (tags) => [...new Set(list(tags).map((t) => OFF_ALLERGEN_MAP[t]).filter(Boolean))];

  return classifyDoc(doc, {
    title: name || 'Producto sin nombre',
    profile,
    context: 'product',
    extraMatches,
    declared: mapAllergens(pr.allergens),
    traces: mapAllergens(pr.traces),
    labels,
    ingredients: splitTopLevel(ingredientsText),
  });
}

export function verdictForFood(foodId, profile) {
  const food = FOOD_BY_ID[foodId];
  if (!food) throw new Error(`Alimento desconocido: ${foodId}`);
  const p = sanitizeProfile(profile);
  const piece = applyEmbutidoProfile(pieceFromFood(food), food, p);
  const nameNorm = normalize(food.name);
  const aliasNorms = (food.aliases || []).map(normalize).filter(Boolean);
  const tags = new Set(food.tags || []);

  // Alergias: etiquetas y nombre (las etiquetas recogen lo que el alimento lleva siempre o casi siempre;
  // los alias son variantes, no ingredientes fijos).
  const neg = negatedSet(nameNorm);
  const allergyFound = new Set();
  for (const a of ALLERGY_IDS) {
    if (tags.has(a) || (!neg.has(a) && ALLERGEN_LEXICON[a].test(nameNorm))) allergyFound.add(a);
  }
  const categories = new Set(tags);
  for (const k of lexiconHits(DIET_LEXICON, nameNorm)) if (!neg.has(k)) categories.add(k);

  return finish(piece, {
    title: food.name,
    foodIds: [food.id],
    profile: p,
    allergyFound,
    otraFound: otraHits(p.otra, [nameNorm, ...aliasNorms]),
    notes: dietNotes(p, categories, false),
    ingredients: [],
  });
}

const GROUP_ORDER = new Map(GROUPS.map((g, i) => [g.id, i]));
const byName = (a, b) => a.name.localeCompare(b.name, 'es') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function searchFoods(query, groupId = 'todo') {
  const g = groupId || 'todo';
  const pool = g === 'todo' ? FOODS : FOODS.filter((f) => (f.groups || []).includes(g));
  const q = normalize(query);
  if (!q) {
    return pool
      .slice()
      .sort((a, b) => (GROUP_ORDER.get(a.groups?.[0]) ?? 99) - (GROUP_ORDER.get(b.groups?.[0]) ?? 99) || byName(a, b));
  }
  const tokens = q.split(' ');
  const ranked = [];
  for (const f of pool) {
    const name = normalize(f.name);
    const aliases = (f.aliases || []).map(normalize);
    const tier = (s) => (s === q ? 0 : s.startsWith(q) ? 1 : s.includes(q) ? 2 : tokens.every((t) => s.includes(t)) ? 3 : null);
    let best = null;
    const nt = tier(name);
    if (nt !== null) best = nt * 2;
    for (const a of aliases) {
      const at = tier(a);
      if (at !== null && (best === null || at * 2 + 1 < best)) best = at * 2 + 1;
    }
    if (best !== null) ranked.push({ f, rank: best });
  }
  return ranked.sort((a, b) => a.rank - b.rank || byName(a.f, b.f)).map((r) => r.f);
}
