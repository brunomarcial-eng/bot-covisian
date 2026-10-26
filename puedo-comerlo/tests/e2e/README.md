# Pruebas de aceptación e2e — «¿Puedo comerlo?»

Batería de extremo a extremo que recorre la app como lo haría la usuaria, en un Chromium móvil
(390×844, `isMobile`, `hasTouch`, `es-ES`), y comprueba el «Criterio de hecho» de `docs/especificacion.md`,
las rutas, atajos y almacenamiento de `docs/CONTRATO.md` y los cambios deliberados de la interfaz rediseñada
(`docs/DECISIONES.md`, «Interfaz» · N5: arranque de 4 pasos, Buscar sin «En la guía», respuestas y filas nuevas).

## Ejecutar

```sh
cd puedo-comerlo
node tests/e2e/fixtures/make-fixtures.cjs   # solo si faltan las imágenes (ya están en el repo)
node tests/e2e/run.cjs                      # todos los escenarios (unos 3–5 min; el recorrido de las 140 fichas y el OCR local son lo más lento)
node tests/e2e/run.cjs 3 4                  # solo los escenarios 3 y 4 (el 11, consola, resume lo ejecutado)
```

Requisitos: Node ≥ 20 y Playwright con Chromium disponibles (`require('playwright')`). No hace falta
`npm install` en el proyecto: el runner es CommonJS (`.cjs`) porque `package.json` es `"type": "module"`.

El runner arranca él mismo `node server.js` con un `PORT` libre (5199 si está libre) y lo para al terminar.
Si `server.js` aún no existe, sirve los estáticos con un servidor mínimo propio que responde 503 en
`/api/leer` (como sin clave de visión). Si `index.html` o `src/app.js` no existen, sale con código 2.

Salida:

- stdout: ✓ / ✗ / ⚠ por comprobación y un resumen final OK / FALLO por escenario.
- `tests/e2e/out/report.md`: el mismo informe en Markdown, con la captura de cada fallo.
- `tests/e2e/out/*.png`, `server.log`, `results.json` (todo, incluidos los eventos de consola y red).
- Código de salida: 0 todo OK · 1 algún FALLO · 2 la app aún no existe · 3 error del propio runner.

`tests/e2e/out/` está en `.gitignore`.

### Variables

| Variable | Para qué |
|---|---|
| `E2E_BASE_URL` | Probar contra un servidor ya arrancado (p. ej. `http://127.0.0.1:5173`). |
| `E2E_PORT` | Puerto preferido (5199). |
| `E2E_OCR_TIMEOUT` | Espera máxima de una lectura de foto, en ms (120000). |
| `E2E_SIN_VISION=1` | Quita `ANTHROPIC_API_KEY` al servidor para forzar el OCR local. |
| `E2E_NO_PROXY=1` | No usar `HTTPS_PROXY` en Chromium. |

### Red

En el entorno de Claude Code la salida a internet pasa por el proxy de `HTTPS_PROXY`: el runner lanza
Chromium con `proxy: { server: HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }` y `ignoreHTTPSErrors`
(solo pruebas). Al empezar comprueba desde Chromium que llegan `world.openfoodfacts.org`,
`cdn.jsdelivr.net` (tesseract) y `fonts.googleapis.com`, y lo apunta en el informe.

## Qué cubre

