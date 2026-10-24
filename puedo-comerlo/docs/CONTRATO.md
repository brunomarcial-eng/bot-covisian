# Contrato técnico — «¿Puedo comerlo?»

Lee primero `docs/especificacion.md` (el encargo literal). Este documento fija la arquitectura y las
interfaces para que el equipo trabaje en paralelo sin pisarse. Si necesitas cambiar una interfaz,
no lo hagas en silencio: déjalo anotado en tu informe final.

## Arquitectura

- Web app móvil **sin paso de build**: HTML + CSS + JavaScript ES modules nativos (`<script type="module">`).
  Nada de React, bundlers ni TypeScript. Navegadores objetivo: Safari iOS 16+ y Chrome Android recientes.
- Todo el estado de la persona vive en `localStorage` (módulo `src/store.js`, ya escrito). No hay cuentas,
  ni servidor de usuarios, ni analítica, ni cookies, ni ningún dato clínico.
- Único backend: `POST /api/leer`, una función sin estado que recibe una foto comprimida y devuelve SOLO la
  transcripción (JSON). No guarda nada ni registra la imagen. El semáforo nunca se decide allí.
- El semáforo lo calcula siempre el motor de reglas local `src/engine/` (puro, determinista, sin DOM, sin red),
  que también se puede importar desde Node para los tests (`node --test`).
- Librerías de navegador solo por CDN con versión exacta fijada, cargadas de forma perezosa con `import()`
  cuando hacen falta (tesseract.js para OCR, ZXing si no hay `BarcodeDetector`). Fuentes: Google Fonts
  (Fraunces y Source Sans 3).
- Router por hash. Servidor local de desarrollo: `node server.js` (sirve estáticos + `/api/leer`).
  Despliegue previsto: cualquier hosting estático + la función `api/leer.js` (formato Vercel).

## Estructura y propietarios

```
puedo-comerlo/
  index.html, styles.css, manifest.webmanifest, icon.svg   → Interfaz (Michi)
  src/app.js, src/ui/*.js                                  → Interfaz (Michi)
  src/store.js                                             → ya escrito (coordinación). No lo reescribas; si
                                                             necesitas algo más, añade funciones sin romper las existentes.
  src/engine/levels.js                                     → ya escrito (coordinación)
  src/engine/foods.js                                      → Contenido de la guía (Laura)
  src/engine/*.js (resto), tests/engine.test.js            → Motor (Beto)
  src/capture/*.js, api/leer.js, server.js                 → Captura (Beto-captura)
  tests/e2e/*                                              → QA (Alfred)
  package.json                                             → coordinación (puedes añadir scripts)
```

## Niveles (`src/engine/levels.js`, ya existe)

```js
LEVELS = ['si', 'duda', 'cuidado', 'no']        // de menos a más grave
LEVEL_LABEL = { si: 'Sí', cuidado: 'Con cuidado', no: 'Mejor no', duda: 'No estoy segura' }
worstLevel(a, b)  // devuelve el peor: no > cuidado > duda > si
```

## Base de alimentos (`src/engine/foods.js`)

```js
export const GROUPS = [
  { id: 'todo', label: 'Todo' }, { id: 'embutidos', label: 'Embutidos' }, { id: 'lacteos', label: 'Lácteos' },
  { id: 'huevos', label: 'Huevos' }, { id: 'carne', label: 'Carne' }, { id: 'pescado', label: 'Pescado' },
  { id: 'restaurante', label: 'En el restaurante' }, { id: 'bebidas', label: 'Bebidas' },
  { id: 'supermercado', label: 'Supermercado' },
];
export const FOODS = [ Food, ... ];
export const FOOD_BY_ID = Object.fromEntries(FOODS.map(f => [f.id, f]));
```

