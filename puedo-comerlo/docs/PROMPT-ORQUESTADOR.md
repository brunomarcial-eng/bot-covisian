# Prompt para la siguiente sesión — «¿Puedo comerlo?», de prototipo a app publicada

Copia todo lo que hay debajo de la línea en un chat nuevo de Claude Code sobre el repositorio
`brunomarcial-eng/bot-covisian`, con el modo **Auto** elegido en el desplegable junto al cuadro de texto.

---

Eres el **ORQUESTADOR** de un equipo de agentes. Tu misión: entregar «¿Puedo comerlo?» publicada en
una URL pública, probada de punta a punta y con una guía de uso, sin pedir nada a la usuaria salvo
los bloqueos de la sección «Lo único que puede parar el trabajo». Trabajas de forma autónoma y
continuada: no preguntes, no pidas confirmaciones, no te quedes esperando. Si una decisión no está
aquí, elige la opción más prudente para la usuaria final, anótala en `docs/DECISIONES.md` y sigue.

## 0. Punto de partida (léelo antes de nada)

- Repo `brunomarcial-eng/bot-covisian`, carpeta `puedo-comerlo/`. Parte de la rama
  `ccr-011cf9ec-7sglha` (si te han asignado otra rama, fusiona esa primero en la tuya y trabaja en la tuya).
- Lee enteros: `puedo-comerlo/docs/especificacion.md` (encargo literal, manda sobre todo),
  `puedo-comerlo/docs/CONTRATO.md` (arquitectura e interfaces), `puedo-comerlo/README.md`,
  `puedo-comerlo/tests/e2e/README.md`.
- Estado verificado al cerrar la sesión anterior:
  - App web sin build (HTML + ES modules), motor de reglas local determinista, 72 alimentos.
  - `npm test` → 93 tests en verde. `node tests/e2e/run.cjs` → 11 escenarios Playwright en verde.
  - `/api/leer` (función estilo Vercel) solo transcribe fotos con Claude (`claude-opus-5-5`);
    sin `ANTHROPIC_API_KEY` responde 503 y el navegador cae al OCR local (tesseract).
  - NO publicada todavía. Camino de visión real nunca probado con clave. Nunca probada en iPhone real.
- Primer paso obligatorio: `cd puedo-comerlo && npm install && npm test && node tests/e2e/run.cjs`.
  Si algo no está en verde, el primer nodo del grafo es arreglarlo.

## 1. Reglas de autonomía (para ti y para cada agente)

1. No preguntes a la usuaria. Decide con la sección 5 («Decisiones por defecto») y sigue.
2. Nunca inventes resultados: si algo no se ha podido comprobar, se dice como «sin comprobar».
3. Cada agente toca SOLO sus archivos (columna «Escribe» del grafo). Si necesita un cambio en un
   archivo ajeno, lo pide al orquestador con el cambio exacto; el orquestador lo asigna.
4. Ningún agente hace commit ni push: lo hace solo el orquestador, al cerrar cada oleada,
   tras `npm test` en verde. Mensajes de commit en español, descriptivos.
5. Nada de datos clínicos, cuentas, analítica, cookies ni servidor de usuarios (ver especificación).
   La imagen nunca se guarda ni se registra.
6. Nunca escribas claves en el código, en el chat ni en commits. La clave de Anthropic solo vive en
   las variables de entorno de Vercel.
7. Si un agente falla por límite de uso o se corta, el orquestador lo reanuda donde lo dejó
   (SendMessage al mismo agente), no lanza uno nuevo.
8. Cada nodo termina con un informe corto: qué ha hecho, cómo lo ha comprobado (comando y resultado),
   qué queda sin comprobar.

## 2. Grafo de trabajo

Nodos = tareas con dueño. Aristas = dependencias («→» significa «desbloquea a»). El orquestador
lanza en paralelo todos los nodos cuyas dependencias estén cerradas, espera sus informes, verifica
la condición de salida y, si falla, devuelve el nodo a su dueño con el fallo concreto (arista de
vuelta) hasta que pase. Máximo 3 vueltas por nodo; a la cuarta, el orquestador lo resuelve él mismo.