| # | Escenario | Comprobaciones principales |
|---|---|---|
| 1 | Arranque de 4 pasos | `#/arranque/1…4` con `.steps-count` («Paso n de 4») y `.back-btn` (no en la portada). Portada con los textos literales y el pie; paso 2 «Alergias e intolerancias» (las 8 alergias, «Otra cosa que no quieras comer», máx. 200); paso 3 «Dietas y restricciones» (vegetariana, vegana, sin cerdo, «Sin lactosa (intolerancia)»); paso 4 privacidad con «Empezar». «Seguir» nunca se desactiva; «Atrás» vuelve; no existe el paso 5; el pie se ve en los cuatro. Ni el arranque ni Ajustes contienen «embutido», «jamón», «AESAN», toxoplasmosis ni «¿Qué has decidido?». Perfil guardado en `pc.v1.profile` (alergias, otra, dieta) tras cada paso; «Empezar» → «¿Qué vas a comer?» con `a.tile` «Comer fuera» y «En el súper». Recoge todos los labels, placeholders, legends y preguntas (arranque + Ajustes) y falla si alguno pide semana, parto, toxoplasmosis, diabetes, analítica, glucosa, peso o edad, o si hay inputs de fecha/número. |
| 2 | Pie y navegación | En Inicio, Fuera, Súper, Lista, Ajustes, Buscar, una ficha e Historial: el pie literal dentro del viewport y no tapado (arriba y tras hacer scroll); navegación inferior con exactamente Inicio, Fuera, Súper, Lista; sin hamburguesa; nombre y acceso a Ajustes arriba. |
| 3 | Buscar | Solo campo y respuesta: `article.answer.lv-<nivel>[data-level]` con `.answer-word`, `.answer-name`, `.answer-phrase`, `.more-btn`/`.more`. «sushi» → «Mejor no» con URL `#/buscar?q=sushi` (sin `g`); «tortilla» → «Con cuidado»; «sushi flameado» → «Mejor no» sin «Ver la ficha»; «xyzzy» → «No estoy segura»; «cesar», «jamon» (sin tildes), «café», «cerveza 0,0». «Añadir a la lista» visible sin abrir «Ver más»; «Ver la ficha» solo con un único alimento. Sin «En la guía», «No aparece», chips, filtros por grupo ni contador. Campo vacío: ayuda y los 10 atajos. Queda en el historial. |
| 4 | Ficha y lista | Atajos de Fuera (`ul.shortcuts a`, ≥ 48 px); atajo «tortilla» → `#/ficha/tortilla-patata`; ficha mínima y «Ver más» con detalle, pregunta y fuente; «Añadir a la lista» → Lista (`li.entry` con `.lvl` y frase); sigue tras recargar; «Quitar» = `button.quiet-btn` con `aria-label="Quitar Tortilla de patata"`; texto literal de lista vacía. |
| 5 | Foto de carta | `carta.jpg` por «Elegir una foto»: acepta filas `li.entry` con «La carta» (y resumen `.summary .pill` con «7 mejor no»…, que suma las filas) o el mensaje honesto, y registra cuál y los niveles de Sushi, Tortilla, Tiramisú, Tinto de verano y Cerveza 0,0 (y el resto). Pie visible en el resultado. Con OCR (lectura incierta) ningún plato puede quedar en «Sí». Privacidad del POST a `/api/leer` (solo `image`, `mediaType`, `mode`; JPEG ≤ 1280 px). `ilegible.jpg` → mensaje honesto literal y ninguna fila. |
| 6 | Cámara | Chromium con cámara falsa: «Hacer una foto» → vídeo en reproducción con `facingMode: environment`, botón de disparo («Hacer la foto»), «Usar esta foto», lectura. Sin cámara (`getUserMedia` rechaza con `NotFoundError`): lo dice y ofrece la galería. |
| 7 | Súper por código | Alergias leche + frutos secos. Atajos (`ul.shortcuts a`). 3017620422003 → `article.answer.lv-no` «Nutella», «Mejor no», frase «Has marcado…», «Añadir a la lista» visible; petición a `world.openfoodfacts.org/api/v2/product/…` sin datos del perfil. 8410014312203 → no está y ofrece fotografiar la etiqueta (opcional: sube `etiqueta.jpg`). 12345 → validación sin petición. |
| 8 | Persistencia y borrado | Lista, favoritos e historial tras recargar («Lo último» con filas-enlace, Historial con «Ficha ·» y no «Guía ·»). Ajustes: alergias, «Otra cosa…», dietas, h2 «Historial», «En la pantalla de inicio», «Tus datos», leyenda «Dietas y restricciones» y «Guardado. Las respuestas ya usan estos ajustes.»; marcar «Huevo» cambia la ficha, Buscar «tortilla» y la Lista a «Mejor no» con «Has marcado huevo.». «Borrar los datos de este móvil» (con `confirm()` o confirmación propia) → `#/arranque/1` y ninguna clave `pc.*`. |
| 9 | Diseño | body 18 px y Source Sans 3; h1 Fraunces; fondo #f3eee6 y tinta #241f1a; botón principal salvia; botones y enlaces-botón ≥ 48 px en todas las pantallas (también el arranque, atajos y filas); sin scroll horizontal; `.answer-word` en Fraunces grande y en el color de la especificación («Sí» #245443, «Con cuidado» #8d4324, «Mejor no» #7a332c) y lo mismo con `.lvl` en las filas del Historial; a 1280 px la columna ≤ 32rem y centrada. Los enlaces en línea (`.text-link`) y las casillas < 48 px solo avisan. |
| 10 | Lenguaje y guía | Abre las 140 fichas de `src/engine/foods.js` por `#/ficha/:id`: una sola respuesta, palabra de nivel exacta y en su color, su nivel base con perfil neutro (palabra, `lv-*` y `data-level`), nombre, frase que no repite la palabra del nivel, y fuente AESAN / Ministerio de Sanidad tras «Ver más». Plato desconocido → «No estoy segura» con fuente «la propia app». Sobre todo lo recorrido por la batería: ninguna fila ni respuesta empieza la frase con la palabra del nivel; ninguna pantalla usa `.card`, `.chip`, `.chips`, `.sheet`, `.row`, `.link-btn` ni `.pill` por respuesta; Buscar sin «En la guía»/«No aparece»; el arranque sin embutidos; ninguna pastilla dice «evitar», «seguro» o «segura» a secas (avisa de títulos con esas palabras). |
| 11 | Consola | `pageerror`, `console.error`, peticiones fallidas y respuestas ≥ 400 del propio origen en todos los escenarios. Se separan los esperados (503 de `/api/leer` sin clave, 404 de OFF para el código inexistente) y la red de terceros. |

