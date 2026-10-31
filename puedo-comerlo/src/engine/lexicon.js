// Léxico del motor de reglas. Todo trabaja sobre texto ya normalizado (normalize.js):
// minúsculas, sin acentos, solo [a-z0-9 .], «0,0» → «00».
//
// Contiene:
// - KEYWORD_RULES: palabras clave → ids de la guía, de MÁS específica a MÁS general. El orden importa:
//   una coincidencia que queda dentro de otra anterior se descarta («jamón» dentro de «jamón york»,
//   «cerveza» dentro de «cerveza 0,0», «atún» dentro de «atún rojo»), y en empate de nivel gana la que
//   antes aparece en esta lista.
// - Contextos para las reglas (crudo, ahumado, cocinado dentro del plato, alcohol en salsa…).
// - Alérgenos, forma de comer y negaciones («sin gluten», «sin huevo»…) para texto libre.
// - Mapas de Open Food Facts (alérgenos, categorías y etiquetas).

// Límites de palabra sobre texto normalizado.
const B = '(?<![a-z0-9])';
const E = '(?![a-z0-9])';

export function wordRe(src, flags = 'g') {
  return new RegExp(`${B}(?:${src})${E}`, flags);
}

const alt = (...xs) => xs.flat().join('|');

// ---------------------------------------------------------------------------
// Listas de palabras reutilizables (fuentes de RegExp)
// ---------------------------------------------------------------------------

// Pescado (no marisco).
export const FISH_SRC = alt(
  'pescad(?:o|os|ito|itos)', 'pescaitos?', 'peces', 'pez(?! de (?:goma|chocolate))',
  'lubinas?', 'merluzas?', 'merluzitas?', 'pescadillas?', 'doradas?', 'rapes?', 'bacalao(?:s|es)?', 'bacaladitos?',
  'lenguados?', 'gallos?', 'rodaballos?', 'besugos?', 'meros?', 'abadejos?', 'cabrachos?', 'corvinas?', 'san pedro',
  'sargos?', 'pargos?', 'percas?', 'pangas?', 'tilapias?', 'rayas?', 'congrios?', 'platijas?', 'fletan(?:es)?', 'halibut',
  'salmon(?:es)?', 'salmonetes?', 'truchas?', 'atun(?:es)?', 'bonito', 'ventrescas?', 'sardinas?', 'sardinillas?',
  'boquerones?', 'anchoas?', 'bocartes?', 'caballas?', 'jurel(?:es)?', 'chicharros?', 'arenques?', 'espadines?',
  'melvas?', 'xoubas?', 'palometas?', 'emperador', 'tiburon(?:es)?', 'cazon', 'marrajos?', 'tintoreras?',
  'mielgas?', 'pintarrojas?', 'lucios?', 'anguilas?', 'angulas?', 'gulas?', 'surimi', 'palitos de cangrejo',
  'chanquetes?', 'mojama', 'huevas?', 'caviar', 'carbonero', 'acedias?', 'pijotas?', 'japutas?', 'esturion',
  'gallineta', 'rascacio', 'lamprea', 'bacaladilla', 'fumet', 'caldo de pescado', 'sopa de pescado',
);

export const MARISCO_SRC = alt(
  'mariscos?', 'mariscadas?', 'gambas?', 'gambones?', 'gambitas?', 'langostinos?', 'cigalas?', 'cigalitas?',
  'necoras?', 'centollos?', 'centollas?', 'bogavantes?', 'langostas?', 'carabineros?', 'camarones?', 'quisquillas?',
  'cangrejos?', 'buey(?:es)? de mar', 'percebes?', 'mejillon(?:es)?', 'almejas?', 'berberechos?', 'navajas?',
  'zamburinas?', 'volandeiras?', 'vieiras?', 'ostras?', 'ostiones?', 'erizos?(?: de mar)?', 'pulpos?', 'pulpitos?',
  'calamar(?:es)?', 'calamarcitos?', 'chipirones?', 'sepias?', 'chocos', 'chopitos?', 'puntillitas?', 'chirlas?',
  'coquinas?', 'tellinas?', 'crustaceos?', 'moluscos?', 'cefalopodos?', 'galeras?', 'santiaguinos?', 'bigaros?',
  'caracolillos?', 'krill',
);

// «Clara»: cerveza con limón o gaseosa. No la clara de huevo («claras montadas», «tortilla de claras»).
export const CLARA_SRC =
  '(?<!(?:de|las|con|sin) )claras?(?! (?:de (?:huevos?|gallina|pollo|pato|codorniz)|montadas?|a punto(?: de nieve)?|batidas?|pasteurizadas?|liquidas?|cocidas?|crudas?|duras?|y yemas?|de [0-9]+ huevos?))';

// Embutidos y fiambres (cualquier tipo).
export const EMBUTIDO_SRC = alt(
  'jamon(?:es)?', 'paletas? (?:iberica|serrana|curada|de bellota|de cebo)', 'paletillas? (?:iberica|serrana|curada)',
  'chorizos?', 'choricitos?', 'chistorra', 'sobrasadas?', 'salchichon(?:es)?', 'fuets?', 'espetec', 'salamis?',
  'pepperoni', 'lomos? embuchad[oa]s?', 'cana de lomo', 'lomo curado', 'cecina', 'mortadela', 'chopped', 'york',
  'fiambres?', 'embutidos?', 'ibericos', 'longanizas?',
);

// Carne (fresca, guisos y también embutidos), para forma de comer y para «crudo».
export const CARNE_SRC = alt(
  'carnes?', 'terneras?', 'vaca', 'buey(?! de mar)', 'novillo', 'pollos?', 'pavo', 'gallina', 'pularda', 'capon',
  'corderos?', 'lechazo', 'cabrito', 'cochinillo', 'cerdo', 'conejo', 'patos?', 'magret', 'oca', 'codorniz',
  'codornices', 'pichon', 'jabali', 'venado', 'ciervo', 'corzo', 'liebre', 'perdiz', 'perdices', 'faisan', 'caballo',
  'potro', 'avestruz', 'solomillos?', 'entrecots?', 'chuleton(?:es)?', 'chuletas?', 'chuletillas?', 'filetes? de (?:ternera|vaca|cerdo|pollo|pavo|buey|lomo|cordero)',
  'pechugas?', 'muslos?', 'contramuslos?', 'alitas?', 'costillas?', 'costillar', 'secreto', 'presa', 'pluma',
  'carrilladas?', 'carrilleras?', 'rabo de toro', 'rabo', 'albondigas?', 'escalopes?', 'escalopines?', 'cachopos?',
  'flamenquin(?:es)?', 'san jacobos?', 'codillos?', 'churrasco', 'lomos?(?! (?:alto |bajo )?de (?:bacalao|atun|salmon|merluza|bonito|pez|rape|corvina|lubina|dorada|trucha))',
  'morcillo', 'osobuco', 'rosbif', 'roast beef', 'tournedos?', 'kebab', 'shawarma', 'gyros', 'callos', 'manitas',
  'orejas?', 'morro', 'torreznos?', 'chicharrones?', 'panceta', 'bacon', 'beicon', 'tocino', 'salchichas?',
  'butifarras?', 'morcillas?', 'hamburguesas?', 'burgers?', 'carne picada', 'picadillo', 'ragu', 'bolonesa',
  'bolognesa', 'caldo de (?:pollo|carne|cocido|huesos|ave)', 'cocido', 'pringa', 'lacon', 'mollejas', 'rinones',
  'sesos', 'higados?', 'higaditos', 'foie', 'caza', 'steak', 'magro', 'zorza', 'raxo',
  EMBUTIDO_SRC,
);

// Cerdo.
export const CERDO_SRC = alt(
  'cerdos?', 'porcin[oa]s?', 'cochinillo', 'cochifrito', 'jamon(?:es)?(?! de (?:pato|pavo|pollo|oca))',
  'paletas? (?:iberica|serrana|curada|de bellota|de cebo)', 'paletillas? (?:iberica|serrana|curada|de cerdo)',
  'chorizos?(?! de pavo)', 'choricitos?', 'chistorra', 'sobrasadas?', 'salchichon(?:es)?(?! de pavo)', 'fuets?',
  'espetec', 'salamis?', 'pepperoni', 'longanizas?', 'butifarras?', 'morcillas?', 'panceta', 'pancetta', 'bacon',
  'beicon', 'tocino', 'lardo', 'manteca(?! de (?:cacao|karite|cacahuete))',
  'lomos?(?! (?:alto |bajo )?de (?!cerdo|cebo|bellota|iberico))', 'cana de lomo', 'costillas? de cerdo',
  'costillas? ibericas?', 'costillas? de cochinillo', 'secreto(?: iberico)?', 'presa(?: iberica)?',
  'pluma(?: iberica)?', 'carrilladas? (?:ibericas?|de cerdo)', 'carrilleras? (?:ibericas?|de cerdo)', 'torreznos?',
  'chicharrones?', 'codillos?', 'orejas?', 'manitas(?: de cerdo)?', 'morro', 'mortadela', 'chopped', 'york', 'lacon',
  'sandwich(?:es)? mixtos?', 'bikinis?', 'croque monsieur', 'cabeza de jabali', 'salchichas?(?! de (?:pollo|pavo|ternera|tofu|soja))', 'pringa', 'zorza', 'raxo', 'cachopos?',
  'flamenquin(?:es)?', 'san jacobos?', 'embutidos?', 'ibericos', 'prosciutto', 'guanciale', 'cecina de cerdo',
);

// Huevo, leche y otros (para «crudo» y para alérgenos).
const HUEVO_SRC = alt(
  'huevos?', 'huevitos?', 'yemas?', 'claras? (?:de huevo|montadas?|a punto de nieve)', 'ovoproductos?', 'albumina',
  'ovoalbumina', 'lisozima', 'mayonesas?', 'mahonesas?', 'alioli', 'allioli', 'ali oli', 'all i oli', 'aioli',
  'ajoaceite', 'salsa (?:tartara|rosa|holandesa|bearnesa)',
  'tortillas?(?! (?:de )?(?:maiz|trigo|harina|mexicanas?|wrap)| para (?:fajitas|burritos|tacos))', 'revueltos?',
  'rebozad[oa]s?', 'a la romana', 'merengues?', 'flan(?:es)?', 'natillas', 'crema catalana', 'tiramisus?',
  'bizcochos?', 'magdalenas?', 'carbonara', 'pasta (?:fresca )?al huevo', 'mousses?', 'souffles?', 'soufles?',
  'quiches?', 'torrijas', 'ensaladillas?', 'brioche',
);

