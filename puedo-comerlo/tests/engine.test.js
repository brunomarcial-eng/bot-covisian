// Tests del motor de reglas. `node --test tests/engine.test.js`
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVELS,
  LEVEL_LABEL,
  worstLevel,
  FOODS,
  GROUPS,
  FOOD_BY_ID,
  normalize,
  searchFoods,
  verdictForFood,
  classifyText,
  classifyProduct,
  checkLabel,
  CLAVE_IDS,
  topicsForFood,
  missingForFood,
} from '../src/engine/index.js';
import { NO_TOPIC_FOODS, MISSING_UNKNOWN } from '../src/engine/temas.js';

const BASE = Object.freeze({ embutido: 'cocinados', embutidos: [], alergias: [], otra: '', dieta: [] });
const profile = (over = {}) => ({ ...BASE, ...over });
const ct = (text, over = {}, opts = {}) => classifyText(text, opts, profile(over));

const VERDICT_KEYS = [
  'title', 'level', 'label', 'phrase', 'detail', 'question', 'alternative', 'source', 'foodId', 'foodIds', 'notes',
  'uncertain', 'ingredients', 'topics', 'missing', 'ojo',
].sort();

function expectLevel(text, level, over = {}) {
  const v = ct(text, over);
  assert.equal(v.level, level, `«${text}» → ${v.level} (${v.foodIds.join(', ')}): ${v.phrase}`);
  assert.equal(v.label, LEVEL_LABEL[level]);
  return v;
}

describe('API y contrato', () => {
  test('exporta lo fijado en el contrato', () => {
    assert.deepEqual(LEVELS, ['si', 'duda', 'cuidado', 'no']);
    assert.equal(worstLevel('si', 'no'), 'no');
    assert.ok(Array.isArray(FOODS) && FOODS.length > 0);
    assert.ok(Array.isArray(GROUPS));
    for (const fn of [normalize, searchFoods, verdictForFood, classifyText, classifyProduct]) {
      assert.equal(typeof fn, 'function');
    }
  });

  test('el veredicto tiene exactamente los campos del contrato', () => {
    for (const v of [ct('sushi'), ct('plato misterioso del chef'), verdictForFood('cafe', BASE), classifyProduct({ name: 'x' }, BASE)]) {
      assert.deepEqual(Object.keys(v).sort(), VERDICT_KEYS);
      assert.ok(Array.isArray(v.foodIds) && Array.isArray(v.notes) && Array.isArray(v.ingredients));
      assert.equal(typeof v.uncertain, 'boolean');
    }
  });

  test('todos los ids que usa el motor existen en la guía', () => {
    for (const id of [
      'jamon-curado', 'chorizo', 'sobrasada', 'salchichon', 'lomo-embuchado', 'embutido-cocinado', 'fiambre-loncheado',
      'pescado-crudo', 'marisco-crudo', 'carne-poco-hecha', 'salsa-vino', 'alcohol', 'cerveza-00', 'cerveza-sin',
      'descafeinado', 'mayonesa-bote', 'mayonesa-casera',
    ]) {
      assert.ok(FOOD_BY_ID[id], id);
    }
  });
});

describe('normalize', () => {
  test('minúsculas, sin acentos, ñ → n', () => {
    assert.equal(normalize('Ñoquis con Jamón'), 'noquis con jamon');
    assert.equal(normalize('  Pâté,  Crème brûlée!! '), 'pate creme brulee');
    assert.equal(normalize('Garçon'), 'garcon');
    assert.equal(normalize(null), '');
  });
  test('«0,0» sigue detectable', () => {
    assert.equal(normalize('Cerveza 0,0'), 'cerveza 00');
    assert.equal(normalize('Mahou 0.0%'), 'mahou 00');
    assert.equal(normalize('Alc. 4,5% vol.'), 'alc 4.5 vol');
  });
});

describe('criterio de hecho y lista de la especificación', () => {
  test('sushi → Mejor no; tortilla → Con cuidado', () => {
    expectLevel('sushi', 'no');
    expectLevel('tortilla', 'cuidado');
    expectLevel('tortilla jugosa', 'no');
    expectLevel('pincho de tortilla', 'cuidado');
  });

  test('jamón curado y fiambre de bandeja', () => {
    expectLevel('jamón ibérico', 'no');
    expectLevel('jamón', 'no');
    for (const t of ['jamón york', 'jamón cocido']) {
      const v = expectLevel(t, 'no');
      assert.equal(v.foodId, 'fiambre-loncheado');
      assert.ok(!v.foodIds.includes('jamon-curado'));
    }
    assert.equal(ct('jamón crudo').foodId, 'jamon-curado');
  });

  test('bebidas', () => {
    assert.equal(expectLevel('cerveza 0,0', 'si').foodId, 'cerveza-00');
    assert.equal(expectLevel('Mahou 0.0', 'si').foodId, 'cerveza-00');
    assert.equal(expectLevel('cerveza sin alcohol', 'cuidado').foodId, 'cerveza-sin');
    expectLevel('cerveza sin gluten', 'no');
    expectLevel('copa de vino', 'no');
    assert.ok(expectLevel('ternera estofada al vino', 'si').foodIds.includes('guiso-vino'));
    assert.equal(expectLevel('ternera en salsa de vino', 'cuidado').foodId, 'salsa-vino');
    expectLevel('sangría', 'no');
    expectLevel('tinto de verano', 'no');
  });

  test('café y té', () => {
    assert.equal(expectLevel('café descafeinado', 'si').foodId, 'descafeinado');
    expectLevel('café con leche', 'si');
    expectLevel('té verde', 'si');
    assert.ok(!ct('tomate').foodIds.includes('te'));
    assert.ok(!ct('ensalada de tomate').foodIds.includes('te'));
  });

  test('pescado y marisco', () => {
    expectLevel('atún rojo', 'no');
    expectLevel('pez espada', 'no');
    assert.equal(expectLevel('atún a la plancha', 'si').foodId, 'atun-plancha');
    expectLevel('salmón ahumado', 'no');
    assert.ok(!ct('salmón ahumado').foodIds.includes('salmon-hecho'));
    expectLevel('lubina a la plancha', 'si');
    expectLevel('boquerones en vinagre', 'no');
    expectLevel('carpaccio de ternera', 'no');
    expectLevel('ostras', 'no');
    expectLevel('gambas cocidas', 'si');
    assert.equal(expectLevel('salmón crudo', 'no').foodId, 'pescado-crudo');
    assert.equal(expectLevel('atún al punto', 'no').foodId, 'pescado-crudo');
  });

  test('límites de palabra: «te», «cava», «poke» no pillan trozos', () => {
    assert.equal(ct('tomate').level, 'duda');
    assert.equal(ct('excavar').level, 'duda');
    assert.equal(ct('poker').level, 'duda');
    assert.ok(!ct('pollo a la cazadora').foodIds.includes('caza'));
    assert.ok(!ct('repollo').foodIds.includes('carne-bien-hecha'));
  });

  test('colisiones resueltas en el motor', () => {
    assert.ok(!ct('tarta de queso estilo New York').foodIds.includes('fiambre-loncheado'));
    assert.ok(!ct('carpaccio de calabacín').foodIds.includes('carpaccio'));
    assert.equal(ct('alioli envasado').foodId, 'mayonesa-bote');
    assert.equal(ct('mayonesa de bote').level, 'si');
    assert.equal(ct('alioli').foodId, 'mayonesa-dudosa');
    assert.equal(ct('alioli casero').foodId, 'mayonesa-casera');
    assert.equal(ct('mayonesa casera').foodId, 'mayonesa-casera');
  });

  test('crudo: pescado → pescado crudo; verdura cruda no es carne', () => {
    assert.equal(ct('carne cruda').foodId, 'carne-poco-hecha');
    assert.ok(!ct('verduras crudas').foodIds.includes('carne-poco-hecha'));
    assert.ok(!ct('jamón crudo').foodIds.includes('carne-poco-hecha'));
  });

  test('sin coincidencias → No estoy segura, sin inventar', () => {
    const v = ct('plato misterioso del chef');
    assert.equal(v.level, 'duda');
    assert.equal(v.label, 'No estoy segura');
    assert.equal(v.phrase, 'No lo tengo claro. No lo doy por seguro.');
    assert.equal(v.question, '¿Lleva huevo crudo, embutido, queso sin pasteurizar, alcohol o pescado sin hacer?');
    assert.equal(v.alternative, null);
    assert.equal(v.source, 'La propia app: no reconozco este plato');
    assert.equal(v.foodId, null);
    assert.deepEqual(v.foodIds, []);
    assert.match(v.detail, /no reconoce/);
    assert.match(v.detail, /no se inventa/);
  });

  test('varias coincidencias: gana la peor', () => {
    const v = ct('melón con jamón');
    assert.equal(v.level, 'no');
    assert.equal(v.foodId, 'jamon-curado');
    assert.ok(v.foodIds.includes('fruta'));
  });

  test('lectura incierta', () => {
    const v = ct('lubina a la plancha', {}, { uncertain: true });
    assert.equal(v.level, 'duda');
    assert.ok(v.phrase.startsWith('No estoy segura de la lectura.'));
    assert.equal(v.uncertain, true);
    // Si ya no era «sí», no cambia.
    assert.equal(ct('sushi', {}, { uncertain: true }).level, 'no');
  });
});

describe('perfil de embutido', () => {
  test('croquetas de jamón según el perfil', () => {
    const v = expectLevel('croquetas de jamón', 'si');
    assert.equal(v.foodId, 'embutido-cocinado');
    const no = expectLevel('croquetas de jamón', 'no', { embutido: 'no' });
    assert.equal(no.phrase, 'Has decidido no comer embutidos.');
    const otro = expectLevel('croquetas de jamón', 'no', { embutidos: ['chorizo'] });
    assert.equal(otro.phrase, 'No está entre los embutidos que has marcado.');
    expectLevel('croquetas de jamón', 'si', { embutidos: ['jamon'] });
    expectLevel('pizza de chorizo', 'no', { embutido: 'no' });
  });

  test('los_como: crudo sigue «Mejor no» con el motivo', () => {
    const v = expectLevel('jamón ibérico', 'no', { embutido: 'los_como' });
    assert.match(v.phrase, /toxoplasmosis/);
    assert.match(v.phrase, /La decisión es tuya/);
    expectLevel('croquetas de jamón', 'si', { embutido: 'los_como' });
  });

  test('cocinados: crudo «Mejor no», cocinado dentro del plato «Sí»', () => {
    assert.equal(ct('fuet').phrase, 'En crudo, mejor no. Cocinado dentro del plato, sí.');
    expectLevel('lentejas con chorizo', 'si');
    expectLevel('huevos rotos con jamón', 'no');
  });

  test('sin perfil: nivel y frase base', () => {
    const v = ct('jamón ibérico', { embutido: null });
    assert.equal(v.level, 'no');
    assert.equal(v.phrase, FOOD_BY_ID['jamon-curado'].phrase);
  });

  test('fiambre de bandeja en frío: «Mejor no», da igual el perfil', () => {
    for (const embutido of [null, 'no', 'cocinados', 'los_como']) {
      const v = ct('jamón york', { embutido });
      assert.equal(v.level, 'no');
      assert.equal(v.phrase, FOOD_BY_ID['fiambre-loncheado'].phrase);
    }
  });

  test('embutido cocinado sin tipo en el texto: sin filtro de «cuáles come»', () => {
    expectLevel('fabada', 'si', { embutidos: ['chorizo'] });
    expectLevel('fabada', 'no', { embutido: 'no' });
  });

  test('la frase sustituida solo gana si ese embutido es el peor', () => {
    const v = ct('croquetas de jamón y copa de vino', { embutido: 'cocinados' });
    assert.equal(v.level, 'no');
    assert.equal(v.foodId, 'alcohol');
  });
});

