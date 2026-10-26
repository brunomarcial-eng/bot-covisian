# Decisiones

Cada agente anota aquí, en su sección, lo que decidió sin preguntar.

## Interfaz

### N4 · Instalar en la pantalla de inicio (Michi, UX/UI)

- **Sin modo sin conexión ni service worker**, como pidió la clienta. Chrome Android ya no exige service worker para instalar: basta el manifest con nombre, iconos 192 y 512, `start_url`, `display: standalone` y HTTPS. En la pantalla Instalar se dice con honestidad: «Necesita internet para abrirse, igual que en el navegador.»
- **`theme_color` crema `#f3eee6`, no salvia.** Es el que ya usaban la app y la meta `theme-color`; la barra superior es crema, así que la barra de estado de Android se funde con ella. Con salvia quedaría una franja verde encima de una cabecera crema. En iOS, `apple-mobile-web-app-status-bar-style: default` (texto oscuro sobre claro), coherente con lo mismo.
- **`id` y `start_url` `./`** (antes `./#/`): el router ya lleva a `#/` o al arranque.
- **Quitado `orientation: portrait`** del manifest: bloquear la orientación va contra WCAG 1.3.4 y no aporta nada (la app es de una columna).
- **Iconos** generados con `scripts/make-icons.cjs` desde `icon.svg` (Chromium de Playwright + codificador PNG propio con zlib, para garantizar PNG RGB sin canal alfa y tamaño exacto): `icon-192.png`, `icon-512.png` («any», el SVG tal cual), `icon-maskable-512.png` (fondo salvia a sangre y el semáforo reducido al 80 %: su punto más lejano queda a un 25 % del centro, dentro de la zona segura del 40 % y también de la máscara más pequeña de Android, ~33 %) y `apple-touch-icon.png` 180×180 opaco. El SVG sigue en el manifest como «any».
- **Nombre corto «Puedo comerlo»** (sin signos) para la pantalla de inicio en iOS y Android: los «¿?» comen espacio y se cortan bajo el icono. El nombre completo sigue siendo «¿Puedo comerlo?».
- **Pantalla `#/instalar`**: pasos escritos con dibujos de línea genéricos (compartir, añadir, tres puntos, confirmar), sin capturas ni logos. Se ordena por sistema detectado por userAgent (iPadOS que se presenta como Mac cuenta como iOS) y se marca «Tu móvil». En ordenador, primero Android (es la mayoría en España) y una línea: «Abre esta misma dirección en el móvil». En iPhone con otro navegador (Chrome, Firefox, Instagram…) aparece un aviso para abrirla en Safari.
- **Safari en iOS 26** esconde Compartir tras los tres puntos y ofrece «Abrir como app web»: los detalles de cada paso lo cubren sin cambiar los tres pasos pedidos (Compartir → «Añadir a pantalla de inicio» → «Añadir»).
- **`beforeinstallprompt`** se escucha desde el arranque (`listenForInstall()` en `src/app.js`), porque llega antes de abrir la pantalla. Se hace `preventDefault()` para que Chrome no saque su barrita en mitad del arranque; la instalación se ofrece con el botón principal «Instalar» de la pantalla. Ese evento solo se puede usar una vez: después del toque se descarta. Si se acepta (o llega `appinstalled`), deja de verse el aviso en Inicio.
- **Aviso en Inicio**: una línea al final («Tenla a mano: ponla en la pantalla de inicio.») con cierre ×. No sale si ya está instalada (`display-mode: standalone`/`fullscreen` o `navigator.standalone`) ni durante el arranque. El cierre se guarda en `pc.v1.installHint`; al cerrar, el foco va al h1 y se anuncia que sigue en Ajustes. «Borrar los datos de este móvil» borra también esa clave (prefijo `pc.v1.`), así que el aviso vuelve: es coherente con «borrar todo».
- **Ajustes**: sección «En la pantalla de inicio» con el botón «Instalar en el móvil»; si ya está instalada, solo «Ya la tienes instalada en este móvil.»
- **Safe areas**: barra superior (arriba) y barra inferior/pie (abajo) ya usaban `env(safe-area-inset-*)`. Añadido el relleno lateral de `.wrap` con `max(gutter, safe-area-inset-left/right)` para que en horizontal, a pantalla completa, nada quede bajo la muesca.
- **Embutido «Solo si van cocinados»** (por el cambio del motor): la descripción pasa a «En crudo, mejor no. Cocinados dentro del plato (croqueta, guiso, pizza al horno), sí.» Afecta al paso 2 y a Ajustes (comparten `profile-fields.js`). La alternativa «El mismo embutido bien cocinado dentro del plato…» no contradice la regla nueva y se queda igual; «No quiero comer embutidos» también.
- `server.js` no se ha tocado: su patrón `ROOT_ICON` ya sirve `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` y `manifest.webmanifest` está en `ROOT_FILES`.

### N5 · Arranque de 4 pasos, Buscar sin «En la guía» y rediseño (Michi, UX/UI)

**Quitar «En la guía» de Buscar.** Lo que sabe el motor no es asunto de la usuaria: Buscar es el campo y la respuesta. Se eliminan la lista de fichas, el contador, el aviso «no aparece…», los chips de grupo y el parámetro `g` (la URL queda `#/buscar?q=…`). Con el campo vacío, una línea de ayuda («Escribe un plato, un alimento o una bebida.») y los atajos. «Ver la ficha» aparece solo si la respuesta sale de un único alimento (`foodIds.length === 1`); «sushi flameado» suma dos y no la enseña. «Añadir a la lista» queda a la vista en la respuesta (antes estaba dentro de «Ver más»). El apuntado en el historial al enviar no cambia.

**Arranque de 4 pasos.** Portada, «Alergias e intolerancias» (con «Otra cosa que no quieras comer»), «Dietas y restricciones» y «Tu privacidad». Se retira todo lo de embutidos de arranque, Ajustes y `profile-fields.js` (opciones, alternativas, lista de cuáles). Se quita también la leyenda de las cuatro pastillas de la portada: la portada es título, texto, aviso y «Seguir», y la persona ve las cuatro palabras en cuanto consulta algo. `sin_lactosa` se rotula «Sin lactosa (intolerancia)» solo en pantalla (el id y `DIETAS` de `store.js` no cambian). Ajustes: alergias, otra cosa, dietas, historial, instalar y borrar datos.

**Diagnóstico del «AI slop» y qué se hizo.** Todas las pantallas eran la misma tarjeta blanca (pastilla + título + frase + «Ver más»), la frase repetía la palabra de la pastilla, había iconos en círculo, chevrones y nubes de chips, y el veredicto, lo único que importa, era una pastillita.
- **La palabra manda.** En una respuesta única (Buscar, ficha, producto) el nivel es la palabra en Fraunces a ~3,5 rem y en su color; el nombre va debajo como contexto y la frase en 1,25 rem. «No estoy segura» baja de tamaño para caber en una línea. Solo Buscar lleva hoja (separa el campo de la respuesta); ficha y producto van directamente sobre el crema.
- **Listas sin cajas.** Carta, lista, historial, «Lo último» y favoritos son filas con filete fino, marca lateral de 3 px del color del nivel, la palabra en versalitas (CSS `font-variant-caps`, el texto sigue siendo «Mejor no»), nombre en Fraunces y la frase en secundario. La marca lateral de «No estoy segura» usa un arena más oscuro (`#a8894a`, ≥ 3:1) que el de la pastilla. La pastilla rellena solo queda en el resumen de la carta («7 mejor no · 1 con cuidado…»).
- **Helper de frase** (`src/ui/phrase.js`, no toca el motor): quita «Sí:», «Sí,», «Con cuidado:», «Mejor no:», «Mejor no,», «No estoy segura:» cuando coincide con la palabra mostrada y pone mayúscula. Añadido por decisión mía «Mejor no por…» → «Por…» (la frase del mercurio). Se respetan «Has marcado leche.» y «No estoy segura de la lectura.».
- **Inicio.** Dos bloques de tipografía grande (Comer fuera, relleno salvia; En el súper, contorno salvia), sin icono ni círculo, con kicker y flecha fina; buscador con la lupa dentro del campo; «Lo último» en filas. El aviso de instalar pasa a una línea con filete.
- **Atajos** en lista tipográfica de dos columnas (texto + flecha fina, ≥ 48 px), no chips. Las casillas de Ajustes/arranque son filas con filete y casilla propia, no cajas.
- **Oficio.** Escala de espaciado de 4/8 px en variables; h1 de 2,25 a 3 rem; foco de 2 px con separación; transiciones de 120–220 ms y entrada de pantalla de 220 ms (anulada con `prefers-reduced-motion`). Barra superior de 52 px; navegación inferior sin cápsula (marca fina de 2 px sobre la pestaña activa), sin desenfoque de cristal, sin sombras; el pie sigue literal, a 12 px. Se quitan los iconos de los botones salvo la casilla «En la lista» y la flecha de «Atrás». Los nombres escritos por la usuaria («sushi») se muestran con inicial mayúscula; lo guardado no cambia.
- **Microcopy.** Fuera del texto de la usuaria: «guía» como palabra interna (historial vacío, ficha no encontrada, etiqueta «Ficha» en vez de «Guía» en el historial), «fichas» → «respuestas» en Ajustes, y las notas pasan de caja con icono a una línea con filete lateral.
- **Se mantienen** paleta, tipografías, 18 px de cuerpo, controles ≥ 48 px, columna de ~32 rem, cuatro destinos, Ajustes arriba, palabras del semáforo, pie literal y una acción principal por pantalla.
- **Pendiente conocido:** el enlace en línea de «Tenla a mano: ponla en la pantalla de inicio» mide 44 px de alto (es parte de una frase; el botón de cerrar sí mide 48).

### N6 · Pantalla entera del color del veredicto (Michi, UX/UI)

Petición de la clienta: que al llegar la respuesta se «ilumine» toda la pantalla (verde, rojo, anaranjado) y luego se escriba la palabra; para lo dudoso, signos de interrogación.

**Qué es una «pantalla de respuesta»** (se colorea entera): Buscar con respuesta, Ficha, Producto escaneado y Etiqueta fotografiada de un solo plato. La carta (varias respuestas), Lista, Historial y «Lo último» se quedan en crema y llevan el color en cada fila.

**Colores finales.** Sí `#245443` (salvia, sin cambio) · Mejor no `#7a332c` (vino, sin cambio) · **Con cuidado `#b04f10`** (terracota anaranjado; la arcilla `#8d4324` era marrón. Es el naranja más vivo que aguanta texto crema a 5,2:1; más claro ya no llega a 4,5:1) · **No estoy segura `#86672a`** (ocre apagado; sustituye a la arena, que era demasiado clara para fondo de pantalla). La arcilla `#8d4324` se queda solo como color de *texto* de «Con cuidado» sobre las bandas claras de las listas (7:1). Texto principal crema `#fffdf8`, secundario `#f6f1e9`; no uso tinta sobre naranja (más vivo, pero rompe la coherencia: crema en las cuatro).

**Cómo se distingue «Con cuidado» de «No estoy segura»** (de un vistazo y sin depender del color): el naranja es rojizo y saturado (matiz 24°, 83 %), el ocre es amarillento y apagado (40°, 52 %); la segunda lleva cinco «?» grandes (hasta 21 rem) y la primera solo dos, más pequeños y a menos opacidad (13 % y 10 %, porque suele haber una pregunta para el camarero). «Sí» y «Mejor no» no llevan adornos.