const LECHE_SRC = alt(
  'sandwich(?:es)? mixtos?', 'bikinis?', 'croque monsieur', 'san jacobos?', 'cachopos?', 'provoletas?', 'fondues? de quesos?',
  'leches?(?! de (?:almendras?|avena|soja|soya|arroz|coco|avellanas?|anacardos?|nueces|espelta|canamo|chufa|tigre|quinoa))',
  'lacteos?', 'lacteas?', 'quesos?', 'quesitos?', 'quesada', 'natas?', 'mantequilla(?! de (?:cacahuetes?|almendras?|anacardos?|cacao))',
  'bechamel', 'besamel', 'yogur(?:es|t|ts)?', 'yoghourt', 'yoghurt', 'kefir', 'cuajada', 'requeson', 'mascarpone',
  'mozzarella', 'mozarella', 'mozzarela', 'burrata', 'ricotta', 'parmesano', 'parmigiano', 'manchego', 'emmental',
  'gouda', 'cheddar', 'brie', 'camembert', 'roquefort', 'cabrales', 'gorgonzola', 'feta', 'idiazabal', 'tetilla',
  'gruyere', 'edam', 'provolone', 'pecorino', 'grana padano', 'stilton', 'havarti', 'raclette', 'comte', 'quark',
  'cottage', 'skyr', 'torta del casar', 'torta de la serena', 'suero(?: de leche| lacteo)?', 'lactosuero', 'lactosa',
  'caseina(?:to)?s?', 'crema de leche', 'ghee', 'flan(?:es)?', 'natillas', 'crema catalana', 'arroz con leche',
  'leche frita', 'dulce de leche', 'batidos?', 'cortados?', 'capuchinos?', 'cappuccinos?', 'lattes?', 'tiramisus?',
  'rulos? de cabra', 'helados? de (?:nata|leche|yogur)',
);

const GLUTEN_SRC = alt(
  'pan(?:es)?', 'panecillos?', 'barra de pan', 'bocadillos?', 'bocatas?', 'sandwich(?:es)?', 'sandwiches',
  'tostadas?', 'tostas?', 'tostaditas?', 'picatostes', 'croutons?', 'migas', 'pan rallado',
  'harinas?(?! de (?:maiz|arroz|garbanzos?|almendras?|coco|soja|patata|yuca|tapioca|castanas?|trigo sarraceno|alforfon|quinoa|teff|mijo|lentejas?|guisantes?))',
  'trigo(?! sarraceno)', 'cebada', 'centeno', 'espelta', 'kamut', 'avena', 'malta', 'seitan', 'semola', 'cuscus',
  'couscous', 'bulgur', 'rebozad[oa]s?', 'empanad[oa]s?', 'empanadillas?', 'a la romana', 'tempura',
  'pastas?(?! de (?:almendras?|cacao|sesamo|aceitunas?|curry|miso|wasabi|anchoas?|dientes|arroz|te|tomate|pimientos?|avellanas?|cacahuetes?|pistachos?|sobrasada))',
  'macarrones', 'espaguetis?', 'spaghetti', 'tallarines', 'fideos?(?! de arroz)', 'fideuas?', 'lasanas?', 'lasagna',
  'canelones', 'raviolis?', 'tortellinis?', 'noquis', 'gnocchi', 'penne', 'fusilli', 'tagliatelle', 'pizzas?',
  'croquetas?', 'bechamel', 'besamel', 'galletas?', 'bizcochos?', 'magdalenas?', 'cruasanes?', 'croissants?',
  'napolitanas?', 'hojaldres?', 'churros?', 'porras', 'rosquillas?', 'torrijas', 'gofres?', 'masa', 'cervezas?',
  'birras?', 'salsa de soja', 'gyozas?', 'dumplings?', 'wraps?', 'burritos?', 'fajitas?', 'durum', 'pita', 'naan',
  'bagels?', 'brioche', 'donuts?', 'picos', 'colines', 'grisines', 'biscotes', 'muesli', 'crepes?', 'creps?',
  'bollos?', 'bolleria', 'tiramisus?', 'calzone', 'bikinis?', CLARA_SRC,
);

const FRUTOS_SECOS_SRC = alt(
  'frutos? secos', 'frutos? de cascara', 'nuez(?! moscada)', 'nueces(?! moscadas?)', 'almendras?', 'almendrad[oa]s?',
  'avellanas?', 'pistachos?', 'anacardos?', 'cacahuetes?', 'cacahuates?', 'mani', 'pinones?', 'pinon',
  'macadamias?', 'pecanas?', 'castanas? de caju', 'pralines?', 'turron(?:es)?', 'mazapan(?:es)?', 'frangipane',
  'romesco', 'ajoblanco', 'ajo blanco', 'pesto', 'gianduja', 'nocilla', 'nutella', 'marcona', 'garrapinadas?',
);

const SOJA_SRC = alt('soja', 'soya', 'tofu', 'edamames?', 'tempeh', 'miso', 'tamari', 'shoyu');
const SESAMO_SRC = alt('sesamo', 'ajonjoli', 'tahini', 'tahin', 'hummus', 'humus', 'gomasio', 'halva', 'halwa');
const MIEL_SRC = alt('miel(?:es)?', 'jalea real', 'propoleos?', 'hidromiel');
const GELATINA_SRC = alt('gelatinas?', 'gominolas?', 'ositos de goma', 'panna cotta', 'panacota', 'cola de pescado');

// Alérgenos en texto libre (ids de alergia del perfil).
export const ALLERGEN_LEXICON = {
  leche: wordRe(LECHE_SRC, ''),
  huevo: wordRe(HUEVO_SRC, ''),
  gluten: wordRe(GLUTEN_SRC, ''),
  frutos_secos: wordRe(FRUTOS_SECOS_SRC, ''),
  pescado: wordRe(alt(FISH_SRC, 'worcestershire', 'perrins', 'garum'), ''),
  marisco: wordRe(MARISCO_SRC, ''),
  soja: wordRe(SOJA_SRC, ''),
  sesamo: wordRe(SESAMO_SRC, ''),
};

// Forma de comer en texto libre (mismas etiquetas que `tags` de la guía).
export const DIET_LEXICON = {
  carne: wordRe(CARNE_SRC, ''),
  cerdo: wordRe(CERDO_SRC, ''),
  pescado: wordRe(FISH_SRC, ''),
  marisco: wordRe(MARISCO_SRC, ''),
  leche: wordRe(LECHE_SRC, ''),
  huevo: wordRe(HUEVO_SRC, ''),
  miel: wordRe(MIEL_SRC, ''),
  gelatina: wordRe(GELATINA_SRC, ''),
};

export const ALLERGY_IDS = ['leche', 'huevo', 'gluten', 'frutos_secos', 'pescado', 'marisco', 'soja', 'sesamo'];

export const ALLERGY_LABEL = {
  leche: 'leche',
  huevo: 'huevo',
  gluten: 'gluten',
  frutos_secos: 'frutos secos',
  pescado: 'pescado',
  marisco: 'marisco',
  soja: 'soja',
  sesamo: 'sésamo',
};

export const DIET_NOTES = {
  vegetariana: { tags: ['carne', 'cerdo', 'pescado', 'marisco', 'gelatina'], note: 'No encaja con vegetariana' },
  vegana: {
    tags: ['carne', 'cerdo', 'pescado', 'marisco', 'gelatina', 'leche', 'huevo', 'miel'],
    note: 'No encaja con vegana',
  },
  sin_cerdo: { tags: ['cerdo'], note: 'Lleva cerdo' },
  sin_lactosa: { tags: ['lactosa', 'leche'], note: 'Puede llevar lactosa' },
};

// ---------------------------------------------------------------------------
// Negaciones: «sin gluten», «sin huevo ni lactosa», «libre de frutos secos»…
// «sin lactosa» NO niega la leche (sigue siendo leche); solo quita la nota de lactosa.
// ---------------------------------------------------------------------------

const NEG_WORDS = {
  gluten: alt('gluten', 'trigo'),
  leche: alt('leche', 'lacteos?', 'proteinas? (?:de )?(?:la )?leche', 'derivados lacteos'),
  huevo: alt('huevos?', 'ovoproductos'),
  frutos_secos: alt('frutos? secos', 'frutos? de cascara'),
  pescado: alt('pescados?'),
  marisco: alt('mariscos?', 'crustaceos', 'moluscos'),
  soja: alt('soja', 'soya'),
  sesamo: alt('sesamo'),
  cerdo: alt('cerdo'),
  carne: alt('carnes?'),
  miel: alt('miel'),
  gelatina: alt('gelatina'),
  lactosa: alt('lactosa'),
};
const NEG_FILLER = alt(
  'ni', 'y', 'o', 'e', 'sin', 'de', 'tampoco', 'anadid[oa]s?', 'azucar(?:es)?', 'conservantes?', 'colorantes?',
  'aditivos', 'grasas?', 'sal', 'aceite de palma', 'edulcorantes?', 'alcohol', 'cafeina', 'gas',
  Object.values(NEG_WORDS),
);
const NEG_LEAD = alt('sin', 'libres? de', 'no contiene', 'no lleva', 'exent[oa]s? de', '0 de', 'cero');

export const NEGATION_RES = Object.fromEntries(
  Object.entries(NEG_WORDS).map(([k, words]) => [
    k,
    new RegExp(`${B}(?:${NEG_LEAD})(?: (?:${NEG_FILLER}))*? (?:${words})${E}`),
  ]),
);

