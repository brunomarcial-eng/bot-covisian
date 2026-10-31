# Especificación original (texto literal del encargo)

Construye una aplicación web móvil, en español de España, llamada «¿Puedo comerlo?».

Es una guía orientativa para una mujer de unos 32 años, primeriza, que va a comer fuera o a hacer la compra y quiere una respuesta corta antes de pedir o de meter algo en el carro. No es una app médica, no hay médico ni científico detrás, y no sustituye a la matrona, al ginecólogo ni al médico. El pie, siempre visible, dice exactamente: «Orientativa. No sustituye el consejo de tu matrona, ginecólogo o médico.»

No recopiles datos de salud. Prohibido preguntar semana de embarazo, fecha probable de parto, inmunidad a toxoplasmosis, diabetes gestacional, analíticas o cualquier dato clínico. No hay cuentas, no hay servidor de usuarios, no hay base de datos de perfiles. Todo lo que la persona configura (embutidos, alergias, forma de comer, lista, historial, favoritos) vive solo en el navegador de ese móvil (localStorage). Si borra los datos del navegador, se pierde. La app no lo ve.

Si hace una foto de una carta o de una etiqueta, la imagen se envía solo para transcribir el texto y no se guarda. El modelo de visión NO decide si algo se puede comer. Solo devuelve JSON con los nombres y los ingredientes que se leen. El semáforo lo calcula siempre un motor de reglas local, determinista, a partir de ese texto y del perfil guardado en el móvil.

## Tono y diseño

Adulta y serena. Nada de bebé, corazones, pastel, ilustración infantil ni plato vacío. Tipografía de títulos: Fraunces. Texto: Source Sans 3. Fondo crema #f3eee6, superficie #fffdf8, tinta #241f1a, texto secundario #5c564e, línea #e3dacd. Salvia #245443 para lo que se puede y para el botón principal. Arcilla #8d4324 para «con cuidado». Vino #7a332c para «mejor no». Arena para «no estoy segura».

Mobile-first, una columna, máximo ~32 rem de ancho, centrada. Botones de al menos 48 px de alto. Texto de cuerpo grande (18 px). Títulos muy grandes. Bordes de hoja 1.75 rem, controles 0.75 rem. Una acción principal por pantalla. Sin menús hamburguesa: navegación fija abajo con cuatro destinos: Inicio, Fuera, Súper, Lista. Arriba, el nombre de la app y un acceso a Ajustes.

Semáforo, siempre con estas palabras, nunca «evitar» ni «seguro» a secas:
- si → «Sí» (salvia)
- cuidado → «Con cuidado» (arcilla)
- no → «Mejor no» (vino)
- duda → «No estoy segura» (arena)

La ficha es mínima: una pastilla de semáforo, el nombre, una sola frase. «Ver más» despliega el detalle, la pregunta para el camarero o la etiqueta, una alternativa y la fuente. Si hay varios riesgos, gana el peor: mejor no > con cuidado > no estoy segura > sí.

## Arranque (6 pasos, una sola vez)

1. Portada. Título «¿Puedo comerlo?». Texto: «Para la carta y para el súper. Una respuesta corta, y el motivo solo si lo abres.» Disclaimer. Botón Seguir.
2. Embutido y jamón curado. Explica, sin preguntar analíticas, este riesgo: el jamón, el chorizo, el salchichón, el fuet o el lomo embuchado, en crudo, son un cárnico sin cocinar. AESAN los señala por toxoplasmosis y, si van loncheados, también por listeria. La app no pregunta analíticas: la persona dice si entran o no en su mesa. El fiambre de bandeja (york, pavo, chopped) va aparte y sale como «mejor no» aunque el jamón curado le dé igual.
   Alternativas que hay que mostrar:
   - El mismo embutido bien cocinado dentro del plato (croqueta, sofrito, pizza al horno), no solo apoyado al servir.
   - Un fiambre recién hecho en caliente, mejor que una bandeja loncheada abierta en la nevera.
   - Otras proteínas: huevo bien cuajado, pollo o ternera hechos del todo, legumbres, o pescado hecho que no sea pez espada, atún rojo, tiburón o lucio.
   Pregunta: «¿Qué has decidido?» Tres opciones, una obligatoria:
   - «No quiero comer embutidos». Jamón, chorizo, salchichón, fuet o lomo salen como «mejor no», también en croqueta o pizza.
   - «Solo si van cocinados». En crudo, mejor no. En croqueta, guiso o pizza, solo si se cocinan de verdad dentro del plato.
   - «Los como, y quiero ver el riesgo». No los marques como seguros. Una línea con el motivo. La decisión, en la mesa, es suya. El nivel sigue siendo «mejor no» si va crudo; no se convierte en «sí».