**Cómo está hecho.** `src/ui/tone.js` (nuevo) pone `document.body.dataset.verdict` = `si|cuidado|no|duda`, actualiza `<meta name="theme-color">` y orquesta la animación; el router llama a `beginNavigation()`/`endNavigation()`: si ninguna pantalla pidió color, todo vuelve a crema al instante (sin fundido, sin destellos; también con atrás/adelante). Los estilos viven en `styles.css` (sección «Pantalla entera…»): `body[data-verdict]` redefine los tokens (tinta, secundario, filetes, acento, foco) para que todo el contenido se lea sobre el color; el fondo del body se propaga al lienzo, así que el color llega también a la zona de rebote del scroll. `index.html` lleva una capa fija `#tone` (iluminación + «?») bajo el contenido; la barra inferior (pie + navegación) toma el mismo color.
- **Iluminación** (de crema a color): un círculo del color nace en la palabra y se expande en 420 ms (Web Animations, `clip-path`); el fondo real de la página toma el color justo al acabar (transición de 0 s con retraso de 0,42 s) y la capa se retira después. El texto aparece escalonado a partir de 300 ms (palabra, nombre, frase, acciones, «Ver más») y los «?» surgen a los 340 ms (fundido + desplazamiento de 1,75 rem, escalonados 130 ms).
- **De un color a otro** (Buscar mientras se escribe; el debounce es el de antes, 180 ms): fundido de 300 ms del fondo y de las barras, sin repetir la animación del texto ni de los «?» si el nivel no cambia. **Sin respuesta** (campo vacío): vuelve a crema con otro fundido de 300 ms.
- **`prefers-reduced-motion`**: cambio instantáneo, sin círculo, sin fundidos y «?» quietos.
- **Los «?»** son `span.tm[aria-hidden]` dentro de `#tone` (no en el artículo, para que no se repitan al reescribir la respuesta), en Fraunces 600, **oscuros** (`#1b1612`) con 10–20 % de opacidad, no crema: un «?» claro bajo el texto le quitaba contraste (3,6:1 en el naranja) y uno oscuro solo se lo da. Quedan asimétricos, con giros de ±6–14°, recortados por los bordes y a escalas de 4 a 21 rem.
- **Botones sobre el color**: principal = relleno crema con texto del color del fondo («Añadir a la lista» en Ficha, «Escanear otro código», «Hacer otra foto»…); secundarios = contorno crema; «Añadir a la lista» en Buscar y Producto sigue siendo secundario (la principal es la de abajo). `:hover` solo en dispositivos con ratón (en el móvil se quedaba pegado tras tocar).
- **«Ver más»**: hoja crema (`--surface`) con texto tinta dentro de la pantalla de color; se prefiere a «mismo fondo con filete» porque el detalle puede ser largo (≥ 12:1) y porque el color del fondo queda como marco. El resto de «Ver más» (filas de listas) no cambia.
- **Buscar con respuesta**: se quita la hoja blanca (ya no hace falta, el color separa el campo de la respuesta). El campo es una hoja crema con tinta; su foco es un anillo crema de 3 px por fuera. Ficha y Producto bajan la respuesta un 5 % de la altura de la pantalla para que la palabra quede sola.
- **Palabra del veredicto**: Fraunces 580, de 3,75 a 5 rem («Sí», «Mejor no»); «Con cuidado» y «No estoy segura» a 3,25–4,5 rem (en 360 px «Con cuidado» cabe en una línea; «No estoy segura» baja a dos).
- **Listas**: cada fila tiene una banda de fondo suave del nivel, a sangre dentro de la columna (compensa el margen lateral de 16 px), con texto tinta, marca lateral de 4 px pegada al borde y, en «No estoy segura» y «Con cuidado», un «?» pequeño decorativo (pseudoelemento con contenido alternativo vacío, no entra en el texto). Tintes: `#e0eae3` sí, `#f8e2d0` con cuidado, `#f2dfdb` mejor no, `#efe6c8` no estoy segura. Se separan con un filete de tinta al 12 %. Texto del nivel sobre la banda: salvia, arcilla, vino y arena oscura (≥ 4,5:1, verificado). Los contadores del resumen de la carta se conservan; sus pastillas usan los nuevos naranja y ocre con texto crema.
- **Se mantiene** todo lo demás: tipografías, 18 px, controles ≥ 48 px (comprobado en 390 y 360), columna de 32 rem, cuatro destinos, Ajustes arriba, palabras, pie literal (12 px, `#f6f1e9` sobre cada color ≥ 4,5:1), sin datos clínicos.

**Para las pruebas (Alfred).** El color ya no está en `.answer-word` (ahora es crema `rgb(255,253,248)` en las cuatro): se comprueba `document.body.dataset.verdict` (`si|cuidado|no|duda`, ausente fuera de las pantallas de respuesta) y, si hace falta el color, `getComputedStyle(document.body).backgroundColor` **esperando ≥ 0,5 s** tras llegar de una pantalla crema (el fondo toma el color al acabar la iluminación; el atributo y la meta `theme-color` cambian al instante). Colores: sí `rgb(36,84,67)`, cuidado `rgb(176,79,16)`, no `rgb(122,51,44)`, duda `rgb(134,103,42)`. `article.answer.lv-*[data-level]`, `.answer-word` (texto exacto), los textos de botones y `ul.entries > li.entry.lv-*[data-level] .lvl` no cambian; se quitan la clase `answer--sheet` (ya no se usa) y el fondo blanco de Buscar. `.entries` ahora tiene margen lateral negativo (bandas a sangre) y `.entry` tiene fondo: cualquier prueba que mida el ancho de las filas verá 32 rem de columna más 2 × gutter.

**Contraste (razón WCAG calculada con script).** Todos los pares ≥ 4,5:1 en texto y ≥ 3:1 en componentes; ninguno falla. Resumen (66 pares comprobados con un script; la tabla completa se entregó en el informe de Michi):

| Par | Sí | Con cuidado | Mejor no | No estoy segura |
|---|---|---|---|---|
| Crema `#fffdf8` sobre el color | 8,5 | 5,2 | 8,8 | 5,2 |
| Secundario `#f6f1e9` sobre el color | 7,7 | 4,7 | 8,0 | 4,7 |
| Botón principal (texto del color sobre crema) | 8,5 | 5,2 | 8,8 | 5,2 |
| Texto crema sobre un «?» oscuro (peor caso) | — | 6,1 | — | 6,7 |
| Palabra del nivel sobre su banda (listas) | 7,0 | 5,7 | 7,0 | 7,3 |
| Marca lateral sobre la banda (componente) | 7,0 | 4,2 | 7,0 | 4,2 |

**No verificado:** sin dispositivo real (solo Chromium emulando 390×844 y 360×740); la meta `theme-color` se comprueba por su valor, no en la barra de estado de un móvil; no he probado Safari ni Firefox (`clip-path` animado y `@media (hover: hover)` son estándar, pero no consta). La lectura de la carta con foto en este entorno usa OCR local (sin clave de visión: `/api/leer` responde 503, esperado).

### N7 · Ilustración: la mesa de la portada y los platos sueltos (ilustradora, SVG a mano)

Petición de la clienta: que la app tenga algo de imagen relacionada con la comida, empezando por la portada («una mesa con 12 platos en vista cenital»), y un detalle discreto de embarazo. Todo el arte vive en `src/ui/art/` (archivos nuevos; no toca CSS ni pantallas) y es SVG inline escrito a mano en JS, sin imágenes, sin fuentes y sin librerías. El azar usa semilla fija: el dibujo sale idéntico siempre.

**Archivos y exports.**
- `src/ui/art/mesa.js`: `mesaSvg({ animada = true, decorativa = false, embarazo = true, encuadre = 'xMidYMid' })`, viewBox 390×520, `preserveAspectRatio="<encuadre> slice"` (se recorta por los bordes; para portada se recomienda `xMidYMax`). Constantes `MESA_W`, `MESA_H`.
- `src/ui/art/platos.js`: `platoSvg(tipo, { decorativa })` con `'tortilla' | 'ensalada' | 'fruta' | 'cuenco'` (160×160; un tipo desconocido da el cuenco) y `cargandoSvg({ decorativa, animada })` (plato con tortilla y tenedor y cuchillo que orbitan una vuelta cada 2,4 s).
- Apoyos internos: `base.js` (paleta, azar con semilla, puntos/hebras, loza), `piezas.js` (los doce platos, uno por función) y `extras.js` (cubiertos, servilleta, jarra, vaso, cesta de pan, mantel, servilleta bordada).

**Los doce platos** (cada uno en `<g class="art-plato" data-plato="…">`): paella, tortilla de patatas con una cuña cortada y apartada, ensalada mixta, gazpacho con hilo de aceite, lentejas en cazuela, pan con tomate en tabla, pescado a la plancha con limón, croquetas (una abierta), verduras a la plancha, fruta (naranjas, peras, fresas), yogur con frutos rojos y aceitunas con tacos de queso curado. Todos llevan comida, ninguno está vacío. Se evitó cualquier plato que la app marca «Mejor no» (nada de embutido crudo, pescado crudo, carne poco hecha, mayonesa o alcohol; el queso es curado, la bebida es agua con limón). Alrededor: jarra y vaso de agua, servilleta de lino, cesta con barra y rebanadas, cuchara, tenedores y cuchillo.

**Estilo.** Plano editorial con sombras duras desplazadas (3,4 px a la derecha, 5 px abajo, tinta al 13 %), sin degradados ni difuminados; únicos detalles de textura: el tejido del lino (patrón de 3 px al 10 %), hilos gruesos sueltos, migas, el mimbre de la cesta y los granos de arroz y las lentejas, hechos con trazos de longitud cero. Paleta de la app (crema `#f3eee6`/`#fffdf8`, tinta `#241f1a`, salvia `#245443`, arcilla `#8d4324`, vino `#7a332c`) más acentos de comida contenidos (azafrán, tomate, limón, naranja, verde hoja, dorado de fritura). Mantel de lino `#ebe0cb`: un tono más oscuro que el crema de la app para que la escena se lea como mesa y los platos blancos destaquen; tinta sobre él da ≥ 12:1. Platos con lozas distintas (blanca con banda salvia, arcilla o vino; salvia esmaltada; barro; gres) y rotaciones y escalas variadas; cuatro cortan el borde izquierdo o derecho a propósito.

**Detalle de embarazo: tres candidatas, elegida la C.** Se renderizaron las tres a 390×520 y a 2×.
- A, persona sentada vista desde arriba (vientre de lino salvia y dos manos de línea): descartada. Con manos de ~40 px el contorno parecía guantes blancos, y con piel rellena la zona se leía como persona, pero las mangas anchas parecían una capa y la cúpula del vientre, un sombrero verde; ocupaba 200×80 px del borde inferior (nada discreto) y a primera vista no decía «embarazo» sin pensarlo.
- B, perfil de línea en tinta como marca de agua sobre el mantel (primero dentro de un círculo): descartada. El círculo parecía un decimotercer plato y, sin círculo, la silueta se perdía entre platos y no tenía dónde apoyarse.
- **C, servilleta de lino con el perfil de una mujer embarazada bordado en hilo de salvia, con un borde de puntadas: elegida.** El perfil (cabeza con moño, espalda con curva lumbar, vientre redondo, mano apoyada) es la lectura más rápida de «embarazo» y en un solo trazo, adulta y sin adornos; sobre una servilleta es un objeto natural de la mesa y no una escena. A 390 px la figura mide ~70 px de alto y se lee en 1–2 s. Sin caras de bebé, chupetes, corazones, estrellas, rosa/azul ni estética infantil. `embarazo: false` la quita si la clienta prefiere no tenerla. Servilleta y figura: `servilletaBordada()` en `extras.js`.

**Animación de entrada** (CSS dentro del propio SVG, prefijo `art-`; `animada: false` no lo incluye). Cada `.art-plato` usa `--i` (0–11) y entra con `scale(.88→1)` + fundido + 12 px de desplazamiento hacia su sitio (`--dx/--dy`, desde el lado opuesto al centro), 560 ms, `cubic-bezier(.22,.7,.2,1)`, 70 ms entre platos; el último acaba a 1,37 s. El orden es de arriba a abajo (paella, tortilla… yogur). Jarra, vaso, servilleta, cesta y cubiertos aparecen solo con fundido, y la servilleta bordada es lo último. Después, vahos muy sutiles sobre la paella y las lentejas (opacidad 0,18→0,5, ciclo de 5,2 s, desfasados). Con `prefers-reduced-motion: reduce` todo se ve quieto desde el primer fotograma (comprobado: opacidad 1 en los 12 platos y 0 animaciones activas). `cargandoSvg` gira `.art-gira` 360° cada 2,4 s en lineal; también se anula con `prefers-reduced-motion`.

**Accesibilidad.** Por defecto `role="img"` y `aria-label` en español («Mesa vista desde arriba con doce platos de comida casera», «Plato con tortilla de patatas», «Plato con ensalada», «Plato con fruta», «Cuenco de gazpacho», «Plato con tenedor y cuchillo que giran»). Con `{ decorativa: true }`, `aria-hidden="true" focusable="false"` y sin `role`. Ningún SVG lleva `<text>`, `<image>`, `<use>` ni `<foreignObject>`.

**Pesos.** `mesaSvg()` 66,8 KB (sin embarazo 65,2; decorativa y sin CSS 65,8); `platoSvg`: tortilla 2,4 KB, ensalada 6,2 KB, fruta 5,2 KB, cuenco 1,7 KB; `cargandoSvg()` 4,0 KB. Módulos: 45 KB de JS en total.

**Comprobado.** Los tres módulos importan en Chromium sin errores ni avisos de consola; los 11 SVG generados son XML válido con `DOMParser('image/svg+xml')` y `xmllint`; capturas de la animación a 300 ms, 700 ms, 1,4 s y 3 s; `prefers-reduced-motion` emulado; recortes de 390×330 con `xMidYMax` y `xMidYMid` y con máscara de fundido arriba; una portada de prueba sobre el `styles.css` actual (texto arriba, mesa debajo con el borde superior fundido) a 390×844. **No verificado:** Safari/Firefox (se usan `transform-box: fill-box` y animaciones CSS sobre `<g>`, estándar pero sin probar), dispositivo real, y la lectura de la figura en pantallas de baja densidad (a 1× se lee, pero con poca nitidez).