describe('alergias y «otra cosa»', () => {
  test('alergia marcada → Mejor no + «Has marcado X.»', () => {
    const v = expectLevel('tarta de queso', 'no', { alergias: ['leche'] });
    assert.ok(v.phrase.startsWith('Has marcado leche.'));
    const v2 = ct('tortilla con queso', { alergias: ['leche', 'huevo'] });
    assert.ok(v2.phrase.startsWith('Has marcado leche y huevo.'));
    assert.ok(ct('pasta al pesto', { alergias: ['frutos_secos'] }).phrase.startsWith('Has marcado frutos secos.'));
    assert.ok(ct('pan con sésamo', { alergias: ['sesamo'] }).phrase.startsWith('Has marcado sésamo.'));
  });

  test('negaciones: «sin gluten» no dispara; «sin lactosa» sigue siendo leche', () => {
    const v = ct('pan sin gluten', { alergias: ['gluten'] });
    assert.ok(!v.phrase.includes('Has marcado'));
    assert.notEqual(v.level, 'no');
    const l = ct('leche sin lactosa', { alergias: ['leche'] });
    assert.equal(l.level, 'no');
    assert.ok(l.phrase.startsWith('Has marcado leche.'));
    assert.ok(!ct('tortilla sin huevo', { alergias: ['huevo'] }).phrase.includes('Has marcado'));
  });

  test('otra cosa en texto libre', () => {
    const v = expectLevel('ceviche con cilantro', 'no', { otra: 'cilantro' });
    assert.ok(v.phrase.startsWith('Has marcado «cilantro».'));
    const g = expectLevel('lubina con champiñones', 'no', { otra: 'Champiñones; picante' });
    assert.ok(g.phrase.startsWith('Has marcado «Champiñones».'));
    assert.equal(ct('tortilla sin cebolla', { otra: 'cebolla' }).level, 'cuidado');
    // Trozos de menos de 3 letras se ignoran.
    assert.equal(ct('té verde', { otra: 'te' }).level, 'si');
  });
});

describe('forma de comer → notas', () => {
  test('vegana y vegetariana', () => {
    assert.ok(ct('tortilla', { dieta: ['vegana'] }).notes.includes('No encaja con vegana'));
    assert.deepEqual(ct('tortilla', { dieta: ['vegetariana'] }).notes, []);
    assert.ok(ct('pollo asado', { dieta: ['vegetariana'] }).notes.includes('No encaja con vegetariana'));
  });
  test('sin cerdo y sin lactosa', () => {
    const v = ct('croquetas de jamón', { dieta: ['sin_cerdo'] });
    assert.ok(v.notes.includes('Lleva cerdo'));
    assert.equal(v.level, 'si');
    assert.ok(ct('café con leche', { dieta: ['sin_lactosa'] }).notes.includes('Puede llevar lactosa'));
    assert.deepEqual(ct('leche sin lactosa', { dieta: ['sin_lactosa'] }).notes, []);
  });
  test('las notas no cambian el nivel', () => {
    assert.equal(ct('lubina a la plancha', { dieta: ['vegana'] }).level, 'si');
  });
});

describe('queso y pasteurización', () => {
  test('queso con leche pasteurizada sube a «Sí»', () => {
    const v = expectLevel('queso de cabra con leche pasteurizada', 'si');
    assert.match(v.phrase, /Quita la corteza si la tiene\./);
  });
  test('leche cruda o sin pasteurizar → Mejor no', () => {
    expectLevel('queso de cabra de leche cruda', 'no');
    expectLevel('queso de cabra sin pasteurizar', 'no');
  });
  test('rallado, loncheado o azul no sube', () => {
    expectLevel('queso rallado pasteurizado', 'no');
    expectLevel('queso azul pasteurizado', 'no');
  });
});

describe('classifyProduct (Open Food Facts)', () => {
  const yogur = {
    code: '8410000000000',
    name: 'Yogur natural',
    brand: 'X',
    image: null,
    ingredientsText: 'Leche pasteurizada, fermentos lácticos.',
    allergens: ['en:milk'],
    traces: ['en:nuts'],
    categories: ['en:dairies', 'en:yogurts'],
    labels: [],
  };

  test('alérgeno declarado de una alergia marcada → Mejor no', () => {
    const v = classifyProduct(yogur, profile({ alergias: ['leche'] }));
    assert.equal(v.level, 'no');
    assert.ok(v.phrase.startsWith('Has marcado leche.'));
    assert.equal(v.title, 'Yogur natural');
  });

  test('trazas: si era «Sí» → Con cuidado', () => {
    assert.equal(classifyProduct(yogur, BASE).level, 'si');
    const v = classifyProduct(yogur, profile({ alergias: ['frutos_secos'] }));
    assert.equal(v.level, 'cuidado');
    assert.ok(v.phrase.startsWith('Puede llevar trazas de frutos secos.'));
  });

  test('alérgeno declarado aunque el texto no lo diga', () => {
    const v = classifyProduct({ name: 'Galletas', ingredientsText: 'harina, azúcar', allergens: ['en:sesame-seeds'] }, profile({ alergias: ['sesamo'] }));
    assert.equal(v.level, 'no');
    assert.ok(v.phrase.startsWith('Has marcado sésamo.'));
  });

  test('sin nombre y sin reconocer → duda', () => {
    const v = classifyProduct({ name: '', ingredientsText: '' }, BASE);
    assert.equal(v.title, 'Producto sin nombre');
    assert.equal(v.level, 'duda');
    assert.equal(v.source, 'La propia app: no reconozco este plato');
  });

  test('productos habituales', () => {
    assert.equal(classifyProduct({ name: 'Leche entera UHT', ingredientsText: 'leche entera de vaca' }, BASE).level, 'si');
    assert.equal(classifyProduct({ name: 'Mayonesa', ingredientsText: 'aceite, agua, yema de huevo, zumo de limón' }, BASE).foodId, 'mayonesa-bote');
    assert.equal(classifyProduct({ name: 'Chorizo extra', ingredientsText: 'carne de cerdo, pimentón, sal' }, BASE).level, 'no');
    assert.equal(classifyProduct({ name: 'Mahou 0,0 Tostada', ingredientsText: 'agua, malta de cebada, lúpulo', categories: ['en:beers', 'en:non-alcoholic-beers'] }, BASE).level, 'si');
    assert.equal(classifyProduct({ name: 'Mahou Clásica', ingredientsText: 'agua, malta de cebada, lúpulo', categories: ['en:beers'] }, BASE).level, 'no');
    assert.equal(classifyProduct({ name: 'Agua mineral natural' }, BASE).foodId, 'agua');
    // «agua» o «zumo de limón» entre los ingredientes no dicen nada del producto.
    // Tampoco la harina, la sal o el aceite: un producto desconocido no pasa a «Sí» por ellos.
    assert.equal(classifyProduct({ name: 'Hogaza del obrador', ingredientsText: 'harina de trigo, agua, sal' }, BASE).level, 'duda');
    assert.equal(classifyProduct({ name: 'Pan de molde', ingredientsText: 'harina de trigo, agua, sal' }, BASE).foodId, 'pan');
    const queso = classifyProduct({ name: 'Queso de cabra', ingredientsText: 'leche pasteurizada de cabra, sal, cuajo' }, BASE);
    assert.equal(queso.level, 'si');
    assert.match(queso.phrase, /Quita la corteza/);
  });

  test('etiqueta sin gluten anula el gluten del texto, no el declarado', () => {
    const p = profile({ alergias: ['gluten'] });
    assert.notEqual(classifyProduct({ name: 'Pan', ingredientsText: 'harina de arroz', labels: ['en:gluten-free'] }, p).level, 'no');
    assert.equal(classifyProduct({ name: 'Pan', allergens: ['en:gluten'], labels: ['en:gluten-free'] }, p).level, 'no');
  });
});

describe('verdictForFood', () => {
  test('ficha con perfil aplicado', () => {
    const v = verdictForFood('jamon-curado', profile({ embutido: 'los_como', dieta: ['sin_cerdo'] }));
    assert.equal(v.title, FOOD_BY_ID['jamon-curado'].name);
    assert.equal(v.level, 'no');
    assert.match(v.phrase, /La decisión es tuya/);
    assert.ok(v.notes.includes('Lleva cerdo'));
    assert.equal(v.foodId, 'jamon-curado');
    assert.deepEqual(v.foodIds, ['jamon-curado']);
  });
  test('alergias por etiquetas y otra cosa por nombre y alias', () => {
    const v = verdictForFood('tortilla-patata', profile({ alergias: ['huevo'] }));
    assert.equal(v.level, 'no');
    assert.ok(v.phrase.startsWith('Has marcado huevo.'));
    assert.equal(verdictForFood('sobrasada', profile({ embutido: 'no' })).phrase, 'Has decidido no comer embutidos.');
    assert.equal(verdictForFood('cafe', profile({ otra: 'capuchino' })).level, 'no');
  });
  test('id desconocido → Error', () => {
    assert.throws(() => verdictForFood('no-existe', BASE), Error);
  });
  test('todas las fichas se pueden pintar', () => {
    for (const f of FOODS) {
      const v = verdictForFood(f.id, BASE);
      assert.ok(LEVELS.includes(v.level), f.id);
      assert.ok(v.phrase, f.id);
    }
  });
});

describe('searchFoods', () => {
  test('por nombre y alias, sin acentos, por inclusión', () => {
    assert.ok(searchFoods('tortilla').some((f) => f.id === 'tortilla-patata'));
    assert.equal(searchFoods('tortilla')[0].id, 'tortilla-patata');
    assert.ok(searchFoods('JAMÓN').some((f) => f.id === 'jamon-curado'));
    assert.deepEqual(searchFoods('jamon').map((f) => f.id), searchFoods('JAMÓN').map((f) => f.id));
    assert.ok(searchFoods('sushi').some((f) => f.id === 'pescado-crudo'));
  });
  test('por grupo', () => {
    const emb = searchFoods('', 'embutidos');
    assert.ok(emb.length > 0);
    assert.ok(emb.every((f) => f.groups.includes('embutidos')));
    assert.equal(searchFoods('').length, FOODS.length);
    assert.equal(searchFoods('', 'todo').length, FOODS.length);
    assert.ok(searchFoods('queso', 'bebidas').every((f) => f.groups.includes('bebidas')));
  });
});

describe('determinismo', () => {
  test('dos llamadas iguales devuelven lo mismo', () => {
    const p = profile({ alergias: ['leche'], otra: 'cilantro', dieta: ['vegana'] });
    for (const t of ['croquetas de jamón', 'sushi con cilantro', 'plato misterioso', 'café con leche']) {
      assert.deepEqual(classifyText(t, {}, p), classifyText(t, {}, p));
    }
    const prod = { name: 'Yogur', ingredientsText: 'leche', allergens: ['en:milk'], traces: ['en:nuts'] };
    assert.deepEqual(classifyProduct(prod, p), classifyProduct(prod, p));
    assert.deepEqual(verdictForFood('pizza', p), verdictForFood('pizza', p));
  });
});

// --- Regresiones de la integración ---
test('una alergia no deja la frase empezando por el veredicto antiguo', () => {
  const p = { embutido: 'cocinados', embutidos: [], alergias: ['leche'], otra: '', dieta: [] };
  const v = classifyText('tarta de queso', {}, p);
  assert.equal(v.level, 'no');
  assert.ok(v.phrase.startsWith('Has marcado leche.'));
  assert.ok(!/\b(?:Con cuidado|Sí)\b/u.test(v.phrase.replace('Has marcado leche.', '')), v.phrase);
});

test('lectura incierta no conserva «Sí» en la frase', () => {
  const p = { embutido: 'cocinados', embutidos: [], alergias: [], otra: '', dieta: [] };
  const v = classifyText('lubina a la plancha', { uncertain: true }, p);
  assert.equal(v.level, 'duda');
  assert.ok(!/(?:^|\s)Sí(?=[\s,:;.])/u.test(v.phrase), v.phrase);
});

test('«ostras gratinadas» es marisco hecho; «ostras» a secas, crudo', () => {
  const p = { embutido: 'cocinados', embutidos: [], alergias: [], otra: '', dieta: [] };
  assert.equal(classifyText('ostras gratinadas', {}, p).level, 'si');
  assert.equal(classifyText('ostras', {}, p).level, 'no');
});

