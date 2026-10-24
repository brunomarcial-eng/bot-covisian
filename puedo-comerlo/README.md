# ¿Puedo comerlo?

Web app móvil, en español de España, para consultar alimentos durante el embarazo al comer fuera o al hacer la compra.
Da una respuesta corta con un semáforo («Sí», «Con cuidado», «Mejor no», «No estoy segura») y explica el motivo solo
si se pide.

Es una **guía orientativa, no médica**. No tiene a ningún profesional sanitario detrás y no sustituye el consejo de la
matrona, el ginecólogo o el médico. No da consejo personalizado.

## Privacidad

- No pide datos clínicos: ni semana de embarazo, ni fecha de parto, ni analíticas.
- No hay cuentas ni servidor de usuarios. Lo que la persona configura (embutidos, alergias, forma de comer, lista,
  historial y favoritos) se guarda solo en el navegador de su móvil (`localStorage`). Si borra los datos del
  navegador, se pierde. La app no lo ve.
- La foto de una carta o de una etiqueta se envía solo para transcribir el texto y no se guarda. El modelo de visión
  no decide nada: devuelve los nombres y los ingredientes que lee.
- El semáforo lo calcula siempre un motor de reglas fijas que funciona en el propio móvil (`src/engine/`), a partir
  de ese texto y del perfil guardado.
- Los códigos de barras se consultan en Open Food Facts.

## Arrancar en local

Necesitas Node 20 o posterior.

```sh
npm install
ANTHROPIC_API_KEY=… npm start
```

Abre http://localhost:5173 (mejor en el móvil o con la vista móvil del navegador).

Sin `ANTHROPIC_API_KEY` la app funciona igual, pero la lectura de fotos cae al OCR local (tesseract.js en el
navegador), que es menos fiable; esas lecturas se marcan como inciertas.

## Tests

```sh
npm test
```

Ejecuta los tests con `node --test` (el motor de reglas es puro y se importa desde Node).

## Desplegar

No hay paso de build: son HTML, CSS y módulos ES nativos.

1. Publica la carpeta del proyecto en cualquier hosting estático.
2. Despliega `api/leer.js` como función sin estado al estilo Vercel (`POST /api/leer`).
3. Configura la variable de entorno `ANTHROPIC_API_KEY` en esa función. Sin ella, `/api/leer` responde 503 y la app
   usa el OCR local.

En Vercel, con `puedo-comerlo/` como carpeta raíz del proyecto, se sirven los estáticos y `api/leer.js` se reconoce
como función.

## Estructura

```
puedo-comerlo/
  index.html, styles.css, manifest.webmanifest, icon.svg   interfaz
  src/app.js, src/ui/                                      pantallas y router por hash
  src/store.js                                             todo lo que se guarda en el móvil (localStorage)
  src/engine/                                              motor de reglas: puro, determinista, sin red
    levels.js                                              niveles del semáforo
    foods.js                                               base de alimentos de la guía
    index.js y resto                                       normalizar, buscar y clasificar
  src/capture/                                             cámara, compresión, lectura de fotos, códigos, Open Food Facts
  api/leer.js                                              función sin estado: foto → transcripción en JSON
  server.js                                                servidor de desarrollo (estáticos + /api/leer)
  tests/                                                   tests del motor y pruebas de extremo a extremo
  docs/especificacion.md                                   el encargo original
  docs/CONTRATO.md                                         arquitectura e interfaces
```

## Fuentes

Los textos de la guía citan solo estas fuentes:

- AESAN (Agencia Española de Seguridad Alimentaria y Nutrición): embarazo y alimentación, listeria, mercurio y
  cafeína.
- Notas del Ministerio de Sanidad.

Cuando la app no reconoce un plato, lo dice y la fuente es la propia app.

---

Orientativa. No sustituye el consejo de tu matrona, ginecólogo o médico.