`Food`:
```js
{
  id: 'pescado-crudo',
  name: 'Pescado crudo',                 // nombre visible, corto
  aliases: ['sushi', 'sashimi', ...],    // en minúsculas; pueden llevar acentos (el motor normaliza)
  groups: ['pescado', 'restaurante'],    // el primero es el principal; 'supermercado' para lo que se compra
  level: 'no',                           // 'si' | 'cuidado' | 'no' | 'duda'
  phrase: 'Crudo, mejor no: puede llevar anisakis y listeria.',   // UNA frase corta
  detail: '…',                           // 2–4 frases, cita la fuente por su nombre
  question: '¿El pescado va crudo o marinado sin cocinar?' | null,  // para el camarero o la etiqueta
  alternative: 'Pescado hecho a la plancha o al horno…' | null,
  source: 'AESAN' | 'Ministerio de Sanidad' | 'AESAN y Ministerio de Sanidad',
  tags: ['pescado', 'crudo'],            // vocabulario abajo
  embutido: 'jamon' | 'chorizo' | 'salchichon' | 'lomo' | undefined,   // solo embutidos curados
}
```

IDs obligatorios (la interfaz y el motor dependen de ellos; se pueden añadir más):

- Embutidos: `jamon-curado` (jamon), `chorizo` (chorizo), `sobrasada` (chorizo), `salchichon` (salchichon: salchichón, fuet, salami), `lomo-embuchado` (lomo), `embutido-cocinado`, `fiambre-loncheado`
- Lácteos: `leche-pasteurizada`, `yogur`, `queso-fresco`, `queso-curado`, `queso-blando-corteza`, `queso-azul`, `queso-loncheado-rallado`, `leche-cruda`
- Huevos: `huevo-bien-hecho`, `mayonesa-bote`, `huevo-poco-hecho`, `tortilla-poco-cuajada`, `mayonesa-casera`, `tortilla-patata`
- Carne: `carne-bien-hecha`, `carne-poco-hecha`, `tartar`, `carpaccio`, `pate`, `higado`, `caza`, `hamburguesa`
- Pescado: `pescado-blanco-plancha`, `pescado-azul-pequeno`, `marisco-cocido`, `pescado-crudo`, `pescado-ahumado`, `boquerones-vinagre`, `marisco-crudo`, `pescado-mercurio`, `atun-lata`, `atun-plancha`
- Restaurante: `ensalada-cesar`, `ensaladilla`, `ensalada`, `gazpacho` (gazpacho o salmorejo), `tarta-queso`, `helado`, `pizza`, `paella` (paella o fideuá), `germinados`, `tiramisu`, `pan-tomate`, `legumbres`, `verdura-cocinada`
- Bebidas y otros: `cafe`, `te`, `cola`, `descafeinado`, `manzanilla`, `agua`, `chocolate`, `cerveza-00`, `cerveza-sin`, `alcohol`, `salsa-vino`, `infusiones-evitar`, `bebida-energetica`, `edulcorantes`, `zumo`, `fruta`

Vocabulario de `tags` (lo usa el motor para alergias y forma de comer):
- Alérgenos (mismos ids que las alergias): `leche`, `huevo`, `gluten`, `frutos_secos`, `pescado`, `marisco`, `soja`, `sesamo`
- Forma de comer: `carne`, `cerdo`, `pescado`, `marisco`, `leche`, `huevo`, `miel`, `gelatina`, `lactosa`
- Informativas libres: `crudo`, `embutido`, `alcohol`, `cafeina`, `mercurio`, `listeria`, `toxoplasma`, …

Pon solo las etiquetas que el alimento lleva siempre o casi siempre (p. ej. `tortilla-patata` → `huevo`;
`pizza` → `gluten`, `leche`; `ensalada-cesar` → `huevo`, `leche`, `gluten`, `pescado` si lleva anchoa en la salsa).

## Perfil (`src/store.js`)

```js
{
  embutido: null | 'no' | 'cocinados' | 'los_como',
  embutidos: [],      // subconjunto de ['jamon','chorizo','salchichon','lomo']; [] = todos
  alergias: [],       // subconjunto de ['leche','huevo','gluten','frutos_secos','pescado','marisco','soja','sesamo']
  otra: '',           // texto libre ≤ 200 caracteres
  dieta: [],          // subconjunto de ['vegetariana','vegana','sin_cerdo','sin_lactosa']
}
```
Etiquetas visibles: `ALERGIAS` y `DIETAS` y `EMBUTIDOS` exportados desde `src/store.js` (id → etiqueta).

## API del motor (`src/engine/index.js`)