// --- Decisión de la clienta: lo cocinado de verdad (bien caliente por dentro) ya se puede comer ---
describe('cocinado dentro del plato (decisión de la clienta)', () => {
  test('pizza: base «Sí», con la pregunta del jamón curado', () => {
    const v = expectLevel('pizza barbacoa', 'si');
    assert.equal(v.question, '¿Lo que lleva encima va al horno o se pone al final, en frío?');
    assert.match(v.detail, /después del horno/);
    expectLevel('pizza', 'si');
    expectLevel('pizza de chorizo', 'si');
    expectLevel('pizza cuatro quesos', 'si');
  });

  test('pizza de jamón york → Sí (el perfil de embutido no le afecta)', () => {
    for (const embutido of [null, 'no', 'cocinados', 'los_como']) {
      const v = ct('pizza de jamón york', { embutido, embutidos: ['chorizo'] });
      assert.equal(v.level, 'si', `${embutido}: ${v.phrase}`);
      assert.ok(v.foodIds.includes('fiambre-cocinado'));
      assert.ok(!v.foodIds.includes('fiambre-loncheado'));
    }
  });

  test('embutido curado cocinado: «Sí», y el perfil sigue mandando', () => {
    const v = expectLevel('croquetas de jamón', 'si');
    assert.equal(v.phrase, 'Sí: cocinado dentro del plato, el calor elimina el riesgo. Que llegue bien caliente.');
    assert.equal(expectLevel('croquetas de jamón', 'no', { embutido: 'no' }).phrase, 'Has decidido no comer embutidos.');
    assert.equal(
      expectLevel('croquetas de jamón', 'no', { embutidos: ['chorizo'] }).phrase,
      'No está entre los embutidos que has marcado.',
    );
    expectLevel('croquetas de jamón', 'si', { embutido: 'los_como' });
    expectLevel('lentejas con chorizo', 'si');
    expectLevel('chorizo frito', 'si');
    assert.equal(verdictForFood('embutido-cocinado', BASE).level, 'si');
  });

  test('embutido curado añadido al final, en crudo o después del horno → crudo', () => {
    for (const t of [
      'pizza con jamón ibérico al final',
      'pizza con jamón serrano después del horno',
      'pizza de jamón ibérico sin hornear',
      'pizza con jamón ibérico en crudo',
    ]) {
      const v = expectLevel(t, 'no');
      assert.ok(v.foodIds.includes('jamon-curado'), t);
    }
    // Un plato frío no cocina el embutido aunque otro ingrediente vaya gratinado.
    expectLevel('ensalada con queso de cabra gratinado y jamón', 'no');
  });

  test('fiambre cocinado → Sí; en frío → Mejor no con la frase nueva', () => {
    for (const t of ['sándwich mixto', 'bikini', 'sándwich mixto a la plancha', 'croquetas de jamón york', 'tosta de jamón york fundido']) {
      expectLevel(t, 'si', { embutido: 'no' });
    }
    expectLevel('san jacobo', 'si');
    for (const t of ['jamón york', 'bocadillo de jamón york', 'ensalada con jamón york', 'pechuga de pavo', 'mortadela', 'pizza de jamón york al final']) {
      const v = expectLevel(t, 'no');
      assert.equal(v.foodId, 'fiambre-loncheado', t);
      assert.equal(v.phrase, 'En frío y de bandeja, mejor no por listeria; bien caliente dentro del plato, sí.');
    }
    // «Jamón cocido al horno» y «pavo braseado» son fiambres de bandeja, no platos calientes.
    expectLevel('jamón cocido al horno', 'no');
    expectLevel('pavo braseado', 'no');
    assert.ok(!ct('bocadillo de jamón york').foodIds.includes('jamon-curado'));
  });

  test('queso cocinado → Sí por esa parte', () => {
    for (const t of ['camembert al horno', 'brie al horno', 'provolone a la plancha', 'queso de cabra gratinado', 'fondue de queso', 'pizza con gorgonzola', 'macarrones con queso rallado gratinado']) {
      assert.equal(expectLevel(t, 'si').foodId === 'queso-cocinado' || ct(t).foodIds.includes('queso-cocinado'), true, t);
    }
    const ens = ct('ensalada con queso de cabra gratinado');
    assert.ok(['si', 'cuidado'].includes(ens.level), ens.level);
    assert.notEqual(ens.level, 'no');
    // Lo que no va cocinado no cambia.
    expectLevel('queso azul', 'no');
    expectLevel('queso rallado', 'no');
    expectLevel('solomillo al roquefort', 'no');
    expectLevel('queso con tomate frito', 'si');
    // La burrata en la pizza se suele poner al final.
    expectLevel('pizza con burrata', 'si');
  });

  test('tarta de queso sin alergias sigue su nivel base', () => {
    assert.equal(ct('tarta de queso').level, FOOD_BY_ID['tarta-queso'].level);
  });

  test('pescado ahumado y germinados cocinados → Sí por esa parte', () => {
    expectLevel('pasta con salmón ahumado', 'si');
    expectLevel('quiche de salmón ahumado', 'si');
    expectLevel('salmón ahumado', 'no');
    expectLevel('ensalada de pasta con salmón ahumado', 'no');
    expectLevel('pizza de salmón ahumado', 'no');
    expectLevel('brotes de soja salteados', 'si');
    expectLevel('wok de verduras con brotes de soja', 'si');
    expectLevel('ensalada de brotes de soja', 'no');
  });

  test('el calor no arregla mercurio, alcohol, huevo crudo ni pescado o carne crudos', () => {
    expectLevel('pez espada a la plancha', 'no');
    expectLevel('pizza de pez espada', 'no');
    expectLevel('tiramisú', 'no');
    expectLevel('sushi', 'no');
    expectLevel('tortilla', 'cuidado');
    expectLevel('carpaccio de ternera', 'no');
    expectLevel('croquetas de jamón y copa de vino', 'no');
  });

  test('gana el peor: pizza de jamón york con huevo poco hecho encima', () => {
    const v = expectLevel('pizza de jamón york con huevo poco hecho encima', 'no');
    assert.equal(v.foodId, 'huevo-poco-hecho');
  });
});

describe('regresiones de la revisión con 293 platos', () => {
  test('«miel» no es «mielga» a medio escribir', () => {
    const v = ct('miel');
    assert.notEqual(v.level, 'no');
    assert.ok(!v.foodIds.includes('pescado-mercurio'));
    // Palabras completas que la guía ya conoce no se leen como prefijo de otra.
    for (const w of ['tarta', 'lengua', 'cabra', 'entre']) {
      assert.equal(ct(w).level, 'duda', w);
    }
    // Lo que sí está a medio escribir sigue funcionando.
    assert.equal(ct('sashim').foodId, 'pescado-crudo');
  });

  test('«clara» es cerveza con limón; «clara de huevo», no', () => {
    for (const t of ['clara', 'clara de limón', 'clara con limón']) {
      assert.equal(expectLevel(t, 'no').foodId, 'alcohol', t);
    }
    assert.equal(expectLevel('clara sin alcohol', 'cuidado').foodId, 'cerveza-sin');
    assert.equal(expectLevel('clara 0,0', 'si').foodId, 'cerveza-00');
    for (const t of ['clara de huevo', 'claras montadas', 'tortilla de claras']) {
      assert.ok(!ct(t).foodIds.includes('alcohol'), t);
    }
  });
});

describe('cuestionario de la clienta (24-10-2026)', () => {
  const casos = {
    si: [
      'croquetas', 'croquetas congeladas', 'gulas al ajillo', 'caldo gallego', 'arroz al horno', 'espaguetis boloñesa',
      'lasaña congelada', 'canelones', 'gnocchi', 'cuscús', 'montadito de pringá', 'oreja a la plancha', 'morcilla',
      'morcilla de burgos', 'salchichas', 'butifarra', 'gyozas', 'pad thai', 'tacos', 'burrito', 'guacamole', 'falafel',
      'flan', 'crema catalana', 'brownie', 'panna cotta', 'torrijas', 'tarta de santiago', 'cruasán', 'magdalenas',
      'rooibos', 'leche de avena', 'bebida de soja', 'pan de molde', 'tostadas', 'muesli', 'mantequilla',
      'aceite de oliva', 'crema de cacahuete', 'huevos', 'tofu', 'seitán', 'aceitunas', 'aceitunas rellenas de anchoa',
      'kétchup', 'salsa de soja', 'vinagre', 'sal', 'harina', 'levadura de cerveza', 'gelatina', 'chicle', 'miel',
      'perrito caliente', 'tila', 'infusión de jengibre', 'tónica', 'salchichas frankfurt', 'salchichas de paquete',
      'horchata de brick', 'chuletón muy hecho', 'huevo frito con la yema hecha', 'anchoas fritas',
    ],
    cuidado: [
      'espaguetis a la carbonara', 'coulant', 'horchata',
    ],
    no: [
      'anchoas del cantábrico', 'surimi', 'poleo menta', 'chuletón', 'kombucha', 'horchata artesana', 'huevo frito',
      'huevos rotos', 'huevos con patatas', 'clara de limón',
    ],
  };
  for (const [level, textos] of Object.entries(casos)) {
    test(`nivel «${LEVEL_LABEL[level]}»`, () => {
      for (const t of textos) expectLevel(t, level);
    });
  }

  test('fichas con la frase y la pregunta decididas', () => {
    assert.equal(ct('huevo frito').phrase, 'La yema líquida, mejor no estos meses: nada de mojar la yema.');
    assert.equal(ct('chuletón').foodId, 'chuleton');
    assert.ok(ct('chuletón').phrase.length <= 90);
    assert.match(FOOD_BY_ID.chuleton.detail, /zapatilla/);
    assert.equal(ct('espaguetis a la carbonara').question, '¿La carbonara lleva yema cruda o el huevo va cuajado?');
    assert.equal(ct('perrito caliente').question, '¿La salchicha está bien hecha y caliente por dentro?');
    assert.equal(ct('horchata artesana').foodId, 'horchata-artesana');
    assert.equal(ct('horchata de brick').foodId, 'horchata-pasteurizada');
  });

  test('alergias en los alimentos nuevos', () => {
    expectLevel('flan', 'no', { alergias: ['huevo'] });
    expectLevel('pan de molde', 'no', { alergias: ['gluten'] });
    expectLevel('pad thai', 'no', { alergias: ['frutos_secos'] });
    expectLevel('tofu', 'no', { alergias: ['soja'] });
    expectLevel('tarta de santiago', 'no', { alergias: ['frutos_secos'] });
    expectLevel('falafel', 'no', { alergias: ['sesamo'] });
    expectLevel('pan de molde sin gluten', 'si', { alergias: ['gluten'] });
  });

  test('colisiones: palabra completa y perfil de embutido', () => {
    assert.ok(!ct('panna cotta').foodIds.includes('pan'));
    assert.ok(!ct('panceta').foodIds.includes('pan'));
    assert.equal(ct('pan con tomate').foodId, 'pan-tomate');
    assert.ok(!ct('salsa verde').foodIds.includes('aceite-vinagre-sal'));
    assert.equal(ct('mielga').foodId, 'pescado-mercurio');
    assert.ok(!ct('levadura de cerveza').foodIds.includes('alcohol'));
    assert.equal(expectLevel('croquetas de jamón', 'no', { embutido: 'no' }).phrase, 'Has decidido no comer embutidos.');
    assert.ok(!ct('morcilla de burgos').foodIds.includes('queso-fresco'));
  });
});