export const NEGATION_EXTRA = [
  { re: wordRe('apt[oa]s? (?:para )?celiacos|para celiacos|gluten free|glutenfree', ''), negates: ['gluten'] },
  {
    re: wordRe('(?<!no )vegan[oa]s?|(?<!no )vegan', ''),
    negates: ['carne', 'cerdo', 'pescado', 'marisco', 'leche', 'huevo', 'miel', 'gelatina', 'lactosa'],
  },
  { re: wordRe('(?<!no )vegetarian[oa]s?', ''), negates: ['carne', 'cerdo', 'pescado', 'marisco', 'gelatina'] },
];

// ---------------------------------------------------------------------------
// Contextos para las reglas
// ---------------------------------------------------------------------------

// Tortilla de huevo (no las de trigo o maíz para wraps).
const TORTILLA_HUEVO = 'tortillas?(?! (?:de )?(?:maiz|trigo|harina|mexicanas?|wrap)| para (?:fajitas|burritos|tacos|wraps?))';
const EMBUTIDO_CURADO_WORDS = alt(
  'jamon(?:es)?', 'paletas?', 'chorizos?', 'choricitos?', 'salchichon(?:es)?', 'fuets?', 'salamis?', 'pepperoni',
  'lomos?(?: embuchados?)?', 'sobrasadas?', 'chistorra', 'cecina', 'embutidos?', 'ibericos', 'prosciutto',
);
const CHEESE_WORDS = alt(
  'quesos?', 'brie', 'camembert', 'provolone', 'rulos?', 'mozzarella', 'mozarella', 'burrata', 'feta', 'halloumi',
  'parmesano', 'emmental', 'gouda', 'cheddar', 'gruyere', 'roquefort', 'cabrales', 'gorgonzola', 'manchego',
  'idiazabal', 'tetilla', 'scamorza', 'reblochon', 'coulommiers', 'torta del casar', 'torta de la serena',
);
const CHEESE_HEAT = alt(
  'al horno', 'horneado', 'hornead[oa]s?', 'gratinad[oa]s?', 'fundid[oa]s?(?! (?:en|para) (?:lonchas|porciones|untar|sandwich))',
  'derretid[oa]s?', 'a la plancha', 'a la parrilla', 'a la brasa', 'plancha', 'frit[oa]s?', 'rebozad[oa]s?',
  'empanad[oa]s?', 'en tempura', 'asad[oa]s?',
);

export const CTX = {
  fish: wordRe(FISH_SRC, ''),
  marisco: wordRe(MARISCO_SRC, ''),
  carne: wordRe(CARNE_SRC, ''),
  embutido: wordRe(EMBUTIDO_SRC, ''),
  huevo: wordRe(alt('huevos?', 'yemas?', 'claras?'), ''),
  lacteo: wordRe(alt('leches?', 'quesos?', 'nata', 'yogur(?:es)?'), ''),
  vegetal: wordRe(
    alt(
      'verduras?', 'hortalizas?', 'vegetales', 'tomates?', 'lechugas?', 'zanahorias?', 'cebollas?', 'cebolletas?',
      'pimientos?', 'pepinos?', 'champinon(?:es)?', 'setas?', 'calabacin(?:es)?', 'brocoli', 'coliflor', 'espinacas?',
      'crudites', 'ajos?', 'ensaladas?', 'esparragos?', 'apio', 'rabanitos?', 'rabanos?', 'remolachas?', 'col',
      'repollo', 'lombarda', 'aguacates?', 'maiz', 'guisantes?', 'judias verdes', 'canonigos', 'rucula', 'escarola',
      'endivias?', 'brotes', 'frutas?', 'manzanas?', 'peras?', 'platanos?', 'naranjas?', 'fresas?', 'kiwis?',
      'pinas?', 'mangos?', 'melon(?:es)?', 'sandias?', 'uvas?', 'frutos rojos', 'hinojo', 'alcachofas?',
      'berenjenas?', 'patatas?', 'boniatos?', 'calabazas?', 'puerros?', 'nabos?', 'chirivias?', 'germinados?',
      'miel(?:es)?',
    ),
    '',
  ),
  crudo: wordRe('crud[oa]s?', ''),
  pocoHecho: wordRe(alt('(?:muy )?poco hech[oa]s?', 'al punto', 'sangrante', 'vuelta y vuelta', 'a la sangre', 'poco cocinad[oa]s?'), ''),
  ahumado: wordRe('ahumad[oa]s?', ''),
  vinagre: wordRe(alt('en vinagre(?:ta)?', 'al vinagre', 'marinad[oa]s? en vinagre'), ''),
  marinado: wordRe('marinad[oa]s?', ''),
  // Embutido curado cocinado de verdad dentro del plato (croqueta, pizza, guiso, sofrito, horno…).
  cookedDish: wordRe(
    alt(
      'croquetas?', 'croquetitas?', 'pizzas?', 'pizzetas?', 'calzone', 'guisos?', 'guisad[oa]s?', 'sofritos?',
      'al horno', 'horno', 'horneado', 'hornead[oa]s?', 'hervid[oa]s?', 'estofad[oa]s?', 'lentejas', 'fabada',
      'fabes', '(?<!(?:jamon|pavo|paleta|pollo|fiambre|lacon|huevo|marisco|pulpo|langostino|arroz|maiz) )cocido(?! (?:extra|en lonchas|loncheado))',
      'potajes?', 'hornazos?', 'bollos? prenaos?', TORTILLA_HUEVO, 'migas', 'revueltos?', 'salteados?', 'salteadas?',
      'empanadas?', 'empanadillas?', 'hojaldres?', 'quiches?', 'garbanzos', 'alubias', 'judias(?! verdes)',
      'callos', 'al infierno', 'a la sidra', 'al vino', 'lasanas?', 'canelones', 'macarrones', 'espaguetis?',
      'tallarines', 'risotto', 'paellas?', 'flamenquin(?:es)?', 'cachopos?', 'san jacobos?', 'rellen[oa]s?',
      'gratinad[oa]s?', 'en salsa', 'choripan', 'cocinad[oa]s? dentro', 'habas', 'guisantes', 'pochas',
      'a la riojana', 'pote',
    ),
    '',
  ),
  // Lo que se añade después del horno o en frío ya no cuenta como cocinado («pizza con jamón ibérico al final»).
  rawMarker: wordRe(
    alt(
      'al final', 'en crudo', 'sin hornear', 'despues del horno', 'despues de hornear', 'tras el horno', 'tras hornear',
      'a la salida del horno', 'al salir del horno', 'fuera del horno', 'al servir', 'en frio', 'fri[oa]s?',
      `(?:${EMBUTIDO_CURADO_WORDS})(?: [a-z]+){0,2} crud[oa]s?`,
    ),
    '',
  ),
  // Platos fríos: el horno o la sartén de otro ingrediente no calientan lo que va dentro
  // («ensalada de pasta con york», «bocadillo de tortilla con york», «ensalada con queso gratinado y jamón»).
  coldDish: wordRe(
    alt(
      'ensaladas?', 'ensaladillas?', 'fri[oa]s?', 'tablas?', 'carpaccios?', 'tartar(?:e|es)?', 'canapes?', 'bagels?',
      'tostas?', 'tostadas?', 'montaditos?', 'bocadillos?', 'bocatas?', 'pulgas?', 'pintxos? frios?', 'wraps?',
      'sandwich(?:es)?(?! (?:mixtos?|calientes?|a la plancha|tostados?))',
    ),
    '',
  ),
  // Fiambre de bandeja calentado de verdad: platos concretos (pizza, croqueta, sándwich mixto…) o pegado al fiambre
  // («york a la plancha», «pavo fundido»). No «al horno» ni «asado» a secas: «jamón cocido al horno» y «pavo asado»
  // son fiambres de bandeja.
  fiambreHeat: wordRe(
    alt(
      'croquetas?', 'croquetitas?', 'pizzas?', 'pizzetas?', 'calzone', 'lasanas?', 'lasagna', 'canelones',
      'quiches?', 'empanadas?', 'empanadillas?', 'hojaldres?', 'revueltos?', TORTILLA_HUEVO, 'gratinad[oa]s?',
      'macarrones', 'sandwich(?:es)? (?:mixtos?|calientes?|a la plancha|tostados?)', 'mixtos? calientes?', 'bikinis?',
      'croque monsieur', 'san jacobos?', 'sanjacobos?', 'cachopos?', 'flamenquin(?:es)?', 'pastel de carne',
    ),
    '',
  ),
  // …o pegado al fiambre (cuenta aunque el plato sea frío: «tosta de york fundido»).
  fiambreNext: wordRe(
    `(?:york|jamon (?:de )?(?:cocido|york|dulce)|pavo|chopped|mortadela|fiambres?)(?: [a-z]+){0,2} (?:${alt(
      'a la plancha', 'plancha', 'calientes?', 'fundid[oa]s?', 'gratinad[oa]s?', 'frit[oa]s?', 'rebozad[oa]s?',
    )})`,
    '',
  ),
  // Queso cocinado de verdad: verbo pegado al queso («camembert al horno», «queso de cabra gratinado»,
  // «gratinado de queso»). Entre medias no puede haber «con», «y»…: «queso con tomate frito» no es queso frito.
  cheeseCooked: wordRe(
    `(?:${CHEESE_WORDS})(?: (?!(?:con|y|e|sobre|sin|en|o)(?![a-z]))[a-z]+){0,2} (?:${CHEESE_HEAT})|(?:gratinad[oa]s?|gratin|fundid[oa]s?|horneado|al horno) (?:con|de|al) (?:${CHEESE_WORDS})|provoletas?|fondues?(?! de chocolate)|raclettes?`,
    '',
  ),
  // Platos en los que el queso se hornea o se fríe dentro.
  cheeseDish: wordRe(
    alt(
      'croquetas?', 'croquetitas?', 'pizzas?', 'pizzetas?', 'calzone', 'lasanas?', 'lasagna', 'canelones', 'quiches?',
      'empanadas?', 'empanadillas?', 'sandwich(?:es)? mixtos?', 'bikinis?', 'croque monsieur', 'san jacobos?',
      'sanjacobos?', 'cachopos?', 'flamenquin(?:es)?', 'provoletas?', 'fondues?(?! de chocolate)', 'raclettes?',
    ),
    '',
  ),
  // Pescado ahumado cocinado en un plato caliente (no en pizza: el ahumado se suele poner al final).
  smokedHeat: wordRe(
    alt(
      'pastas?', 'espaguetis?', 'spaghetti', 'tallarines', 'macarrones', 'penne', 'tagliatelle', 'fettuccine',
      'raviolis?', 'risotto', 'quiches?', 'revueltos?', TORTILLA_HUEVO, 'al horno', 'horneado', 'hornead[oa]s?',
      'gratinad[oa]s?', 'lasanas?', 'canelones', 'croquetas?', 'empanadas?', 'empanadillas?', 'salteados?',
      'cocinad[oa]s?', 'en caliente',
    ),
    '',
  ),
  // Brotes y germinados cocinados (salteado, wok, sopa…).
  sproutHeat: wordRe(
    alt(
      'salteados?', 'salteadas?', 'wok', 'sopas?', 'caldos?', 'ramen', 'rollitos?(?: de primavera)?', 'revueltos?',
      TORTILLA_HUEVO, 'al horno', 'frit[oa]s?', 'cocinad[oa]s?', 'hervid[oa]s?', 'a la plancha', 'en tempura',
      'tempura', 'guisad[oa]s?', 'estofad[oa]s?', 'chop suey', 'yakisoba', 'tallarines salteados',
    ),
    '',
  ),
  // Formas de cocinar que solo cuentan pegadas al embutido («chorizo frito», «jamón a la plancha»):
  // «patatas fritas con jamón» lleva el jamón apoyado al servir, no cocinado.
  cookedNextToEmbutido: wordRe(
    `(?:jamon(?:es)?|chorizos?|choricitos?|salchichon(?:es)?|fuets?|salamis?|lomos?(?: embuchados?)?|sobrasadas?|chistorra|cecina|paletas?|embutidos?)(?: [a-z]+){0,2} (?:${alt(
      'frit[oa]s?', 'a la (?:plancha|brasa|parrilla)', 'plancha', 'asad[oa]s?', 'braseado', 'salteado', 'hervid[oa]s?',
      'cocid[oa]s?', 'guisad[oa]s?', 'estofad[oa]s?', 'a la sidra', 'al vino', 'al infierno', 'al horno',
      'horneado', 'hornead[oa]s?', 'gratinad[oa]s?', 'fundid[oa]s?',
    )})`,
    '',
  ),
  // Alcohol solo como salsa o guiso («al vino», «a la sidra», «reducción de Pedro Ximénez»…).
  alcoholCooking: wordRe(
    alt(
      'salsas?', 'guisos?', 'guisad[oa]s?', 'estofad[oa]s?', 'reduccion(?:es)?', 'reducid[oa]s?', 'flambead[oa]s?',
      'flamead[oa]s?', 'flambe', 'hornead[oa]s?', 'horneado', 'al horno', 'horno', 'al vino(?: tinto| blanco)?',
      'a la sidra', 'al jerez', 'al cava', 'al oporto', 'al pedro ximenez', 'al brandy', 'al conac', 'al vermut',
      'al marsala', 'al madeira', 'a la cerveza', 'en salsa', 'braseado', 'a la marinera', 'marinera', 'bourguignon',
      'caldereta', 'civet', 'risotto', 'a la riojana', 'cocinad[oa]s? (?:con|en|al)', 'chorizo a la sidra',
    ),
    '',
  ),
  // …salvo que haya bebida de verdad en la mesa.
  alcoholDrink: wordRe(
    alt('copas?', 'vasos?', 'sangrias?', '(?<!a la )cervezas?', CLARA_SRC, 'tinto de verano', 'mojitos?', 'cubatas?',
      'chupitos?', 'jarras?', 'botellas?', 'botellin(?:es)?', 'cana(?! de (?:lomo|azucar))', 'canas(?! de (?:lomo|azucar))',
      'tercios?', 'gin tonic', 'gintonic', 'calimocho', 'rebujito', 'borrach[oa]s?'),
    '',
  ),
  // Vino o licor que se añade al final o se flamea: queda alcohol («Con cuidado»).
  flambe: wordRe(alt('flambead[oa]s?', 'flamead[oa]s?', 'flambe', 'al final', 'en crudo'), ''),
  // Guiso largo (el vino hierve de verdad): «Sí».
  guisoLargo: wordRe(
    alt(
      'guisad[oa]s?', 'guisos?', 'estofad[oa]s?', 'brasead[oa]s?', 'carrilleras?', 'carrilladas?', 'rabo de toro',
      'bourguignon', 'caldereta', 'civet', 'cocido', 'a la sidra', 'a la marinera', 'marinera', 'risotto',
      'a la riojana', 'hornead[oa]s?', 'al horno', 'cocinad[oa]s? (?:con|en|al)',
    ),
    '',
  ),
  salsaVino: wordRe(alt('salsas?', 'reduccion(?:es)?', 'reducid[oa]s?'), ''),
  sinAlcohol: wordRe(alt('sin alcohol', 'desalcoholizad[oa]s?', '00 alcohol', 'alcohol 00', 'cero alcohol'), ''),
  pasteurizado: wordRe('(?<!(?:sin|no) )pasteurizad[oa]s?', ''),
  noPasteurizado: wordRe(alt('sin pasteurizar', 'no pasteurizad[oa]s?', 'leches? crudas?', 'de leche cruda'), ''),
  sinLactosa: wordRe(alt('sin lactosa', '0 lactosa', 'libres? de lactosa', 'lactose free'), ''),
};

