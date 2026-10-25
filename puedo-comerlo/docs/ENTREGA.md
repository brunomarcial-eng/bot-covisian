# Entrega — «¿Puedo comerlo?»

**Dirección:** https://puedo-comerlo.vercel.app (25-10-2026, última publicación: pantalla entera de color, portada con la mesa y clave de Anthropic activa)

**Última versión:** 25-10-2026, rediseño de la interfaz y arranque de 4 pasos (sin la pregunta de embutidos). `docs/GUIA-DE-USO.md` y sus capturas están al día con esa versión.

## Comprobado
- 116 tests del motor y de la captura en verde (`npm test`).
- 11 escenarios de extremo a extremo en verde **contra la dirección publicada**: arranque sin datos
  clínicos, pie y navegación, «sushi» → Mejor no, «tortilla» → Con cuidado, ficha y lista, foto de carta
  (lectura local) e imagen ilegible con mensaje honesto, cámara y sin cámara, súper con Open Food Facts
  real (Nutella con alergias), persistencia y borrado, diseño, lenguaje del semáforo en las 140 fichas
  y consola sin errores.
- Archivos internos (`package.json`, `docs/`, `tests/`, credenciales) responden 404 en producción.
- 293 platos y productos habituales: ninguno queda en «No estoy segura».

## Sin comprobar
- Lectura de fotos con Claude (falta `ANTHROPIC_API_KEY` en Vercel). Sin ella, las fotos se leen en el
  propio móvil y los platos salen como lectura aproximada.
- Un iPhone y un Android reales (probado con perfiles de móvil en Chromium).

## Lo que tiene que hacer la dueña
1. console.anthropic.com: workspace propio con límite de gasto mensual y una clave solo para esta app.
2. vercel.com → proyecto `puedo-comerlo` → Settings → Environment Variables → `ANTHROPIC_API_KEY`
   (Production y Preview) → Save → Deployments → último → Redeploy.
3. Abrir la dirección en el móvil, instalarla (Ajustes → «Instalar en el móvil») y seguir el guion de
   prueba de 5 minutos de `docs/GUIA-DE-USO.md`.

## Decisiones
Todas en `docs/DECISIONES.md`. Las principales: lo cocinado dentro del plato sale «Sí»; el york frío de
bandeja, «Mejor no»; modelo de lectura Sonnet 5.5; límite de 20 fotos cada 10 minutos por persona.

## Actualización 25-10-2026 (tarde)
- Clave `ANTHROPIC_API_KEY` activa en Vercel (Production y Preview). Comprobado en la dirección pública: la carta de ejemplo se lee con Claude Sonnet 5.5 en unos 4 s, 11 platos, sin lectura aproximada y sin colar el nombre del local.
- 11 escenarios e2e y 396 comprobaciones en verde contra la dirección publicada; 125 tests del motor y la captura en verde.
- Pendiente de la dueña: probarla en un iPhone y un Android reales (solo probada con pantallas de móvil simuladas).
