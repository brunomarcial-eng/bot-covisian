# Cómo publicar y mantener «¿Puedo comerlo?»

Guía en lenguaje llano. No hace falta saber programar: todo se hace desde la web de Vercel
(vercel.com) y desde la consola de Anthropic (console.anthropic.com).

---

## 1. Dirección pública

**Todavía no está publicada.** La conexión automática que usamos no tiene permiso para crear proyectos
en tu cuenta de Vercel, así que el primer paso (crear el proyecto) tienes que darlo tú, una sola vez.
Son unos cinco minutos y está explicado en el apartado 2.

Cuando lo hagas, la dirección será la que te enseñe Vercel al terminar. Normalmente:

**https://puedo-comerlo.vercel.app**

(Si ese nombre ya estuviera cogido, Vercel le añade algo detrás; la verás en la pantalla del proyecto,
arriba, en «Domains».)

---

## 2. Publicarla por primera vez (una sola vez)

1. Entra en **vercel.com** con tu cuenta (equipo «brunomarcial-3195's projects»).
2. Pulsa **Add New… → Project**.
3. En «Import Git Repository» elige **GitHub**. Si te lo pide, pulsa **Install / Configure GitHub App**
   y da acceso al repositorio **brunomarcial-eng/bot-covisian** (basta con ese). Luego pulsa **Import**
   junto a ese repositorio.
4. En la pantalla de configuración:
   - **Project Name**: `puedo-comerlo`
   - **Root Directory**: pulsa **Edit** y elige la carpeta **`puedo-comerlo`**.
   - **Framework Preset**: **Other**.
   - Abre **Build and Output Settings**:
     - **Build Command**: activa el interruptor «Override» y **déjalo vacío**.
     - **Output Directory**: activa «Override» y escribe un punto: **`.`**
     - **Install Command**: no lo toques.
   - (Opcional) **Environment Variables**: puedes añadir aquí ya la clave, como se explica en el
     apartado 3 (nombre `ANTHROPIC_API_KEY`).
5. Pulsa **Deploy** y espera a que salga el confeti.
6. Ahora di a Vercel qué rama es la «buena»: **Settings → Environments → Production → Branch Tracking**
   y escribe **`ccr-011cf9ec-7sglha`** → **Save**. Después ve a **Deployments**, abre el último y pulsa
   **⋯ → Redeploy**.

A partir de aquí, cada cambio que se suba a esa rama se publica solo.

> Si prefieres no conectar GitHub, también vale: cuando el proyecto exista, el equipo técnico puede
> publicarlo desde fuera subiendo los archivos directamente.

---

## 3. Añadir la clave para que lea las fotos con Claude

Sin clave la app funciona igual, pero las fotos de cartas y etiquetas se leen «a ojo» con un lector
sencillo dentro del móvil (más lento y menos fiable). Con la clave, las lee Claude.

1. En **console.anthropic.com** crea una clave (ver apartado 4: mejor en un espacio propio).
   Cópiala; empieza por `sk-ant-`. **No la mandes por correo ni por chat a nadie.**
2. En **vercel.com** abre el proyecto **puedo-comerlo**.
3. Ve a **Settings → Environment Variables**.
4. Rellena:
   - **Key**: `ANTHROPIC_API_KEY`
   - **Value**: pega tu clave.
   - **Environments**: marca **Production** y **Preview**.
5. Pulsa **Save**.
6. Ve a **Deployments**, abre el **último** y pulsa **⋯ → Redeploy** (la clave solo se aplica al volver
   a publicar).

**Cómo saber que funciona:** abre la app en el móvil, entra en «Fuera», haz una foto a una carta y espera.
Si **no** aparece el aviso «He leído la carta de forma aproximada. Revisa los nombres.», está leyendo con
Claude. Si aparece, todavía está usando el lector sencillo: revisa que el nombre de la clave esté bien
escrito y que hiciste el «Redeploy».

---

## 4. Recomendación: un espacio y un límite de gasto solo para esta app

Para que el gasto de esta app no se mezcle con tu otro uso y nunca te dé un susto:

1. En **console.anthropic.com → Settings → Workspaces** crea un workspace nuevo, por ejemplo
   «Puedo comerlo».
2. Dentro de ese workspace, pon un **límite de gasto mensual** (por ejemplo **10 $**). Si se alcanza,
   la app no se rompe: simplemente vuelve a leer las fotos con el lector sencillo hasta el mes siguiente.
3. Crea la clave **dentro de ese workspace** y úsala solo para esta app (apartado 3).

Con 10 $ al mes, al precio del modelo por defecto, da para unas 600 fotos al mes (ver tabla abajo).

---

## 5. Cambiar el modelo y cuánto cuesta cada foto

Por defecto la app usa **Claude Sonnet 5.5** (lo elegiste tú: lee muy bien y cuesta la mitad que Opus). Se puede cambiar sin tocar nada más:

1. **Settings → Environment Variables → Add**:
   - **Key**: `VISION_MODEL`
   - **Value**: uno de estos tres, escrito exactamente así:
     - `claude-sonnet-5-5` (por defecto, buen equilibrio)
     - `claude-opus-5-5` (el que mejor lee, el doble de caro)
     - `claude-haiku-5-5` (muchísimo más barato, algo menos fino con cartas difíciles)
   - **Environments**: Production y Preview → **Save**.
2. **Deployments → último → ⋯ → Redeploy**.

Si se escribe mal o se pone otro nombre, la app usa Sonnet 5.5 sin dar error. No hace falta crear la variable si te vale Sonnet.

**Coste orientativo** (una foto reducida a 1.280 px ≈ 1.600 «tokens» de entrada y ~500 de salida):

| Modelo | Por foto | Por 1.000 fotos | Fotos con 10 $/mes |
|---|---|---|---|
| Opus 5.5 | ≈ 1,6 céntimos de $ | ≈ 16,40 $ | ≈ 600 |
| Sonnet 5.5 (por defecto) | ≈ 0,8 céntimos de $ | ≈ 8,20 $ | ≈ 1.200 |
| Haiku 5.5 | ≈ 0,04 céntimos de $ | ≈ 0,41 $ | ≈ 24.000 |

(Cuentas: Opus 1.600 × 4 $ + 500 × 20 $ por millón = 0,0164 $; Sonnet 1.600 × 2 $ + 500 × 10 $ = 0,0082 $;
Haiku 1.600 × 0,10 $ + 500 × 0,50 $ = 0,00041 $. Es una estimación: una carta muy larga puede costar algo
más.)

**Topes de uso ya incluidos** (para que nadie gaste de más por error o por abuso): como mucho
**20 fotos por persona cada 10 minutos** y **300 fotos al día**. Si se pasa, esa foto se lee con el lector
sencillo del móvil; no sale ningún error. Son topes aproximados (Vercel puede tener varias copias de la
app funcionando a la vez y cada una cuenta por su lado), por eso el límite de gasto del apartado 4 sigue
siendo la red de seguridad de verdad.

---

## 6. Si deja de funcionar

- **La app no abre**: en vercel.com → proyecto **puedo-comerlo** → **Deployments**. El de arriba debe
  decir **Ready** (verde). Si dice **Error**, ábrelo y mira **Build Logs**; puedes volver al anterior que
  funcionaba con **⋯ → Promote to Production** (o «Instant Rollback»).
- **Las fotos salen siempre con el aviso «de forma aproximada»**: o falta la clave, o se ha agotado el
  límite de gasto del workspace, o la clave se ha borrado. Revisa el apartado 3 y en
  console.anthropic.com el gasto del workspace.
- **Para ver qué pasa por dentro**: **Deployments → el último → Logs** (o la pestaña **Logs** del
  proyecto). Ahí verás líneas como «fallo de la API de visión 401» (clave mala) o «429» (límite de
  Anthropic alcanzado). **Los registros no contienen fotos ni el texto de las cartas**: la app no los
  guarda en ningún sitio.
- Si nada de esto lo arregla, pásale al equipo técnico la hora aproximada del fallo y la captura de la
  pantalla de Logs.