Cada escenario usa un contexto nuevo (localStorage vacío). Salvo el 1 y el 9, que hacen el arranque por la
interfaz, el resto siembra el perfil en `pc.v1.profile` + `pc.v1.onboarded` (formato de `src/store.js`: `alergias`, `otra`, `dieta`; ya no hay campos de embutidos) y,
si la app no lo respeta, lo avisa y hace el arranque por la interfaz.

Leyenda del informe: **FALLO** incumple la especificación o el contrato; *Aviso* es algo que conviene
mirar pero no rompe el criterio de hecho; `·` es información (qué se vio, tiempos, rutas).

## Escaneo guiado, claves y lista de la compra (N8) · escenarios 12–16

Todo lo que toca internet va **simulado** con `page.route` (Open Food Facts con códigos inventados `84123456789xx`, `/api/producto` y, donde hace falta, `/api/leer`): ni en local ni en producción se llama de verdad a `/api/producto`, salvo UNA vez en el escenario 16. Cada escenario 12–15 se ejecuta a 390×844 y a 360×740 (etiqueta `[390×844]` / `[360×740]` en el informe) y en cada pantalla clave comprueba: sin scroll horizontal, controles ≥ 48 px, pie visible, nada tapado por el pie y, en el bloque de etiqueta, contraste ≥ 4,5:1 sobre cada color.