describe('alergias y «otra cosa»: la frase no se contradice con la guía', () => {
  test('Nutella con frutos secos: solo «Has marcado…», detalle coherente, sin pregunta ni alternativa', () => {
    const v = ct('Nutella', { alergias: ['frutos_secos'] });
    assert.equal(v.level, 'no');
    assert.equal(v.phrase, 'Has marcado frutos secos.');
    assert.doesNotMatch(v.phrase, /moderación|cafeína/);
    assert.match(v.detail, /^Lleva frutos secos, que has marcado en tus ajustes\. Por eso sale «Mejor no»/);
    assert.match(v.detail, /no tenga un riesgo especial/);
    assert.doesNotMatch(v.detail, /se puede tomar con normalidad/);
    assert.equal(v.question, null);
    assert.equal(v.alternative, null);
  });

  test('base «Con cuidado» y base desconocida', () => {
    const c = ct('tortilla de patatas', { alergias: ['huevo'] });
    assert.equal(c.phrase, 'Has marcado huevo.');
    assert.match(c.detail, /solo pida algo de cuidado/);
    assert.equal(c.question, null);
    const d = ct('plato misterioso con soja', { alergias: ['soja'] });
    assert.equal(d.level, 'no');
    assert.equal(d.phrase, 'Has marcado soja.');
    assert.match(d.detail, /no reconoce del todo/);
  });

  test('«otra cosa» sobre una base que no era «Mejor no»', () => {
    const v = ct('tortilla con cebolla', { otra: 'cebolla' });
    assert.equal(v.level, 'no');
    assert.equal(v.phrase, 'Has marcado «cebolla».');
    assert.match(v.detail, /^Has marcado «cebolla» entre lo que no quieres comer en tus ajustes\. Por eso sale «Mejor no»/);
    assert.equal(v.question, null);
    assert.equal(v.alternative, null);
  });

  test('si la base ya era «Mejor no», se mantiene frase, detalle, pregunta y alternativa de la guía', () => {
    const base = ct('ceviche con cilantro');
    const v = ct('ceviche con cilantro', { otra: 'cilantro' });
    assert.equal(v.phrase, `Has marcado «cilantro». ${base.phrase}`);
    assert.equal(v.detail, base.detail);
    assert.equal(v.question, base.question);
    assert.equal(v.alternative, base.alternative);
    assert.ok(base.question);
  });

  test('vale igual para productos (alérgenos declarados) y para fichas', () => {
    const p = classifyProduct(
      { name: 'Yogur natural', ingredientsText: 'leche pasteurizada', allergens: ['en:milk'], categories: ['en:yogurts'] },
      profile({ alergias: ['leche'] }),
    );
    assert.equal(p.level, 'no');
    assert.equal(p.phrase, 'Has marcado leche.');
    assert.match(p.detail, /^Lleva leche, que has marcado/);
    assert.equal(p.question, null);
    const f = verdictForFood('chocolate', profile({ otra: 'chocolate' }));
    assert.equal(f.phrase, 'Has marcado «chocolate».');
    assert.match(f.detail, /entre lo que no quieres comer/);
    assert.equal(f.alternative, null);
    // Sin alergia, la ficha no cambia.
    assert.equal(verdictForFood('chocolate', BASE).detail, FOOD_BY_ID.chocolate.detail);
  });

  test('el perfil de embutido «no» conserva su frase (la base ya era «Mejor no»)', () => {
    const v = ct('croquetas de jamón', { embutido: 'no', alergias: ['gluten'] });
    assert.equal(v.phrase, 'Has marcado gluten. Has decidido no comer embutidos.');
  });
});

describe('fiambre en frío y plato combinado', () => {
  test('bocadillo, sándwich o mixto en frío → fiambre de bandeja, Mejor no', () => {
    for (const t of ['bocadillo de pavo', 'pavo en frío', 'sándwich de pavo', 'sándwich mixto frío', 'mixto frío', 'bocadillo de jamón cocido', 'bocadillo de jamón york']) {
      const v = expectLevel(t, 'no');
      assert.equal(v.foodId, 'fiambre-loncheado', t);
    }
  });
  test('caliente o carne hecha → Sí', () => {
    for (const t of ['sándwich mixto', 'bikini', 'sándwich mixto caliente', 'pavo', 'pechuga de pavo a la plancha', 'pechuga de pavo asada', 'bocadillo de pavo asado']) {
      expectLevel(t, 'si');
    }
    assert.equal(ct('pavo').foodId, 'carne-bien-hecha');
  });
  test('«plato combinado» no es alcohol; «combinado» a secas, sí', () => {
    for (const t of ['plato combinado', 'platos combinados']) {
      const v = ct(t);
      assert.ok(!v.foodIds.includes('alcohol'), t);
      assert.notEqual(v.level, 'no', t);
    }
    for (const t of ['combinado', 'combinados', 'combinado de ginebra', 'plato combinado con copa de vino']) {
      assert.equal(expectLevel(t, 'no').foodId, 'alcohol', t);
    }
  });
});

// ---------------------------------------------------------------------------
// N3 · Temas («claves») y comprobación de etiqueta
// ---------------------------------------------------------------------------

const isTopicList = (list) => Array.isArray(list) && list.every((t) => CLAVE_IDS.includes(t)) && new Set(list).size === list.length;
const prod = (over = {}) => ({ name: 'Producto', ingredientsText: 'agua, sal', ...over });
const SIN_INGREDIENTES = 'No tengo los ingredientes de este producto. Fotografíalos y lo compruebo.';
const DATOS_WEB = 'Datos encontrados en internet, sin confirmar con la etiqueta.';

describe('temas: topics en el veredicto', () => {
  test('los ids fijos', () => {
    assert.deepEqual(
      [...CLAVE_IDS],
      ['listeria', 'toxoplasmosis', 'mercurio', 'huevo-crudo', 'pescado-crudo', 'alcohol', 'cafeina', 'hierbas'],
    );
  });

  test('topics y missing salen siempre, como arrays de ids sin repetir, por los tres caminos', () => {
    const vs = [
      ct('sushi'), ct('agua'), ct('plato misterioso'), ct('tarta de queso'),
      verdictForFood('cafe', BASE), verdictForFood('agua', BASE),
      classifyProduct({ name: 'Queso fresco' }, BASE), classifyProduct(prod({ name: 'Yogur' }), BASE), classifyProduct(null, BASE),
    ];
    for (const v of vs) {
      assert.ok(isTopicList(v.topics), `${v.title}: ${v.topics}`);
      assert.ok(isTopicList(v.missing), `${v.title}: ${v.missing}`);
      assert.ok(v.missing.length <= 5);
    }
  });

  test('sushi → pescado-crudo (y listeria); tinto de verano → alcohol; café → cafeina; pez espada → mercurio', () => {
    assert.deepEqual(ct('sushi').topics, ['pescado-crudo', 'listeria']);
    assert.deepEqual(ct('tinto de verano').topics, ['alcohol']);
    assert.deepEqual(ct('bebida energética').topics, ['cafeina']);
    assert.deepEqual(ct('pez espada a la plancha').topics, ['mercurio']);
    // Café, atún en lata, té…: ahora son «Sí» con «Ojo con esto» y no llevan tema.
    assert.deepEqual(ct('café').topics, []);
    assert.deepEqual(ct('atún en lata').topics, []);
  });

  test('listeria, toxoplasmosis, huevo-crudo y hierbas', () => {
    for (const t of ['queso azul', 'roquefort', 'brie', 'queso de cabra', 'paté', 'salmón ahumado', 'jamón cocido', 'brotes de alfalfa', 'leche cruda']) {
      assert.ok(ct(t).topics.includes('listeria'), t);
    }
    for (const t of ['jamón serrano', 'chorizo', 'carpaccio de ternera', 'steak tartar', 'carne poco hecha', 'chuletón']) {
      assert.ok(ct(t).topics.includes('toxoplasmosis'), t);
    }
    for (const t of ['mayonesa casera', 'mayonesa', 'tiramisú', 'mousse casera', 'huevo frito', 'tortilla de patata', 'ensaladilla', 'steak tartar']) {
      assert.ok(ct(t).topics.includes('huevo-crudo'), t);
    }
    for (const t of ['poleo menta', 'infusión de regaliz']) {
      assert.deepEqual(ct(t).topics, ['hierbas'], t);
    }
    for (const t of ['tila', 'infusión de jengibre']) assert.deepEqual(ct(t).topics, [], t);
    for (const t of ['boquerones en vinagre', 'ostras', 'ceviche', 'anchoas']) {
      assert.ok(ct(t).topics.includes('pescado-crudo'), t);
    }
  });

  test('un «Sí» no lleva temas; los temas solo salen con «Con cuidado» o «Mejor no»', () => {
    for (const t of ['merluza a la plancha', 'agua', 'pizza de jamón york', 'croquetas de jamón', 'pollo asado', 'fruta', 'queso gratinado', 'huevo duro', 'yogur', 'cerveza 0,0', 'café', 'hamburguesa', 'paella', 'ensalada mixta']) {
      const v = ct(t);
      assert.equal(v.level, 'si', t);
      assert.deepEqual(v.topics, [], t);
    }
    for (const f of FOODS) {
      const v = verdictForFood(f.id, BASE);
      if (v.level === 'si' || v.level === 'duda') assert.deepEqual(v.topics, [], f.id);
      else if (!NO_TOPIC_FOODS.includes(f.id)) assert.ok(v.topics.length > 0, `${f.id} sin temas`);
    }
    // Lo que el calor arregla ya no es un tema.
    assert.deepEqual(ct('pizza de jamón al horno').topics, []);
    assert.deepEqual(ct('queso pasteurizado').topics, []);
  });

  test('los temas son del motivo, no del perfil: embutido cocinado con «no quiero embutidos» no lleva tema', () => {
    const v = ct('croquetas de jamón', { embutido: 'no' });
    assert.equal(v.level, 'no');
    assert.deepEqual(v.topics, []);
    // El crudo sí: ahí el motivo es de verdad la toxoplasmosis.
    assert.deepEqual(ct('jamón serrano', { embutido: 'no' }).topics, ['toxoplasmosis']);
  });

  test('la alergia no añade ni quita temas; una alergia sobre un «Sí» no inventa ninguno', () => {
    assert.deepEqual(ct('merluza a la plancha', { alergias: ['pescado'] }).topics, []);
    const v = ct('tarta de queso fría', { alergias: ['leche', 'gluten'] });
    assert.equal(v.level, 'no');
    assert.ok(v.phrase.startsWith('Has marcado leche y gluten.'), v.phrase);
    assert.ok(!/Con cuidado/.test(v.phrase + v.detail), 'sin contradicciones con la alergia');
    assert.ok(isTopicList(v.topics));
    assert.deepEqual(v.topics, ct('tarta de queso fría').topics);
    assert.notDeepEqual(v.topics, []);
    // Y la horneada, con alergia, tampoco se contradice: «Sí» de base, «Mejor no» por lo marcado.
    const h = ct('tarta de queso', { alergias: ['leche'] });
    assert.equal(h.level, 'no');
    assert.ok(!/Con cuidado/.test(h.phrase + h.detail));
  });

  test('orden por relevancia: lo más grave primero', () => {
    assert.deepEqual(ct('tinto de verano con bebida energética').topics, ['alcohol', 'cafeina']);
    const v = ct('pizza de jamón al final y café');
    assert.deepEqual(v.topics, ['toxoplasmosis']);
  });

  test('topicsForFood: tabla y etiquetas', () => {
    assert.deepEqual(topicsForFood(FOOD_BY_ID['pescado-ahumado']), ['listeria', 'pescado-crudo']);
    assert.deepEqual(topicsForFood(FOOD_BY_ID['agua']), []);
    // Un alimento nuevo sin entrada propia cae a sus etiquetas.
    assert.deepEqual(topicsForFood({ id: 'x', level: 'no', tags: ['crudo', 'huevo', 'listeria'] }), ['listeria', 'huevo-crudo']);
    assert.deepEqual(topicsForFood({ id: 'x', level: 'si', tags: ['listeria'] }), []);
    assert.deepEqual(topicsForFood(null), []);
  });
});