// Tipo de embutido (para el perfil) cuando solo sabemos que es «embutido cocinado».
export const EMBUTIDO_TYPE_RES = {
  jamon: wordRe('jamon(?:es)?(?! (?:de )?(?:cocido|york|dulce|en dulce|de pavo))|paletas? (?:iberica|serrana|curada|de bellota|de cebo)|cecina', ''),
  chorizo: wordRe('chorizos?|choricitos?|sobrasadas?', ''),
  salchichon: wordRe('salchichon(?:es)?|fuets?|espetec|salamis?|pepperoni', ''),
  lomo: wordRe('lomos? embuchad[oa]s?|cana de lomo|lomo curado|lomo iberico de bellota|lomito iberico', ''),
};

// ---------------------------------------------------------------------------
// Palabras clave → ids de la guía, de más específica a más general.
//
// ids: lista de huecos; cada hueco es un id o una lista de ids alternativos (se usa el primero que exista).
// Lista vacía = «bloqueo»: la expresión ocupa ese trozo de texto para que una regla posterior más general
// no lo pille («vinagre de vino» no es vino; «tortillas de trigo» no son tortilla de huevo).
// nameOnly: solo en el nombre (no en la lista de ingredientes de un producto).
// context: 'product' | 'text' → solo en ese tipo de clasificación.
// ---------------------------------------------------------------------------

const BEER = alt(
  'cervezas?', 'birras?', 'canas?', 'tercios?', 'botellin(?:es)?', 'quintos?', 'mahou', 'estrella(?: galicia| damm)?',
  'heineken', 'san miguel', 'alhambra', 'cruzcampo', 'amstel', 'ambar', 'damm', 'free damm', 'voll damm', 'keler',
  'moritz', 'carlsberg', 'coronita', 'corona', 'budweiser', 'radler', 'lager', 'tostada', CLARA_SRC,
);

const RAW_FISH_FOR_CUT = alt(
  'pescados?', 'salmon', 'atun', 'bacalao', 'lubina', 'dorada', 'corvina', 'pez [a-z]+', 'emperador', 'rape',
  'merluza', 'sardinas?', 'boquerones?', 'anchoas?', 'caballa', 'trucha', 'lenguado', 'rodaballo', 'besugo', 'mero',
  'pargo', 'hamachi', 'seriola', 'pez mantequilla',
);
const RAW_SHELLFISH_FOR_CUT = alt(
  'gambas?', 'gambones?', 'carabineros?', 'langostinos?', 'cigalas?', 'vieiras?', 'zamburinas?', 'quisquillas?',
);

const ANCHOA_SALAZON =
  '(?<!rellen[oa]s? (?:de|con) )anchoas?(?! (?:fritas?|rebozadas?|a la plancha|al horno|en tempura|asadas?|frescas?))';

function rule(ids, src, opts = {}) {
  return { ids: Array.isArray(ids) ? ids : [ids], src, ...opts };
}
const any = (...ids) => [ids]; // un solo hueco con alternativas
const block = (src, opts) => rule([], src, opts);