3. Si no eligió «no quiero», pregunta cuáles come: jamón curado; chorizo o sobrasada; salchichón, fuet o salami; lomo embuchado. Si marca algunos, los que no marcó salen como «mejor no» con «No está entre los embutidos que has marcado.» Si no marca ninguno, se aplican todos.
4. Alergias, opcionales: leche, huevo, gluten, frutos secos, pescado, marisco, soja, sésamo. Campo libre corto (máx. 200) para otra cosa que no quiera comer. Si el texto libre aparece en el plato, el nivel pasa a «mejor no».
5. Forma de comer, opcional y combinable: vegetariana, vegana, sin cerdo, sin lactosa. No cambia el semáforo de seguridad; añade una nota («No encaja con vegana», «Lleva cerdo», etc.).
6. Privacidad, en tres frases claras: no pedimos semana ni analíticas; alergias y lista se quedan en este móvil y no hay cuenta; la foto se envía solo para leer el texto, no se guarda, y el semáforo lo calculan reglas fijas. Botón «Empezar».

Ajustes permite cambiar todo eso y borrar los datos de este móvil (vuelve al arranque).

## Pantallas

Inicio, «¿Qué vas a comer?». Subtítulo: «En la mesa o en el súper. La respuesta, primero.» Dos botones grandes: Comer fuera, En el súper. Debajo, un buscador «O escribe el plato» (placeholder: Sushi, tortilla, jamón…). Si hay historial, «Lo último» con las 3 últimas fichas.

Comer fuera. «Foto de la carta, o el plato escrito. Si no se lee, no lo invento.» Botón «Hacer una foto» que abre la cámara trasera (getUserMedia, facingMode environment), previsualiza y confirma con «Usar esta foto». Si no hay cámara, dilo y ofrece galería. También «Elegir una foto» y «Buscar un plato». Atajos: jamón curado, pescado crudo, tortilla, ensalada César, ensaladilla, tarta de queso, gazpacho, mayonesa casera, queso blando, paella.

Al leer la foto: comprímela a JPEG (lado largo ≤ 1280, calidad ~0.7). Pídele al modelo de visión SOLO transcripción, máximo 12 platos, JSON {"readable":true,"items":[{"name","ingredients":[],"uncertain":false}]}. Si no se lee, {"readable":false,"items":[]}. No debe inventar salsas, huevo ni alcohol que no aparezcan, ni dar consejo de salud. Si la visión falla, intenta OCR local (tesseract, español) y marca esas líneas como inciertas. Si no hay nada, no inventes: «No he podido leer la carta. Acércala, o escribe el plato.» Cada línea pasa por el motor de reglas. Publica el resultado con título «La carta» y ve a la pantalla de resultado.

En el súper. «El código consulta Open Food Facts. Si no está, fotografía los ingredientes.» Escanear código de barras (BarcodeDetector o ZXing), o teclear 8–14 dígitos. GET https://world.openfoodfacts.org/api/v2/product/{code}.json. Si no está, dilo y pide foto de la etiqueta. La foto de etiqueta usa el mismo lector: un ítem, ingredientes literales. Cruza alérgenos declarados y trazas con las alergias marcadas. Atajos: atún en lata, loncheados, queso rallado, paté, ahumado, café, alcohol, cerveza 0,0.

Resultado. Lista de fichas mínimas. Si la lectura era incierta y el nivel era «sí», bájalo a «no estoy segura» y antepón «No estoy segura de la lectura.»

Buscar. Campo de texto y filtros por grupo: Todo, Embutidos, Lácteos, Huevos, Carne, Pescado, En el restaurante, Bebidas, Supermercado. Búsqueda por nombre y alias, sin acentos, por inclusión. Cada resultado abre su ficha.