```
                 ┌──────────── N0 Base verde (orquestador) ────────────┐
                 ▼                ▼                ▼                   ▼
          N1 Contenido      N3 Publicación    N4 PWA y móvil      N5 Guía de uso (borrador)
          (Laura)           (Beto-infra)      (Michi)             (Laura)
                 │                │                │                   │
                 ▼                │                │                   │
          N2 Motor (Beto) ◄───────┘ (N2 no depende de N3; solo de N1)  │
                 │                │                │                   │
                 └───────┬────────┴────────┬───────┘                   │
                         ▼                 ▼                           │
                  N6 QA local         N7 QA en producción ◄── N3       │
                  (Alfred)            (Alfred-prod)                    │
                         │                 │                           │
                         └────────┬────────┘                           │
                                  ▼                                    ▼
                        N8 Entrega (orquestador) ◄──────── N5 Guía final (capturas reales)
            Aristas de vuelta: N6/N7 fallo → dueño del archivo culpable → N6/N7 otra vez.
```

| Nodo | Dueño | Depende de | Escribe | Hecho cuando |
|---|---|---|---|---|
| N0 Base verde | Orquestador | — | lo que haga falta para volver a verde | `npm test` y e2e en verde en la rama de trabajo |
| N1 Contenido | Laura (PO) | N0 | `src/engine/foods.js` | Añadidos: bebidas vegetales (avena, almendra, soja, arroz), salchichas cocidas/frescas, morcilla, croquetas (genérico, con cuidado), anchoas en salazón, gulas/surimi, embutido vegetal, kombucha (mejor no: puede llevar alcohol). Mismo formato, fuentes solo AESAN / Ministerio de Sanidad, una frase, sin «evitar» ni «seguro». Su script de comprobación de la guía pasa. |
| N2 Motor | Beto (Lead Dev) | N1 | `src/engine/lexicon.js`, `classify.js`, `tests/engine.test.js` | Los nuevos alimentos se emparejan por palabra completa sin colisiones; tests nuevos para cada uno; `npm test` verde. |
| N3 Publicación | Beto-infra | N0 | `vercel.json`, `.vercelignore`, `api/leer.js` (solo límite de uso), `docs/DESPLIEGUE.md` | Proyecto Vercel en el equipo `brunomarcial-3195s-projects` (MCP de Vercel), raíz `puedo-comerlo`, sin paso de build, producción desde la rama de entrega. Límite de uso en `/api/leer` (p. ej. regla de firewall de Vercel por IP, o contador en memoria de 20 fotos/10 min por IP) con test. `curl` a la URL: `/` 200, `/package.json` y `/docs/…` 404, `/api/leer` sin clave 503 o con clave 400 ante cuerpo vacío. La URL pública queda en `docs/DESPLIEGUE.md`. |
| N4 PWA y móvil | Michi (UX/UI) | N0 | `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js` (nuevo), `src/app.js`, `src/ui/*` | Service worker que cachea la app y la guía (la búsqueda y las fichas funcionan sin conexión; foto y código avisan con calma de que necesitan conexión). Instalable en iOS y Android (iconos PNG 192/512, `apple-touch-icon`). Revisión a 360×740, 390×844 y 430×932 con perfil de iPhone de Playwright: nada cortado, teclado numérico en el código, sin scroll horizontal. `server.js` debe servir `sw.js` (pide el cambio al orquestador). |
| N5 Guía de uso | Laura (PO) | N0 (borrador) · N7 (final) | `docs/GUIA-DE-USO.md`, `docs/capturas/*.png` | Guía en español llano para la usuaria: qué es y qué no, primer arranque, comer fuera (foto y escrito), súper (código y etiqueta), lista, historial, ajustes y borrar datos, privacidad, cómo instalarla en el móvil, qué significa cada color, límites. Con capturas reales de la URL publicada. |
| N6 QA local | Alfred (QA) | N2, N4 | `tests/e2e/*` | 11 escenarios + nuevos: alimentos de N1, modo sin conexión (service worker), perfil iPhone. Todo verde. Fallos → arista de vuelta al dueño. |
| N7 QA en producción | Alfred-prod | N3, N2, N4 (desplegados) | `tests/e2e/*` (modo `BASE_URL=…`) | La batería e2e entera contra la URL pública. Si hay `ANTHROPIC_API_KEY` en Vercel: `carta.jpg` y `etiqueta.jpg` leídas por visión (`via: 'vision'`), niveles correctos y la foto no aparece en ningún log. Si no hay clave: anotarlo como «sin comprobar» y verificar la caída al OCR. |
| N8 Entrega | Orquestador | N6, N7, N5 | `README.md`, `docs/ENTREGA.md` | Todo commiteado y pusheado; PR abierta contra `main` con resumen; `docs/ENTREGA.md` con: URL, cómo probarla en 5 minutos (guion paso a paso), qué está comprobado y qué no, decisiones tomadas, carencias conocidas. Mensaje final a la usuaria: URL + guion de prueba + lo único que tiene que hacer ella. |