const RULE_DEFS = [
  // --- Precisiones más específicas que la lista de la especificación ---
  rule('carne-poco-hecha', 'tatakis? de (?:ternera|buey|vaca|res|wagyu|presa|secreto|solomillo|cerdo|pato|ciervo|venado|retinto)'),
  rule('marisco-cocido', 'carpaccios? de pulpo'),
  block('carpaccios? de (?:calabacin|tomate|remolacha|pina|setas?|champinon(?:es)?|verduras?|calabaza|pepino|fresas?|mango|melon|sandia|higos?|naranja|alcachofas?|esparragos?|portobellos?|boletus|hongos)'),
  block('tortillas? (?:de )?(?:maiz|trigo|harina|mexicanas?)|tortillas? para (?:fajitas|burritos|tacos|wraps?)'),
  rule('fiambre-loncheado', 'cabeza de jabali'),
  block('(?:estilo )?new york(?: cheese ?cake)?'),
  rule(
    'carne-bien-hecha',
    '(?:chuleton(?:es)?|chuletas?|txuletas?|entrecots?|solomillos?|carnes?|filetes?|magret(?: de pato)?|steak|lomo (?:alto|bajo))(?: [a-z]+){0,2} (?:(?:bien|muy) hech[oa]s?|hech[oa]s? del todo|(?:bien|muy) pasad[oa]s?)',
  ),
  rule(
    'carne-bien-hecha',
    'pechugas? de (?:pollo|pavo|pato) (?:a la (?:plancha|brasa|parrilla|crema|naranja)|al (?:horno|ajillo|curry|vino)|asad[oa]s?|frit[oa]s?|empanad[oa]s?|rellen[oa]s?|guisad[oa]s?|en salsa|en su jugo|estofad[oa]s?)',
  ),
  rule(
    'huevo-bien-hecho',
    'huevos? (?:frit[oa]s? |a la plancha )?(?:(?:bien|muy) hech[oa]s?|bien cuajad[oa]s?|con (?:la )?yema (?:bien )?(?:hecha|cuajada|dura))',
  ),
  // Horchata (cuestionario de la clienta): de brick o pasteurizada, «Sí»; artesana o sin pasteurizar, «Mejor no»;
  // a secas, «Con cuidado». Antes que la leche cruda («sin pasteurizar») para no leerla como leche.
  rule(
    'horchata-artesana',
    'horchatas?(?: [a-z]+){0,2} (?:artesan[oa]s?|artesanal(?:es)?|sin pasteurizar|no pasteurizad[oa]s?|recien hech[oa]s?|caseras?|de horchateria|a granel)',
    { nameOnly: true },
  ),
  rule(
    'horchata-pasteurizada',
    'horchatas?(?: [a-z]+){0,2} (?:pasteurizad[oa]s?|de brick|de brik|en brick|en brik|uht|esterilizad[oa]s?|envasad[oa]s?|embotellad[oa]s?|de botella)',
    { nameOnly: true },
  ),
  rule('horchata', 'horchatas?(?: de chufa)?|(?:leches?|bebidas?) de chufa'),
  rule('pate', 'mousses? de (?:pato|foie|higado|oca|pate|cerdo|ave|campana|pollo)'),

  // 1. Mercurio alto
  rule('pescado-mercurio', 'pez espada|emperador|atun(?:es)? rojos?|tiburon(?:es)?|cazon|marrajos?|tintoreras?|mielgas?|pintarrojas?|lucios?'),
  // 2. Pescado crudo
  rule(
    'marisco-crudo',
    `(?:carpaccios?|tartar(?:e|es)?|crudos?) de (?:${RAW_SHELLFISH_FOR_CUT})|(?:${RAW_SHELLFISH_FOR_CUT}) crud[oa]s?|ostras?(?! (?:gratinadas?|a la (?:parrilla|plancha|brasa)|al horno|fritas?|cocidas?|al vapor|en tempura|rebozadas?))|ostiones?|marisco crudo|mariscos crudos|erizos?(?: de mar)?|almejas? vivas?`,
  ),
  rule(
    'pescado-crudo',
    `sushis?|sashimis?|nigiris?|makis?|uramakis?|temakis?|gunkans?|california rolls?|ceviches?|cebiches?|tiraditos?|leche de tigre|tatakis?|pokes?|poke bowls?|esqueixada|gravlax|(?:carpaccios?|tartar(?:e|es)?|crudos?) de (?:${RAW_FISH_FOR_CUT})|pescados? crudos?|pescado marinado|salmon marinado`,
  ),
  // 3. Ahumados
  rule(
    'pescado-ahumado',
    '(?:salmon(?:es)?|truchas?|bacalao|sardinas?|anguilas?|arenques?|caballas?|atun|esturion|palometa|pescados?)(?: [a-z]+){0,2} ahumad[oa]s?|ahumad[oa]s? de (?:salmon|trucha|bacalao|sardina|anguila|arenque|caballa|pescado)|(?:tablas?|surtido|plato|tostas?) de ahumados|ahumados variados',
  ),
  // 4. En vinagre
  rule(
    'boquerones-vinagre',
    '(?:boquerones?|anchoas?|sardinas?|bocartes?|caballas?)(?: [a-z]+){0,2} (?:en |al )?vinagre(?:ta)?|(?:boquerones?|anchoas?|bocartes?) marinad[oa]s?',
  ),
  // Anchoas en salazón (cuestionario de la clienta: «Mejor no»). No las aceitunas rellenas de anchoa ni las
  // anchoas frescas fritas (son boquerones). En un producto envasado, solo en el nombre.
  rule('anchoas-salazon', `${ANCHOA_SALAZON}`, { context: 'text' }),
  rule('anchoas-salazon', `${ANCHOA_SALAZON}`, { context: 'product', nameOnly: true }),
  // 5. Carne cruda: tartar y carpaccio
  rule('tartar', 'steak tartar(?:e)?|tartar(?:e|es)?(?: de (?:ternera|buey|vaca|res|solomillo|wagyu|retinto|carne))?'),
  rule('carpaccio', 'carpaccios?(?: de (?:ternera|buey|vaca|res|solomillo|wagyu|cecina|pato|presa|secreto|retinto|carne))?'),
  // Huevo y tortilla poco hechos (antes que «poco hecha» de la carne).
  rule(
    'tortilla-poco-cuajada',
    'tortillas?(?: de [a-z]+(?: (?:y|con) [a-z]+)?)? (?:poco (?:hech|cuajad)[oa]s?|jugosas?|babosas?|sin cuajar|cremosas?|melosas?)|tortillas? (?:de )?betanzos',
  ),
  rule(
    'huevo-poco-hecho',
    '(?:huevos?|yemas?|claras?)(?: [a-z]+){0,2} (?:poco hech[oa]s?|crud[oa]s?|liquid[oa]s?|sin cuajar|poco cuajad[oa]s?|pasad[oa]s? por agua|a baja temperatura|a 6[0-9](?: grados)?|mollets?|poches?|pochad[oa]s?|escalfad[oa]s?)|huevos? (?:rotos|estrellados|frit[oa]s?)|huevos? (?:de (?:corral|granja|gallina|campo|casa) )?(?:frit[oa]s?|a la plancha)|huevos? (?:a la flamenca|al plato)|a caballo|(?<!(?:de|revueltos?|tortillas?) )huevos? con (?:patatas|chorizo|chistorra|jamon|morcilla|pimientos|bacon|beicon|panceta|salchichas|longaniza|picadillo|sobrasada)|yemas? liquidas?|poches?|huevos? (?:a la )?benedict(?:ine|ina|inos)?|revueltos? (?:jugosos?|poco hechos?|cremosos?|babosos?)|huevos? revueltos? (?:jugosos?|cremosos?|poco hechos?)',
  ),
  // 6. Poco hecha / al punto / sangrante
  rule('carne-poco-hecha', '(?:muy )?poco hech[oa]s?|al punto(?! de sal)|sangrante|vuelta y vuelta|a la sangre|poco cocinad[oa]s?|crud[oa] por dentro|rosbif|roast beef|magret(?: de pato)?'),
  rule('chuleton', 'chuleton(?:es)?|chuletas? de (?:vaca|buey)|txuletas?'),
  // 7. Mayonesa: de bote (supermercado o dicho expresamente) antes que casera.
  rule('mayonesa-bote', 'mayonesas?|mahonesas?|alioli|allioli|aioli|salsa alioli', { context: 'product' }),
  rule(
    'mayonesa-bote',
    '(?:mayonesas?|mahonesas?|alioli|allioli)(?: [a-z]+)? (?:de bote|de tarro|industrial(?:es)?|envasad[oa]s?|comercial(?:es)?|pasteurizad[oa]s?|del super|light)',
  ),
  // Casera dicho expresamente → «Mejor no».
  rule('mayonesa-casera', '(?:mayonesas?|mahonesas?|alioli|allioli|aioli|ajoaceites?) (?:caser[oa]s?|de la casa|artesan[oa]s?)|mayonesa de la casa'),
  // En la carta, «mayonesa» o «alioli» a secas pueden ser caseros: se pregunta («Con cuidado»). En un producto
  // envasado es de bote (arriba).
  rule('mayonesa-dudosa', 'alioli|allioli|ali oli|all i oli|aioli|ajoaceites?|mayonesas?|mahonesas?', { context: 'text' }),
  // 8. Tiramisú / mousse
  rule(any('tiramisu'), 'tiramisus?'),
  rule(any('mousse-casera', 'tiramisu'), 'mousses?(?: [a-z]+){0,3} (?:casera|de la casa)|semifrios?'),
  rule(any('mousse-casera', 'tiramisu'), 'mousses?|zabaglione|zabaione|sabayon', { context: 'text' }),
  // 9. Paté / foie / micuit
  rule('pate', 'pates?|foie(?: gras)?|micuit|mi cuit|terrinas? de (?:foie|pato|higado|campana)|rillettes'),
  // 10. Hígado
  rule('higado', 'higados?|higaditos?|higadillos?'),
  // 11. Caza
  rule(
    'caza',
    'caza(?: mayor| menor)?|carne de caza|jabali(?:es)?|venado|ciervo|corzo|gamo|rebeco|muflon|liebre|perdiz|perdices|faisan(?:es)?|becadas?|tordos?|torcaz|conejo de monte|pato salvaje',
  ),
  // 12. Leche cruda
  rule(
    'leche-cruda',
    'leches?(?: de (?:vaca|cabra|oveja|burra))? crudas?|de leche cruda|sin pasteurizar|no pasteurizad[oa]s?|leche sin tratar|torta del casar|torta de la serena',
  ),
  // 13. Quesos: rallado o loncheado (la forma manda), azul, blando con corteza.
  rule(
    'queso-loncheado-rallado',
    '(?:quesos?|parmesano|grana padano|emmental|mozzarella|gouda|edam|cheddar)(?: (?:de )?[a-z]+){0,2} (?:rallad[oa]s?|lonchead[oa]s?|en lonchas|en hilos?|en polvo|para (?:sandwich|gratinar|fundir|pizza))|lonchas? de queso|queso para gratinar',
  ),
  rule(
    'queso-azul',
    'quesos? azul(?:es)?|roquefort|cabrales|gorgonzola|valdeon|picon|tresviso|stilton|danablu|gamoneu|gamonedo|bleu d[a-z]+',
  ),
  // Tabla o surtido de quesos: suele llevar azul, de cabra o blandos; se pregunta («Con cuidado»).
  rule('queso-blando-corteza', '(?:tablas?|surtido|plato|plato variado|tabla variada|tabla de) (?:de )?quesos(?: variados)?|quesos variados'),
  rule(
    'queso-blando-corteza',
    'brie|camembert|rulos?(?: de cabra)?|quesos? de cabra|coulommiers|reblochon|chevre|crottin|queso de rulo|quesos? blandos?|queso de corteza (?:blanca|enmohecida|florida)',
  ),
  // 14. Fiambre de bandeja (antes que el jamón curado).
  rule(
    'fiambre-loncheado',
    '(?:bocadillos?|bocatas?|sandwich(?:es)?|tostas?|tostadas?|montaditos?|bagels?|pulgas?) (?:de |con )?(?:pechugas? de )?pavo(?! (?:a la|al|asad|frit|empanad|rellen|guisad|en salsa|en su jugo|estofad))|pavo (?:en frio|fiambre)|(?:sandwich(?:es)? )?mixtos? fri[oa]s?|jamon(?:es)? (?:de )?(?:cocido|york|dulce|en dulce|de pavo)(?: extra)?|(?<!new )york|pechugas? de pavo(?! (?:a la|al|asad|frit|empanad|rellen|guisad|en salsa|en su jugo|estofad))|pavo (?:loncheado|en lonchas|cocido|braseado)|fiambres?(?: de [a-z]+)?|chopped|mortadela|lonchas? de (?:pavo|pollo|york)|pollo (?:loncheado|en lonchas)|(?<!(?:jamon|serrano|iberico|curado|bellota|chorizo|salchichon|lomo|embuchado|fuet|salami|queso|cecina|sobrasada)(?: [a-z0-9]+){0,2} )loncheados?',
  ),
  // 15. Embutidos curados.
  rule(
    'lomo-embuchado',
    'lomos? embuchad[oa]s?|canas? de lomo|lomo curado|lomo iberico de bellota|lomito iberico|lomo iberico(?! (?:a la|al|asad|frit|plancha|braseado|en salsa|con))|lomo de bellota(?! (?:a la|al|asad|frit|plancha))',
  ),
  rule('sobrasada', 'sobrasadas?|sobrassada'),
  rule('chorizo', 'chorizos?(?! (?:de pavo|vegano|vegetal))|choricitos?'),
  rule('salchichon', 'salchichon(?:es)?(?! de pavo)|fuets?|espetec|salamis?|pepperoni|secallona'),
  // Tabla o surtido de ibéricos / embutidos (mezcla varios tipos).
  rule(
    'tabla-embutidos',
    '(?:tablas?|surtido|platos?|tabla variada) de (?:ibericos|embutidos(?: ibericos)?)|ibericos|embutidos?(?: ibericos| curados| variados)?',
  ),
  // 16. Jamón curado, con lookahead para no pillar «jamón cocido» ni «jamón york».
  rule(
    'jamon-curado',
    'jamon(?:es)?(?! (?:de )?(?:cocido|york|dulce|en dulce|de pavo))(?: (?:iberico|serrano|curado|crudo|de bellota|de cebo|de recebo|pata negra|gran reserva|reserva|loncheado|al corte|cortado a cuchillo))*|paletas? (?:iberica|serrana|curada|de bellota|de cebo)|paletillas? (?:iberica|serrana|curada)|pata negra|jabugo|cecina',
  ),
  // «Levadura de cerveza» no es cerveza.
  rule('levadura', 'levaduras?(?: de cerveza| nutricional(?:es)?)?', { nameOnly: true }),
  // 17. Bebidas: cerveza 0,0, sin alcohol, alcohol.
  rule(
    'cerveza-00',
    `(?:${BEER}|sin alcohol|sin)(?: [a-z0-9.]+){0,3}? (?:00|0 0|cero cero)(?: por ciento)?|(?:00|cero cero)(?: [a-z]+){0,2} (?:cervezas?|tostada|lager|radler)|cero alcohol|alcohol 00|00 alcohol`,
  ),
  rule(
    'cerveza-sin',
    `(?:${BEER})(?: [a-z]+){0,2}? sin alcohol|(?:cervezas?|birras?|canas?|tercios?|botellin(?:es)?|mahou|estrella(?: galicia| damm)?|heineken|san miguel|alhambra|cruzcampo|amstel|ambar|damm|keler|carlsberg) sin(?! (?:gluten|lactosa|azucar(?:es)?|filtrar|pasteurizar|alcohol))|una sin$|cervezas? desalcoholizadas?`,
  ),
  rule(
    any('sin-alcohol', 'cerveza-sin'),
    '(?:vinos?|cava|sidras?|vermut|vermu|vermouth|mojitos?|sangrias?|tinto de verano|cocktails?|coctel(?:es)?|coctail|combinados?|gin tonic|espumosos?|champan|champagne|bebidas?|lambrusco|moscatel)(?: [a-z]+){0,2}? (?:sin alcohol|desalcoholizad[oa]s?)',
  ),
  // «Plato combinado» es un plato, no una bebida.
  block('platos? combinad[oa]s?'),
  block(
    'vinagres?(?: (?:de )?(?:vino|jerez|modena|sidra|cava|manzana|arroz|balsamico|blanco|tinto|pedro ximenez|frambuesa))*|vinagreta|aceto(?: balsamico)?|balsamico',
  ),
  rule('alcohol', 'agua de valencia'),
  rule(
    'alcohol',
    alt(
      'vinos?', 'tintos?', 'tinto de verano', 'cava', 'cavas', 'champan', 'champagne', 'espumosos?', 'sidras?', 'vermut',
      'vermu', 'vermouth', 'sangrias?', 'mojitos?', 'cubatas?', 'licor(?:es)?', 'licor de [a-z]+', 'al licor', 'orujo',
      'pacharan', 'anis del mono', 'anisete', 'aguardientes?', 'ron', 'ginebra', 'gin', 'gin tonic', 'gintonic', 'vodka',
      'whisky', 'whiskey', 'brandy', 'conac', 'cognac', 'tequila', 'mezcal', 'pisco', 'jerez', 'amontillado',
      'oloroso', 'oporto', 'marsala', 'madeira', 'pedro ximenez', 'moscatel', 'lambrusco', 'rioja', 'ribera del duero',
      'albarino', 'verdejo', 'txakoli', 'chacoli', 'calimocho', 'kalimotxo', 'rebujito', 'carajillos?', 'chupitos?',
      'cervezas?', 'birras?', 'canas?(?! de (?:lomo|azucar))', 'tercios?', 'botellin(?:es)?', 'cocktails?',
      'coctel(?:es)?', 'coctail', 'combinados?', 'alcohol(?:es)?', 'alcoholic[oa]s?', 'bebidas? alcoholicas?', 'sake',
      'soju', 'baileys', 'crema de orujo', 'limoncello', 'amaretto', 'cointreau', 'kirsch', 'calvados', 'absenta',
      'aperol', 'spritz', 'campari', 'martini', 'bellini', 'daiquiri', 'pina colada', 'caipirinha', 'caipiroska',
      'cosmopolitan', 'clara de cerveza', 'clara con limon', CLARA_SRC, 'queimada', 'mistela', 'sol y sombra', 'borrach[oa]s?',
    ),
  ),
  // 18. Bebida energética
  rule(
    'bebida-energetica',
    'bebidas? energeticas?|energeticas?|energy drinks?|red bull|redbull|monster(?: energy)?|burn|rockstar|bebidas? energizantes?',
  ),
  // 19. Café (descafeinado antes: lo anula).
  rule(
    'descafeinado',
    '(?:(?:cafes?|capuchinos?|cappuccinos?|cortados?|lattes?|espressos?|expresos?|tes?|cola|coca cola)(?: [a-z]+){0,2} )?(?:descafeinad[oa]s?|descaf|decaf|deca|sin cafeina|sin teina|desteinad[oa]s?)',
  ),
  rule(
    'cafe',
    'cafes?|espressos?|expresos?|cortados?|capuchinos?|cappuccinos?|lattes?|macchiatos?|frappuccinos?|frappe|cafe bombon|nespresso|capsulas de cafe|moka',
  ),
  // 20. Infusiones a evitar, manzanilla y té. Cuestionario de la clienta: kombucha y poleo «Mejor no»; tila y
  // jengibre «Con cuidado»; rooibos «Sí». Antes que «té», que si no se queda con «té de…».
  rule('kombucha', 'kombuchas?|tes? (?:de )?kombucha'),
  rule('poleo-menta', '(?:(?:infusion(?:es)?|tes?|tisanas?) de )?poleos?(?: menta)?|menta poleo'),
  rule('tila', '(?:(?:infusion(?:es)?|tes?|tisanas?) de )?(?:tilas?|tilo|flor(?:es)? de tilo)'),
  rule(
    'infusion-jengibre',
    '(?:infusion(?:es)?|tes?|tisanas?|aguas?|shots?|chupitos?) (?:de |con )?jengibre(?: (?:y|con) limon)?|jengibre (?:en infusion|con limon)|^jengibre(?: (?:fresco|en polvo|molido|en rama))?$|^raiz de jengibre$',
  ),
  rule('rooibos', '(?:(?:infusion(?:es)?|tes?) (?:de )?)?rooibos', { nameOnly: true }),
  rule('infusiones-evitar', '(?:infusion(?:es)?|tes?|tisanas?|raiz|palo|extracto|rama|hojas?) de (?:sen|regaliz|ruda)|sen|regaliz|ruda'),
  rule('manzanilla', 'manzanillas?(?! de sanlucar)|camomila|infusion(?:es)? de manzanilla'),
  block('tes? (?:de )?(?:frutas|hierbas|frutos rojos)|infusion(?:es)? de frutas'),
  rule(
    'te',
    'tes? (?:verde|negro|rojo|blanco|azul|matcha|chai|helado|frio|con leche|con limon|earl grey|ingles|moruno|marroqui|de jazmin|de menta|pakistani)|matcha|chai(?: latte)?|earl grey|pu erh|oolong|darjeeling|sencha|bancha|kukicha|genmaicha|ice tea|iced tea|nestea|tes?',
  ),
  // Chocolate antes que cola («Cola Cao»).
  rule(
    'chocolate',
    'chocolates?|cacao(?: soluble| en polvo| puro| desgrasado)?|colacao|cola cao|nesquik|bombon(?:es)?|chocolatinas?|nocilla|nutella|crema de cacao',
  ),
  block('colas? de (?:rape|langosta|langostinos?|cerdo|toro|buey|pescado|caballo|gambas?|cangrejo|vaca|ternera|carabinero)'),
  rule('cola', 'coca colas?|cocacola|pepsi(?: max)?|refrescos? de cola|colas?(?: zero| light)?|dr pepper'),
  // 21. Restaurante
  rule('ensalada-cesar', 'ensaladas? (?:cesar|caesar)|caesar salad|cesar salad|salsa cesar'),
  rule('ensaladilla', 'ensaladillas?(?: rusas?)?|ensalada rusa'),
  // Tarta de queso fría o sin hornear: nada la cocina («Con cuidado»); la horneada es «Sí».
  rule(
    'tarta-queso-fria',
    'tartas? de quesos?(?: [a-z]+){0,2} (?:fria|sin hornear|sin horno)|tartas? (?:fria|sin hornear|sin horno)(?: de quesos?)?|cheese ?cakes? (?:fria|frio|sin hornear)|tarta fria de queso',
  ),
  rule('tarta-queso', 'tartas? de quesos?|cheese ?cakes?|pastel(?:es)? de queso|tarta new york|tarta de la vina'),
  rule(
    'germinados',
    'germinad[oa]s?|brotes? de (?:soja|alfalfa|rabanos?|rabanitos?|brocoli|judias?(?: mungo)?|mungo|lentejas?|trebol|cebolla|puerro|girasol|guisantes?|fenogreco|mostaza)|alfalfa',
  ),
  // 22. Atún en lata y atún
  rule(
    'atun-lata',
    'atun(?:es)? (?:en (?:lata|conserva|aceite(?: de oliva| vegetal| de girasol)?|escabeche)|al natural|claro|blanco|enlatado|de lata|light)|latas? de atun|bonito del norte|bonito (?:en (?:aceite|conserva|escabeche|lata)|al natural)|ventrescas?(?: de (?:atun|bonito))?|melvas?(?: canutera)?',
  ),
  rule('atun-plancha', 'atun(?:es)?|bonito'),
  rule('salmon-hecho', 'salmon(?:es)?|truchas?'),

  // --- Más general (después de la lista de la especificación) ---
  // Bebidas vegetales, separadas por alérgeno (avena o espelta: gluten; soja; frutos secos).
  rule('bebida-avena', '(?:bebidas?|leches?)(?: vegetal(?:es)?)? de (?:avena|espelta)', { nameOnly: true }),
  rule('bebida-soja', '(?:bebidas?|leches?)(?: vegetal(?:es)?)? de (?:soja|soya)', { nameOnly: true }),
  rule(
    'bebida-almendras',
    '(?:bebidas?|leches?)(?: vegetal(?:es)?)? de (?:almendras?|avellanas?|anacardos?|nueces)',
    { nameOnly: true },
  ),
  rule(
    'bebida-vegetal',
    'bebidas? (?:vegetal(?:es)?|de (?:arroz|coco))(?: de (?:arroz|coco))?|leches? de (?:arroz|coco)',
    { nameOnly: true },
  ),
  rule('yogur', 'yogur(?:es|t|ts)?|yoghourt|yoghurt|bifidus|kefir|skyr'),
  rule(
    'queso-fresco',
    'quesos? fresc[oa]s?|queso de burgos|(?<!morcilla de )burgos|requeson|mozzarella|mozarella|mozzarela|burrata|ricotta|mascarpone|feta|cottage|quark|queso batido|queso crema|queso de untar|queso tierno|queso blanco|cuajada|mato',
  ),
  rule(
    'queso-curado',
    'quesos?(?: (?:curad[oa]s?|semicurad[oa]s?|viejos?|anejos?|de oveja|de vaca|mezcla|manchego|fundido))?|manchego|parmesano|parmigiano|grana padano|pecorino|emmental|gruyere|gouda|edam|cheddar|idiazabal|tetilla|mahon|zamorano|roncal|majorero|provolone|havarti|comte|raclette|maasdam|tronchon|arzua|san simon|quesitos?',
  ),
  rule(
    'leche-pasteurizada',
    'leches?(?: (?:entera|desnatada|semidesnatada|semi|uht|pasteurizada|esterilizada|en polvo|condensada|evaporada|fresca|sin lactosa|de vaca|de cabra|de oveja|con cacao|chocolatada|infantil|de crecimiento))*',
  ),
  rule('huevo-bien-hecho', 'huevos? (?:duros?|cocidos?|bien hech[oa]s?|bien cuajad[oa]s?)|huevo duro'),
  // «Huevos» a secas (la compra): solo el nombre entero, para no pillar «huevos con…».
  rule(
    'huevos-frescos',
    '(?:^|(?<=[|] ))(?:media )?(?:huevos?|docena de huevos)(?: (?:frescos?|camperos?|ecologicos?|de corral|de gallina|de granja|xl|l|m))*(?=$| [|])',
    { nameOnly: true },
  ),
  rule('revuelto', 'huevos? revueltos?|revueltos?'),
  rule(
    'tortilla-patata',
    'pinchos? de tortilla|tortillas?(?: (?:de )?(?:patatas?|papas|espanola|de cebolla|francesa))?',
  ),
  rule('hamburguesa', 'hamburguesas?|burgers?|smash burgers?|cheeseburgers?'),
  rule(
    'carne-bien-hecha',
    alt(
      'carnes?(?! (?:cruda|poco hecha|de caza))', 'filetes? de (?:ternera|vaca|cerdo|pollo|pavo|buey|lomo|cordero)',
      'pechugas? de (?:pollo|pavo|pato)', 'terneras?', 'vaca', 'buey(?! de mar)', 'novillo', 'pollos?', 'pavo',
      'gallina', 'pularda', 'capon', 'corderos?', 'lechazo', 'cabrito', 'cochinillo', 'cerdo', 'conejo', 'patos?',
      'codorniz', 'codornices', 'pichon', 'solomillos?', 'entrecots?', 'chuletas?',
      'chuletillas?', 'pechugas?', 'muslos?', 'contramuslos?', 'alitas?', 'costillas?', 'costillar', 'secreto',
      'presa', 'pluma', 'carrilladas?', 'carrilleras?', 'rabo de toro', 'albondigas?', 'escalopes?', 'escalopines?',
      'cachopos?', 'flamenquin(?:es)?', 'san jacobos?', 'codillos?', 'churrasco',
      'lomos?(?! (?:alto |bajo )?de (?:bacalao|atun|salmon|merluza|bonito|pez|rape|corvina|lubina|dorada|trucha))',
      'morcillo', 'osobuco', 'tournedos?', 'kebab', 'shawarma', 'gyros', 'callos', 'torreznos?',
      'panceta', 'bacon', 'beicon', 'parrillada de carne', 'pollo asado', 'cocido', 'lacon', 'rabo de toro',
    ),
  ),
  rule(
    'pescado-azul-pequeno',
    'sardinas?|sardinillas?|boquerones?|bocartes?|anchoas? (?:fritas?|rebozadas?|a la plancha|al horno|en tempura|asadas?|frescas?)|caballas?|jurel(?:es)?|chicharros?|salmonetes?|arenques?|espadines?|xoubas?|chanquetes?',
  ),
  rule(
    'pescado-blanco-plancha',
    'pescad(?:o|os|ito|itos)(?: blancos?)?|pescaitos?|lubinas?|merluzas?|pescadillas?|doradas?|rapes?|bacalao(?:s|es)?|bacaladitos?|lenguados?|gallos?|rodaballos?|besugos?|meros?|abadejos?|cabrachos?|corvinas?|san pedro|sargos?|pargos?|percas?|pangas?|tilapias?|rayas?|congrios?|platijas?|fletan(?:es)?|halibut|gallineta|acedias?|pijotas?',
  ),
  rule(
    'marisco-cocido',
    'mariscos?|mariscadas?|gambas?|gambones?|gambitas?|langostinos?|cigalas?|necoras?|centollos?|centollas?|bogavantes?|langostas?|carabineros?|camarones?|quisquillas?|cangrejos?|buey(?:es)? de mar|percebes?|mejillon(?:es)?|almejas?|berberechos?|navajas?|zamburinas?|vieiras?|ostras?|pulpos?|pulpitos?|calamar(?:es)?|calamarcitos?|chipirones?|sepias?|chocos|chopitos?|puntillitas?|chirlas?|coquinas?|tellinas?',
  ),
  rule(
    'legumbres',
    'lentejas?|garbanzos?|alubias?|judias? (?:blancas|pintas|rojas|negras)|judiones?|fabes|fabada|potajes?|habas?|hummus|humus|frijoles?',
  ),
  rule('ensalada', 'verduras? crudas?|crudites|bastones de verduras'),
  block(
    'harinas? de (?:maiz|arroz|garbanzos?|almendras?|coco|soja|patata|yuca|tapioca|castanas?|trigo sarraceno|alforfon|quinoa|teff|mijo|lentejas?|guisantes?)',
  ),
  rule(
    'verdura-cocinada',
    'judias verdes|parrillada de verduras|verduras?|pisto|menestra|espinacas|acelgas|brocoli|coliflor|alcachofas?|esparragos?(?: trigueros| verdes| blancos)?|calabacin(?:es)?|berenjenas?|pimientos?(?: asados| de padron| del piquillo)?|champinon(?:es)?|setas?|crema de (?:verduras|calabaza|calabacin|puerros?|zanahoria)|pure de (?:verduras|patatas?)|escalivada|samfaina|ratatouille|patatas?(?: (?:asadas|cocidas|al horno|fritas|panaderas|a lo pobre|bravas))?',
  ),
  rule('pan-tomate', 'pan con tomate|pa amb tomaquet|pan tumaca|tumaca|tostadas? con tomate|tostadas? de tomate'),
  rule('gazpacho', 'gazpachos?|salmorejos?|porra antequerana|ajoblanco|ajo blanco'),
  rule('helado-casero', '(?:helados?|gelatos?|sorbetes?) (?:caser[oa]s?|hechos? en casa|de la casa)'),
  rule('helado', 'helados?|sorbetes?|granizados?'),
  rule('pizza', 'pizzas?|pizzetas?|calzone'),
  rule(
    'paella',
    'paellas?|fideuas?|arroz (?:negro|a banda|del senyoret|del senoret|marinero|con bogavante|caldoso|meloso|de marisco)',
  ),
  rule('ensalada', 'ensaladas?|mezclum|canonigos|rucula|lechuga|escarola'),
  rule(
    'edulcorantes',
    'edulcorantes?|sacarina(?: sodica)?|aspartamo|sucralosa|acesulfamo(?: k| potasico)?|ciclamato|stevia|estevia|glucosidos de esteviol|eritritol|xilitol|maltitol|sorbitol|edulcorad[oa]s?',
  ),
  rule('zumo', 'zumos?|nectar(?:es)?|smoothies?|licuados?|jugos?(?! de carne)', { nameOnly: true }),
  rule(
    'fruta',
    'frutas?|fruta del tiempo|macedonias?|manzanas?|peras?|platanos?|bananas?|naranjas?|mandarinas?|fresas?|fresones?|uvas?|melocoton(?:es)?|albaricoques?|ciruelas?|kiwis?|pinas?|mangos?|papayas?|sandias?|melon(?:es)?|cerezas?|arandanos?|frambuesas?|moras?|higos?|granadas?|nisperos?|caquis?|pomelos?|nectarinas?|paraguayos?|chirimoyas?',
  ),
  rule(
    'agua',
    'aguas?(?: (?:mineral(?:es)?|con gas|sin gas|natural|del grifo|de manantial|embotellada|carbonatada))*(?! de (?:valencia|coco|azahar|mar|rosas))',
    { nameOnly: true },
  ),
];