| # | Escenario | Comprobaciones principales |
|---|---|---|
| 12 | Escaneo guiado | «Ñoquis de patata» de OFF sin ingredientes (`/api/producto` → 503): «No estoy segura» con «No tengo los ingredientes de este producto. Fotografíalos y lo compruebo.», `section.need-label` («Me faltan los ingredientes», «Voy a mirar si lleva: …huevo.», botón «Fotografiar los ingredientes» → `#/super?ingredientes=1`), `/api/producto` solo recibe código, nombre y marca. «Cancelar» la foto vuelve al resultado. Tras la foto (lectura simulada con huevo): `section.label-check` con `li.check-row[data-topic][data-status]`, lo hallado primero, «Por qué importa» → `#/claves/huevo-crudo` (y abre esa clave), historial con una sola entrada del producto, POST a `/api/leer` sin datos de la persona. Después, `etiqueta.jpg` real: filas de etiqueta o el mensaje honesto. |
| 13 | Internet, no encontrado y cancelar | `/api/producto` → producto con `sourceName`/`sourceUrl`: «Datos encontrados en internet (Alcampo). Compruébalos con la etiqueta.», `a.ext-link` con `target=_blank` y `rel` noopener noreferrer, el «Sí» rebajado a «No estoy segura» («Datos encontrados en internet, sin confirmar con la etiqueta.»), «Mejor no» que se queda «Mejor no», confianza baja = sin ingredientes. No encontrado (found:false y 503): «No lo encuentro. Fotografía los ingredientes y lo miro por ti.» con «Fotografiar los ingredientes» como botón principal, y foto de un producto sin código (el nombre sale de la foto). «Cancelar» durante «Buscando en Open Food Facts…» y «Buscando en internet…» con la respuesta retrasada: vuelve al Súper, la respuesta tardía no abre nada y no queda nada en el historial. |
| 14 | Claves | «Ver más» de tiramisú y sushi: «Para saber más», `ul.chips a.chip` (≥ 48 px) y «Por qué importa»; un «Sí» no lleva temas. `#/claves`: 8 `li.clave[data-clave]` con `.clave-head[aria-expanded]`, una abierta a la vez (la URL la sigue), `#/claves/huevo-crudo` abre y baja, un id inventado no abre nada. Las 8 citan AESAN o el Ministerio de Sanidad y ninguna dice «evitar» ni «seguro/segura». Enlaces en Inicio (`a.claves-link`, siempre) y Ajustes; la barra inferior sigue con 4 destinos. |
| 15 | Lista de la compra | h1 «Lista de la compra»; sushi, tortilla, lubina y «xyzzy» ordenados Sí → Con cuidado → No estoy segura → Mejor no; `input.buy-box[data-action=comprado]` (con `click()`; zona de toque ≥ 48 px) baja a «En el carro (n)» (plegable) y persiste tras recargar; desmarcar; «Vaciar lo comprado»; «Compartir la lista» por portapapeles (permisos `clipboard-read/write`; «Mi lista de la compra» + «- Nombre» solo de lo pendiente, sin semáforo ni «embarazo») y por `navigator.share`; vacío con plato y la línea literal; datos antiguos sin `done` como pendientes; nota «Sale «Mejor no» con tus ajustes» solo sin tema; «Borrar los datos» deja cero claves `pc.*`. |
| 16 | Humo de `/api/producto` | UNA llamada real con 8424289001480: la app termina en un resultado o en «No lo encuentro…» y `/api/producto` responde 200 (en local, sin clave, 503 es lo esperado; en producción un 5xx es FALLO). |

Contra producción: `E2E_BASE_URL=https://puedo-comerlo.vercel.app node tests/e2e/run.cjs`. Allí la carta y las etiquetas las lee Claude (en local, OCR), `/api/producto` está simulado salvo en el escenario 16 y el límite de `/api/leer` es de 20 fotos por IP cada 10 minutos (la batería usa unas 12).

## Pantalla entera del color (N6) e ilustración (N7/N7b)

Lo que la batería comprueba de estos dos cambios (todo en los escenarios de arriba):