```js
export { LEVELS, LEVEL_LABEL, worstLevel } from './levels.js';
export { FOODS, GROUPS, FOOD_BY_ID } from './foods.js';
export function normalize(text): string                         // minúsculas, sin acentos, ñ→n, espacios colapsados
export function searchFoods(query, groupId = 'todo'): Food[]    // nombre + alias, sin acentos, por inclusión; '' → todo el grupo
export function verdictForFood(foodId, profile): Verdict        // ficha de un alimento conocido
export function classifyText(name, { ingredients = [], uncertain = false } = {}, profile): Verdict
export function classifyProduct(product, profile): Verdict      // producto de Open Food Facts normalizado (ver Captura)
```

`Verdict` (lo que pinta la interfaz):
```js
{
  title: 'Sushi de salmón',     // lo leído/escrito, o el nombre del alimento
  level: 'no', label: 'Mejor no',
  phrase: 'Has marcado pescado. Crudo, mejor no…',   // UNA frase (con prefijos «Has marcado X.» / «No estoy segura de la lectura.» si toca)
  detail: '…', question: '…' | null, alternative: '…' | null,
  source: 'AESAN' | … | 'La propia app: no reconozco este plato',
  foodId: 'pescado-crudo' | null,  // alimento de la guía que decide el nivel (para enlazar a su ficha)
  foodIds: ['pescado-crudo', …],   // todas las coincidencias
  notes: ['No encaja con vegana', 'Lleva cerdo'],   // forma de comer (no cambian el nivel)
  uncertain: false,
  ingredients: [],
}
```

Reglas del perfil (las implementa el motor; la interfaz solo pinta):
- Embutido curado (crudo o cocinado) con tipo K:
  - `embutido === 'no'` → «Mejor no», frase «Has decidido no comer embutidos.» (también en croqueta o pizza).
  - si `embutidos` no está vacío y K no está → «Mejor no», frase «No está entre los embutidos que has marcado.»
  - `'cocinados'`: crudo → «Mejor no»; cocinado dentro del plato → «Con cuidado», solo si se cocina de verdad dentro.
  - `'los_como'`: crudo sigue «Mejor no» (nunca «Sí»), frase = una línea con el motivo; la decisión es suya.
- Fiambre de bandeja: siempre «Mejor no», da igual el perfil.
- Alergia marcada presente (nombre, ingredientes, etiquetas, alérgenos OFF) → «Mejor no» y antepone «Has marcado X.»
  «sin gluten» / «sin huevo» etc. no disparan la alergia (salvo «sin lactosa» con alergia a leche: sigue siendo leche).
- Texto libre `otra` presente → «Mejor no» y antepone «Has marcado «X».»
- Trazas OFF de una alergia marcada: si el nivel era «Sí» → «Con cuidado».
- Forma de comer → solo `notes`.

## Captura (`src/capture/`)

```js
// camera.js
export function cameraAvailable(): boolean                        // hay mediaDevices.getUserMedia
export async function openCamera(videoEl): Promise<{ stop(): void, capture(): Promise<Blob> }>
      // facingMode: { ideal: 'environment' }; lanza Error con .code = 'no-camera' | 'denied' | 'error'

// image.js
export async function compressImage(blobOrFile, { maxSide = 1280, quality = 0.7 } = {})
      : Promise<{ blob: Blob, base64: string /* sin prefijo data: */, mediaType: 'image/jpeg', width, height }>

// reader.js
export async function readImage(blobOrFile, mode /* 'carta' | 'etiqueta' */, { onStatus } = {})
      : Promise<{ readable: boolean, items: Array<{ name: string, ingredients: string[], uncertain: boolean }>,
                  via: 'vision' | 'ocr' | 'none' }>
      // comprime → POST /api/leer → si falla (red, 4xx/5xx, JSON raro) → OCR local tesseract 'spa' con items
      // uncertain: true → si no sale nada, { readable: false, items: [], via: 'none' }. Nunca inventa. Nunca lanza
      // por «ilegible». onStatus(texto) para mensajes tipo «Leyendo la carta…». Máximo 12 ítems en 'carta', 1 en 'etiqueta'.

// barcode.js
export function isValidCode(s): boolean                       // 8–14 dígitos
export async function startScanner(videoEl, onCode): Promise<{ stop(): void }>
      // cámara trasera; BarcodeDetector (ean_13, ean_8, upc_a, upc_e) o ZXing por CDN; llama onCode(code) una vez

// off.js
export async function fetchProduct(code): Promise<{ found: true, product: Product } | { found: false }>
      // GET https://world.openfoodfacts.org/api/v2/product/{code}.json (con ?fields=… para aligerar)
      // 404 / status 0 → { found: false }. Error de red → lanza Error con .code = 'network'.
Product = {
  code, name, brand, image /* url|null */,
  ingredientsText,            // preferir ingredients_text_es, si no ingredients_text
  allergens: ['en:milk', …],  // allergens_tags
  traces: ['en:nuts', …],     // traces_tags
  categories: [ … ],          // categories_tags
  labels: [ … ],              // labels_tags
}
```