**Para integrar.**
- Portada: texto arriba y la mesa debajo, a sangre (`margin-inline: calc(-1 * var(--gutter))`), `encuadre: 'xMidYMax'` y una máscara CSS que funda el borde superior con el crema (`mask-image: linear-gradient(to bottom, transparent, #000 18–24%)`); no escribir texto encima de la escena (los platos mandan). Con 310–330 px de alto se ven los platos del centro y la servilleta; con 520 px, los doce.
- El SVG no necesita clases externas: solo `display:block; width:100%; height:100%` en el contenedor. Las clases `art-*` y sus `@keyframes` van dentro del SVG; si más adelante se añade una `Content-Security-Policy`, `style-src` tendrá que permitir `'unsafe-inline'` (o mover el CSS de `mesa.js` y `platos.js` a `styles.css`).
- Platos sueltos: de 120 a 160 px de lado; `cargandoSvg` a 96–140 px con el texto de estado al lado.

### N7b · Integración de la ilustración en la interfaz (Michi, UX/UI)

La clienta pidió «algo relacionado con la alimentación, porque no hay nada más que texto», sobre todo en la portada, con un detalle de embarazo sin excederse. La ilustración (mesa, platos sueltos, plato que gira) es de la ilustradora (N7 · Ilustración, arriba). Esto es cómo se coloca. Se levanta la regla «nada de plato vacío» de la especificación solo para esto; seguimos sin estética infantil, sin corazones ni pasteles.

- **Código**: `src/ui/art-ui.js` (nuevo) con `coverArt()`, `emptyState(tipo, …texto)` y `loadingStatus(texto)`. Usa `mesaSvg({ animada: false, decorativa: true, encuadre: 'xMidYMax' })`, `platoSvg(tipo, { decorativa: true })` y `cargandoSvg({ decorativa: true, animada: false })`.
- **CSS del movimiento en `styles.css`, no dentro del SVG** (desvío de la sugerencia de la ilustradora): el `<style>` del SVG metía el CSS en el `textContent` de la pantalla y de la región viva «Leyendo…» (pruebas que lean texto verían `@keyframes…`). Se copian sus reglas tal cual en la sección «Ilustración» de `styles.css` (con su `prefers-reduced-motion`). **Si la ilustradora cambia el CSS de `mesa.js` o `platos.js`, hay que copiarlo también ahí.** Tampoco hay problema con una futura CSP.
- **Portada (paso 1)**: orden título → texto → mesa → «Seguir» → nota. La nota de «guía orientativa, no una app médica» pasa tras el botón (el pie literal sigue siempre visible). Antes iba entre el texto y «Seguir»; así «Seguir» queda a la vista en 360×740 (queda ≥ 16 px sobre el pie) y la mesa tiene sitio. La mesa va a sangre, alineada abajo (`xMidYMax`, para no perder la servilleta bordada), con el borde de arriba fundido con una máscara (`mask-image`), sin texto encima. Alto = `clamp(13rem, 100svh − 27rem, 30rem)`: 376 px en 390×844, 300 px en 360×740 (aquí se ven unos 9 platos y la servilleta; los doce, con más alto). Los platos entran escalonados (la animación es la de la ilustradora, ~1,1 s) y el texto sube en fundido con 0,05–0,7 s de retraso (con `prefers-reduced-motion`, todo a la vista al instante, comprobado). Se conserva «Paso 1 de 4» (`.steps-count`) y la barra de pasos.
- **Estados vacíos**: Lista (ensalada) e Historial (tortilla) con el plato suelto de 8,5 rem y la misma línea de antes, literal. **«Lo último» en Inicio**, que antes no salía sin historial, sale ahora con el rótulo, un plato de fruta de 5 rem a la izquierda y «Aquí irán tus últimas respuestas.». Está bajo el pliegue en móvil y no compite con las dos acciones.
- **Carga**: «Preparando la foto… / Leyendo la carta… / Leyendo la etiqueta… / Leyendo en el propio móvil…» (`photo.js`) y «Buscando en Open Food Facts…» (`super.js`) llevan el plato con cubiertos que giran (5,5 rem) en lugar del círculo giratorio. El texto sigue en la región viva (`.status[role=status]`); el dibujo es `aria-hidden`. Las clases `.status`, `.status-text` y los textos no cambian; ya no existe `.spinner` en estas dos pantallas (sigue en `statusBox()`, sin uso).
- **Inicio**: decidido **no** poner un recorte de la mesa. Subiría «Comer fuera» y «En el súper» unos 100 px y en 360×740 la segunda acción quedaría casi fuera de pantalla; las dos acciones son lo principal. Inicio solo gana el plato pequeño de «Lo último» vacío y una entrada escalonada de los dos accesos (0,4 s, la segunda 70 ms después).
- **Movimiento coherente**: la carta leída entra fila a fila (`ul.entries.entries--rise`, ≤ 0,5 s en total); Lista e Historial no, para que quitar una fila no repita la animación. Todo se anula con `prefers-reduced-motion`.
- **Para las pruebas**: el texto de los estados vacíos y de carga es el mismo. Nuevos: `.cover-art` (`aria-hidden`), `.empty.empty--art`, `.empty-art`, `.status--art`, `.status-art`, `.entries--rise`. En la portada, la nota (`.disclaimer-note`) está ahora **después** del botón «Seguir» (mismo texto). Inicio sin historial tiene ahora la sección «Lo último» con su línea.
- **Comprobado**: 390×844 y 360×740, dos rondas (portada con frames a 150/500/900/2200 ms; Inicio, Lista e Historial vacíos; carga de OFF con respuesta retrasada; lectura de la carta), cero errores de consola, sin desbordamiento horizontal, controles ≥ 48 px, `prefers-reduced-motion` en la portada, y regresión de N6 (colores, atrás/adelante) sin cambios.

### N8 · Escaneo guiado, claves y lista (Michi, UX/UI)

Petición de la clienta: que el código y la foto de los ingredientes se correspondan («el código me dice ñoquis, dudo si lleva huevo: hazle una foto a los ingredientes y comprueba esto»), ir educando sobre los temas que se repiten y una lista que sirva para algo. Textos: los de Laura («Claves del embarazo»). El semáforo y `checkLabel` los calcula siempre el motor.

**Escaneo guiado (Súper → Resultado → foto → Resultado)**
- `super.js` consulta con `lookupProduct` (`src/capture/producto.js`): plato animado + «Buscando en Open Food Facts…» / «Buscando en internet…» (región viva) + botón «Cancelar» (cancela con `signal` y vuelve al Súper). Sin red → el mensaje de siempre. El producto se guarda con `ingredientsSource` (`off`, `web` o ausente si no hay ingredientes utilizables) y `payload.web = { name, url }` si algo salió de internet: el motor rebaja a «No estoy segura» lo que no está confirmado.
- Resultado de producto, bajo la frase y antes de «Ver más», en un bloque `.guided`: (1) si vino de internet, «Datos encontrados en internet (Fuente ↗). Compruébalos con la etiqueta.» con enlace `target="_blank" rel="noopener noreferrer"`; (2) sin ingredientes: «Me faltan los ingredientes» + «Voy a mirar si lleva: …» + «Con la foto de la etiqueta te lo digo mejor.» + botón principal «Fotografiar los ingredientes» (enlace a `#/super?ingredientes=1`); con ingredientes de internet el título es «Compruébalo con la etiqueta» y se quita la frase «He encontrado el producto…» (la frase del motor ya dice lo mismo). El segundo botón, «Escanear otro código», pasa a secundario mientras haya que fotografiar. (3) No encontrado en ningún sitio: en el Súper, «No lo encuentro. Fotografía los ingredientes y lo miro por ti.» y el botón principal pasa a «Fotografiar los ingredientes».
- «Voy a mirar si lleva: …» usa las palabras de Laura (huevo, leche o queso sin pasteurizar, embutido curado o carne cruda, pescado con mercurio, pescado crudo o ahumado, alcohol, cafeína, hierbas o infusiones), no los títulos de `claveLabel` (que son nombres de tema: «Listeria»). Los títulos se usan en los chips.
- Tras la foto (`#/super?ingredientes=1`): `readImage(blob, 'etiqueta')` → se une al producto del código (nombre y marca del código; ingredientes de la foto con `ingredientsSource: 'etiqueta'`) → `classifyProduct` → nuevo resultado (el historial sustituye la entrada anterior del mismo producto). Si no hay producto, el nombre sale de la foto o es «Producto de la foto». Si no se leen ingredientes: «No he podido leer los ingredientes. Acércala, con buena luz.» y el mismo botón para repetir. Cancelar la cámara vuelve al resultado.
- «Lo que he mirado en la etiqueta» (`checkLabel`): una fila por tema, lo hallado primero (icono de aviso, negrita, enlace «Por qué importa» a la clave), luego lo tranquilizador (✓ «Aparece leche pasteurizada de vaca: bien.») y lo que no aparece («No aparece huevo.»). Temas: los que faltaban antes de la foto, más los del veredicto; si no hay ninguno, los cinco por defecto del motor. Con ingredientes que ya trajo Open Food Facts y un veredicto dudoso, el mismo bloque se titula «Lo que he mirado en los ingredientes». Matices: pasteurizado → «bien»; `duda` → «Con esto no lo puedo descartar.»; `poca` → «en poca cantidad.». Textos de los temas sin plantilla de Laura, escritos por mí: listeria «No aparecen lácteos sin pasteurizar, fiambres ni ahumados.», toxoplasmosis «No aparece embutido curado ni carne cruda.», mercurio «No aparece pescado con mercurio.».
- Sobre el color del veredicto todo va en crema (≥ 5,2:1), con filetes finos y sin color por fila: el aviso se distingue por el icono y la negrita, no por el color. La etiqueta suelta (sin código) también enseña las filas si el veredicto tiene temas.

**Claves**
- «Ver más» de cualquier respuesta con `topics`: título «Para saber más», chips neutros (superficie crema, filete, ≥ 48 px) con el título del tema y el enlace «Por qué importa» al primero (`#/claves/<id>`).
- Pantalla `#/claves` (crema): entradilla de Laura, ocho filas con el título en Fraunces y el resumen visible; al abrir (una sola a la vez) por qué importa, qué mirar en la etiqueta, qué preguntar en la carta, dónde suele aparecer, una alternativa y la fuente; cierre «Si tienes una duda sobre tu caso, pregúntasela a tu matrona.». `#/claves/<id>` la abre y baja a ella; un id inventado no abre nada. Al abrir o cerrar se actualiza la URL sin repintar. Sin ilustración (quería sobriedad; la lista de temas ya es lo bastante visual).
- Accesos: una línea con filete en Inicio («Las claves del embarazo: los 8 temas que más se repiten →», antes del aviso de instalar) y una sección en Ajustes con «Ver las claves». No es un quinto destino de la barra.

**Lista de la compra** (`store.js`: `done` por entrada, `setListDone(id, bool)`, `clearListDone()`; `getList()` normaliza los datos antiguos sin `done` como pendientes; `isInList` ignora lo ya comprado y volver a añadir lo devuelve a pendiente)
- Título «Lista de la compra» y entradilla que contesta a «¿para qué sirve?»: «Lo que vas a comprar. Márcalo cuando lo metas en el carro y compártela con quien vaya a la tienda.».
- «N pendiente(s)» + «Compartir la lista» (oculto si no hay nada pendiente; `navigator.share` y, si no, portapapeles → «Lista copiada.»; si falla, «No he podido compartir la lista.»). Se comparte solo lo pendiente: «Mi lista de la compra» y una línea «- Nombre» por producto; sin semáforo, sin frases y sin mención al embarazo. (La clienta lo escribió «Compartir lista» y Laura «Compartir la lista»: uso el de Laura.)
- «Pendiente»: ordenado Sí, Con cuidado, No estoy segura, Mejor no (a igualdad, el orden guardado), con la banda de color de siempre y una casilla de 48 px con «Comprado» debajo (toda la columna es zona de toque). «En el carro (n)»: plegable (botón con `aria-expanded`), tachado suave sobre fondo neutro, y «Vaciar lo comprado». «Quitar» y «Ver más» siguen en cada fila. Marcar o quitar anuncia en la región viva («X: en el carro.», «X: otra vez pendiente.», «X: quitado de la lista.») y lleva el foco a la fila que ocupa su sitio o al título.
- La nota discreta «Sale «Mejor no» con tus ajustes» solo sale en las filas «Mejor no» **sin tema** detrás (motivo personal: una alergia, una dieta o lo que la persona no quiere comer). Si hay tema (p. ej. sushi → pescado crudo) la frase de la propia respuesta ya lo explica y repetirlo con «tus ajustes» sería falso.
- Estado vacío con plato y la línea literal de antes. La lista se recalcula con el perfil actual, como antes.