describe('temas: missing y producto sin ingredientes', () => {
  test('ñoquis sin ingredientes → duda con la frase nueva y missing con huevo-crudo', () => {
    const v = classifyProduct({ name: 'Ñoquis de patata' }, BASE);
    assert.equal(v.level, 'duda');
    assert.equal(v.label, 'No estoy segura');
    assert.equal(v.phrase, SIN_INGREDIENTES);
    assert.ok(!v.phrase.includes('lectura'));
    assert.ok(v.missing.includes('huevo-crudo'));
    assert.deepEqual(v.topics, []);
    assert.equal(v.question, null);
    assert.equal(v.alternative, null);
    assert.equal(v.source, 'La propia app: faltan los ingredientes');
    assert.ok(v.foodIds.includes('pasta'));
    // Lo mismo con ingredientes en blanco.
    assert.equal(classifyProduct({ name: 'Ñoquis de patata', ingredientsText: '  \n ' }, BASE).phrase, SIN_INGREDIENTES);
  });

  test('ñoquis con ingredientes → Sí, sin missing; la etiqueta confirma que no hay huevo', () => {
    const ingredientsText = 'patata, harina de trigo, sal';
    const v = classifyProduct({ name: 'Ñoquis de patata', ingredientsText }, BASE);
    assert.equal(v.level, 'si');
    assert.deepEqual(v.missing, []);
    assert.deepEqual(v.topics, []);
    assert.deepEqual(checkLabel(ingredientsText, ['huevo-crudo'], BASE), [{ topic: 'huevo-crudo', status: 'no-aparece', evidence: [] }]);
    const con = checkLabel('patata, harina de trigo, huevo, sal', ['huevo-crudo'], BASE);
    assert.deepEqual(con, [{ topic: 'huevo-crudo', status: 'aparece', evidence: ['huevo'] }]);
  });

  test('sin ingredientes: «Con cuidado» y «Mejor no» se quedan, con missing', () => {
    const fresco = classifyProduct({ name: 'Queso de cabra' }, BASE);
    assert.equal(fresco.level, 'cuidado');
    assert.ok(fresco.phrase.startsWith('Con cuidado'));
    assert.ok(fresco.missing.includes('listeria'));
    assert.deepEqual(fresco.topics, ['listeria']);
    const jamon = classifyProduct({ name: 'Jamón serrano' }, BASE);
    assert.equal(jamon.level, 'no');
    assert.ok(jamon.missing.includes('toxoplasmosis'));
    assert.deepEqual(jamon.topics, ['toxoplasmosis']);
  });

  test('con ingredientes de OFF, de etiqueta o sin fuente no se rebaja ni hay missing', () => {
    for (const ingredientsSource of [undefined, 'off', 'etiqueta']) {
      const v = classifyProduct(prod({ name: 'Yogur natural', ingredientsText: 'leche pasteurizada, fermentos', ingredientsSource }), BASE);
      assert.equal(v.level, 'si', String(ingredientsSource));
      assert.deepEqual(v.missing, []);
    }
  });

  test('ingredientes de internet sin confirmar: Sí → duda con la frase nueva; cuidado y no se quedan', () => {
    const yogur = classifyProduct(prod({ name: 'Yogur natural', ingredientsText: 'leche, fermentos', ingredientsSource: 'web' }), BASE);
    assert.equal(yogur.level, 'duda');
    assert.equal(yogur.phrase, DATOS_WEB);
    assert.deepEqual(yogur.missing, ['listeria']);
    assert.equal(yogur.source, 'La propia app: datos de internet sin confirmar');
    // También con product.source === 'web'.
    assert.equal(classifyProduct(prod({ name: 'Yogur natural', source: 'web' }), BASE).phrase, DATOS_WEB);
    const queso = classifyProduct(prod({ name: 'Queso de cabra', ingredientsSource: 'web' }), BASE);
    assert.equal(queso.level, 'cuidado');
    assert.ok(queso.missing.includes('listeria'));
    const jamon = classifyProduct(prod({ name: 'Jamón serrano', ingredientsSource: 'web' }), BASE);
    assert.equal(jamon.level, 'no');
    assert.ok(jamon.missing.includes('toxoplasmosis'));
    // Sin ingredientes y de internet: manda que faltan.
    assert.equal(classifyProduct({ name: 'Yogur natural', ingredientsSource: 'web' }, BASE).phrase, SIN_INGREDIENTES);
  });

  test('la rebaja respeta alergias y trazas (que ya eran más graves que «Sí»)', () => {
    const v = classifyProduct({ name: 'Yogur natural', allergens: ['en:milk'] }, profile({ alergias: ['leche'] }));
    assert.equal(v.level, 'no');
    assert.ok(v.phrase.startsWith('Has marcado leche.'));
    const tr = classifyProduct(prod({ name: 'Yogur natural', traces: ['en:nuts'] }), profile({ alergias: ['frutos_secos'] }));
    assert.equal(tr.level, 'cuidado');
  });

  test('plato o producto no reconocido → missing por defecto (regla 7)', () => {
    assert.deepEqual([...MISSING_UNKNOWN], ['huevo-crudo', 'listeria', 'toxoplasmosis', 'alcohol', 'pescado-crudo']);
    for (const v of [ct('plato misterioso del chef'), classifyProduct({ name: 'Zzxq' }, BASE), classifyProduct(prod({ name: 'Zzxq' }), BASE)]) {
      assert.equal(v.level, 'duda');
      assert.deepEqual(v.missing, MISSING_UNKNOWN);
      assert.deepEqual(v.topics, []);
    }
  });

  test('lectura incierta de algo reconocido → duda con missing de su categoría', () => {
    const v = classifyText('Pizza', { uncertain: true }, BASE);
    assert.equal(v.level, 'duda');
    assert.deepEqual(v.missing, ['listeria', 'toxoplasmosis']);
    assert.deepEqual(classifyText('Zumo', { uncertain: true }, BASE).missing, []);
  });

  test('classifyText con datos de internet', () => {
    const v = classifyText('Yogur natural', { ingredients: ['leche'], source: 'web' }, BASE);
    assert.equal(v.level, 'duda');
    assert.equal(v.phrase, DATOS_WEB);
    assert.equal(classifyText('Yogur natural', { ingredientsSource: 'web' }, BASE).level, 'duda');
    assert.equal(classifyText('Yogur natural', {}, BASE).level, 'si');
  });

  test('un «Sí» de texto y de ficha nunca lleva missing', () => {
    for (const t of ['merluza a la plancha', 'yogur', 'agua', 'pollo asado']) assert.deepEqual(ct(t).missing, [], t);
    assert.deepEqual(verdictForFood('yogur', BASE).missing, []);
  });

  test('missing por categoría (producto sin ingredientes)', () => {
    const miss = (name) => classifyProduct({ name }, BASE);
    assert.ok(miss('Salmón ahumado').level === 'no' && miss('Salmón ahumado').missing.includes('listeria'));
    assert.deepEqual(miss('Yogur natural').missing, ['listeria']);
    assert.deepEqual(miss('Huevos camperos').missing, ['huevo-crudo']);
    assert.deepEqual(miss('Flan de huevo').missing, ['huevo-crudo']);
    assert.deepEqual(miss('Chorizo').missing, ['listeria', 'toxoplasmosis']);
    assert.deepEqual(miss('Atún en lata').missing, ['mercurio', 'pescado-crudo', 'listeria']);
    assert.deepEqual(miss('Cerveza').missing, ['alcohol']);
    assert.deepEqual(miss('Infusión de poleo').missing, ['hierbas']);
    assert.deepEqual(miss('Café soluble').missing, ['cafeina']);
    assert.deepEqual(miss('Hamburguesa').missing, ['toxoplasmosis']);
    assert.deepEqual(miss('Gnocchi rellenos').missing, ['huevo-crudo', 'listeria']);
    assert.deepEqual(miss('Gnocchi de patata').missing, ['huevo-crudo']);
    assert.deepEqual(miss('Gnocchi rellenos de queso').missing, ['listeria', 'huevo-crudo']);
    assert.deepEqual(miss('Agua mineral natural').missing, []);
    assert.deepEqual(missingForFood(null), []);
  });

  test('missing sin duplicados y como mucho 5', () => {
    const v = classifyProduct({ name: 'Plato combinado de pescado, huevo, embutido y café' }, BASE);
    assert.ok(isTopicList(v.missing));
    assert.ok(v.missing.length <= 5);
  });
});

