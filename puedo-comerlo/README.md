# ¿Puedo comerlo?

Web app móvil, en español de España, para consultar alimentos durante el embarazo al comer fuera o al hacer la compra.
Da una respuesta corta con un semáforo («Sí», «Con cuidado», «Mejor no», «No estoy segura») y explica el motivo solo
si se pide.

Es una **guía orientativa, no médica**. No tiene a ningún profesional sanitario detrás y no sustituye el consejo de la
matrona, el ginecólogo o el médico. No da consejo personalizado.

## Privacidad

- No pide datos clínicos: ni semana de embarazo, ni fecha de parto, ni analíticas.
- No hay cuentas ni servidor de usuarios. Lo que la persona configura (alergias, otra cosa que no quiera comer, dietas, lista,
  historial y favoritos) se guarda solo en el navegador de su móvil (`localStorage`). Si borra los datos del
  navegador, se pierde. La app no lo ve.
- La foto de una carta o de una etiqueta se envía solo para transcribir el texto y no se guarda. El modelo de visión
  no decide nada: devuelve los nombres y los ingredientes que lee.
- El semáforo lo calcula siempre un motor de reglas fijas que funciona en el propio móvil (`src/engine/`), a partir
  de ese texto y del perfil guardado.
- Los códigos de barras se consultan en Open Food Facts. Si el producto no está o no trae ingredientes, `api/producto.js`
  lo busca en internet con Claude: solo viajan el código y, si se conoce, el nombre y la marca. Los datos de internet no
  dan nunca «Sí» sin confirmarlos con la foto de la etiqueta.

## Arrancar en local

Necesitas Node 20 o posterior.

```sh
npm install
ANTHROPIC_API_KEY=… npm start
```

Abre http://localhost:5173 (mejor en el móvil o con la vista móvil del navegador).

Sin `ANTHROPIC_API_KEY` la app funciona igual, pero la lectura de fotos cae al OCR local (tesseract.js en el
navegador), que es menos fiable; esas lecturas se marcan como inciertas, y la búsqueda de productos en internet
(`/api/producto`) no está disponible: queda Open Food Facts y la foto de los ingredientes.

## Tests

```sh
npm test
```

Ejecuta los tests con `node --test` (el motor de reglas es puro y se importa desde Node).

## Desplegar

No hay paso de build: son HTML, CSS y módulos ES nativos.

1. Publica la carpeta del proyecto en cualquier hosting estático.
2. Despliega `api/leer.js` y `api/producto.js` como funciones sin estado al estilo Vercel (`POST /api/leer` y
   `POST /api/producto`).
3. Configura la variable de entorno `ANTHROPIC_API_KEY` en esas funciones. Sin ella, `/api/leer` y `/api/producto` responden 503 y la app
   usa el OCR local y Open Food Facts.

En Vercel, con `puedo-comerlo/` como carpeta raíz del proyecto, se sirven los estáticos y `api/leer.js` y `api/producto.js` se
reconocen como funciones.

## Estructura

```
puedo-comerlo/
  index.html, styles.css, manifest.webmanifest, icon.svg   interfaz
  src/app.js, src/ui/                                      pantallas y router por hash
  src/store.js                                             todo lo que se guarda en el móvil (localStorage)
  src/engine/                                              motor de reglas: puro, determinista, sin red
    levels.js                                              niveles del semáforo
    foods.js                                               base de alimentos y sus fichas
    index.js y resto                                       normalizar, buscar y clasificar
  src/capture/                                             cámara, compresión, lectura de fotos, códigos, Open Food Facts
  api/leer.js                                              función sin estado: foto → transcripción en JSON
  api/producto.js                                          función sin estado: código de barras → ficha del producto (búsqueda web)
  server.js                                                servidor de desarrollo (estáticos + /api/leer)
  tests/                                                   tests del motor y pruebas de extremo a extremo
  docs/especificacion.md                                   el encargo original
  docs/CONTRATO.md                                         arquitectura e interfaces
```

## Fuentes

Los textos de las fichas citan solo estas fuentes:

- AESAN (Agencia Española de Seguridad Alimentaria y Nutrición): embarazo y alimentación, listeria, mercurio y
  cafeína.
- Notas del Ministerio de Sanidad.

Cuando la app no reconoce un plato, lo dice y la fuente es la propia app.

---

Orientativa. No sustituye el consejo de tu matrona, ginecólogo o médico.