`POST /api/leer` — cuerpo `{ image: base64, mediaType: 'image/jpeg', mode: 'carta' | 'etiqueta' }`
→ 200 `{ readable: boolean, items: [{ name, ingredients: [], uncertain }] }`; 503 `{ error: 'sin_vision' }` si no
hay clave; 400/413/502 en otros casos. La interfaz nunca llama a esta ruta directamente: usa `readImage`.

## Interfaz

Rutas (hash):
`#/` Inicio · `#/fuera` · `#/super` · `#/lista` · `#/historial` · `#/buscar?q=…&g=…` · `#/ficha/:id` ·
`#/resultado` · `#/ajustes` · `#/arranque/1` … `#/arranque/6`. Sin arranque hecho → siempre a `#/arranque/1`.

Atajos → ficha:
- Fuera: jamón curado→`jamon-curado`, pescado crudo→`pescado-crudo`, tortilla→`tortilla-patata`,
  ensalada César→`ensalada-cesar`, ensaladilla→`ensaladilla`, tarta de queso→`tarta-queso`,
  gazpacho→`gazpacho`, mayonesa casera→`mayonesa-casera`, queso blando→`queso-blando-corteza`, paella→`paella`
- Súper: atún en lata→`atun-lata`, loncheados→`fiambre-loncheado`, queso rallado→`queso-loncheado-rallado`,
  paté→`pate`, ahumado→`pescado-ahumado`, café→`cafe`, alcohol→`alcohol`, cerveza 0,0→`cerveza-00`

Buscar / «O escribe el plato»: arriba la respuesta del motor para el texto escrito (`classifyText`) — «la
respuesta, primero» — y debajo «En la guía» con `searchFoods`. Al enviar, se apunta en el historial (via
`busqueda`). Escribir «sushi» debe mostrar «Mejor no»; «tortilla», «Con cuidado».

Resultado (`#/resultado`): lee `store.getResult()`; título («La carta», nombre del producto o «La etiqueta»),
aviso opcional, lista de fichas mínimas. Si el payload se puede recalcular, recalcúlalo con el perfil actual.

## Almacenamiento (`src/store.js`, ya existe)

Claves con prefijo `pc.v1.`. `clearAll()` borra todo lo de la app y la devuelve al arranque.
Entrada de historial / lista:
```js
{ id, at, via: 'foto'|'codigo'|'busqueda'|'guia', title, level, phrase, foodId: string|null, payload: Payload|null }
Payload = { kind: 'texto', text }
        | { kind: 'carta' | 'etiqueta', items: [{ name, ingredients, uncertain }] }
        | { kind: 'producto', product }
        | { kind: 'item', name, ingredients, uncertain }        // una ficha suelta guardada en la lista
```
Con `payload` (o `foodId`) la interfaz puede recalcular el semáforo con el perfil actual.

## Textos fijos (literales)

- Pie siempre visible: «Orientativa. No sustituye el consejo de tu matrona, ginecólogo o médico.»
- Nunca «evitar» ni «seguro» a secas en los semáforos. Etiquetas: «Sí», «Con cuidado», «Mejor no», «No estoy segura».
- Sin datos clínicos: nada de semanas, fechas de parto, toxoplasmosis de la persona, analíticas, diabetes.
