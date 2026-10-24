# Pruebas de aceptación e2e — «¿Puedo comerlo?»

Batería de extremo a extremo que recorre la app como lo haría la usuaria, en un Chromium móvil
(390×844, `isMobile`, `hasTouch`, `es-ES`), y comprueba el «Criterio de hecho» de `docs/especificacion.md`
y las rutas, atajos y almacenamiento de `docs/CONTRATO.md`.

## Ejecutar

```sh
cd puedo-comerlo
node tests/e2e/fixtures/make-fixtures.cjs   # solo si faltan las imágenes (ya están en el repo)
node tests/e2e/run.cjs                      # todos los escenarios (5–10 min; el OCR local es lo lento)
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
| 1 | Arranque | Textos literales de la portada; el paso 2 explica (AESAN, toxoplasmosis, listeria, fiambre, alternativas) y «Seguir» no avanza sin elegir; «Solo si van cocinados»; marca embutidos y «Leche»; «Empezar» → «¿Qué vas a comer?»; perfil en `pc.v1.profile`. Recoge todos los labels, placeholders, legends y preguntas (arranque + Ajustes) y falla si alguno pide semana, parto, toxoplasmosis, diabetes, analítica, glucosa, peso o edad, o si hay inputs de fecha/número. |
| 2 | Pie y navegación | En Inicio, Fuera, Súper, Lista, Ajustes, Buscar, una ficha e Historial: el pie literal dentro del viewport y no tapado (arriba y tras hacer scroll); navegación inferior con exactamente Inicio, Fuera, Súper, Lista; sin hamburguesa; nombre y acceso a Ajustes arriba. |
| 3 | Búsqueda | «sushi» → «Mejor no»; «tortilla» → «Con cuidado» como respuesta principal; queda en el historial; filtros de Buscar; búsqueda sin tildes («cesar», «jamon»); «En la guía». |
| 4 | Ficha y lista | Atajos de Fuera; atajo «tortilla» → `#/ficha/tortilla-patata`; ficha mínima y «Ver más» con detalle, pregunta y fuente; «Añadir a la lista» → Lista; sigue tras recargar; «Quitar»; texto literal de lista vacía. |
| 5 | Foto de carta | `carta.jpg` por «Elegir una foto»: acepta fichas con «La carta» o el mensaje honesto, y registra cuál y los niveles de Sushi, Tortilla, Tiramisú, Tinto de verano y Cerveza 0,0 (y el resto). Con OCR (lectura incierta) ningún plato puede quedar en «Sí». Privacidad del POST a `/api/leer` (solo `image`, `mediaType`, `mode`; JPEG ≤ 1280 px). `ilegible.jpg` → mensaje honesto literal y ninguna ficha. |
| 6 | Cámara | Chromium con cámara falsa: «Hacer una foto» → vídeo en reproducción con `facingMode: environment`, botón de disparo, «Usar esta foto», lectura. Sin cámara (`getUserMedia` rechaza con `NotFoundError`): lo dice y ofrece la galería. |
| 7 | Súper por código | Alergias leche + frutos secos. 3017620422003 → «Nutella», «Mejor no», «Has marcado…»; petición a `world.openfoodfacts.org/api/v2/product/…` sin datos del perfil. 8410014312203 → no está y ofrece fotografiar la etiqueta (opcional: sube `etiqueta.jpg`). 12345 → validación sin petición. |
| 8 | Persistencia y borrado | Lista, favoritos e historial tras recargar («Lo último», Historial). Ajustes muestra todo el perfil; marcar «Huevo» cambia la ficha de tortilla a «Mejor no» con «Has marcado huevo.». «Borrar los datos de este móvil» (con `confirm()` o confirmación propia) → `#/arranque/1` y ninguna clave `pc.*`. |
| 9 | Diseño | body 18 px y Source Sans 3; h1 Fraunces; fondo #f3eee6 y tinta #241f1a; botón principal salvia; botones y enlaces-botón ≥ 48 px en todas las pantallas (también el arranque); sin scroll horizontal; colores de las pastillas «Sí» #245443, «Con cuidado» #8d4324, «Mejor no» #7a332c; a 1280 px la columna ≤ 32rem y centrada. |
| 10 | Lenguaje y guía | Abre todas las fichas de `src/engine/foods.js`: una pastilla, su nivel base con perfil neutro, su nombre, y fuente AESAN / Ministerio de Sanidad tras «Ver más». Plato desconocido → «No estoy segura». En todo lo recorrido por la batería, ninguna pastilla dice «evitar», «seguro» o «segura» a secas (avisa de títulos con esas palabras). |
| 11 | Consola | `pageerror`, `console.error`, peticiones fallidas y respuestas ≥ 400 del propio origen en todos los escenarios. Se separan los esperados (503 de `/api/leer` sin clave, 404 de OFF para el código inexistente) y la red de terceros. |

Cada escenario usa un contexto nuevo (localStorage vacío). Salvo el 1 y el 9, que hacen el arranque por la
interfaz, el resto siembra el perfil en `pc.v1.profile` + `pc.v1.onboarded` (formato de `src/store.js`) y,
si la app no lo respeta, lo avisa y hace el arranque por la interfaz.

Leyenda del informe: **FALLO** incumple la especificación o el contrato; *Aviso* es algo que conviene
mirar pero no rompe el criterio de hecho; `·` es información (qué se vio, tiempos, rutas).

## Fixtures

`fixtures/make-fixtures.cjs` las regenera de forma reproducible (HTML fijo + captura con Playwright, fuentes
del sistema, PRNG con semilla):

- `carta.jpg` (1000 px de ancho): carta con Entrantes, Principales, Postres y Bebidas, con precios.
- `etiqueta.jpg`: «Queso fresco de Burgos» con «Ingredientes: leche pasteurizada de vaca, sal, cuajo y cloruro cálcico.»
- `ilegible.jpg`: superficie lisa con grano, sin texto.

## Límites conocidos

- El OCR local (tesseract por CDN) es lento y su resultado varía; por eso el escenario 5 acepta fichas o el
  mensaje honesto, y solo marca FALLO cuando un plato sale con un nivel incompatible con la guía.
- La cámara falsa de Chromium da un patrón animado: lo normal es el mensaje honesto.
- Open Food Facts es un servicio externo: si cae, el escenario 7 fallará por red (se ve en la consola).