- **Color del veredicto** (1, 3, 4, 7, 9, 10): en las pantallas de UNA respuesta (Buscar, ficha, producto, etiqueta de un plato) `document.body.dataset.verdict` = `si|cuidado|no|duda`, el fondo del body tarda ~0,45 s en tomar el color (la batería espera 0,7 s): sí `rgb(36,84,67)`, con cuidado `rgb(176,79,16)`, mejor no `rgb(122,51,44)`, no estoy segura `rgb(134,103,42)`; `<meta name="theme-color">` cambia con el veredicto y vuelve a `#f3eee6`. `.answer-word` es crema `rgb(255,253,248)` con el texto exacto (se lee con `textContent`: «Sí» se pinta en mayúsculas por CSS y `innerText` daría «SÍ»). Palabra, frase y pie ≥ 4,5:1 sobre el color. Fuera de esas pantallas (Inicio, Fuera, Súper, Lista, Historial, Ajustes, carta) no hay `data-verdict` y el fondo es crema.
- **Transiciones** (9): en Buscar, «sushi» → «lubina a la plancha» → «tortilla» → «xyzzy» → vacío, con `data-verdict` y meta al instante, fondo tras el fundido, «?» decorativos (`#tone span[aria-hidden]`) solo con cuidado y duda; atrás/adelante entre fichas e Inicio; `prefers-reduced-motion` (emulado): color al instante y 0 animaciones.
- **Listas** (4, 5, 9): `ul.entries > li.entry.lv-*[data-level]` con banda de fondo (`#e0eae3`, `#f8e2d0`, `#f2dfdb`, `#efe6c8`) y la palabra `.lvl` en salvia, arcilla, vino o arena oscura (≥ 4,5:1). Las filas son 2 × gutter más anchas que la columna: se comprueba que caben, centradas y sin scroll horizontal (390 px y 1280 px).
- **Portada** (1): `.cover-art` (`aria-hidden`) con 12 `.art-plato`, `main.is-cover`, «Paso 1 de 4», «Seguir» dentro del viewport y por encima del pie a 390×844 y 360×740, `.disclaimer-note` después del botón, sin `<text>`/`<image>` en el SVG; con reduced-motion los 12 platos con opacidad 1 y 0 animaciones; sin él, animación al abrir.
- **Vacíos y carga** (2, 4, 5, 7): `.empty.empty--art` con `.empty-art` en Lista, Historial e Inicio («Lo último»); `.status--art .status-art` con el texto en `.status-text` y sin `.spinner` al leer una foto y al consultar Open Food Facts (la respuesta se retrasa con `page.route`); la carta leída es `ul.entries.entries--rise`.
- **SVG** (10): ninguno de los SVG vistos en la batería contiene `<text>`, `<tspan>`, `<image>` ni `<foreignObject>`, y las ilustraciones grandes son decorativas.
- **360×740** (9): ficha de cada color, Buscar (largo y con «Ver más»), carta, Lista, Historial y Ajustes sin scroll horizontal, controles ≥ 48 px, nada tapado por el pie; capturas en `out/09-*-360-*.png`.

En local `/api/leer` responde 503 (sin clave de visión): la lectura de fotos va por OCR local y eso es lo esperado.

## Fixtures

`fixtures/make-fixtures.cjs` las regenera de forma reproducible (HTML fijo + captura con Playwright, fuentes
del sistema, PRNG con semilla):

- `carta.jpg` (1000 px de ancho): carta con Entrantes, Principales, Postres y Bebidas, con precios.
- `etiqueta.jpg`: «Queso fresco de Burgos» con «Ingredientes: leche pasteurizada de vaca, sal, cuajo y cloruro cálcico.»
- `ilegible.jpg`: superficie lisa con grano, sin texto.

## Límites conocidos

- El OCR local (tesseract por CDN) es lento y su resultado varía; por eso el escenario 5 acepta filas o el
  mensaje honesto, y solo marca FALLO cuando un plato sale con un nivel incompatible con la guía.
- La cámara falsa de Chromium da un patrón animado: lo normal es el mensaje honesto.
- Open Food Facts es un servicio externo: si cae, el escenario 7 fallará por red (se ve en la consola).