export const KEYWORD_RULES = RULE_DEFS.map((r, index) => ({
  index,
  ids: r.ids,
  re: wordRe(r.src, 'g'),
  nameOnly: !!r.nameOnly,
  context: r.context || null,
}));

// Ids → posición de la primera regla que los nombra (para desempatar «el más específico»).
export function ruleOrderIndex() {
  const order = new Map();
  for (const r of KEYWORD_RULES) {
    for (const slot of r.ids) {
      for (const id of Array.isArray(slot) ? slot : [slot]) {
        if (!order.has(id)) order.set(id, r.index);
      }
    }
  }
  return order;
}

// ---------------------------------------------------------------------------
// Open Food Facts
// ---------------------------------------------------------------------------

export const OFF_ALLERGEN_MAP = {
  'en:milk': 'leche',
  'en:eggs': 'huevo',
  'en:gluten': 'gluten',
  'en:nuts': 'frutos_secos',
  'en:peanuts': 'frutos_secos',
  'en:fish': 'pescado',
  'en:crustaceans': 'marisco',
  'en:molluscs': 'marisco',
  'en:soybeans': 'soja',
  'en:sesame-seeds': 'sesamo',
};

// Categorías (sin prefijo de idioma) → ids de la guía. Solo categorías claras; ante la duda, nada.
const CATEGORY_LIST = [
  [['yogurts', 'plain-yogurts', 'greek-yogurts', 'fruit-yogurts', 'drinkable-yogurts', 'natural-yogurts', 'kefir'], 'yogur'],
  [
    [
      'milks', 'uht-milks', 'pasteurised-milks', 'pasteurized-milks', 'semi-skimmed-milks', 'skimmed-milks',
      'whole-milks', 'lactose-free-milks', 'sterilised-milks', 'sterilized-milks', 'powdered-milks', 'milk-powders',
      'condensed-milks', 'evaporated-milks', 'cow-milks', 'goat-milks',
    ],
    'leche-pasteurizada',
  ],
  [['raw-milks', 'raw-milk-cheeses', 'raw-cow-milk-cheeses', 'raw-goat-milk-cheeses', 'raw-sheep-milk-cheeses'], 'leche-cruda'],
  [['blue-cheeses', 'blue-veined-cheeses', 'roqueforts', 'gorgonzola'], 'queso-azul'],
  [['bloomy-rind-cheeses', 'soft-cheeses-with-bloomy-rind', 'bries', 'camemberts', 'goat-cheese-logs'], 'queso-blando-corteza'],
  [['grated-cheeses', 'sliced-cheeses', 'shredded-cheeses', 'cheese-slices'], 'queso-loncheado-rallado'],
  [['fresh-cheeses', 'cream-cheeses', 'mozzarella', 'mozzarella-cheese', 'ricotta', 'burrata', 'feta', 'cottage-cheeses', 'quark', 'mascarpone', 'burgos-cheeses'], 'queso-fresco'],
  [['hard-cheeses', 'semi-hard-cheeses', 'cured-cheeses', 'manchego', 'parmigiano-reggiano', 'emmentaler', 'goudas', 'cheddar-cheese'], 'queso-curado'],
  [['cooked-hams', 'sliced-cooked-hams', 'white-hams', 'turkey-breasts', 'sliced-turkey', 'turkey-cold-cuts', 'poultry-hams', 'mortadella', 'chopped-pork'], 'fiambre-loncheado'],
  [['dry-hams', 'cured-hams', 'serrano-hams', 'iberian-hams', 'jamon-iberico', 'jamon-serrano', 'prosciutto', 'parma-hams', 'dry-cured-hams'], 'jamon-curado'],
  [['chorizos', 'chorizo'], 'chorizo'],
  [['sobrasadas', 'sobrassadas'], 'sobrasada'],
  [['salamis', 'dry-sausages', 'fuets', 'salchichons'], 'salchichon'],
  [['dry-cured-loins', 'cured-pork-loins', 'lomo-embuchado'], 'lomo-embuchado'],
  [['pates', 'liver-pates', 'foie-gras', 'pork-pates', 'poultry-pates'], 'pate'],
  [['smoked-salmons', 'smoked-fishes', 'smoked-trouts'], 'pescado-ahumado'],
  [['canned-tunas', 'tunas-in-olive-oil', 'tunas-in-sunflower-oil', 'canned-albacore'], 'atun-lata'],
  [['marinated-anchovies', 'anchovies-in-vinegar'], 'boquerones-vinagre'],
  [['canned-sardines', 'sardines-in-oil'], 'pescado-azul-pequeno'],
  [['canned-mussels', 'mussels-in-pickled-sauce', 'cockles', 'canned-clams'], 'marisco-cocido'],
  [['non-alcoholic-beers', 'alcohol-free-beers', 'low-alcohol-beers'], 'cerveza-sin'],
  [
    [
      'beers', 'lagers', 'wines', 'red-wines', 'white-wines', 'rose-wines', 'sparkling-wines', 'cavas', 'champagnes',
      'ciders', 'spirits', 'liqueurs', 'alcoholic-beverages', 'vermouths', 'sangrias', 'whiskies', 'rums', 'gins',
      'vodkas', 'brandies', 'fortified-wines', 'sherries',
    ],
    'alcohol',
  ],
  [['decaffeinated-coffees', 'decaffeinated-coffee', 'decaffeinated-coffee-capsules'], 'descafeinado'],
  [['coffees', 'ground-coffees', 'coffee-capsules', 'coffee-beans', 'instant-coffees', 'coffee-drinks', 'espresso'], 'cafe'],
  [['teas', 'green-teas', 'black-teas', 'tea-bags', 'iced-teas', 'matcha'], 'te'],
  [['chamomile', 'chamomile-infusions', 'chamomile-teas'], 'manzanilla'],
  [['waters', 'mineral-waters', 'natural-mineral-waters', 'spring-waters', 'sparkling-waters', 'still-waters'], 'agua'],
  [['colas', 'cola-soft-drinks', 'cola-drinks'], 'cola'],
  [['energy-drinks'], 'bebida-energetica'],
  [['fruit-juices', 'orange-juices', 'juices', 'nectars', 'fruit-nectars', 'apple-juices', 'multifruit-juices', 'smoothies'], 'zumo'],
  [['fresh-fruits', 'apples', 'bananas', 'oranges', 'pears'], 'fruta'],
  [['chocolates', 'dark-chocolates', 'milk-chocolates', 'cocoa-powders', 'chocolate-powders', 'cocoa-and-chocolate-powders', 'hot-chocolate-powders'], 'chocolate'],
  [['mayonnaises', 'aiolis'], 'mayonesa-bote'],
  [['sprouts', 'germinated-seeds', 'bean-sprouts'], 'germinados'],
  [['ice-creams', 'ice-creams-and-sorbets', 'sorbets'], 'helado'],
  [['pizzas', 'frozen-pizzas'], 'pizza'],
  [['gazpachos', 'salmorejos'], 'gazpacho'],
  [['sweeteners', 'artificial-sweeteners', 'table-top-sweeteners'], 'edulcorantes'],
  [['chickpeas', 'lentils', 'cooked-legumes', 'hummus', 'pulses', 'canned-chickpeas', 'canned-lentils', 'white-beans'], 'legumbres'],
  [['tiramisu'], 'tiramisu'],
  [['cheesecakes'], 'tarta-queso'],
  [['eggs', 'chicken-eggs', 'fresh-eggs'], 'huevo-bien-hecho'],
  [['hamburgers', 'beef-burgers'], 'hamburguesa'],
];

export const OFF_CATEGORY_MAP = Object.fromEntries(
  CATEGORY_LIST.flatMap(([tags, id]) => tags.map((t) => [t, id])),
);

// Etiquetas (labels_tags) que niegan una categoría en texto libre.
export const OFF_LABEL_NEGATIONS = {
  'en:gluten-free': ['gluten'],
  'en:no-gluten': ['gluten'],
  'en:lactose-free': ['lactosa'],
  'en:no-lactose': ['lactosa'],
  'en:vegan': ['carne', 'cerdo', 'pescado', 'marisco', 'leche', 'huevo', 'miel', 'gelatina', 'lactosa'],
  'en:vegetarian': ['carne', 'cerdo', 'pescado', 'marisco', 'gelatina'],
};