**Para las pruebas.** Rutas nuevas `#/claves`, `#/claves/<id>`, `#/super?ingredientes=1`. Selectores: `.guided`, `.web-notice`, `a.ext-link`, `section.need-label` (h2 «Me faltan los ingredientes» o «Compruébalo con la etiqueta»), `section.label-check` con `li.check-row.check-row--found|doubt|ok|absent[data-topic][data-status]`, `.check-link`, `ul.chips a.chip`, `.claves-link`, `li.clave[data-clave] .clave-head[aria-expanded]`, `.shop-bar`, `.shop-count`, `button[data-action=compartir]`, `.shop-list--pend`, `.shop-list--carro`, `li.entry--shop[data-done]`, `input.buy-box[data-action=comprado]`, `button[data-action=vaciar-comprado]`, `.carro-toggle`, `.share-msg`. Cambios de texto: h1 «Lista de la compra»; «Buscando en internet…»; botón «Cancelar» durante la búsqueda; «No lo encuentro. Fotografía los ingredientes y lo miro por ti.» (sustituye a «No está en Open Food Facts…»); «Fotografiar los ingredientes» (junto a «Fotografiar la etiqueta», que se mantiene en el Súper normal).

### N7c · Ilustración de categorías y destellos del veredicto (ilustradora)

Petición de la clienta: «Dale más animación a la aplicación: un movimiento, un destello, un brillo, o una imagen de algo; que no sea solamente texto.» Se añaden tres módulos nuevos en `src/ui/art/`, sin tocar `styles.css`:
- `categorias.js`: `categoriaSvg(id, { decorativa = true, animada = true })` y `CATEGORIAS` (18 ids: carne, ave, pescado, marisco, verdura, ensalada, fruta, queso, huevo, pan, pasta, arroz, cuenco, legumbres, postre, bebida, embutido, generico; un id desconocido da `generico`). 160×160, plato visto desde arriba con la comida de la categoría, mismo estilo y paleta que la mesa. Pesan entre 2,2 y 5,9 KB (arroz 5,9; fruta 5,7; ensalada 5,6; marisco 5,4). Ningún plato vacío; el «genérico» lleva tomate aliñado y los cubiertos a los lados. «Embutido» es la tabla de fiambres (chorizo, salchichón, jamón y pan) para los «mejor no».
- `destellos.js`: `destellosSvg(tipo, { decorativa = true, animada = true })` con `si` (cinco chispas de cuatro puntas, doradas y crema, de tamaños distintos), `cuidado` (puntos suspensivos que suben y dos «?» pequeños), `duda` (cuatro «?» de trazo fino flotando), `no` (cruz fina que se dibuja) y `si-check` (check que se dibuja y dos chispas). 0,5–1,5 KB cada uno, 160×160, crema `#fffdf8` y dorado `#f6dc8a`, `aria-hidden`.
- `art-css.js`: `ART_CSS`, una cadena de 2,9 KB con todas las reglas y `@keyframes` (prefijo `art-`) de los dos módulos y su versión `prefers-reduced-motion`, para pegarla en `styles.css`.

**Cómo funciona.** Los SVG no llevan `<style>`: las reglas viven en `ART_CSS` y solo se activan si el `<svg>` lleva la clase `art-anim` (`animada: true`; con `animada: false` queda una imagen quieta). Los detalles vivos van marcados con `data-anim`: `vapor` (dos hilos que suben), `brillo` (reflejo sobre aceite, salsa, caramelo o grasa), `gota` (aceite o caramelo que brilla y se apaga) y `destello` (chispa de cuatro puntas); en los destellos, `chispa`, `flota` y `traza` (trazo con `stroke-dasharray` y `pathLength="1"`). Entrada de la categoría: «pop» de 460 ms (escala 0,88 → 1,025 → 1, con fundido), medido en Chromium: opacidad 1 a los ~320 ms y asentada a ~460 ms. Bucles lentos de 3,4 a 4,6 s, desfasados con `--v`/`--d`; solo `transform`, `opacity` y `stroke-dashoffset`. Sin confeti ni estética infantil.

**Reducción de movimiento.** `@media (prefers-reduced-motion: reduce)` anula todas las animaciones y deja el estado final (comprobado: 0 animaciones activas; los trazos de `no` y `si-check` quedan dibujados enteros. Se detectó y corrigió un fallo de especificidad que los dejaba ocultos).

**Cambio compatible en `piezas.js`.** Se exportan `mej` y `gamba`, y `paella()` y `ensalada()` aceptan `{ ligera: true }` (menos grano y menos ingredientes) para caber en 6 KB. Sin argumentos devuelven lo mismo que antes: `mesaSvg()` pesa exactamente igual (66 777 bytes).

**Comprobado.** Hoja de 18 categorías a 240 px, tira a 80 px sobre crema y sobre `#245443`, `#7a332c`, `#b04f10` y `#86672a`, y destellos en los cuatro colores y en crema; los 23 SVG son XML válido (DOMParser y `xmllint`), ninguno lleva `<style>`, `<text>` ni `<image>`; los módulos importan sin errores ni avisos de consola. **No verificado:** Safari/Firefox ni dispositivo real. Los hilos de `vapor` son crema con un contorno de tinta muy tenue: sobre el plato blanco casi no se ven y se leen mejor donde asoman sobre el color.

**Uso recomendado.** Categoría: de 96 a 140 px (a 96 todavía se distingue qué es) y hasta 160 px en pantallas de respuesta; a un lado de la palabra o bajo el nombre, sin taparla. Funciona sobre crema y sobre los cuatro colores del veredicto (la sombra dura de tinta se pierde en el vino, pero el plato blanco o la tabla de madera dan el contraste). Destellos: capa decorativa de 160 a 240 px, `position:absolute` detrás o al lado de la palabra, nunca sobre el texto; `si-check` y `no` se pueden usar solos de 56 a 96 px. Los destellos son solo para fondos de color: sobre crema, el crema y el dorado no se ven.

## Publicación

### N3 · Publicar en Vercel y proteger /api/leer (Beto-infra)

- **No se ha podido publicar desde aquí.** La conexión de Vercel de esta sesión puede leer el equipo `brunomarcial-3195s-projects` (plan Hobby) pero responde **403 «You don't have permission to create a project»** tanto a `create_project` como a `create_deployment` (que crea el proyecto implícitamente) y a `create_git_project`. Además, Vercel no tiene ningún namespace de GitHub conectado (`git_namespaces` vacío), así que el Plan A (proyecto ligado a GitHub) tampoco era posible. No se ha reintentado ni se ha pedido ninguna clave. La creación del proyecto queda para la persona dueña de la cuenta, paso a paso en `docs/DESPLIEGUE.md` §2 (importar el repo desde el panel, raíz `puedo-comerlo`, «Other», sin build, salida `.`, rama de producción `ccr-011cf9ec-7sglha`). Con el proyecto creado, cualquier agente con permiso de despliegue puede hacer el Plan B (subida directa).
- **Lista blanca en `vercel.json` (`routes`).** Sin build y con salida = raíz, Vercel sirve como estático todo lo que se sube, y `package.json`/`package-lock.json` hay que subirlos para que instale `@anthropic-ai/sdk`. Por eso `vercel.json` pasa de `headers` a `routes` (no se pueden mezclar): primero las cabeceras (`nosniff`, `no-referrer`, `Permissions-Policy`, y se añade `X-Frame-Options: DENY`; `no-store` en `/api/*`), y después una ruta que responde **404 a todo lo que no sea** `/`, `index.html`, `styles.css`, `manifest.webmanifest`, iconos `icon*/apple-touch-icon*/favicon*` (.png/.svg/.ico), `src/**/*.js` (sin `..`) y `/api/leer`. Es la misma política que `server.js`. No se ha podido probar en Vercel real: hay que comprobarla con curl en el primer despliegue (`/package.json`, `/server.js`, `/docs/especificacion.md`, `/tests/e2e/run.cjs` → 404; `/`, `/src/app.js`, `/api/leer` → OK).
- **`.vercelignore`**: fuera `docs/`, `tests/`, `node_modules/`, `*.md`, `server.js` (solo es para desarrollo local), `scripts/`, `.gitignore`, `.vercel/`, `test-results/`. Se suben `package.json` y `package-lock.json`.
- **Node 22**: `engines.node` pasa de `>=20` a `22.x`. En Vercel `engines` manda sobre el ajuste del proyecto y `>=20` habría elegido la versión más nueva disponible.
- **Modelo por `VISION_MODEL`** (`claude-sonnet-5-5` por defecto, elegido por la clienta; `claude-opus-5-5`, `claude-haiku-5-5`; otro valor → por defecto). Se lee en cada petición. `fallbacks: 'default'` + beta `server-side-fallback-2026-07-01` solo con Opus 5.5 y Sonnet 5.5; con Haiku 5.5 no se envían (no tiene respaldo de servidor) y tampoco se hace el reintento «sin fallbacks». `max_tokens` 2048, esfuerzo `low`.
- **Límite de uso en memoria**: 20 fotos por IP en una ventana deslizante de 10 minutos y 300 al día (ventana fija de 24 h desde la primera foto) **por instancia**. En serverless cada instancia lleva sus contadores, así que es aproximado; el tope de gasto real es el límite mensual del workspace de Anthropic (recomendado en `DESPLIEGUE.md`). Se comprueba antes de leer el cuerpo (si ya se ha pasado, ni se lee la foto) y se descuenta solo tras validar la foto: las peticiones inválidas no gastan cupo. Al pasarse: 429 `{ error: 'limite' }` con `Retry-After` en segundos. Orden de errores: 405 → 403 → 415 → 503 `sin_vision` → 429 → 400/413.
- **IP**: primer valor de `x-forwarded-for` (en Vercel lo pone la plataforma) o `req.socket.remoteAddress`. Con `server.js` en local la cabecera la puede falsear quien llama; da igual, es solo desarrollo.
- **Cliente**: `src/capture/reader.js` ya trata cualquier respuesta no OK (`!res.ok`) como «pasa al OCR local», así que un 429 no rompe nada. No se ha tocado.
- **Firewall de Vercel**: no se ha podido crear (no hay proyecto). Cuando exista, si el plan lo permite, conviene una regla de WAF «Rate limit» para `path = /api/leer`, método POST, 20 peticiones / 600 s por IP, acción 429. Es un refuerzo; el límite en memoria ya está.

## Motor

### N2 · «Lo que se cocina de verdad ya se puede comer» (Beto, Lead Developer)

Decisión de la clienta (manda sobre la especificación original): lo que se cocina hasta estar bien caliente por dentro (horneado o cualquier cocinado; AESAN: bien caliente en el centro) ya no tiene el riesgo de listeria o toxoplasma. Cambios y lo que decidí sin preguntar:

- **Cuatro alimentos nuevos en la guía, solo para lo cocinado**: `fiambre-cocinado`, `queso-cocinado`, `ahumado-cocinado` y `germinados-cocinados`, todos «Sí». El motor convierte en ellos la coincidencia cruda cuando el plato va cocinado, igual que ya hacía con `embutido-cocinado`. Así el `foodId` del veredicto enlaza a una ficha que dice «Sí» y no a la de «Mejor no». No son platos nuevos de los «No estoy segura» (esos los decide la clienta en el cuestionario).
- **`embutido-cocinado` → «Sí»** («Sí: cocinado dentro del plato, el calor elimina el riesgo. Que llegue bien caliente.»). Con `cocinados` y `los_como` también «Sí». El perfil sigue mandando: `embutido: 'no'` → «Mejor no» y el tipo no marcado → «Mejor no». La frase del crudo con `cocinados` pasa a «En crudo, mejor no. Cocinado dentro del plato, sí.»
- **Embutido curado crudo aunque esté en un plato cocinado** si el texto dice «al final», «en crudo», «sin hornear», «después del horno/de hornear», «tras el horno», «al salir del horno», «al servir», «en frío», o el embutido va pegado a «crudo» («pizza de jamón crudo»). También si el plato es frío (ensalada, tabla, bocadillo, tosta, montadito, sándwich que no sea mixto ni caliente…): el gratinado del queso de una ensalada no cocina el jamón que va encima. Lo pegado al embutido («chorizo frito», «jamón a la plancha») cuenta siempre.
- **«Cocido» como plato**: solo «cocido» en singular y no detrás de jamón, pavo, paleta, fiambre, lacón, huevo, marisco… («jamón cocido», «huevo cocido con jamón» no cocinan el embutido).
- **Fiambre de bandeja cocinado** solo en platos concretos (pizza, calzone, croqueta, lasaña, canelones, quiche, empanada, hojaldre, revuelto, tortilla, gratinado, macarrones, sándwich mixto/caliente/a la plancha, bikini, croque monsieur, san jacobo, cachopo, flamenquín) o con el verbo pegado al fiambre («york a la plancha», «york fundido», «pavo caliente», frito, rebozado). **No** con «al horno», «asado» ni «braseado» a secas: «jamón cocido al horno», «pavo asado» o «pavo braseado» son fiambres que se venden en bandeja y se comen fríos. En un plato frío (bocadillo, ensalada) sigue «Mejor no». El perfil de embutido no le afecta.
- **Queso cocinado**: cuenta si el verbo va pegado al queso (al horno, gratinado, fundido, derretido, a la plancha/parrilla/brasa, frito, rebozado, empanado, en tempura, asado), con como mucho dos palabras en medio y ninguna de ellas «con», «y», «sobre»… («queso con tomate frito» no es queso frito), o «gratinado de queso»; o si el plato lo hornea o fríe dentro (pizza, calzone, croqueta, lasaña, canelones, quiche, empanada, sándwich mixto, bikini, san jacobo, cachopo, flamenquín, provoleta, fondue, raclette). Excepciones prudentes: **la burrata en la pizza no cuenta** como cocinada (se suele poner al final) salvo que se diga «burrata gratinada/al horno»; **las salsas no cuentan** («solomillo al roquefort» sigue «Mejor no»); la **tarta de queso** mantiene su nivel; en un **producto envasado** solo cuenta el plato (una pizza), no «queso fundido» (lonchas o porciones de nevera). La leche cruda se convierte solo cuando es queso cocinado.
- **Pescado ahumado cocinado** en pasta, risotto, quiche, revuelto, tortilla, al horno, gratinado, lasaña, canelones, croqueta, empanada o salteado. **No en pizza**: el ahumado se suele poner al final, en frío. Ensalada de pasta con ahumado sigue «Mejor no».
- **Germinados cocinados** en salteado, wok, sopa, caldo, ramen, rollitos de primavera, revuelto, tortilla, frito, tempura, guiso. En ensalada, «Mejor no».
- **Pizza** base «Sí» («Sí: va horneada, y el horno cocina lo que lleva encima.») con la pregunta «¿El jamón curado va al horno o se pone al final, en frío?». Con varias coincidencias «Sí», la ficha que manda es la de la pizza (va antes en el orden de reglas), así que en «pizza de jamón york» se ve la frase y la pregunta de la pizza.
- **No se toca** lo que el calor no arregla: mercurio, alcohol y cafeína, huevo crudo o mayonesa casera, pescado o carne cruda o poco hecha. Tortilla de patata sigue «Con cuidado». «Gana el peor» igual.
- **Alias que cortan otra palabra clave**: un alias que parte por la mitad una coincidencia de otro alimento ya no cuenta («bocadillo de jamón» dentro de «bocadillo de jamón york» no es jamón curado; «croquetas de jamón» dentro de «croquetas de jamón york» tampoco). Sin esto, «croquetas de jamón york» salía «Mejor no» con `embutido: 'no'`.
- **«Escrito a medias»** (petición del coordinador por «miel» → «mielga»): ahora exige ≥ 5 letras, que la palabra no sea ya una palabra completa conocida (cualquier palabra de los nombres, alias y textos de la guía, del léxico de alérgenos y forma de comer, más «lengua», «cabra», «tarta», «entre», «cocina», «parrilla»…) y nunca lleva al pescado con mercurio. Revisadas todas las palabras de la guía: «tarta» ya no sale tartar, «lengua» ya no sale lenguado, «cabra» ya no sale cabrales, «entre» ya no sale entrecot. Consecuencia: «sush» (4 letras) ya no se lee como sushi; «sashim» sí.
- **«Clara»** (cerveza con limón o gaseosa) → alcohol; «clara sin alcohol» → cerveza sin; «clara 0,0» → cerveza 0,0. No es clara de cerveza si va detrás de «de/las/con/sin» («tortilla de claras») ni delante de «de huevo», «montadas», «a punto de nieve», «batidas», «pasteurizadas», «líquidas», «cocidas», «crudas»… Cuenta también como gluten y como bebida en la mesa.
- **Alérgenos y forma de comer**: «sándwich mixto», «bikini», «croque monsieur» cuentan como leche y cerdo (y gluten); «san jacobo», «cachopo», «provoleta», «fondue de queso» como leche.
- **Contrato**: `docs/CONTRATO.md` dice «Fiambre de bandeja: siempre «Mejor no»» y «cocinado dentro del plato → «Con cuidado»». Ya no es así; no he tocado ese archivo (no es mío): queda anotado aquí y en el informe.

### N3 · Temas y comprobación de etiqueta (Beto, Lead Developer)

Petición de la clienta: que el código de barras y la foto de los ingredientes se correspondan («si no está segura porque son ñoquis y duda del huevo, en los ingredientes vendrá»), y educar a la usuaria en los temas que se repiten durante todo el embarazo. Archivos nuevos: `src/engine/temas.js` (ids y tablas) y `src/engine/etiqueta.js` (`checkLabel`); `index.js` los exporta (`checkLabel`, `LABEL_TOPICS`, `CLAVE_IDS`, `topicsForFood`, `missingForFood`). No hay dependencia de `claves.js`: el motor usa su propia constante `CLAVE_IDS` (un test comprueba que, si existe, coincide con los ids de `CLAVES`). `index.js` no reexporta `CLAVES`; que lo añada quien escribe `claves.js`.

**Campos nuevos del Verdict (siempre presentes, arrays de ids, sin repetir):**
- `topics`: los temas por los que sale «Con cuidado» o «Mejor no». «Sí» y «No estoy segura» llevan `[]`. Salen de los alimentos emparejados (tabla por id en `temas.js`; un alimento nuevo sin entrada cae a sus etiquetas `listeria`, `toxoplasma`, `mercurio`, `alcohol`, `cafeina`, `crudo`+`huevo`/`pescado`), solo de los que de verdad pesan: el nivel de la pieza es cuidado/no tras pasteurizar y aplicar el perfil, y el alimento lo es en la guía. Así «croquetas de jamón» con «no quiero embutidos» sale «Mejor no» sin tema (el motivo es la decisión de la persona, no la toxoplasmosis), pero «jamón serrano» con el mismo perfil sí lleva `toxoplasmosis`. Lo cocinado de verdad (pizza al horno, queso gratinado) ya es «Sí» y no lleva tema. No uso el texto suelto para añadir temas (daría falsos: «pizza con jamón al horno» tiene «jamón» y es «Sí»): el texto ya decide qué alimentos se emparejan. Orden: lo más grave primero, luego el orden de reglas, luego el orden de la tabla.
- `missing`: lo que no se puede descartar sin ver la etiqueta. Se rellena si el nivel final es «No estoy segura» (plato o producto no reconocido, o lectura incierta) o si es un producto sin ingredientes o con ingredientes de internet (aunque el nivel sea «Con cuidado» o «Mejor no»). Máximo 5, ordenados por relevancia (primero el alimento más grave). No reconocido: `['huevo-crudo','listeria','toxoplasmosis','alcohol','pescado-crudo']` (regla 7). Reconocido sin nada que mirar (agua, fruta, bebidas vegetales, zumo, croquetas): `[]`.

**Rebaja a «No estoy segura» en `classifyProduct`** (solo cuando el nivel sería «Sí»; «Con cuidado» y «Mejor no» se quedan, con `missing`):
- `ingredientsText` vacío o en blanco → «No tengo los ingredientes de este producto. Fotografíalos y lo compruebo.» (sin «No estoy segura de la lectura»). Fuente «La propia app: faltan los ingredientes».
- `ingredientsSource === 'web'` o `product.source === 'web'` → «Datos encontrados en internet, sin confirmar con la etiqueta.». Fuente «La propia app: datos de internet sin confirmar». Si además no hay ingredientes, manda la primera frase.
- Ingredientes de OFF o de foto de etiqueta (`ingredientsSource` ausente, `'off'` o `'etiqueta'`) no se rebajan.
- En los dos casos `question` y `alternative` pasan a `null`, `detail` explica que se fotografíe la etiqueta y `foodId/foodIds` se conservan (enlace a la ficha). Alergias y trazas mandan: una alergia marcada sigue dando «Mejor no» y las trazas «Con cuidado» (ya eran más graves que «Sí»).
- `classifyText` acepta `{ source: 'web' }` o `{ ingredientsSource: 'web' }` en sus opciones y aplica la segunda rebaja; sin ingredientes no rebaja (un nombre de plato escrito no es un producto).
- **Decisión mía, sin exención:** un producto sin ingredientes se rebaja siempre, también el agua o el pan, porque la lista de ingredientes es lo único que protege a quien ha marcado una alergia que la guía no deduce del nombre (pan de molde con leche o huevo). El coste es que «Agua mineral» sin ingredientes sale «No estoy segura» con `missing: []`; si la clienta lo quiere distinto, es una excepción de una línea en `finish()`. **Cambio en tests existentes:** los productos de prueba «Mahou 0,0» y «Mahou Clásica» llevaban solo categorías; ahora llevan ingredientes.

**Quién da la frase de un «Sí» en un producto (corrección al integrar).** En `classifyProduct`, si el nivel resultante es «Sí», la frase, el detalle, la pregunta y la fuente solo pueden venir de un alimento emparejado por el nombre del producto (o por su categoría de OFF), nunca de uno que solo aparece como ingrediente: la ficha de «leche pasteurizada» describe la leche, no unos ñoquis que la llevan. Si no hay coincidencia por nombre o categoría, sale la frase neutra «He mirado los ingredientes y no veo nada que haya que vigilar.» (detalle: «He comparado los ingredientes con los temas que se repiten en el embarazo (listeria, toxoplasmosis, huevo crudo, alcohol…) y no aparece nada que pida cuidado. Fuente: la propia app, a partir de la lista de ingredientes.», fuente «La propia app: a partir de los ingredientes», `question`/`alternative` null, `foodId` null). `foodIds` sigue con todas las coincidencias. «Con cuidado» y «Mejor no» deciden por ingredientes como antes (el motivo sí es el ingrediente) y no antepongo «Lleva X»: las fichas ya nombran el motivo («Mejor no: el queso azul puede llevar listeria.»). Ojo: «Ñoquis de patata» casa por nombre con «verdura cocinada» (por «patata») y «pasta», así que su «Sí» usa la frase de esa ficha y no la neutra; la neutra sale cuando el nombre no casa con nada de la guía.

**`checkLabel(ingredientsText, topicIds, profile)`** → `[{ topic, status: 'aparece'|'no-aparece', evidence: string[≤3], matiz? }]`, en el orden pedido, sin repetir y sin ids desconocidos (sin `topicIds`, todos los temas). `profile` se acepta y por ahora no cambia nada. Léxico propio, por palabra completa sobre texto normalizado, con unos pocos términos en inglés por las listas de OFF. `evidence` son fragmentos literales de la lista (el ingrediente tal como está escrito, con paréntesis; si pasa de 80 caracteres, el trozo que habla del tema). `matiz` solo está cuando procede y vale para todos los fragmentos (uno sin matiz lo quita; si se mezclan, manda el menos tranquilizador, `duda` > `poca` > `pasteurizado`):
- `pasteurizado`: huevo u ovoproducto pasteurizado (sigue siendo `aparece`) y, en listeria, queso azul o brie de leche pasteurizada (`aparece`). Aparte, **lácteo pasteurizado sin ningún otro riesgo** da `no-aparece` con `matiz: 'pasteurizado'` y esos fragmentos como `evidence` (señal tranquilizadora).
- `duda`: la palabra no basta: «alcohol de caña», «atún» (sin «rojo»), «carne picada», «lomo» a secas, «anchoas», y quesos frescos (fresco, requesón, burrata, mozzarella, feta, ricotta…) que no dicen «pasteurizada». Un queso fresco que sí lo dice pasa a señal tranquilizadora.
- `poca`: cacao y chocolate (cafeína), hinojo y tila (hierbas).
- Negaciones: «sin/libre de/exento de/no contiene/cero X» con hasta tres palabras en medio (no cruzan «con»: «sin lactosa con huevo» sí lleva huevo), «cerveza/vino sin alcohol», «desalcoholizado», «0,0», «descafeinado», «sin cafeína».
- No cuentan: vinagre (de vino, de alcohol…), levadura de cerveza, alcoholes de azúcar, manteca de cacao, chocolate blanco, infusiones de menta/tila/manzanilla/jengibre (cafeína), cola de pescado, jamón cocido/york (no es toxoplasmosis; es fiambre y sale en listeria). «Ahumado» y «crudo» solo cuentan junto a una palabra de pescado o marisco («pimentón ahumado», «jamón crudo» y «leche cruda» no son pescado crudo; «leche cruda» sí es listeria).
- Además de lo pedido añadí a listeria: germinados, fiambres (jamón cocido, mortadela, chopped), surimi y salchichas Frankfurt; a toxoplasmosis: sobrasada, chistorra, cecina, longaniza, tartar y carpaccio; a hierbas: glicirricina y los nombres ingleses de regaliz y poleo. Poleo y regaliz no llevan matiz.