describe('checkLabel', () => {
  const one = (text, topic) => checkLabel(text, [topic], BASE)[0];

  test('forma del resultado y orden de los temas pedidos', () => {
    const r = checkLabel('harina, huevo, vino', ['alcohol', 'huevo-crudo', 'alcohol', 'inventado'], BASE);
    assert.deepEqual(r.map((x) => x.topic), ['alcohol', 'huevo-crudo']);
    for (const x of r) {
      assert.ok(['aparece', 'no-aparece'].includes(x.status));
      assert.ok(Array.isArray(x.evidence) && x.evidence.length <= 3);
    }
    assert.equal(checkLabel('x', [], BASE).length, 0);
    assert.equal(checkLabel('x', undefined, BASE).length, CLAVE_IDS.length);
  });

  test('entradas raras no lanzan', () => {
    for (const t of [undefined, null, '', '   ', 42, {}]) {
      const r = checkLabel(t, ['huevo-crudo', 'alcohol'], BASE);
      assert.ok(r.every((x) => x.status === 'no-aparece' && x.evidence.length === 0));
    }
    assert.deepEqual(checkLabel('huevo', 'huevo-crudo', BASE).map((x) => x.status), ['aparece']);
  });

  test('huevo: huevo, yema, clara, ovoproducto, mayonesa, albúmina', () => {
    for (const t of ['Huevo', 'yema de huevo', 'clara', 'ovoproductos', 'mayonesa', 'albúmina', 'huevo en polvo', 'ovoalbúmina']) {
      assert.equal(one(t, 'huevo-crudo').status, 'aparece', t);
    }
    assert.equal(one('harina, azúcar, aceite de girasol', 'huevo-crudo').status, 'no-aparece');
    // Palabra completa: «huevas» y «huevería» no son huevo.
    assert.equal(one('huevas de pescado', 'huevo-crudo').status, 'no-aparece');
  });

  test('huevo pasteurizado: aparece, con evidencia y matiz «pasteurizado»', () => {
    const r = one('Harina, huevo pasteurizado (8%), sal', 'huevo-crudo');
    assert.equal(r.status, 'aparece');
    assert.equal(r.matiz, 'pasteurizado');
    assert.deepEqual(r.evidence, ['huevo pasteurizado (8%)']);
    assert.equal(one('ovoproducto pasteurizado', 'huevo-crudo').matiz, 'pasteurizado');
    // Uno sin pasteurizar quita el matiz.
    assert.equal(one('huevo pasteurizado, yema', 'huevo-crudo').matiz, undefined);
    assert.equal(one('huevo', 'huevo-crudo').matiz, undefined);
  });

  test('negaciones: sin huevo, sin alcohol, 0,0, sin cafeína', () => {
    for (const t of ['sin huevo', 'libre de huevo', 'sin gluten ni huevo', 'sin leche ni huevos', 'producto sin huevo ni lactosa']) {
      assert.equal(one(t, 'huevo-crudo').status, 'no-aparece', t);
    }
    // «sin lactosa con huevo»: el «con» corta la negación.
    assert.equal(one('sin lactosa con huevo', 'huevo-crudo').status, 'aparece');
    for (const t of ['sin alcohol', 'Cerveza sin alcohol', 'cerveza 0,0', 'Cerveza 0.0%', 'vino sin alcohol', 'vino desalcoholizado', 'alcohol 0,0', 'levadura de cerveza', 'azúcares alcohol', 'alcoholes de azúcar']) {
      assert.equal(one(t, 'alcohol').status, 'no-aparece', t);
    }
    for (const t of ['café descafeinado', 'sin cafeína', 'descafeinado', 'sin teína', 'cola sin cafeína', 'manteca de cacao', 'té de menta', 'cola de pescado']) {
      assert.equal(one(t, 'cafeina').status, 'no-aparece', t);
    }
  });

  test('alcohol: vino, cerveza, ron, licor, brandy, coñac, whisky, ginebra, alcohol, etanol; no vinagre', () => {
    for (const t of ['vino blanco', 'cerveza', 'ron', 'licor de hierbas', 'brandy', 'coñac', 'whisky', 'ginebra', 'alcohol', 'etanol', 'alcohol etílico', 'Vino tinto (12%)']) {
      assert.equal(one(t, 'alcohol').status, 'aparece', t);
    }
    for (const t of ['vinagre', 'vinagre de vino', 'vinagre de vino blanco', 'vinagre balsámico', 'vinagreta', 'vinagre de alcohol', 'ronda de pan']) {
      assert.equal(one(t, 'alcohol').status, 'no-aparece', t);
    }
    // El vinagre no tapa un vino de verdad.
    assert.equal(one('vinagre de vino, vino blanco', 'alcohol').status, 'aparece');
    const duda = one('azúcar, alcohol de caña', 'alcohol');
    assert.equal(duda.status, 'aparece');
    assert.equal(duda.matiz, 'duda');
    assert.deepEqual(duda.evidence, ['alcohol de caña']);
  });

  test('cafeína: café, cafeína, té, guaraná, mate, cola; cacao con matiz «poca»', () => {
    for (const t of ['café', 'extracto de café', 'cafeína', 'té verde', 'guaraná', 'yerba mate', 'cola', 'extracto de nuez de cola', 'Aroma natural, extracto de té negro']) {
      const r = one(t, 'cafeina');
      assert.equal(r.status, 'aparece', t);
      assert.equal(r.matiz, undefined, t);
    }
    for (const t of ['cacao', 'cacao en polvo', 'chocolate negro']) {
      const r = one(t, 'cafeina');
      assert.equal(r.status, 'aparece', t);
      assert.equal(r.matiz, 'poca', t);
    }
    assert.equal(one('cacao, café', 'cafeina').matiz, undefined);
  });

  test('listeria: leche cruda, sin pasteurizar, azules, brie, patés, ahumados', () => {
    for (const t of ['leche cruda', 'queso de leche cruda', 'queso sin pasteurizar', 'queso azul', 'roquefort', 'gorgonzola', 'cabrales', 'brie', 'camembert', 'salmón ahumado', 'paté de hígado', 'foie gras', 'brotes de alfalfa', 'jamón cocido', 'fiambre']) {
      assert.equal(one(t, 'listeria').status, 'aparece', t);
    }
    // Ahumado sin pescado no es listeria.
    assert.equal(one('pimentón ahumado', 'listeria').status, 'no-aparece');
    assert.equal(one('sabor ahumado', 'listeria').status, 'no-aparece');
    assert.equal(one('sal, aceite, harina', 'listeria').status, 'no-aparece');
  });

  test('listeria: pasteurizada es una señal distinta, con matiz', () => {
    const solo = one('Leche pasteurizada, sal, cuajo', 'listeria');
    assert.equal(solo.status, 'no-aparece');
    assert.equal(solo.matiz, 'pasteurizado');
    assert.deepEqual(solo.evidence, ['Leche pasteurizada']);
    const azul = one('Queso azul (leche pasteurizada)', 'listeria');
    assert.equal(azul.status, 'aparece');
    assert.equal(azul.matiz, 'pasteurizado');
    // «sin pasteurizar» no es pasteurizado.
    const cruda = one('queso de leche sin pasteurizar', 'listeria');
    assert.equal(cruda.status, 'aparece');
    assert.equal(cruda.matiz, undefined);
    // Queso fresco: sin decirlo, duda; diciéndolo, tranquiliza.
    assert.equal(one('queso fresco', 'listeria').matiz, 'duda');
    assert.equal(one('queso fresco de leche pasteurizada', 'listeria').status, 'no-aparece');
    assert.equal(one('leche cruda y leche pasteurizada', 'listeria').matiz, undefined);
  });

  test('toxoplasmosis: jamón, chorizo, salchichón, fuet, lomo, carne cruda, carne picada', () => {
    for (const t of ['jamón serrano', 'chorizo', 'salchichón', 'fuet', 'lomo embuchado', 'carne cruda', 'sobrasada', 'embutidos']) {
      const r = one(t, 'toxoplasmosis');
      assert.equal(r.status, 'aparece', t);
      assert.equal(r.matiz, undefined, t);
    }
    for (const t of ['carne picada', 'lomo']) assert.equal(one(t, 'toxoplasmosis').matiz, 'duda', t);
    assert.equal(one('jamón cocido', 'toxoplasmosis').status, 'no-aparece');
    assert.equal(one('jamón york', 'toxoplasmosis').status, 'no-aparece');
    assert.equal(one('lomo de bacalao', 'toxoplasmosis').status, 'no-aparece');
    assert.equal(one('sin embutidos', 'toxoplasmosis').status, 'no-aparece');
  });

  test('mercurio: pez espada, emperador, atún (rojo), tiburón, cazón, lucio', () => {
    for (const t of ['pez espada', 'emperador', 'atún rojo', 'tiburón', 'cazón', 'lucio']) {
      const r = one(t, 'mercurio');
      assert.equal(r.status, 'aparece', t);
      assert.equal(r.matiz, undefined, t);
    }
    assert.equal(one('atún', 'mercurio').matiz, 'duda');
    assert.equal(one('salmón, merluza', 'mercurio').status, 'no-aparece');
  });

  test('pescado crudo: crudo, marinado, ahumado, ceviche (solo con pescado)', () => {
    for (const t of ['salmón crudo', 'pescado marinado', 'salmón ahumado', 'ceviche', 'sushi', 'boquerones en vinagre', 'carpaccio de bacalao']) {
      assert.equal(one(t, 'pescado-crudo').status, 'aparece', t);
    }
    for (const t of ['jamón crudo', 'pimentón ahumado', 'cacao crudo', 'leche cruda', 'carne marinada']) {
      assert.equal(one(t, 'pescado-crudo').status, 'no-aparece', t);
    }
    assert.equal(one('anchoas', 'pescado-crudo').matiz, 'duda');
  });

  test('hierbas: regaliz, ruda, sen, poleo; hinojo y tila con matiz «poca»', () => {
    for (const t of ['regaliz', 'extracto de regaliz', 'ruda', 'hojas de sen', 'poleo']) {
      const r = one(t, 'hierbas');
      assert.equal(r.status, 'aparece', t);
      assert.equal(r.matiz, undefined, t);
    }
    for (const t of ['hinojo', 'tila']) assert.equal(one(t, 'hierbas').matiz, 'poca', t);
    assert.equal(one('sin regaliz', 'hierbas').status, 'no-aparece');
    assert.equal(one('manzanilla, menta', 'hierbas').status, 'no-aparece');
  });

  test('evidencia: fragmentos literales de la lista, máximo 3, sin repetir', () => {
    const r = one('Vino tinto, Cerveza, vino tinto, Ron añejo, Licor de café, Brandy', 'alcohol');
    assert.equal(r.evidence.length, 3);
    assert.deepEqual(r.evidence, ['Vino tinto', 'Cerveza', 'vino tinto']);
    // Literal: conserva mayúsculas y acentos.
    assert.deepEqual(one('Salsa de Café Molido, sal', 'cafeina').evidence, ['Salsa de Café Molido']);
    // Un ingrediente muy largo se acorta al trozo que habla del tema.
    const largo = one(`Salsa (${'agua, '.repeat(20)}yema de huevo, sal, ${'especias, '.repeat(10)}pimienta)`, 'huevo-crudo');
    assert.equal(largo.status, 'aparece');
    assert.ok(largo.evidence[0].length <= 80);
    assert.match(largo.evidence[0], /huevo/);
  });

  test('inglés básico de listas de OFF', () => {
    assert.equal(one('sugar, egg, salt', 'huevo-crudo').status, 'aparece');
    assert.equal(one('water, wine, salt', 'alcohol').status, 'aparece');
    assert.equal(one('water, sugar', 'alcohol').status, 'no-aparece');
  });

  test('determinismo y sin efectos sobre la entrada', () => {
    const txt = 'Leche pasteurizada, huevo, vino, cacao';
    const ids = ['listeria', 'huevo-crudo', 'alcohol', 'cafeina'];
    const copy = [...ids];
    assert.deepEqual(checkLabel(txt, ids, BASE), checkLabel(txt, ids, BASE));
    assert.deepEqual(ids, copy);
    assert.deepEqual(checkLabel(txt, ids, BASE), checkLabel(txt, ids));
  });

  test('cada tema pedido en missing se puede comprobar', () => {
    for (const id of CLAVE_IDS) assert.equal(checkLabel('agua', [id], BASE).length, 1, id);
  });
});

describe('temas: coherencia y determinismo', () => {
  test('claves.js, si existe, usa los mismos ids', async () => {
    let mod = null;
    try {
      mod = await import('../src/engine/claves.js');
    } catch {
      return; // aún no está: no depende de ello
    }
    const ids = mod.CLAVES.map((c) => c.id).sort();
    assert.deepEqual(ids, [...CLAVE_IDS].sort());
  });

  test('todo lo que devuelve topics/missing son ids de claves, en cualquier alimento de la guía', () => {
    for (const f of FOODS) {
      assert.ok(isTopicList(topicsForFood(f)), f.id);
      assert.ok(isTopicList(missingForFood(f)), f.id);
    }
  });

  test('un duda siempre lleva missing; un «Sí» nunca lleva topics (muestra de platos y productos)', () => {
    const platos = [
      'sushi', 'ñoquis', 'plato del día', 'tortilla', 'paella', 'zumo', 'ensalada', 'macarrones', 'solomillo', 'tarta casera',
      'gazpacho', 'pulpo', 'helado artesano', 'hamburguesa', 'croquetas', 'pizza cuatro quesos', 'lasaña', 'flan', 'mojito', 'xyzzy',
    ];
    for (const t of platos) {
      const v = ct(t);
      if (v.level === 'duda') assert.ok(v.missing.length > 0, t);
      if (v.level === 'si') assert.deepEqual(v.topics, [], t);
      if (v.level === 'cuidado' || v.level === 'no') assert.deepEqual(v.missing, [], t);
    }
  });

  test('mismo texto y perfil → mismo resultado', () => {
    for (const t of ['sushi', 'plato misterioso', 'ñoquis']) assert.deepEqual(ct(t), ct(t));
    const p = { name: 'Ñoquis de patata' };
    assert.deepEqual(classifyProduct(p, BASE), classifyProduct(p, BASE));
    assert.deepEqual(verdictForFood('queso-azul', BASE), verdictForFood('queso-azul', BASE));
  });
});

describe('producto: la frase de un «Sí» no la da un ingrediente', () => {
  const NEUTRA = 'He mirado los ingredientes y no veo nada que haya que vigilar.';
  const LECHE = FOOD_BY_ID['leche-pasteurizada'].phrase;

  test('ñoquis con leche pasteurizada en la etiqueta → Sí, pero no con la frase de la leche', () => {
    const v = classifyProduct({ name: 'Ñoquis de patata', ingredientsText: 'patata, harina de trigo, leche pasteurizada, sal' }, BASE);
    assert.equal(v.level, 'si');
    assert.notEqual(v.phrase, LECHE);
    assert.notEqual(v.foodId, 'leche-pasteurizada');
    assert.ok(v.foodIds.includes('leche-pasteurizada'), 'foodIds sigue con todas las coincidencias');
    assert.deepEqual(v.topics, []);
    assert.deepEqual(v.missing, []);
  });

  test('nombre sin coincidencia y ingredientes «Sí» → frase neutra de la propia app', () => {
    const v = classifyProduct({ name: 'Producto del obrador', ingredientsText: 'leche pasteurizada, sal' }, BASE);
    assert.equal(v.level, 'si');
    assert.equal(v.phrase, NEUTRA);
    assert.match(v.detail, /^He comparado los ingredientes con los temas que se repiten en el embarazo/);
    assert.match(v.detail, /Fuente: la propia app, a partir de la lista de ingredientes\.$/);
    assert.equal(v.source, 'La propia app: a partir de los ingredientes');
    assert.equal(v.question, null);
    assert.equal(v.alternative, null);
    assert.equal(v.foodId, null);
    assert.deepEqual(v.foodIds, ['leche-pasteurizada']);
  });

  test('yogur natural por nombre con ingredientes de OFF → su frase de yogur', () => {
    const v = classifyProduct({ name: 'Yogur natural', ingredientsText: 'leche pasteurizada, fermentos lácticos' }, BASE);
    assert.equal(v.level, 'si');
    assert.equal(v.foodId, 'yogur');
    assert.equal(v.phrase, FOOD_BY_ID.yogur.phrase);
  });

  test('por categoría de OFF también cuenta como el producto', () => {
    const v = classifyProduct({ name: 'Natural', ingredientsText: 'leche pasteurizada, fermentos', categories: ['en:yogurts'] }, BASE);
    assert.equal(v.foodId, 'yogur');
  });

  test('«Con cuidado» y «Mejor no» siguen decidiéndose por los ingredientes, con su motivo', () => {
    const azul = classifyProduct({ name: 'Pasta fresca rellena', ingredientsText: 'harina, queso azul, huevo' }, BASE);
    assert.equal(azul.level, 'no');
    assert.equal(azul.foodId, 'queso-azul');
    assert.match(azul.phrase, /queso azul/);
    assert.deepEqual(azul.topics, ['listeria']);
    const fresco = classifyProduct({ name: 'Pasta fresca rellena', ingredientsText: 'harina, queso de cabra, sal' }, BASE);
    assert.equal(fresco.level, 'cuidado');
    assert.deepEqual(fresco.topics, ['listeria']);
  });

  test('la frase neutra no cambia alergias, trazas ni la rebaja por falta de ingredientes', () => {
    const p = { name: 'Producto del obrador', ingredientsText: 'leche pasteurizada, sal' };
    assert.equal(classifyProduct({ ...p, allergens: ['en:milk'] }, profile({ alergias: ['leche'] })).level, 'no');
    assert.equal(classifyProduct({ ...p, traces: ['en:nuts'] }, profile({ alergias: ['frutos_secos'] })).level, 'cuidado');
    assert.equal(classifyProduct({ ...p, ingredientsSource: 'web' }, BASE).phrase, DATOS_WEB);
    assert.equal(classifyProduct({ name: 'Yogur natural', ingredientsText: ' ' }, BASE).phrase, SIN_INGREDIENTES);
  });
});