Ficha de un alimento conocido. Aplica el perfil (embutido, alergias, nota, dieta) y guarda en el historial una sola vez si no se acaba de ver el mismo alimento. Botones: Añadir a la lista, Guardar en favoritos.

Lista de la compra. Lo que ha ido guardando, con semáforo y frase. Se puede quitar. Si está vacía: «Todavía no hay nada. Cuando mires un plato o un producto, puedes dejarlo aquí.»

Historial. Las últimas 40 consultas (foto, código o búsqueda), con semáforo. Las de la guía enlazan a su ficha.

## Motor de reglas

Una base local de alimentos. Cada uno tiene id, nombre, alias, grupo, nivel base, una frase, un detalle, una pregunta para el camarero o null, una alternativa o null, la fuente (AESAN / Ministerio de Sanidad / la propia app) y etiquetas.

Al clasificar un texto libre:
1. Normaliza: minúsculas, sin acentos, ñ→n.
2. Empareja por alias (si el nombre encaja con puntuación ≥ 50) y por estas palabras clave, de más específica a más general: pez espada/emperador/atún rojo/tiburón/cazón/marrajo/tintorera/mielga/lucio; sushi/sashimi/ceviche/tataki/poke/carpaccio de pescado; salmón o trucha ahumados; boquerones o anchoas en vinagre; ostras y marisco crudo; steak tartar/tartar/carpaccio; poco hecha/al punto/sangrante; mayonesa casera/alioli; tiramisú/mousse; tortilla jugosa/huevo crudo/yema líquida/huevos rotos/poché; paté/foie/micuit; hígado; caza; leche cruda o sin pasteurizar; brie/camembert/roquefort/cabrales/gorgonzola/rulo de cabra; queso rallado o loncheado; jamón cocido/york/pavo loncheado/fiambre/chopped/mortadela; chorizo/salchichón/fuet/lomo embuchado/sobrasada/salami; jamón ibérico/serrano/curado/paleta, con lookahead para no pillar «jamón cocido» ni «jamón york»; cerveza 0,0; cerveza sin alcohol; vino/cava/cerveza/sidra/vermut/sangría/tinto de verano/mojito/cubata/licor; bebida energética; café; té verde/negro/matcha/chai; ensalada César; ensaladilla; tarta de queso; germinados; atún en lata/atún claro/bonito del norte; atún.
3. Si dice crudo y parece pescado o marisco, añade pescado crudo; si no, carne poco hecha.
4. Cerveza 0,0 anula alcohol y «sin alcohol». «Sin alcohol» anula alcohol genérico. Si el alcohol aparece solo como salsa, guiso, estofado, reducción, flameado u horneado, y no hay copa, vaso, sangría, cerveza, tinto de verano, mojito o cubata, no es «alcohol»: es «salsa o guiso con vino» (con cuidado: el alcohol de un hervor largo se va, el de un chorrito al servir no).
5. Si hay embutido curado y también croqueta, pizza, guiso, sofrito, horno, hervido o estofado, trátalo como embutido cocinado dentro del plato, no como crudo.
6. Descafeinado anula café. «Mayonesa de bote» anula mayonesa casera. Mercurio alto anula atún y pescado genérico. Ahumado, crudo o en vinagre anulan el pescado genérico «a la plancha».
7. Si no hay ninguna coincidencia: nivel «no estoy segura», frase «No lo tengo claro. No lo doy por seguro.» No inventes el resto. Pregunta si lleva huevo crudo, embutido, queso sin pasteurizar, alcohol o pescado sin hacer.
8. Si hay varias coincidencias, fusiona y quédate el peor nivel. La frase es la del peor.
9. Después, el perfil de embutido puede sustituir la frase (ver arranque). Una alergia marcada que aparezca en el nombre, los ingredientes o las etiquetas pone el nivel en «mejor no» y antepone «Has marcado X.» Las trazas de Open Food Facts, si el nivel era «sí», lo bajan a «con cuidado». Si la etiqueta dice leche pasteurizada en un queso que no es loncheado y el nivel no era ya «mejor no», puede subir a «sí» con «Quita la corteza si la tiene.» Si dice sin pasteurizar, «mejor no».

