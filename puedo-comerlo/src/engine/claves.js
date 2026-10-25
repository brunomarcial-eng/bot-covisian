// Las claves del embarazo de «¿Puedo comerlo?».
// Ocho temas que se repiten una y otra vez durante el embarazo. Sirven para educar, no para dar veredictos:
// el semáforo lo sigue calculando el motor. Contenido orientativo; fuentes citadas: AESAN (embarazo y
// alimentación, listeria, mercurio, cafeína) y notas del Ministerio de Sanidad. Sin dependencias: se importa
// desde el navegador y desde Node.
//
// Forma de cada clave:
// { id, titulo, resumen (una frase, ≤ 90 caracteres), porque (2–3 frases), donde[] (pistas de etiqueta),
//   carta[] (preguntas o pistas para el camarero), ejemplos[], alternativa, fuente }

export const CLAVES = [
  {
    id: 'listeria',
    titulo: 'Listeria',
    resumen: 'Fríos de nevera listos para comer: mejor cocinados, bien calientes.',
    porque:
      'La listeria es una bacteria que, a diferencia de otras, puede seguir creciendo en la nevera. AESAN la señala en el embarazo por el riesgo de infección, aunque apenas se note. Se encuentra sobre todo en alimentos listos para comer, y el calor la elimina.',
    donde: [
      'Leche cruda o «sin pasteurizar»',
      'Queso azul, de pasta blanda o con corteza',
      'Loncheado o rallado de bandeja',
      'Ahumado, paté o foie refrigerados',
      'Brotes y germinados crudos',
    ],
    carta: [
      '¿El queso es pasteurizado?',
      '¿Lleva queso azul o fiambre en frío?',
      '¿El ahumado va en frío o cocinado?',
      '¿Esto se calienta bien en el plato?',
    ],
    ejemplos: [
      'Jamón york y pavo de bandeja',
      'Queso brie, camembert o roquefort',
      'Queso rallado de bolsa',
      'Salmón ahumado',
      'Paté de nevera',
      'Brotes de alfalfa',
    ],
    alternativa:
      'El mismo alimento cocinado hasta que esté bien caliente por dentro: una pizza al horno, un queso gratinado o un salmón hecho.',
    fuente: 'AESAN',
  },
  {
    id: 'toxoplasmosis',
    titulo: 'Toxoplasmosis',
    resumen: 'Carne bien hecha y verdura bien lavada: así se corta el riesgo.',
    porque:
      'La toxoplasmosis la produce un parásito que puede estar en la carne cruda o poco hecha y en la tierra que queda en frutas y verduras. AESAN la señala en el embarazo por el riesgo de infección. El calor y un buen lavado lo eliminan.',
    donde: [
      'Embutido curado «sin cocinar»',
      'Carne cruda o «para cocinar en casa»',
      'Verduras y hortalizas de bolsa «listas para comer»',
      'Frutas sin pelar',
    ],
    carta: [
      '¿La carne puede ir muy hecha, sin nada rosado?',
      '¿El jamón o el chorizo va cocinado o en crudo?',
      '¿La ensalada viene bien lavada?',
      '¿Es tartar o carpaccio?',
    ],
    ejemplos: [
      'Jamón, chorizo y salchichón curados',
      'Steak tartar',
      'Carpaccio de ternera',
      'Carne al punto o sangrante',
      'Ensalada y verdura cruda',
      'Fruta sin lavar',
    ],
    alternativa:
      'Carne hecha del todo, embutido cocinado dentro del plato y la verdura y la fruta lavadas o peladas.',
    fuente: 'AESAN',
  },
  {
    id: 'mercurio',
    titulo: 'Mercurio',
    resumen: 'Los peces grandes acumulan mercurio, y cocinarlos no lo quita.',
    porque:
      'El mercurio se acumula en los peces grandes que viven muchos años, y AESAN recomienda en el embarazo no tomar los que más tienen. Cocinar el pescado no lo elimina. El resto del pescado sigue siendo una buena parte de la alimentación, variando las especies.',
    donde: [
      'Pez espada o emperador',
      'Atún rojo o de almadraba',
      'Tiburón: cazón, marrajo, tintorera, mielga',
      'Lucio',
      'Atún en lata: mira si es claro o bonito',
    ],
    carta: [
      '¿Qué pescado es exactamente?',
      '¿El atún es rojo?',
      '¿El cazón es de tiburón?',
      '¿Hay otro pescado blanco o azul pequeño?',
    ],
    ejemplos: [
      'Pez espada a la plancha',
      'Emperador',
      'Atún rojo y ventresca',
      'Cazón en adobo',
      'Marrajo',
      'Lucio',
    ],
    alternativa:
      'Merluza, lubina, salmón o sardinas bien hechos; el atún en lata, con moderación y alternando con otros pescados.',
    fuente: 'AESAN',
  },
  {
    id: 'huevo-crudo',
    titulo: 'Huevo crudo',
    resumen: 'El huevo, siempre cuajado: la salmonela está en el crudo.',
    porque:
      'La salmonela puede estar en el huevo crudo o poco hecho y provoca una infección digestiva que conviene no pasar durante el embarazo. AESAN recomienda en el embarazo tomar el huevo bien cocinado, con clara y yema cuajadas. Lo que lleva huevo pasteurizado no tiene ese riesgo.',
    donde: [
      'Mayonesa o alioli «casero»',
      'Huevo fresco sin pasteurizar',
      'Salsas con yema',
      'Postres sin horno: tiramisú, mousse, semifrío',
    ],
    carta: [
      '¿La mayonesa o el alioli es casero o de bote?',
      '¿La tortilla está cuajada hasta el centro?',
      '¿Me ponen el huevo con la yema hecha?',
      '¿El postre lleva huevo crudo?',
    ],
    ejemplos: [
      'Huevo frito con la yema líquida',
      'Huevos rotos y huevo poché',
      'Tortilla jugosa',
      'Mayonesa y alioli caseros',
      'Tiramisú y mousse caseros',
      'Salsa césar casera',
    ],
    alternativa:
      'Huevo duro o frito con la yema cuajada, mayonesa de bote y postres horneados con el huevo cocinado.',
    fuente: 'AESAN',
  },
  {
    id: 'pescado-crudo',
    titulo: 'Pescado crudo',
    resumen: 'Pescado y marisco, hechos del todo: crudo puede llevar parásitos.',
    porque:
      'El pescado crudo o apenas marcado puede llevar anisakis, un parásito, y otras bacterias. AESAN recomienda en el embarazo tomar el pescado bien cocinado. Congelarlo antes reduce el riesgo de anisakis, pero no el de otras bacterias.',
    donde: [
      'Pescado «crudo», «marinado» o «en vinagre»',
      'Salmón o trucha «ahumados»',
      'Boquerones en vinagre',
      'Marisco crudo, como las ostras',
    ],
    carta: [
      '¿El pescado va crudo, marinado o hecho del todo?',
      '¿Los boquerones son en vinagre o fritos?',
      '¿El ahumado va en frío?',
      '¿El sushi lleva todo cocinado o es vegetal?',
    ],
    ejemplos: [
      'Sushi y sashimi',
      'Ceviche',
      'Tataki y poke',
      'Boquerones en vinagre',
      'Salmón ahumado de nevera',
      'Ostras al natural',
    ],
    alternativa:
      'Pescado hecho a la plancha o al horno, boquerones fritos y sushi vegetal o con todo cocinado.',
    fuente: 'AESAN',
  },
  {
    id: 'alcohol',
    titulo: 'Alcohol',
    resumen: 'No se conoce ninguna cantidad de alcohol sin riesgo en el embarazo.',
    porque:
      'AESAN y el Ministerio de Sanidad recomiendan no tomar alcohol durante el embarazo, porque no se conoce una cantidad sin riesgo. Vale para el vino, la cerveza, el cava, la sidra y los combinados, también en una copa pequeña. En un guiso o una salsa que ha hervido de verdad se va gran parte del alcohol; el que se añade al final, no.',
    donde: [
      'Vino, cava, sidra o licor entre los ingredientes',
      'Cerveza: mira si pone 0,0',
      '«Sin alcohol» no siempre es 0,0',
      'Salsas «al vino», «al jerez» o flambeadas',
    ],
    carta: [
      '¿Tenéis cerveza 0,0 o algo sin alcohol?',
      '¿La salsa lleva vino o licor?',
      '¿El vino ha hervido con el guiso o se añade al final?',
      '¿Se flamea el plato?',
    ],
    ejemplos: [
      'Vino, cava y sidra',
      'Cerveza y tinto de verano',
      'Sangría y combinados',
      'Carrillada o rabo de toro al vino',
      'Postres con licor',
      'Cerveza «sin alcohol» que no es 0,0',
    ],
    alternativa:
      'Cerveza 0,0, agua con gas con limón; y los guisos con vino, solo si hierven de verdad.',
    fuente: 'AESAN y Ministerio de Sanidad',
  },
  {
    id: 'cafeina',
    titulo: 'Cafeína',
    resumen: 'La cafeína suma: café, té y cola cuentan en el mismo tope diario.',
    porque:
      'AESAN recomienda en el embarazo no pasar de unos 200 mg de cafeína al día, sumando todo lo que la lleva. La cantidad cambia mucho según cómo se prepare y el tamaño de la taza, así que un solo café grande ya puede acercarse. Es una cifra orientativa, no una cuenta exacta.',
    donde: [
      'Café, té, mate o guaraná entre los ingredientes',
      'Cacao y chocolate negro',
      'Bebidas de cola y energéticas',
      '«Descafeinado» o «sin cafeína»',
    ],
    carta: [
      '¿Me lo podéis poner descafeinado?',
      '¿Me lo ponéis pequeño?',
      '¿Tenéis cola sin cafeína?',
      '¿El té es descafeinado?',
    ],
    ejemplos: [
      'Café solo, con leche o cortado',
      'Té verde, negro y matcha',
      'Refresco de cola',
      'Mate',
      'Chocolate negro',
      'Bebidas energéticas',
    ],
    alternativa:
      'Café descafeinado, manzanilla o rooibos; y, si es café de verdad, pequeño y contando el resto de lo que lleva cafeína.',
    fuente: 'AESAN',
  },
  {
    id: 'hierbas',
    titulo: 'Hierbas e infusiones',
    resumen: 'Natural no es lo mismo que inocuo: algunas plantas no convienen.',
    porque:
      'Que una infusión sea natural no quiere decir que no tenga efectos. AESAN desaconseja en el embarazo algunas plantas, como el sen, la ruda o el regaliz en cantidad. Ante una mezcla de hierbas que no conoces, lo prudente es consultarlo en la farmacia o con tu matrona.',
    donde: [
      'Sen, ruda o poleo entre los ingredientes',
      'Regaliz: caramelos o infusión en cantidad',
      'Infusiones «laxantes», «adelgazantes» o «detox»',
      'Mezclas de plantas sin lista clara',
    ],
    carta: [
      '¿Qué lleva exactamente esta infusión?',
      '¿Tenéis manzanilla o rooibos?',
      '¿El té de hierbas lleva poleo o regaliz?',
    ],
    ejemplos: [
      'Infusión de sen',
      'Ruda',
      'Regaliz en cantidad',
      'Poleo menta',
      'Infusiones laxantes o detox',
      'Mezclas de hierbas depurativas',
    ],
    alternativa: 'Manzanilla o rooibos, que no plantean problema, o simplemente agua con limón.',
    fuente: 'AESAN',
  },
];

export const CLAVE_BY_ID = Object.fromEntries(CLAVES.map((c) => [c.id, c]));

// Nombre corto de una clave para chips y enlaces; si el id no existe, el propio id.
export function claveLabel(id) {
  const c = CLAVE_BY_ID[id];
  return c ? c.titulo : id;
}