// ---------------------------------------------------------------------------
// N4 · Recalibrado de niveles y «Ojo con esto»
// ---------------------------------------------------------------------------

// Carta y súper españoles realistas: [texto, nivel esperado] y [nombre, ingredientes, nivel esperado].
const S = 'si', C = 'cuidado', N = 'no';
const CARTA = [
 // carnes
 ['entrecot', S], ['solomillo de ternera', S], ['filete de ternera', S], ['pollo asado', S], ['pechuga de pollo a la plancha', S],
 ['chuletillas de cordero', S], ['secreto ibérico', S], ['escalope de ternera', S], ['albóndigas en salsa', S], ['costillas a la barbacoa', S],
 ['hamburguesa', S], ['hamburguesa de buey', S], ['cachopo', S], ['flamenquín', S], ['san jacobo', S], ['pollo al ajillo', S],
 ['conejo al ajillo', S], ['cordero asado', S], ['cochinillo asado', S], ['lomo a la plancha', S], ['carrillera al vino tinto', S],
 ['rabo de toro', S], ['estofado de ternera', S], ['pollo al vino', S], ['ternera guisada', S], ['pinchos morunos', S], ['codillo', S],
 ['solomillo de cerdo', S], ['alitas de pollo', S], ['chuletón muy hecho', S],
 // pescados y mariscos
 ['lubina a la plancha', S], ['merluza a la romana', S], ['bacalao al pil pil', S], ['calamares a la romana', S], ['gambas al ajillo', S],
 ['pulpo a la gallega', S], ['sardinas a la brasa', S], ['rape a la plancha', S], ['salmón a la plancha', S], ['dorada a la sal', S],
 ['pescaíto frito', S], ['boquerones fritos', S], ['mejillones al vapor', S], ['almejas a la marinera', S], ['zamburiñas', S],
 ['navajas a la plancha', S], ['chipirones', S], ['atún a la plancha', S], ['bacalao a la vizcaína', S], ['sopa de pescado', S],
 // arroces y pasta
 ['paella de marisco', S], ['arroz con verduras', S], ['fideuá', S], ['arroz negro', S], ['arroz a banda', S], ['risotto de setas', S],
 ['arroz caldoso', S], ['espaguetis boloñesa', S], ['macarrones con tomate', S], ['lasaña de carne', S], ['canelones', S], ['ñoquis', S],
 ['pizza margarita', S], ['pizza de jamón y queso', S], ['pizza cuatro quesos', S], ['pizza barbacoa', S], ['espaguetis a la carbonara', C],
 // verduras, ensaladas, sopas, legumbres
 ['ensalada mixta', S], ['ensalada de tomate', S], ['ensalada de pasta', S], ['ensalada de garbanzos', S], ['ensalada de aguacate', S],
 ['gazpacho andaluz', S], ['salmorejo', S], ['crema de calabaza', S], ['caldo gallego', S], ['lentejas estofadas', S], ['fabada asturiana', S],
 ['cocido madrileño', S], ['potaje de garbanzos', S], ['garbanzos con espinacas', S], ['judías verdes con jamón', S], ['pisto con huevo', S],
 ['verduras a la plancha', S], ['parrillada de verduras', S], ['menestra de verduras', S], ['patatas bravas', S], ['pimientos de padrón', S],
 ['berenjenas con miel', S], ['alcachofas a la plancha', S], ['espárragos trigueros', S], ['pan con tomate', S], ['sopa de ajo', S],
 // huevos y tapas
 ['croquetas de jamón', S], ['croquetas de pollo', S], ['revuelto de setas', S], ['huevos duros', S], ['huevos revueltos', S],
 ['bocadillo de lomo', S], ['bocadillo de calamares', S], ['bocadillo de pollo', S], ['sándwich mixto', S], ['hummus', S], ['guacamole', S],
 ['falafel', S], ['tacos de pollo', S], ['burrito', S], ['kebab', S], ['nachos con queso', S], ['empanada gallega', S], ['empanadillas', S],
 // postres
 ['flan de huevo', S], ['natillas', S], ['arroz con leche', S], ['crema catalana', S], ['torrijas', S], ['churros con chocolate', S],
 ['fruta del tiempo', S], ['macedonia', S], ['yogur natural', S], ['brownie', S], ['tarta de queso', S], ['tarta de Santiago', S],
 ['tarta de manzana', S], ['helado de vainilla', S], ['profiteroles', S], ['milhojas', S], ['pastel de nata', S], ['croissant', S],
 ['magdalenas', S], ['cuajada', S], ['fresas con nata', S],
 // bebidas
 ['café con leche', S], ['café solo', S], ['té verde', S], ['cola', S], ['zumo de naranja', S], ['agua con gas', S], ['cerveza 0,0', S],
 ['tila', S], ['manzanilla', S], ['rooibos', S], ['batido de chocolate', S], ['horchata de brick', S], ['infusión de jengibre', S],
 // Con cuidado (reservado)
 ['ensaladilla rusa', C], ['tortilla de patatas', C], ['bocadillo de tortilla', C], ['coulant de chocolate', C], ['ensalada césar', C],
 ['tabla de quesos', C], ['ensalada de queso de cabra', C], ['brie', C], ['patatas alioli', C], ['mayonesa', C], ['helado casero', C],
 ['tarta de queso fría', C], ['cerveza sin alcohol', C], ['horchata', C], ['solomillo en salsa de vino', C], ['pollo flambeado', C],
 // Mejor no (riesgo real)
 ['sushi variado', N], ['sashimi de salmón', N], ['jamón ibérico', N], ['jamón serrano', N], ['tabla de ibéricos', N], ['chorizo', N],
 ['tiramisú', N], ['vino tinto', N], ['tinto de verano', N], ['copa de cava', N], ['carpaccio de ternera', N], ['steak tartar', N],
 ['bocadillo de jamón serrano', N], ['bocadillo de jamón york', N], ['huevos fritos con patatas', N], ['huevos rotos con jamón', N],
 ['pez espada a la plancha', N], ['atún rojo', N], ['paté', N], ['queso azul', N], ['salmón ahumado', N], ['tortilla poco cuajada', N],
 ['mayonesa casera', N], ['boquerones en vinagre', N], ['ostras', N], ['ceviche', N], ['gin tonic', N], ['mojito', N],
 ['entrecot poco hecho', N], ['chuletón al punto', N], ['hamburguesa poco hecha', N], ['mousse de chocolate casera', N], ['foie', N],
 ['tataki de atún', N], ['anchoas', N], ['kombucha', N], ['bebida energética', N], ['queso de leche cruda', N],
];
const SUPER = [
 // [nombre, ingredientes, esperado]
 ['Yogur natural', 'Leche pasteurizada, fermentos lácticos', S],
 ['Leche entera UHT', 'Leche entera de vaca', S],
 ['Queso fresco batido', 'Leche pasteurizada, cuajo, sal', S],
 ['Queso manchego curado', 'Leche pasteurizada de oveja, sal, cuajo, lisozima', S],
 ['Queso en lonchas', 'Queso, leche pasteurizada, sal', N],
 ['Jamón cocido extra', 'Jamón de cerdo, sal, dextrosa', N],
 ['Pechuga de pavo en lonchas', 'Pechuga de pavo, sal, almidón', N],
 ['Chorizo ibérico', 'Carne de cerdo, pimentón, sal, ajo', N],
 ['Atún claro en aceite de oliva', 'Atún claro, aceite de oliva, sal', S],
 ['Sardinillas en aceite', 'Sardinillas, aceite de oliva, sal', S],
 ['Mejillones en escabeche', 'Mejillones, aceite, vinagre, pimentón, sal', S],
 ['Salmón ahumado', 'Salmón, sal, humo', N],
 ['Palitos de cangrejo', 'Pasta de pescado (surimi), almidón, clara de huevo', N],
 ['Pan de molde', 'Harina de trigo, agua, levadura, sal, azúcar', S],
 ['Galletas María', 'Harina de trigo, azúcar, aceite de girasol, huevo', S],
 ['Cereales de desayuno', 'Trigo integral, azúcar, sal, malta', S],
 ['Tomate frito', 'Tomate, aceite de girasol, azúcar, sal', S],
 ['Mayonesa', 'Aceite de girasol, agua, yema de huevo pasteurizada, vinagre, sal', S],
 ['Pizza congelada cuatro quesos', 'Harina, queso mozzarella, queso gouda, tomate, aceite', S],
 ['Lasaña de carne congelada', 'Pasta, carne de vacuno, tomate, bechamel, queso', S],
 ['Croquetas de jamón congeladas', 'Leche, harina, jamón, aceite, huevo', S],
 ['Ensalada en bolsa', 'Lechuga, canónigos, rúcula', S],
 ['Gazpacho de brick', 'Tomate, pepino, pimiento, aceite, vinagre, sal', S],
 ['Zumo de naranja', 'Zumo de naranja exprimido', S],
 ['Cola zero', 'Agua, dióxido de carbono, colorante, edulcorantes, cafeína', S],
 ['Cerveza sin alcohol 0,0', 'Agua, malta de cebada, lúpulo', S],
 ['Cerveza lager', 'Agua, malta de cebada, lúpulo', N],
 ['Agua mineral natural', 'Agua mineral natural', S],
 ['Hummus', 'Garbanzos, tahini, aceite de oliva, limón, sal', S],
 ['Huevos camperos', 'Huevos', S],
 ['Tortilla de patatas refrigerada', 'Patata, huevo pasteurizado, cebolla, aceite de girasol, sal', C],
 ['Ensaladilla rusa refrigerada', 'Patata, zanahoria, atún, mayonesa (aceite, huevo pasteurizado), guisantes', C],
 ['Paté de hígado de cerdo', 'Hígado de cerdo, grasa, sal, especias', N],
 ['Sobrasada', 'Carne de cerdo, pimentón, sal', N],
 ['Salchichas Frankfurt', 'Carne de cerdo, agua, sal, especias', S],
 ['Flan de huevo', 'Leche, huevo, azúcar, caramelo', S],
 ['Natillas', 'Leche, azúcar, yema de huevo, almidón', S],
 ['Helado de vainilla', 'Leche, nata, azúcar, yema de huevo pasteurizada', S],
 ['Café molido', 'Café', S],
 ['Infusión de manzanilla', 'Manzanilla', S],
 ['Chocolate negro 70%', 'Cacao, azúcar, manteca de cacao', S],
 ['Aceitunas rellenas de anchoa', 'Aceitunas, anchoa, agua, sal', S],
 ['Tofu', 'Soja, agua, coagulante', S],
];

