# Entrega — «¿Puedo comerlo?»

**Dirección:** https://puedo-comerlo.vercel.app

**Última versión:** 26-10-2026.

## Qué incluye esta versión
- Arranque de 4 pasos (portada con la mesa de 12 platos, alergias e intolerancias, dietas y restricciones,
  privacidad). Ya no se pregunta por embutidos: la app aplica siempre la misma regla prudente.
- Respuestas con la pantalla entera del color del veredicto, dibujo del tipo de comida, destello en «Sí», cruz
  en «Mejor no» y «?» en las dudas (se quita con «Reducir movimiento» del móvil).
- «Sí» con avisos cortos («Ojo con esto»); «Con cuidado» solo cuando depende de un dato que no se ve, con una
  «Pregunta» para el camarero.
- Foto de la carta leída con Claude (Sonnet 5.5) en unos 4 segundos, sin avisos de lectura aproximada.
- Escaneo guiado en el Súper: «Me faltan los ingredientes», foto de los ingredientes y «Lo que he mirado en
  la etiqueta», tema por tema. Si el producto no está en Open Food Facts, búsqueda en internet (10–20 s, con
  «Cancelar»; límite de 6 por persona cada 10 minutos); lo de internet nunca sale «Sí» hasta comprobarlo con
  la etiqueta.
- «Las claves del embarazo»: 8 temas (listeria, toxoplasmosis, mercurio, huevo crudo, pescado crudo, alcohol,
  cafeína, hierbas e infusiones), enlazados desde las respuestas.
- Lista de la compra: «Comprado», «Pendiente», «En el carro», «Compartir la lista» (solo lo pendiente, sin
  semáforo) y «Vaciar lo comprado».
- `docs/GUIA-DE-USO.md` y sus capturas están al día con esta versión (capturas hechas sobre la dirección
  publicada).

## Comprobado
- 247 tests del motor y de la captura en verde (`npm test`).
- 18 escenarios de extremo a extremo en verde (`tests/e2e/run.cjs`).
- Foto de la carta de ejemplo en la dirección publicada: 11 platos leídos con Claude en unos segundos (6–8 s desde que
  se elige la foto), sin lectura aproximada.
- Archivos internos (`package.json`, `docs/`, `tests/`, credenciales) responden 404 en producción.

## Sin comprobar
- Un iPhone y un Android reales (probado solo con pantallas de móvil simuladas en Chromium).
- La cobertura de códigos de barras con productos reales de marca blanca: Open Food Facts trae ingredientes en
  unos 3 de cada 10 de los que se probaron, y Mercadona no publica sus códigos en la web. La búsqueda en
  internet y la foto de los ingredientes cubren el resto, pero no está medido en producción.

## Lo que tiene que hacer la dueña
1. Abrir la dirección en el móvil, instalarla (Ajustes → «Instalar en el móvil») y seguir el guion de
   prueba de 5 minutos de `docs/GUIA-DE-USO.md`.
2. Vigilar el gasto en console.anthropic.com (workspace propio con límite mensual): la lectura de fotos y la
   búsqueda de productos en internet usan la clave `ANTHROPIC_API_KEY` de Vercel.

## Decisiones
Todas en `docs/DECISIONES.md`. Las principales: lo cocinado dentro del plato sale «Sí»; el fiambre de bandeja
en frío, «Mejor no»; «Sí» significa que se puede tal como se sirve normalmente; modelo de lectura Sonnet 5.5;
límite de 20 fotos cada 10 minutos por persona.
