// OCR local de respaldo (tesseract.js, español) para cuando la lectura por visión no está disponible.
// La librería se carga por CDN, con versiones exactas, solo cuando hace falta. La imagen no sale del
// navegador. Todo lo que devuelve va marcado como incierto. Si la librería no carga, devuelve [] sin lanzar.

export const TESSERACT = Object.freeze({
  script: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js',
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
  // Carpeta: tesseract elige tesseract-core-simd-lstm.wasm.js o tesseract-core-lstm.wasm.js según el móvil.
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
  langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int',
});

const OEM_LSTM_ONLY = 1;
const OCR_TIMEOUT_MS = 90_000;
const MAX_ITEMS = { carta: 12, etiqueta: 1 };
// El OCR recoge algo más de 12 líneas: la interfaz se queda con 12, priorizando las reconocibles.
const OCR_COLLECT = 20;
// Líneas que empiezan como un encabezado («Carta del mediodía», «Menú del día 14 €»).
const HEADING_START = /^(?:nuestra |la )?(?:carta|menu)\b/;
const MAX_NAME = 120;
const MAX_INGREDIENTS = 40;
const MAX_INGREDIENT = 80;

function fold(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countLetters(text) {
  return (String(text).match(/\p{L}/gu) || []).length;
}

function cut(text, max) {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('').trim() : text;
}

// Encabezados y avisos típicos de una carta que no son platos (comparados sin acentos ni mayúsculas).
const HEADINGS = new Set(
  [
    'carta', 'la carta', 'nuestra carta', 'menu', 'menú', 'menu del dia', 'menú del día', 'menu degustacion',
    'menú degustación', 'entrantes', 'para compartir', 'a compartir', 'para picar', 'raciones', 'medias raciones',
    'tapas', 'primeros', 'primeros platos', 'primer plato', 'segundos', 'segundos platos', 'segundo plato',
    'principales', 'platos principales', 'postres', 'postre', 'nuestros postres', 'bebidas', 'bebida', 'vinos',
    'vino', 'vinos tintos', 'vinos blancos', 'vinos rosados', 'cervezas', 'refrescos', 'cafes', 'cafés',
    'infusiones', 'cafes e infusiones', 'cafés e infusiones', 'ensaladas', 'carnes', 'pescados',
    'pescados y mariscos', 'mariscos', 'arroces', 'pastas', 'pizzas', 'hamburguesas', 'bocadillos', 'sopas',
    'cremas', 'verduras', 'guarniciones', 'sugerencias', 'sugerencias del chef', 'fuera de carta', 'del mar',
    'de la tierra', 'de la huerta', 'especialidades', 'especialidad de la casa', 'desayunos', 'meriendas',
    'iva incluido', 'iva incl', 'precios con iva', 'precios en euros', 'pan', 'pan y bebida', 'pan y postre',
    'pan, bebida y postre', 'incluye pan', 'servicio de pan', 'alergenos', 'alérgenos', 'precio', 'precios',
    'bienvenidos', 'gracias', 'buen provecho', 'que aproveche',
  ].map(fold),
);

const NOISE = /(?:\bi\.?v\.?a\b|www\.|https?:|@|\btel[eé]?f?o?n?o?\b\.?\s*\d|\bconsult\w*\b.*\bal[eé]rgen)/i;

// Quita precios, puntos de relleno y viñetas de una línea.
export function cleanLine(line) {
  return String(line)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/(?:€|eur\b|euros?\b)\s*\d{1,4}(?:[.,]\d{1,2})?/gi, ' ')
    .replace(/\d{1,4}(?:[.,]\d{1,2})?\s*(?:€|eur\b|euros?\b)/gi, ' ')
    .replace(/(?:^|\s)\d{1,4}[.,]\d{2}(?=\s|$)/g, ' ') // «12,50» suelto al final
    .replace(/[.·•…_~=*]{2,}|-{3,}|—{2,}/g, ' ') // puntos de relleno y similares
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•·*|:;,.~=_>»«"'()[\]]+/, '')
    .replace(/[\s\-–—•·*|:;,~=_<«»"'(]+$/, '')
    .replace(/\s*\.$/, '')
    .trim();
}

function plausible(line) {
  const letters = countLetters(line);
  if (letters < 4) return false;
  // Al menos una palabra de verdad (4+ letras seguidas): descarta ruido tipo «fe 15 r».
  if (!/\p{L}{4,}/u.test(line)) return false;
  const visible = line.replace(/\s/g, '').length;
  if (!visible || letters / visible < 0.6) return false; // ruido del OCR
  if (NOISE.test(line)) return false;
  const folded = fold(line).replace(/[:.]+$/, '');
  return !HEADINGS.has(folded) && !HEADING_START.test(folded);
}

// Parte una lista de ingredientes por comas o punto y coma, sin romper paréntesis ni decimales («8,7 %»).
export function splitIngredients(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[') depth++;
    if ((ch === ')' || ch === ']') && depth > 0) depth--;
    const decimal = ch === ',' && /\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? '');
    // Fin de frase («… lácticos. Puede contener trazas…»): punto seguido de espacio y mayúscula.
    const sentenceEnd = ch === '.' && /\s/.test(s[i + 1] ?? '') && /\p{Lu}/u.test(s.slice(i + 1).trimStart()[0] ?? '');
    if (((ch === ',' || ch === ';') && !decimal || sentenceEnd) && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts
    .map((p) => p.replace(/\s+/g, ' ').replace(/^[\s.:;\-–—•*]+/, '').replace(/[\s.:;\-–—•*]+$/, '').trim())
    .filter((p) => countLetters(p) >= 2)
    .map((p) => cut(p, MAX_INGREDIENT))
    .slice(0, MAX_INGREDIENTS);
}

// «Ingredientes:» con las confusiones típicas del OCR (I/l/1).
const INGREDIENTS_MARK = /[il1|!]ngred[il1|!]entes?\s*[:;.]?/i;
const INGREDIENTS_END =
  /informaci[oó]n nutricional|valor(?:es)? (?:energ[eé]tico|nutricional|medios?)|consumir (?:preferentemente|antes)|fecha de caducidad|cons[eé]rv(?:ese|ar) |modo de empleo|preparaci[oó]n\s*:|peso neto|\blote\b|fabricad[oa] (?:por|en)|envasad[oa] (?:por|en)|elaborad[oa] (?:por|en)|distribuid[oa] por|ingredients\s*:|ingr[eé]dients\s*:|nutrition/i;

// Convierte el texto reconocido en ítems { name, ingredients, uncertain: true }. Puro (testeable en Node).
export function parseOcrText(text, mode = 'carta') {
  const raw = String(text ?? '');
  if (mode === 'etiqueta') {
    const flat = raw.replace(/-\n(?=\p{Ll})/gu, '').replace(/\s*\n\s*/g, ' ');
    let ingredients = [];
    const mark = INGREDIENTS_MARK.exec(flat);
    if (mark) {
      let rest = flat.slice(mark.index + mark[0].length);
      const end = INGREDIENTS_END.exec(rest);
      if (end) rest = rest.slice(0, end.index);
      ingredients = splitIngredients(rest);
    } else {
      // Sin la palabra «Ingredientes»: solo si el texto parece una lista separada por comas.
      const pieces = splitIngredients(flat).filter((p) => countLetters(p) >= 3);
      if (pieces.length >= 3) ingredients = pieces;
    }
    return ingredients.length ? [{ name: 'La etiqueta', ingredients, uncertain: true }] : [];
  }

  const seen = new Set();
  const items = [];
  for (const line of raw.split(/\r?\n/)) {
    const clean = cleanLine(line);
    if (!clean || !plausible(clean)) continue;
    const key = fold(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name: cut(clean, MAX_NAME), ingredients: [], uncertain: true });
    if (items.length >= OCR_COLLECT) break;
  }
  return items;
}

// Líneas con confianza baja del OCR fuera: mejor no leer nada que inventar un plato.
const MIN_LINE_CONFIDENCE = 60;

function confidentText(data) {
  if (!data) return '';
  const lines = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) lines.push(line);
    }
  }
  if (!lines.length) return typeof data.confidence === 'number' && data.confidence < MIN_LINE_CONFIDENCE ? '' : data.text ?? '';
  return lines
    .filter((l) => (l.confidence ?? 0) >= MIN_LINE_CONFIDENCE)
    .map((l) => l.text)
    .join('\n');
}