**Tabla: qué temas salen y qué se pide mirar** (`topics` solo con «Con cuidado» o «Mejor no»; `missing` solo con duda, producto sin ingredientes o datos de internet; entre paréntesis, el orden)
| Categoría | `topics` | `missing` |
|---|---|---|
| Quesos, leche, yogur, mantequilla, horchata | listeria | listeria |
| Huevo crudo o poco hecho: mayonesa casera, tortilla, revuelto, huevo frito, tiramisú, mousse, coulant, carbonara, César, ensaladilla, paella | huevo-crudo (tiramisú: + cafeina; tarta de queso y helado: + listeria) | huevo-crudo (César, tarta de queso, helado, tiramisú y lasaña: + listeria) |
| Pasta, ñoquis, gyozas, salsas de bote, repostería y postres con huevo | — (son «Sí») | huevo-crudo (pasta «rellena»: + listeria) |
| Embutido curado | toxoplasmosis | listeria, toxoplasmosis |
| Fiambre de bandeja | listeria | listeria, toxoplasmosis |
| Paté, salchichas Frankfurt, perrito caliente | listeria | paté y Frankfurt: toxoplasmosis, listeria; perrito: listeria |
| Carne poco hecha, carpaccio, chuletón, hamburguesa | toxoplasmosis | toxoplasmosis |
| Steak tartar | toxoplasmosis, huevo-crudo | huevo-crudo, toxoplasmosis |
| Pescado crudo, marisco crudo, boquerones en vinagre, anchoas | pescado-crudo (crudo: + listeria) | mercurio, pescado-crudo, listeria |
| Pescado ahumado | listeria, pescado-crudo | mercurio, pescado-crudo, listeria |
| Pez espada, emperador, atún, tiburón | mercurio | mercurio, pescado-crudo, listeria |
| Surimi y gulas | listeria (surimi) | listeria |
| Germinados | listeria | listeria |
| Ensaladas y gazpacho | toxoplasmosis (verdura mal lavada) | ensalada: listeria, toxoplasmosis; gazpacho: toxoplasmosis |
| Pizza | — (es «Sí») | listeria, toxoplasmosis |
| Alcohol, cerveza sin alcohol, salsa al vino | alcohol | alcohol |
| Kombucha | alcohol, cafeina | alcohol, cafeina |
| Café, té, cola, energética, chocolate | cafeina | cafeina |
| Poleo, sen/ruda/regaliz, tila, jengibre, rooibos | hierbas (rooibos es «Sí») | hierbas |
| Bebida no reconocida | — | alcohol, cafeina, hierbas |
| Nada reconocido | — | huevo-crudo, listeria, toxoplasmosis, alcohol, pescado-crudo |
| Hígado, caza, tónica, edulcorantes, zumo | — (el motivo es otro: vitamina A, plomo, quinina, azúcar) | — |
| Agua, fruta, verdura, legumbres, pan, cereales, bebidas vegetales, croquetas | — | — |

**Pendiente / avisos.** (1) Las frases nuevas son literales de la petición; la interfaz decide cómo enseñar `topics`, `missing` y el matiz. (2) `checkLabel` con texto vacío devuelve «no-aparece» en todo: quien lo llame debe comprobar antes que hay texto. (3) El e2e 10 falla solo en «Ningún SVG … contiene <text>» (cuenta 0 ilustraciones grandes visibles; es de la interfaz, no del motor).

## Cuestionario

### Respuestas de la clienta del 24-10-2026 (Laura, contenido, y Beto, motor)

Aplicadas las respuestas de `docs/CUESTIONARIO.md`: 64 alimentos nuevos en la guía (de 76 a 140). El corpus de 293 platos pasa de 87 «No estoy segura» a 0. Lo que decidí sin preguntar:

- **Agrupaciones** solo cuando comparten nivel, frase, grupo y alérgenos: «Pan» (molde, integral, tostadas, pan rallado), «Cereales, avena o galletas», «Aceite, vinagre y sal», «Encurtidos y aceitunas», «Tomate frito, kétchup o mostaza», «Mantequilla o nata», «Frutos secos y crema de cacahuete», «Flan, natillas o crema catalana», «Lasaña o canelones», «Pasta, ñoquis o cuscús», «Morcilla, butifarra o salchichas», «Bollería y bizcocho» y «Profiteroles, milhojas, torrijas y otros pasteles». Separados por alérgenos: el brownie (frutos secos), la tarta de Santiago, el muesli, la panna cotta y la gelatina, la boloñesa (carne), los tacos (sin gluten) del burrito, la salsa de soja (soja y gluten) del resto de salsas, y las bebidas vegetales en cuatro fichas: avena o espelta (gluten), soja, almendras u otros frutos secos, y arroz o coco.
- **Etiquetas prudentes para alergias**: gulas y surimi llevan `pescado`, `huevo` y `gluten` (la mayoría lleva clara de huevo y almidón de trigo); el pad thai, `pescado` además de huevo, cacahuete y soja (casi siempre lleva salsa de pescado); el falafel, `sesamo` (tahini); las croquetas, `gluten`, `leche` y `huevo`. Lasaña y canelones llevan `carne` (casi siempre la llevan), así que una lasaña de verduras da la nota «No encaja con vegetariana»: es solo una nota.
- **Surimi «Mejor no»** (decisión de la clienta): refrigerado listo para comer, como los loncheados. «Palitos de cangrejo» es surimi y pasa de «Sí» a «Mejor no». Las **gulas** siguen «Sí» (la clienta): la ficha dice que se salteen o calienten bien. «Surimi a la plancha» no se convierte en «Sí»: es un caso raro y se queda en lo prudente.
- **Anchoas en salazón «Mejor no»**: palabra clave «anchoa(s)», salvo «aceitunas rellenas de anchoa» (encurtidos, «Sí») y «anchoas fritas/rebozadas/a la plancha/al horno/frescas», que son boquerones (pescado azul pequeño, «Sí»). La «gilda» lleva anchoa en salazón: «Mejor no». **«Pizza con anchoas» sale «Mejor no»**: no hay ficha de anchoa cocinada y a menudo se ponen al final; anotado por si la clienta lo quiere distinto. En un producto envasado, la anchoa cuenta solo en el nombre (no por ir en la lista de ingredientes de unas aceitunas).
- **Huevo**: la frase de `huevo-poco-hecho` es ahora «La yema líquida, mejor no estos meses: nada de mojar la yema.». Además de «huevo frito» y «huevos rotos», cuentan como yema líquida «huevo a la plancha», «huevos a la flamenca», «huevos al plato», «a caballo» y «huevos con patatas/chorizo/jamón/morcilla…» (en España son huevos fritos; no si va detrás de «tortilla de», «revuelto de»). «Huevo frito/a la plancha con (la) yema hecha/cuajada/dura» o «bien/muy hecho» → «Sí». «Huevos» a secas, como compra (solo el nombre entero: «huevos», «docena de huevos», «huevos camperos»…), → ficha nueva «Huevos frescos», «Sí, siempre bien hechos».
- **Salchichas**: a secas o frescas, «Sí» (en la ficha de morcilla y butifarra); «Frankfurt», «de paquete», «envasadas», «cocidas», «de Viena» o «en lata», «Con cuidado» (ficha propia). Perrito caliente, «Con cuidado».
- **Chuletón**: ficha propia «Mejor no» con la frase y el tono que pidió la clienta; sale de los alias de «Carne poco hecha». «Muy hecho», «bien hecho», «hecho del todo», «bien/muy pasado» → «Carne bien hecha», «Sí». «Chuletón al punto» enseña la frase de la carne poco hecha (va antes).
- **Horchata**: tres fichas. A secas, «Con cuidado»; «pasteurizada», «de brick/brik», «UHT», «envasada», «embotellada», «de botella» → «Sí»; «artesana/artesanal», «sin pasteurizar», «no pasteurizada», «casera», «recién hecha», «de horchatería», «a granel» → «Mejor no». Las palabras clave van antes que la leche cruda para que «sin pasteurizar» no la marque como leche. «Horchata natural» se queda en «Con cuidado» (puede ser de las dos). «Leche/bebida de chufa» es horchata.
- **Infusiones**: poleo menta «Mejor no»; tila y jengibre «Con cuidado»; rooibos «Sí» (antes estaba bloqueado como «no reconocido»). «Jengibre» solo cuenta como infusión si lo dice («infusión/té/agua/shot de jengibre») o si es la palabra sola: «salmón al jengibre» no pasa a «Con cuidado». La kombucha sale de la regla del té y pasa a ficha propia «Mejor no» (alcohol y cafeína).
- **Tónica «Con cuidado»** por la quinina; la fuente citada es AESAN en lo general (agua como bebida principal), sin atribuirle nada sobre la quinina.
- **Básicos de despensa solo por el nombre**: aceite, sal, vinagre, azúcar, harina, levadura, pan, mantequilla, salsas, encurtidos, gelatina, miel, mermelada, frutos secos, pipas, cereales, pasta, tofu, seitán, bebidas vegetales, surimi, chicle y rooibos no cuentan cuando aparecen en la lista de ingredientes de un producto (igual que ya pasaba con «agua» y «zumo»): un producto desconocido no pasa a «Sí» porque lleve harina y sal, y el surimi de unas gulas no las vuelve «Mejor no». Los alérgenos se siguen leyendo en todo el texto.
- **Harinas sin gluten** («harina de maíz, arroz, garbanzo, almendra…») quedan bloqueadas: no se leen como «Harina» (que lleva `gluten`) para no avisar de gluten donde no lo hay; salen «No estoy segura».
- **Colisiones revisadas** con palabras completas: «pan» no casa en «panna cotta», «panceta» ni «pan con tomate» (sigue su ficha); «sal» no casa en «salsa» ni «salmón»; «miel» no es «mielga»; «miel cruda» ya no se lee como carne cruda; «morcilla de Burgos» ya no es queso de Burgos; «levadura de cerveza» no es cerveza; «té de jengibre/poleo/tila/rooibos» no es té con cafeína.
- **Retoques pedidos por el coordinador**: frase del chocolate «Sí, con moderación: el chocolate negro también lleva algo de cafeína.» y pregunta de la pizza «¿Lo que lleva encima va al horno o se pone al final, en frío?».
- **Pregunta 94 (modelo de visión)**: la clienta eligió Sonnet 5.5; es el modelo por defecto.
- **Fuentes**: todas las fichas nuevas citan AESAN (la kombucha, AESAN y Ministerio de Sanidad) en términos generales, sin cifras salvo los 200 mg de cafeína.

### N2b · Alergias sin contradicciones, fiambre en frío y plato combinado (Beto)

- **Alergia o «otra cosa» que pone «Mejor no» sobre una base que no lo era**: la frase queda solo en «Has marcado X.» y el detalle pasa a una nota propia («Lleva X, que has marcado en tus ajustes. Por eso sale «Mejor no», aunque en general este alimento no tenga un riesgo especial en el embarazo.»; con base «Con cuidado»: «…solo pida algo de cuidado en el embarazo»; con base desconocida: «…aunque la app no reconoce del todo este plato»; para «otra cosa»: «Has marcado «X» entre lo que no quieres comer en tus ajustes. …»). `question` y `alternative` pasan a null. Si la base ya era «Mejor no» (incluido el perfil de embutido «no»), se queda todo como estaba. Vale para `classifyText`, `classifyProduct` y `verdictForFood` (todos pasan por `finish()`). Las trazas y la lectura incierta no cambian.
- **Fiambre en frío**: «bocadillo/sándwich/tosta/montadito de pavo», «pavo en frío», «mixto frío» y «sándwich mixto frío» → fiambre de bandeja («Mejor no»). «Frío/fría» en el texto convierte en crudo cualquier fiambre o embutido que iba a contar como cocinado. «Pavo» a secas, «pechuga de pavo a la plancha/asada» y «bocadillo de pavo asado» siguen siendo carne hecha («Sí»).
- **«Plato(s) combinado(s)»** ya no es alcohol (bloqueo en el léxico; sin coincidencia, «No estoy segura»). «Combinado», «combinados» y «combinado de ginebra» siguen siendo alcohol, también «plato combinado con copa de vino».

## Claves del embarazo

### N8 · Las ocho claves y el microcopy que las acompaña (Laura, Product Owner)

La clienta pidió: «No solamente que te dé el resultado, sino ir educando a la usuaria para que sepa cuáles son los temas conflictivos que se van a ir repitiendo durante todo el embarazo.» Esto lo resuelven las **claves**: ocho temas que vuelven una y otra vez, explicados una sola vez y enlazados desde cada respuesta. No son un veredicto nuevo: el semáforo lo sigue calculando el motor.

**Entregable de contenido**: `src/engine/claves.js` (nuevo, sin dependencias). Exporta `CLAVES` (ocho, en este orden: `listeria`, `toxoplasmosis`, `mercurio`, `huevo-crudo`, `pescado-crudo`, `alcohol`, `cafeina`, `hierbas`), `CLAVE_BY_ID` y `claveLabel(id)` (el título o el propio id). Cada clave lleva `id`, `titulo`, `resumen` (una frase, ≤ 90 caracteres; los de ahora miden entre 57 y 67), `porque` (2–3 frases), `donde` (pistas de etiqueta), `carta` (preguntas para el camarero), `ejemplos`, `alternativa` y `fuente`.

**Lo que decidí sin preguntar**