Niveles base de la guía (frase corta; el detalle largo cita la fuente y no se muestra hasta «Ver más»):

Embutidos. Jamón curado, chorizo/salchichón/fuet/lomo y sobrasada: mejor no, crudos. Embutido bien cocinado dentro del plato: con cuidado. Fiambre loncheado de bandeja (york, pavo, chopped, mortadela): mejor no, aunque el jamón le dé igual, por listeria.

Lácteos. Leche pasteurizada y yogur: sí. Queso fresco o de Burgos y queso curado: con cuidado (que sea pasteurizado). Queso blando con corteza (brie, camembert, rulo de cabra): con cuidado, quitar la corteza, y mejor no si es de leche cruda. Queso azul: mejor no. Queso loncheado o rallado de bandeja: mejor no. Leche sin pasteurizar: mejor no.

Huevos. Huevo bien hecho y mayonesa de bote: sí. Huevo poco hecho, tortilla poco cuajada y mayonesa casera o alioli de huevo crudo: mejor no. Tortilla de patata: con cuidado, solo si está cuajada hasta el centro.

Carne. Bien hecha: sí. Poco hecha, tartar, carpaccio, paté refrigerado, hígado y caza: mejor no. Hamburguesa: con cuidado, hecha del todo, sin rosado.

Pescado y marisco. Pescado blanco a la plancha y pescado azul pequeño bien hecho: sí. Marisco cocido: sí. Pescado crudo (sushi, sashimi, ceviche, tataki, poke), ahumado de nevera, boquerones en vinagre y marisco crudo: mejor no. Pez espada, emperador, atún rojo, tiburón, cazón, marrajo, tintorera, mielga y lucio: mejor no, por mercurio. Atún en lata y atún a la plancha que no sea rojo: con cuidado, sin pasarse.

En el restaurante. Ensalada César, ensaladilla, ensalada, gazpacho o salmorejo, tarta de queso, helado, pizza y paella o fideuá: con cuidado (preguntar huevo crudo, mayonesa casera, queso sin pasteurizar, embutido crudo, alcohol o marisco poco hecho). Brotes y germinados: mejor no. Tiramisú: mejor no, por el huevo crudo. Pan con tomate, legumbres y verdura cocinada: sí.

Bebidas. Café: con cuidado, tope orientativo 200 mg de cafeína al día (un solo café grande ya puede acercarse). Té y cola: con cuidado, cuentan en esa misma cafeína. Descafeinado, manzanilla, agua, chocolate y cerveza 0,0: sí. Cerveza «sin alcohol» que no sea 0,0: con cuidado, puede quedar alcohol. Alcohol (vino, cava, cerveza, sidra, vermú, sangría, combinados): mejor no, también en cantidad pequeña. Salsa o guiso con vino: con cuidado, solo si hierve de verdad. Infusiones a evitar (sen, regaliz en cantidad, ruda, y otras que AESAN desaconseja en el embarazo): mejor no. Edulcorantes: con cuidado. Zumo: con cuidado, mejor la fruta entera. Fruta: sí.

Fuentes que hay que citar en el detalle, no inventar otras: AESAN (embarazo y alimentación, listeria, mercurio, cafeína) y notas del Ministerio de Sanidad. Cuando la app no reconoce el plato, la fuente es la propia app, y hay que decirlo.

## Qué no construir

Ni calendario de 9 meses, ni semana de embarazo, ni contador de cafeína acumulada, ni tracker de nutrientes, ni chat médico, ni login, ni sincronización entre móviles, ni consejo personalizado según analíticas. La primera versión es comer fuera y el súper, más la guía buscable, la lista y el historial.

## Criterio de hecho

Una persona nueva completa el arranque sin que le pidan nada clínico, elige embutidos, llega a «¿Qué vas a comer?», escribe «sushi» y ve «Mejor no», escribe «tortilla» y ve «Con cuidado», abre la cámara o elige una foto de carta y obtiene fichas (o un mensaje honesto si no se lee), escanea o teclea un código de barras real y ve el producto de Open Food Facts con sus alergias aplicadas, y puede guardar en la lista. Todo sigue ahí al recargar, y desaparece si borra los datos.