let modulePromise = null;

function loadTesseract() {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ TESSERACT.script)
      .then((mod) => mod.default ?? mod)
      .catch((err) => {
        modulePromise = null; // se puede reintentar más tarde
        throw err;
      });
  }
  return modulePromise;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Reconoce la imagen y devuelve ítems inciertos. Nunca lanza: si algo falla, [].
export async function ocrImage(blobOrFile, mode = 'carta', { onStatus } = {}) {
  const m = mode === 'etiqueta' ? 'etiqueta' : 'carta';
  let worker = null;
  let finished = false;
  const run = async () => {
    const Tesseract = await loadTesseract();
    if (typeof Tesseract?.createWorker !== 'function') return [];
    const created = await Tesseract.createWorker('spa', OEM_LSTM_ONLY, {
      workerPath: TESSERACT.workerPath,
      corePath: TESSERACT.corePath,
      langPath: TESSERACT.langPath,
      logger: (msg) => {
        if (finished || typeof onStatus !== 'function') return;
        if (msg?.status === 'recognizing text' && msg.progress > 0.05 && msg.progress < 1) {
          try {
            onStatus(`Leyendo en el propio móvil, puede tardar un poco… ${Math.round(msg.progress * 100)} %`);
          } catch {
            /* nada */
          }
        }
      },
    });
    if (finished) {
      // Se agotó el tiempo mientras se preparaba: se cierra aquí mismo.
      await created.terminate().catch(() => {});
      return [];
    }
    worker = created;
    const result = await worker.recognize(blobOrFile, {}, { text: true, blocks: true });
    return parseOcrText(confidentText(result?.data), m);
  };
  try {
    return await withTimeout(run(), OCR_TIMEOUT_MS);
  } catch {
    return [];
  } finally {
    finished = true;
    const w = worker;
    worker = null;
    if (w) {
      try {
        await w.terminate();
      } catch {
        /* nada */
      }
    }
  }
}
