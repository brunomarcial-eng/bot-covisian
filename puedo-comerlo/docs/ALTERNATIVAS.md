# Alternativas: instalarla en el móvil y crecer sin que el gasto recaiga en ti

## 1. Cómo tenerla en el móvil (de más sencilla a más compleja)

| Opción | Qué es | Coste | Tiempo | Recomendación |
|---|---|---|---|---|
| **A. App web instalable (PWA)** | Abres el enlace y la añades a la pantalla de inicio. Sale con su icono, a pantalla completa y sin barra del navegador, como una app. | 0 € | Ya hecho en esta entrega | **La recomendada ahora.** |
| B. Solo el enlace o un QR | Mandas el enlace por WhatsApp o imprimes un QR. Se abre en el navegador. | 0 € | Inmediato | Sirve para probar, pero cada vez hay que abrir el enlace. |
| C. APK para Android (TWA) | Un archivo .apk generado con PWABuilder que envuelve la misma web. Se instala «a mano» (permitiendo orígenes desconocidos) o se publica en Google Play. | 0 € (Play: 25 $ una vez) | 1 tarde | Si alguien de Android insiste en tener un archivo. No sirve para iPhone. |
| D. App nativa (Capacitor) en App Store y Google Play | La misma web dentro de una app real. | Apple: 99 $/año; Google: 25 $ | 1–2 semanas con revisiones | Solo si la abres al público. |
| ~~WebGL~~ | No es una forma de instalar: es una tecnología para gráficos 3D en el navegador. | — | — | No aplica. |

**Cómo se instala la opción A** (también está explicado dentro de la app, en Ajustes → «Instalar en el móvil»):
- **iPhone:** abre el enlace en **Safari**, toca el botón Compartir (el cuadrado con la flecha hacia arriba) → «Añadir a pantalla de inicio» → «Añadir».
- **Android:** abre el enlace en **Chrome**, toca el menú ⋮ → «Instalar aplicación» (o «Añadir a pantalla de inicio»).

Así lo más parecido a una app sin pasar por tiendas ni pagar nada es la PWA, que es exactamente lo que dices: «añadir a la pantalla de inicio».

## 2. ¿Railway en vez de Vercel?

Las dos sirven. La diferencia **no está en los tokens**: el gasto de la API de Claude va siempre a la
clave que pongas, la alojes donde la alojes.

| | Vercel (lo que usamos) | Railway (donde tienes el bot) |
|---|---|---|
| Coste de alojamiento | Plan gratuito (uso personal, no comercial) | Desde ~5 $/mes |
| Encaje con esta app | Perfecto: web estática + una función que solo se ejecuta al hacer una foto | Bien: arrancaría `node server.js` como un servicio siempre encendido |
| Mantenimiento | Ninguno | Ninguno, pero el servicio está siempre encendido |
| Cuándo elegirlo | Ahora (familia y amigos) | Si quieres tenerlo todo en el mismo sitio que el bot |

## 3. Que el gasto de la API no te afecte

**Ahora, para familia y amigos (unas 5 personas, uso esporádico):**
1. En console.anthropic.com crea un **workspace solo para esta app** con un **límite de gasto mensual**
   (por ejemplo 10 $) y una **clave solo para ella**. Si se pasa, deja de leer fotos con Claude y la app
   cae al lector local: no se rompe ni te llega una factura sorpresa.
2. La app ya limita el uso: como mucho **20 fotos cada 10 minutos por persona** y un tope diario.
3. Solo se gasta al **hacer una foto**. Buscar un plato, escanear un código o mirar la guía no gasta nada,
   porque las reglas van en el móvil.
4. El modelo se cambia con una variable (`VISION_MODEL`) sin tocar el código: Sonnet 5.5 o Haiku 5.5
   bajan el coste por foto.

Cuenta orientativa: con Sonnet 5.5 (el elegido), menos de 1 céntimo por foto; 5 personas haciendo 3 fotos a la semana
son unas 60 fotos al mes, **menos de 1 € al mes**.

**Si un día se abre a más gente (con invitación):**
1. **Códigos de invitación** y cuota por persona (por ejemplo, 30 fotos al mes), guardando solo un
   contador anónimo por código. Seguiría sin cuentas ni datos de salud.
2. **Primero el lector local, Claude solo si hace falta**: el OCR del móvil intenta leer la carta y solo si
   sale mal se envía a Claude. Recorta mucho el número de llamadas.
3. **Caché de cartas**: la carta de un mismo restaurante fotografiada por varias personas se lee una vez
   (huella de la imagen o del texto, sin guardar la foto).
4. **Modelo barato por defecto** (Haiku 5.5) y uno mejor solo cuando la lectura sale dudosa.
5. **Que no lo pagues tú**: un patrocinio, una suscripción pequeña o un modelo «trae tu propia clave»
   para quien quiera fotos ilimitadas. Esto ya es una decisión de negocio, para cuando toque.