Paralelismo: oleada 1 = N1, N3, N4, N5 (borrador) a la vez; oleada 2 = N2 en cuanto acabe N1;
oleada 3 = N6 y N7 a la vez; oleada 4 = N5 final y N8.

## 3. Cómo lanzar a cada agente

Cada agente se lanza con la herramienta Agent en segundo plano, con un prompt que incluya:
su rol y nombre, el nodo, las rutas de `especificacion.md` y `CONTRATO.md`, la columna «Escribe»
(y la prohibición de tocar nada más), la condición «Hecho cuando» literal, las reglas de la
sección 1 y el formato del informe final. El orquestador no repite trabajo de un agente activo;
mientras espera, revisa los informes que llegan, ejecuta las comprobaciones y prepara la oleada siguiente.

## 4. Lo único que puede parar el trabajo (y qué hacer)

- Falta `ANTHROPIC_API_KEY` en Vercel → NO pares: publica igual (las fotos caen al OCR local),
  marca la visión real como «sin comprobar» y dilo en la entrega con el paso exacto para añadirla.
- El MCP de Vercel no responde o no tiene permiso → documenta en `docs/DESPLIEGUE.md` el
  despliegue paso a paso, deja todo lo demás terminado y dilo en la entrega.
- Límite de uso de la API → reanuda los agentes cuando se restablezca; no reinicies desde cero.

## 5. Decisiones por defecto (úsalas sin preguntar)

- Hosting: Vercel, equipo `brunomarcial-3195s-projects`, subdominio `*.vercel.app` (sin dominio propio).
- URL pública sin contraseña, con límite de uso en `/api/leer` y comprobación de mismo origen.
- Modelo de visión: `claude-opus-5-5` con esfuerzo bajo (ya implementado). No cambiar.
- «Pizza de jamón york» y otros fiambres de bandeja cocinados en el plato: siguen «Mejor no»
  (la especificación lo dice literal). Anotarlo como decisión revisable.
- Lo que la guía no reconoce sigue «No estoy segura». No se inventan niveles.
- Sin analítica, sin cookies, sin servicios externos nuevos más allá de los ya usados
  (Open Food Facts, jsdelivr para tesseract/ZXing, Google Fonts). Si N4 puede servir las fuentes
  desde la propia app para funcionar sin conexión, mejor.
- Idioma de todo: español de España. Tono adulto y sereno.

## 6. Criterio de terminado (todo cierto a la vez)

1. URL pública que abre en móvil y funciona.
2. `npm test` y e2e en verde en local y e2e en verde contra la URL pública.
3. El «Criterio de hecho» de `especificacion.md` se cumple en la URL pública.
4. `docs/GUIA-DE-USO.md` y `docs/ENTREGA.md` escritos, con capturas reales.
5. Todo commiteado, pusheado y con PR abierta.
6. Mensaje final corto a la usuaria: URL, guion de prueba de 5 minutos, lo comprobado, lo que no,
   y lo único que tiene que hacer ella (si falta algo).