describe('recalibrado: Sí con «Ojo con esto»', () => {
  const sinOjo = (t, re, over = {}) => {
    const v = ct(t, over);
    assert.equal(v.level, 'si', `${t} → ${v.level} (${v.foodIds.join(', ')})`);
    assert.ok(v.ojo.some((o) => re.test(o)), `${t}: ${JSON.stringify(v.ojo)}`);
    assert.deepEqual(v.topics, [], t);
    return v;
  };

  test('carnes hechas: Sí y ojo de cocción', () => {
    for (const t of ['entrecot', 'filete de ternera', 'solomillo de ternera', 'pollo asado', 'escalope de ternera', 'albóndigas', 'chuletillas de cordero', 'cordero asado']) {
      sinOjo(t, /hecha del todo/);
    }
    sinOjo('hamburguesa', /rosadas/);
    sinOjo('hamburguesa de buey', /rosadas/);
  });

  test('arroces y paella: Sí y ojo del marisco', () => {
    for (const t of ['paella', 'paella de marisco', 'fideuá', 'arroz negro', 'arroz a banda']) sinOjo(t, /marisco/);
  });

  test('ensaladas, gazpacho y salmorejo: Sí y verdura lavada', () => {
    for (const t of ['ensalada mixta', 'ensalada de tomate', 'gazpacho', 'gazpacho andaluz', 'salmorejo']) sinOjo(t, /lavada/);
    sinOjo('salmorejo', /jamón/);
  });

  test('helado y quesos de súper: Sí y pasteurizado', () => {
    sinOjo('helado de vainilla', /pasteurizado/);
    for (const t of ['queso fresco', 'mozzarella', 'burrata', 'queso manchego', 'queso curado', 'requesón']) sinOjo(t, /pasteurizad/);
  });

  test('cafeína, azúcar y mercurio: Sí con moderación', () => {
    for (const t of ['café con leche', 'té verde', 'cola']) sinOjo(t, /cafeína/);
    sinOjo('zumo de naranja', /fruta entera/);
    sinOjo('edulcorante', /moderación/);
    sinOjo('atún en lata', /mercurio/);
    sinOjo('atún a la plancha', /mercurio/);
    sinOjo('tónica', /quinina/);
    sinOjo('tila', /vez en cuando/);
  });

  test('tarta de queso horneada y revuelto: Sí; la fría, Con cuidado', () => {
    sinOjo('tarta de queso', /pasteurizado/);
    sinOjo('tarta de queso al horno', /cuajado/);
    sinOjo('revuelto de setas', /cuajado/);
    for (const t of ['tarta de queso fría', 'tarta de queso sin hornear', 'cheesecake sin hornear']) {
      const v = expectLevel(t, 'cuidado');
      assert.equal(v.foodId, 'tarta-queso-fria', t);
      assert.ok(v.question);
      assert.deepEqual(v.topics, ['listeria', 'huevo-crudo']);
    }
  });

  test('guisos con vino que hierve de verdad: Sí; salsa o flambé: Con cuidado', () => {
    for (const t of ['carrillera al vino tinto', 'rabo de toro', 'ternera al vino', 'ternera estofada al vino', 'pollo a la sidra', 'almejas a la marinera', 'estofado con vino']) {
      const v = ct(t);
      assert.equal(v.level, 'si', `${t} → ${v.level} (${v.foodIds.join(', ')})`);
      assert.ok(v.ojo.some((o) => /vino/.test(o)), t);
    }
    for (const t of ['solomillo en salsa de vino', 'pollo flambeado', 'gambas flambeadas con brandy', 'reducción de vino', 'salsa al oporto']) {
      const v = expectLevel(t, 'cuidado');
      assert.ok(v.foodIds.includes('salsa-vino'), t);
      assert.deepEqual(v.topics, ['alcohol'], t);
    }
    // Vino de verdad en la mesa, siempre «Mejor no».
    expectLevel('carrillera con una copa de vino', 'no');
  });

  test('salchichas y perrito: Sí si van calientes', () => {
    sinOjo('perrito caliente', /caliente/);
    sinOjo('salchichas frankfurt', /calientes/);
  });

  test('«ojo» en la ficha y en el veredicto de una ficha', () => {
    assert.deepEqual(verdictForFood('hamburguesa', BASE).ojo, ['Que esté hecha del todo, sin partes rosadas.']);
    assert.deepEqual(verdictForFood('agua', BASE).ojo, []);
    assert.deepEqual(verdictForFood('pescado-crudo', BASE).ojo, []);
    assert.equal(verdictForFood('hamburguesa', BASE).level, 'si');
  });

  test('varias fichas suman sus avisos, sin repetir y como mucho 3', () => {
    const v = ct('hamburguesa con ensalada mixta y café con leche y tarta de queso');
    assert.equal(v.level, 'si');
    assert.equal(v.ojo.length, 3);
    assert.equal(new Set(v.ojo).size, 3);
    assert.deepEqual(ct('ensalada mixta y gazpacho').ojo, ['Verdura bien lavada.', 'Sin jamón curado por encima.']);
  });

  test('con queso pasteurizado dicho, ya no hace falta el aviso', () => {
    const v = ct('queso fresco pasteurizado');
    assert.equal(v.level, 'si');
    assert.deepEqual(v.ojo, []);
  });

  test('un «Con cuidado» puede llevar los avisos de lo demás; «Mejor no» y «No estoy segura», ninguno', () => {
    const c = ct('tortilla de patatas con ensalada mixta');
    assert.equal(c.level, 'cuidado');
    assert.deepEqual(c.ojo, ['Verdura bien lavada.']);
    for (const t of ['sushi', 'tiramisú', 'jamón serrano', 'plato misterioso del chef', 'ensalada con jamón serrano']) {
      assert.deepEqual(ct(t).ojo, [], t);
    }
    // Una alergia que lo vuelve «Mejor no» quita los avisos.
    assert.deepEqual(ct('pizza', { alergias: ['gluten'] }).ojo, []);
    assert.equal(ct('pizza', { alergias: ['gluten'] }).level, 'no');
  });

  test('productos: el «ojo» viene del nombre, no de los ingredientes; la rebaja a duda no lo lleva', () => {
    const h = classifyProduct({ name: 'Hamburguesa de ternera', ingredientsText: 'carne de ternera, sal, especias' }, BASE);
    assert.equal(h.level, 'si');
    assert.deepEqual(h.ojo, ['Que esté hecha del todo, sin partes rosadas.']);
    assert.deepEqual(classifyProduct({ name: 'Producto del obrador', ingredientsText: 'leche pasteurizada, sal' }, BASE).ojo, []);
    assert.deepEqual(classifyProduct({ name: 'Hamburguesa de ternera' }, BASE).ojo, []);
    assert.deepEqual(classifyProduct({ name: 'Queso fresco' }, BASE).level, 'duda');
  });

  test('«ojo» siempre presente: array, máx. 3, sin repetir, cada aviso ≤ 70 caracteres, sin «evitar» ni «seguro»', () => {
    const check = (v, t) => {
      assert.ok(Array.isArray(v.ojo), t);
      assert.ok(v.ojo.length <= 3, t);
      assert.equal(new Set(v.ojo).size, v.ojo.length, t);
      for (const o of v.ojo) {
        assert.ok(o.length <= 70, `${t}: «${o}» (${o.length})`);
        assert.doesNotMatch(o, /evitar|seguro|segura/i, t);
        assert.doesNotMatch(o, /[0-9]/.test(o) && !/0,0|200 mg/.test(o) ? /[0-9]/ : /^$/, t);
      }
      if (v.level === 'no' || v.level === 'duda') assert.deepEqual(v.ojo, [], t);
      if (v.level === 'si' || v.level === 'duda') assert.deepEqual(v.topics, [], t);
    };
    for (const f of FOODS) {
      assert.ok(!f.ojo || (Array.isArray(f.ojo) && f.ojo.length <= 3), f.id);
      check(verdictForFood(f.id, BASE), f.id);
    }
    for (const [t] of CARTA) check(ct(t), t);
    for (const [n, i] of SUPER) check(classifyProduct({ name: n, ingredientsText: i }, BASE), n);
    check(classifyProduct({ name: 'Yogur', ingredientsSource: 'web' }, BASE), 'web');
  });
});

describe('recalibrado: Con cuidado reservado y Mejor no intactos', () => {
  test('Con cuidado: el riesgo depende de un dato que no se ve, y hay pregunta', () => {
    for (const t of [
      'tortilla de patatas', 'bocadillo de tortilla', 'ensaladilla rusa', 'espaguetis a la carbonara', 'coulant de chocolate',
      'helado casero', 'tarta de queso fría', 'queso de cabra', 'brie', 'camembert', 'tabla de quesos', 'mayonesa', 'alioli',
      'patatas alioli', 'ensalada césar', 'salsa al vino', 'cerveza sin alcohol', 'horchata',
    ]) {
      const v = expectLevel(t, 'cuidado');
      assert.ok(v.question, `${t} sin pregunta`);
      assert.ok(v.topics.length > 0, `${t} sin tema`);
    }
    assert.equal(ct('alioli').foodId, 'mayonesa-dudosa');
    assert.equal(ct('mayonesa casera').foodId, 'mayonesa-casera');
  });

  test('Mejor no intacto: ningún riesgo real pasa a verde ni a naranja', () => {
    for (const t of [
      'sushi', 'sashimi', 'nigiri', 'ceviche', 'tartar de salmón', 'steak tartar', 'carpaccio de ternera', 'entrecot poco hecho',
      'solomillo al punto', 'chuletón', 'hamburguesa poco hecha', 'tiramisú', 'mousse casera', 'jamón serrano', 'jamón ibérico',
      'chorizo', 'tabla de ibéricos', 'bocadillo de jamón york', 'bocadillo de jamón serrano', 'mayonesa casera', 'alioli casero',
      'salmón ahumado', 'huevos fritos', 'huevos rotos con jamón', 'huevo poché', 'tortilla poco cuajada', 'pez espada',
      'atún rojo', 'tiburón', 'paté', 'foie', 'queso azul', 'roquefort', 'cabrales', 'queso rallado', 'leche cruda',
      'boquerones en vinagre', 'ostras', 'anchoas', 'surimi', 'brotes de alfalfa', 'vino tinto', 'cerveza', 'tinto de verano',
      'gin tonic', 'mojito', 'cava', 'kombucha', 'bebida energética', 'poleo menta', 'regaliz', 'hígado', 'caza',
      'ensalada con jamón serrano', 'ensalada con salmón ahumado', 'ensalada con queso azul', 'salmorejo con jamón serrano',
    ]) {
      expectLevel(t, 'no');
    }
  });

  test('alergias, dietas y trazas no cambian con el recalibrado', () => {
    assert.equal(ct('pizza', { alergias: ['gluten'] }).level, 'no');
    assert.ok(ct('pizza', { alergias: ['gluten'] }).phrase.startsWith('Has marcado gluten.'));
    assert.equal(ct('café con leche', { alergias: ['leche'] }).level, 'no');
    assert.ok(ct('paella', { dieta: ['vegetariana'] }).notes.length === 0);
    assert.ok(ct('hamburguesa', { dieta: ['vegetariana'] }).notes.includes('No encaja con vegetariana'));
    const tr = classifyProduct({ name: 'Yogur natural', ingredientsText: 'leche pasteurizada', traces: ['en:nuts'] }, profile({ alergias: ['frutos_secos'] }));
    assert.equal(tr.level, 'cuidado');
  });
});

describe('recalibrado: corpus de carta y súper españoles', () => {
  test('cada plato sale en el nivel esperado y ninguno en «No estoy segura»', () => {
    const fallos = [];
    for (const [t, e] of CARTA) {
      const v = ct(t);
      if (v.level !== e) fallos.push(`${t}: ${v.level} (esperado ${e}; ${v.foodIds.join(',')})`);
    }
    for (const [n, i, e] of SUPER) {
      const v = classifyProduct({ name: n, ingredientsText: i }, BASE);
      if (v.level !== e) fallos.push(`[producto] ${n}: ${v.level} (esperado ${e}; ${v.foodIds.join(',')})`);
    }
    assert.deepEqual(fallos, []);
  });

  test('reparto: ≥ 80 % «Sí» sin contar los de riesgo real, «Con cuidado» ≤ 10 %', () => {
    const niveles = CARTA.map(([t]) => ct(t).level);
    const total = CARTA.length;
    const riesgo = CARTA.filter(([, e]) => e === 'no').length;
    const cuenta = (l) => niveles.filter((x) => x === l).length;
    assert.ok(total >= 150, String(total));
    assert.ok(cuenta('si') / (total - riesgo) >= 0.8, `Sí ${cuenta('si')} de ${total - riesgo}`);
    assert.ok(cuenta('cuidado') / total <= 0.1, `Con cuidado ${cuenta('cuidado')} de ${total}`);
    assert.equal(cuenta('duda'), 0);
    assert.equal(cuenta('no'), riesgo);
  });
});