- **Alineada con la guía de alimentos.** Cada afirmación sale de lo que ya dicen las fichas de `foods.js` (mismas especies de mercurio, mismos ahumados, mismas salsas con vino, mismo tope de cafeína). Dos cosas que no están en el brief y que se han dejado fuera a propósito: no se da ninguna frecuencia ni cantidad de pescado, y no se dice qué cantidad de regaliz es «mucha».
- **Fuentes.** Solo AESAN y el Ministerio de Sanidad, por su nombre y de forma general («AESAN recomienda…», «AESAN señala…»). Alcohol: «AESAN y Ministerio de Sanidad» (igual que la ficha del alcohol). El resto: AESAN. No se atribuye a ninguna de las dos ningún detalle que no esté ya en la guía.
- **Cifras.** La única cifra es «200 mg» de cafeína al día, con «orientativa». Hay un «0,0» en alcohol: es el nombre de la cerveza (la propia etiqueta), no una cantidad.
- **Palabras vetadas.** No aparecen «evitar» ni «seguro/segura» (ni en el texto, ni como veredicto). Para el alcohol se usa la fórmula de la guía: «no se conoce una cantidad sin riesgo».
- **Tono.** Frases cortas, sin exclamaciones ni diminutivos, sin alarma: se dice qué es, por qué importa y qué hacer. Cada clave termina en una alternativa práctica.
- **Cocinar sí cambia el resultado… salvo en el mercurio.** Listeria, toxoplasmosis, salmonela y anisakis: el calor (o un buen lavado) corta el riesgo. Mercurio, alcohol (si no hierve de verdad) y cafeína: no. Es la misma distinción que ya hace el motor tras la decisión N2.
- **Poleo** va en «Hierbas» porque la clienta lo dejó en «Mejor no» (poleo menta) en el cuestionario; **manzanilla y rooibos** se nombran como alternativa («Sí» en la guía). Tila y jengibre («Con cuidado») no se nombran: no caben en una pista corta sin matizar.
- **Mate** aparece en cafeína como ejemplo y en la pista de etiqueta; en la guía el mate está dentro del té (yerba mate).

**Validado**: `node -e "import('./src/engine/claves.js').then(m=>console.log(m.CLAVES.length))"` → 8; ningún `resumen` pasa de 90 caracteres; `porque` de 2–3 frases; `donde` 3–5, `carta` 2–4 y `ejemplos` 4–6 por clave; sin «evitar», «seguro/segura» ni exclamaciones; ninguna cifra salvo 200 mg (y el «0,0»).

### Microcopy de la interfaz (para Michi)

Texto literal, listo para pegar. Entre llaves, lo que pone el código. Tratamiento de tú, sin exclamaciones, sin «evitar» ni «seguro» como veredicto. No he tocado ningún archivo de interfaz.

#### 1. Producto reconocido por nombre, pero sin ingredientes («No estoy segura» tras escanear)

| Clave | Texto |
|---|---|
| `duda.titulo` | Me faltan los ingredientes |
| `duda.apertura` | He encontrado el producto por su nombre, pero no trae la lista de ingredientes. |
| `duda.pregunta` | Voy a mirar si lleva: {lista}. |
| `duda.cierre` | Con la foto de la etiqueta te lo digo mejor. |

- **{lista}** se construye a partir de `missing`: etiquetas en minúscula, separadas por coma y la última con « o ». Una sola: «Voy a mirar si lleva: huevo.» Varias: «Voy a mirar si lleva: huevo, leche sin pasteurizar o alcohol.» Si `missing` viene vacío, no se pinta la pregunta (solo apertura y cierre).
- **Etiqueta de cada tema** (que `missing` debe traducir a estas palabras): huevo → «huevo»; leche → «leche sin pasteurizar»; embutido → «embutido curado»; pescado → «pescado crudo o ahumado»; mercurio → «pescado con mercurio»; alcohol → «alcohol»; cafeína → «cafeína»; brotes → «brotes crudos»; hierbas → «hierbas o infusiones»; carne → «carne cruda». Si el motor usa otros ids, Michi los casa con la clave más cercana de esta lista.
- El título es el h1 de la pantalla; la pastilla sigue siendo «No estoy segura» (arena).

#### 2. Pasar a la foto

| Clave | Texto |
|---|---|
| `foto.boton` | Fotografiar los ingredientes |
| `foto.ayuda` (bajo el botón, opcional) | Acerca la etiqueta, con buena luz, hasta que se lean las letras. |

Es el botón principal de esa pantalla (salvia). Sin segunda acción al lado.

#### 3. Resultado tras la foto

| Clave | Texto |
|---|---|
| `etiqueta.encabezado` | Lo que he mirado en la etiqueta |
| `etiqueta.no` (plantilla, tema ausente) | No aparece {tema}. |
| `etiqueta.si` (plantilla, tema hallado) | Aparece: {tema}. |
| `etiqueta.si.pasteurizado` (plantilla, con matiz bueno) | Aparece {tema}, {matiz}: bien. |
| `etiqueta.si.sinpasteurizar` (matiz malo) | Aparece {tema}, sin pasteurizar. |
| `etiqueta.ilegible` (si esa parte no se lee) | No se lee bien esta parte de la etiqueta. |

Una línea por tema, en este orden fijo: huevo, leche, embutido curado, pescado, alcohol, cafeína, brotes, hierbas. Se escribe primero lo hallado (con enlace «Por qué importa») y debajo lo que no aparece, en tono más suave.

| Tema | Ausente | Hallado | Con matiz «pasteurizado» |
|---|---|---|---|
| huevo | No aparece huevo. | Aparece: huevo. | Aparece huevo, pasteurizado: bien. |
| leche | No aparece leche. | Aparece: leche. | Aparece leche, pasteurizada: bien. |
| queso | No aparece queso. | Aparece: queso. | Aparece queso, pasteurizado: bien. |
| embutido curado | No aparece embutido curado. | Aparece: embutido curado. | — |
| pescado crudo o ahumado | No aparece pescado crudo ni ahumado. | Aparece: pescado ahumado. | — |
| alcohol | No aparece alcohol. | Aparece: alcohol. | — |
| cafeína | No aparece cafeína. | Aparece: cafeína. | — |
| brotes | No aparecen brotes. | Aparecen: brotes. | — |
| hierbas | No aparecen hierbas desaconsejadas. | Aparecen: hierbas desaconsejadas. | — |

(«Aparecen» solo en los dos temas en plural.) El matiz solo existe para huevo, leche y queso. Si la etiqueta dice «sin pasteurizar», sale la plantilla `etiqueta.si.sinpasteurizar`.

#### 4. Enlace a la clave y chip de tema

| Clave | Texto |
|---|---|
| `clave.enlace` | Por qué importa |
| `clave.enlace.aria` | Por qué importa: {titulo} |
| `clave.chip` | {claveLabel(id)}, p. ej. «Listeria», «Huevo crudo», «Hierbas e infusiones» |

- El chip es neutro (superficie y línea, sin color de semáforo) y lleva a la clave; no es una pastilla de veredicto, para no confundirse con las cuatro palabras.
- El enlace «Por qué importa» va dentro de «Ver más», junto a la fuente, y también en cada línea hallada de `etiqueta.si`. Destino propuesto: `#/claves` con la clave abierta (`#/claves/{id}`).
- Un alimento puede llevar más de un chip (p. ej. el tiramisú: Huevo crudo y Cafeína). Máximo dos a la vista; el resto en «Ver más».

#### 5. Pantalla «Las claves del embarazo»

| Clave | Texto |
|---|---|
| `claves.titulo` | Las claves del embarazo |
| `claves.entradilla` | Son los ocho temas que más se repiten durante el embarazo. Sirven para saber qué mirar en una etiqueta y qué preguntar en la carta. |
| `claves.tarjeta.abrir` | Abrir |
| `claves.tarjeta.cerrar` | Cerrar |
| `claves.secc.porque` | Por qué importa |
| `claves.secc.donde` | Qué mirar en la etiqueta |
| `claves.secc.carta` | Qué preguntar en la carta |
| `claves.secc.ejemplos` | Dónde suele aparecer |
| `claves.secc.alternativa` | Una alternativa |
| `claves.fuente` | Fuente: {fuente} |
| `claves.cierre` | Si tienes una duda sobre tu caso, pregúntasela a tu matrona. |

- **Forma de cada tarjeta**: superficie `#fffdf8` con borde de hoja, sin color de semáforo. Cerrada: el título (Fraunces, h2) y debajo el `resumen` en una frase, con «Abrir» a la derecha. Abierta: `porque` en un párrafo; `donde` como lista corta; `carta` como lista de preguntas entre comillas; `ejemplos` en una sola línea separada por comas; `alternativa` en un párrafo; la fuente al final, pequeña. Una sola abierta a la vez; se abre la que viene en la URL. Ocho tarjetas en una columna, en el orden de `CLAVES`.
- **Dónde se entra**: un enlace discreto en Inicio, bajo «Lo último» («Las claves del embarazo») y otro en Ajustes. No es un quinto destino de la barra inferior (la especificación fija cuatro).
- Sin cuenta atrás, sin «has leído 3 de 8», sin barra de progreso: es una consulta, no un curso.

#### 6. Datos que vienen de internet

| Clave | Texto |
|---|---|
| `internet.aviso` | Datos encontrados en internet ({fuente}). Compruébalos con la etiqueta. |

Ejemplo real: «Datos encontrados en internet (Open Food Facts). Compruébalos con la etiqueta.» `{fuente}` es el nombre de la base consultada. El aviso va antes del resultado, en texto secundario y con «Fotografiar los ingredientes» a mano.

#### 7. Producto que no está en ningún sitio

| Clave | Texto |
|---|---|
| `noencuentro.texto` | No lo encuentro. Fotografía los ingredientes y lo miro por ti. |
| `noencuentro.boton` | Fotografiar los ingredientes |

Sustituye a «No está en Open Food Facts. Haz una foto de los ingredientes.» (el mensaje de red se queda como está).

#### 8. Lista de la compra

| Clave | Texto |
|---|---|
| `lista.titulo` | Lista |
| `lista.carro` (encabezado de lo comprado) | En el carro |
| `lista.pendiente` (encabezado de lo que falta) | Pendiente |
| `lista.carro.vacio` | Nada en el carro todavía. |
| `lista.pendiente.vacio` | No queda nada pendiente. |
| `lista.vacia.titulo` | Lista vacía |
| `lista.vacia.texto` | Todavía no hay nada. Cuando mires un plato o un producto, puedes dejarlo aquí. |
| `lista.contador` | {n} pendiente / {n} pendientes |
| `lista.marcar.aria` | Marcar {nombre} como comprado |
| `lista.desmarcar.aria` | Devolver {nombre} a pendiente |
| `lista.marcado` (mensaje al marcar) | {nombre}: en el carro. |
| `lista.desmarcado` (mensaje al desmarcar) | {nombre}: otra vez pendiente. |
| `lista.quitado` (ya existe) | {nombre}: quitado de la lista. |
| `lista.compartir.boton` | Compartir la lista |
| `lista.compartir.titulo` | Mi lista de la compra |
| `lista.compartir.ok` | Lista compartida. |
| `lista.compartir.copiada` | Lista copiada. |
| `lista.compartir.error` | No he podido compartir la lista. |

- **Orden**: «Pendiente» primero, «En el carro» debajo; «En el carro» se pliega si no hay nada. El semáforo y la frase de cada fila no cambian al marcar: el color de la banda sigue siendo el de la respuesta.
- **Mensaje al marcar**: se anuncia en la región viva (`announce`), igual que «quitado de la lista», y el foco pasa a la fila siguiente o, si no hay, al título.
- **Texto que se comparte** (`navigator.share({ title, text })`; si no existe, se copia al portapapeles): primera línea «Mi lista de la compra», una línea por producto pendiente con un guion («- Queso fresco»), sin el semáforo, sin frases y sin dirección web. Solo lo pendiente: es para que otra persona haga la compra. Si no hay nada pendiente, el botón se oculta.
- Ni el texto ni el botón de compartir mencionan embarazo ni salud: el mensaje sale del móvil de la usuaria y puede acabar en un grupo familiar.

#### Para quien integre

- `CLAVES`, `CLAVE_BY_ID` y `claveLabel` se importan de `src/engine/claves.js`. La ruta `#/claves` y la forma de `missing` son decisión de interfaz y motor; este texto no depende de ellas.
- Los textos 1, 3, 6 y 7 son frases de interfaz, no de la guía: no van en `foods.js`.
- Si el copy de algún tema cambia por una pregunta de la clienta, el sitio único es este apartado y `claves.js`.

## Cobertura de códigos de barras

### N8 · Más fuentes para el código de barras (Beto-infra)

Problema de la clienta: de 10 productos de súper español, solo 4 estaban en Open Food Facts (OFF). Lo que se hizo y lo que decidí sin preguntar:

**Qué hay ahora**
- `src/capture/off.js`: `fetchProduct(code)` sigue igual de compatible y ahora devuelve `{ found: true, product, source: 'off', incomplete }`. `incomplete = true` si el producto existe pero **no tiene lista de ingredientes** (en la medición de abajo es lo más común en marcas blancas). Ingredientes: `ingredients_text_es` → `ingredients_text` → `ingredients_text_<en|fr|it|pt|ca|de>` → lista estructurada `ingredients[].text` unida con comas. `product` añade `quantity` (si viene) e `ingredientsLang` (solo si la lista NO está en español). Un reintento ante fallo de red o 5xx (no ante 404 ni JSON roto); `signal` para cancelar.
- `api/producto.js` (POST `/api/producto`, `{ code }`): búsqueda web de respaldo con el SDK oficial y la herramienta de servidor `web_search` (`web_search_20260209` con Sonnet 5.5 / Opus 5.5; `web_search_20250305` con Haiku 5.5), `max_uses` 3, esfuerzo bajo, `max_tokens` 2048, salida estructurada. Modelo en `PRODUCT_MODEL` (misma lista blanca que `VISION_MODEL`, por defecto `claude-sonnet-5-5`). El modelo **solo transcribe**: nunca decide el semáforo.
- `src/capture/producto.js`: `lookupProduct(code, { signal, onStatus })` orquesta OFF → web → combinación (contrato exacto en el informe de Beto-infra y en el propio archivo).
- `vercel.json` (`functions` con `maxDuration` 60 y lista blanca `api/(?:leer|producto)`), `server.js` (ruta local) y `.vercelignore` (comentario). `api/leer.js` solo ha ganado `export` en cuatro ayudantes que ya tenía (`send`, `HttpError`, `headerValue`, `checkSameOrigin`) para no duplicar la comprobación de mismo origen.

**Decisiones de prudencia** (todas con test)
- **Una ficha sin ingredientes no es «encontrada» para el semáforo**: `incomplete` dispara la búsqueda web y, si tampoco sale, la app debe pedir la foto de la etiqueta (flujo que ya existe). Preferimos «No estoy segura» a un «Sí» sin lista.
- **Listas en otro idioma**: se usan (mejor algo que nada) pero llevan `ingredientsLang`. Comprobado con el motor actual: «lait cru, sel» y «lait cru de brebis, présure, sel» salen «No estoy segura» (no reconoce palabras francesas), no «Sí». La interfaz podría decir «la lista está en francés» cuando `ingredientsLang` exista.
- **Búsqueda web con pista**: el cliente manda a `/api/producto`, además del código, el `name` y la `brand` que OFF ya conoce (opcionales, ≤ 100 y ≤ 60 caracteres, saneados). Motivo medido: buscar por el número suelto casi nunca encuentra la ficha (ver abajo); por nombre y marca, las fichas de Alcampo/Carrefour salen con sus ingredientes. Para que la pista no abra puertas: el prompt dice que si la página muestra otro código no es ese producto; la caché va por código **+ pista** (una pista inventada por quien llama no puede envenenar el resultado de los demás); y el texto de la pista nunca llega al motor.
- **Campo extra `code_on_page`** en el esquema de salida (el modelo dice si la página muestra ese mismo código). Regla del servidor sobre `confidence` cuando hay ingredientes: si `code_on_page` es falso → «baja» sin pista, como mucho «media» con pista. Además «baja» si no hay `source_url` válida o si la fuente no está entre las páginas que devolvió la búsqueda.
- **El cliente descarta los ingredientes de la web con confianza «baja»** (el producto queda `incomplete`: mejor no saber que saber mal). Con «media» o «alta» los usa y expone `sourceName`/`sourceUrl`/`confidence` para que la interfaz diga de dónde salen («Ingredientes copiados de Mercadona») y recuerde comprobarlos en la etiqueta.
- **Si el modelo contesta sin haber buscado** (ninguna búsqueda en la respuesta ni en `usage.server_tool_use`), se ignora lo que diga (saldría de su memoria) → `web_no_disponible`.
- Los errores de la herramienta (`unavailable`, `too_many_requests`…) llegan como bloque, no como excepción: si no hubo ninguna búsqueda buena y el modelo dice `found:false`, se responde `web_no_disponible` (5 min de caché) y **no** «no encontrado» (1 h), para no esconder un fallo temporal.
- **Sin bucles ni gasto escondido**: el SDK sin reintentos automáticos; un único segundo intento, más conservador (búsqueda básica, sin respaldo de servidor, JSON pedido en el prompt), solo si la API rechaza con 400/403 (herramienta no habilitada, esquema incompatible…) y cuesta nada porque no llegó a ejecutarse; `pause_turn` se reanuda como mucho 2 veces; plazo total de 40 s (la función admite 60); el cliente espera 45 s.
- **Código mal tecleado**: `/api/producto` rechaza (400 `codigo`) los de 12, 13 y 14 dígitos con dígito de control incorrecto: no existen, no se paga una búsqueda. Los de 8 dígitos no se comprueban (el UPC-E no sigue la regla del EAN-8).
- **Control de gasto**: 6 búsquedas por IP cada 10 minutos y 60 al día **por instancia** (en memoria, aproximado en serverless; el tope real es el límite de gasto del workspace de Anthropic, que sigue recomendado). Las respuestas de caché y las peticiones inválidas no gastan cupo; peticiones simultáneas del mismo código comparten una búsqueda. Caché por código: 24 h si se encontró, 1 h si no, 5 min si la web no estuvo disponible. Orden de errores: 405 → 403 → 415 → 503 `sin_vision` → 400/413 → (caché) → 429.
- Coste orientativo (a comprobar con la tarifa vigente): tokens de Sonnet 5.5 (2 USD entrada / 10 USD salida por millón) más la tarifa de la herramienta de búsqueda web (hasta 3 búsquedas por consulta). Con el tope de 60 búsquedas al día por instancia el gasto máximo diario por instancia es de unos pocos dólares; el gasto real depende de cuántas consultas lleguen a la web (solo las que OFF no resuelve). Haiku 5.5 sale unas 20 veces más barato en tokens, pero con la búsqueda básica y peor criterio al copiar: probar con los códigos de abajo antes de cambiar `PRODUCT_MODEL`.
- Privacidad: a Anthropic solo viajan el código de barras y, si OFF lo conoce, el nombre y la marca del producto. Ningún dato de la persona, ni foto, ni perfil. No se registra contenido, solo errores con su código de estado.
- `product.allergens` y `traces` de lo que viene de la web van **vacíos** (OFF los da como etiquetas `en:milk`; aquí el modelo solo copia). Los alérgenos que la página declare viajan aparte en `allergensText` (texto) para mostrarlos; el motor ya lee los alérgenos del texto de ingredientes.
- No he tocado la interfaz (`src/ui`); la integración de `lookupProduct` en `src/ui/super.js` la ha hecho el agente de interfaz sobre el contrato de abajo. `docs/CONTRATO.md` no se ha editado (no es mío): la firma de `fetchProduct` es compatible; `lookupProduct` y `POST /api/producto` son interfaces nuevas, descritas aquí y en `src/capture/producto.js`.
- **Requisito en producción**: la herramienta de búsqueda web debe estar habilitada para la organización de Anthropic (ajuste de administrador en la Console). Si no lo está, `/api/producto` responde 200 `{ found:false, reason:'web_no_disponible' }` y la app sigue con OFF y la foto de la etiqueta; no se rompe nada.

**Cuánto cubre (medición real, 25-10-2026)**

*A. Muestra independiente de OFF: 24 códigos de marca blanca (prefijo 84) tomados de las fichas de Alcampo (Auchan / Producto Alcampo, 21 códigos) y Carrefour (3), que son las dos webs que publican el EAN.* Se validó el dígito de control de los 24 y se consultó OFF (`/api/v2/product/<code>`):
- En OFF: **16 de 24 (67 %)**; no están: **8 (33 %)**.
- En OFF **con lista de ingredientes: 7 de 24 (29 %)**; en OFF **sin ingredientes: 9 (38 %)**.
- Intervalos de confianza al 95 % (Wilson; la muestra es pequeña): en OFF 47–82 %; con ingredientes 15–49 %.
- Es decir: con solo OFF, ~7 de cada 10 productos de marca blanca no dan una lista utilizable. La clienta vio 4 de 10 en OFF (otros productos y otra muestra); aquí salen más en OFF (16 de 24) pero casi la mitad de ellos sin lista.
- Los 16 que están en OFF coinciden por nombre con la ficha del súper, lo que respalda que los códigos no estaban mal copiados. Los 8 que no están pasan el dígito de control, pero no tengo otra confirmación de que existan.
- Aparte, 8 códigos franceses de Auchan/Carrefour (prefijos 359/356, a la venta en España): los 8 están en OFF con ingredientes, pero 4 solo en francés → `ingredientsLang: 'fr'`.
- Limitaciones: no hay Mercadona, Dia ni Lidl (sus webs no publican el EAN, y no se pueden obtener sin scraping); la muestra no es aleatoria (helados y salsas pesan de más: 4 de los 8 ausentes son helados de la misma marca); n = 24.

*B. Dentro de OFF, parte de fichas con ingredientes por marca (API de búsqueda, `ingredients_n ≥ 1`, productos de España):* Hacendado 36 % de 9 345 · Dia 37 % de 2 544 · Lidl 26 % de 1 712 · Auchan/Alcampo 23 % de 2 663 · Carrefour 71 % de 8 078 · Eroski 16 % de 3 035 · Consum 43 % de 1 703 · Bonpreu 22 % de 1 820. (Productos con ingredientes ≠ productos con la lista bien transcrita; y el número de fichas de Hacendado no dice qué fracción del catálogo real cubre.) Coincide con la muestra A (Auchan/Alcampo: 23 % aquí frente a 4 de 21, 19 %, allí).

*C. ¿Encuentra la web lo que falta?* No he podido probar la herramienta real (aquí no hay clave), solo la búsqueda web de esta sesión, que es otro motor. Resultado, para dar una estimación honesta y no una promesa:
- **Por el número suelto: 0 de 11.** Busqué el EAN (solo, entrecomillado y con el tipo de producto) de productos cuyo EAN aparece impreso en la ficha de Alcampo: no devolvió ninguna de esas fichas. Los buscadores indexan muy mal los números de código de barras.
- **Por nombre y marca: sí.** Las fichas de Alcampo y Carrefour con ingredientes salieron en todas las búsquedas por nombre que probé (Alcampo: yogures, quesos en lonchas, salmón ahumado, mejillones, fiambre de pavo; Carrefour: tomate frito, galletas saladas, croquetas). Por eso se manda la pista de OFF.
- Estimación (no medida, hay que validarla en producción): de cada 100 códigos de marca blanca, ~29 salen completos de OFF; ~38 están en OFF sin lista y la web por nombre puede rescatar una buena parte (de 20 a 30 puntos si el súper publica la lista); ~33 no están en OFF y, sin nombre que buscar, la web rinde poco (de 0 a 8 puntos). **Cobertura útil esperable: de ~50 % a ~65 % con la web, frente a ~29 % solo con OFF.** El resto debe acabar en la foto de la etiqueta, que es la red de seguridad real. Mercadona (la que más compra la clienta) no se ha podido medir.

**Alternativas valoradas y descartadas** (valoradas por documentación y por lo que pude comprobar sin cuentas; precios y condiciones cambian: revisar antes de contratar nada)
- **Open Products Facts** (y Open Beauty/Pet Food Facts): misma infraestructura que OFF, pero es de productos no alimentarios; para comida no aporta nada que OFF no tenga.
- **UPCitemdb**: plan gratuito muy limitado (del orden de 100 consultas al día), centrado en UPC de EE. UU., sin lista de ingredientes estructurada; mala cobertura de marcas blancas españolas.
- **EAN-Search.org**: buena cobertura de códigos de varios países, pero solo nombre, categoría y país emisor: **sin ingredientes**; API de pago por volumen.
- **Go-UPC**: de pago desde el primer día (con prueba corta); datos centrados en EE. UU. y los ingredientes solo en parte; las condiciones no dejan guardar ni redistribuir los datos.
- **Barcode Lookup**: de pago; ingredientes en pocos productos y sobre todo de tiendas de EE. UU.; poca cobertura en España.
- **USDA FoodData Central (Branded Foods)**: gratis y con ingredientes, pero son productos del mercado de EE. UU.: cobertura en España casi nula.
- **Edamam**: base de alimentos con prueba gratuita y plan de pago; centrada en EE. UU./Reino Unido, sin buena cobertura de EAN españoles, y sus condiciones limitan guardar los datos.
- **Nutritionix**: productos de marca de EE. UU. y Canadá, de pago; sin cobertura en España.
- **Scraping directo de supermercados** (Mercadona, Carrefour, Dia, etc.): las condiciones de uso de esas webs prohíben la extracción automática; Mercadona no publica el EAN y su API no es oficial; Carrefour devolvió 403 a las peticiones automáticas que probé (también a `WebFetch`); además se rompe con cualquier cambio de la web. Descartado por legalidad y fragilidad. La búsqueda web de Anthropic sí lee esas fichas, pero como una búsqueda normal, sin saltarse nada.
- Alternativa que **no** descarto para el futuro: pedir la ficha al propio súper o a GS1 España (Verified by GS1 / datos de producto por acuerdo comercial). Requiere contrato; solo tendría sentido si la web sigue sin llegar.

**Qué debe probar quien despliega** (con la clave en producción): ver el informe final de Beto-infra (lista de códigos y qué esperar).
