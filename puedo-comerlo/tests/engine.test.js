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
} from '../src/engine/index.js';

const BASE = Object.freeze({ embutido: 'cocinados', embutidos: [], alergias: [], otra: '', dieta: [] });
const profile = (over = {}) => ({ ...BASE, ...over });
const ct = (text, over = {}, opts = {}) => classifyText(text, opts, profile(over));

const VERDICT_KEYS = [
  'title', 'level', 'label', 'phrase', 'detail', 'question', 'alternative', 'source', 'foodId', 'foodIds', 'notes',
  'uncertain', 'ingredients',
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
    assert.equal(expectLevel('ternera estofada al vino', 'cuidado').foodId, 'salsa-vino');
    expectLevel('sangría', 'no');
    expectLevel('tinto de verano', 'no');
  });

  test('café y té', () => {
    assert.equal(expectLevel('café descafeinado', 'si').foodId, 'descafeinado');
    expectLevel('café con leche', 'cuidado');
    expectLevel('té verde', 'cuidado');
    assert.ok(!ct('tomate').foodIds.includes('te'));
    assert.ok(!ct('ensalada de tomate').foodIds.includes('te'));
  });

  test('pescado y marisco', () => {
    expectLevel('atún rojo', 'no');
    expectLevel('pez espada', 'no');
    assert.equal(expectLevel('atún a la plancha', 'cuidado').foodId, 'atun-plancha');
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
    assert.equal(ct('alioli').foodId, 'mayonesa-casera');
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
    const v = expectLevel('croquetas de jamón', 'cuidado');
    assert.equal(v.foodId, 'embutido-cocinado');
    const no = expectLevel('croquetas de jamón', 'no', { embutido: 'no' });
    assert.equal(no.phrase, 'Has decidido no comer embutidos.');
    const otro = expectLevel('croquetas de jamón', 'no', { embutidos: ['chorizo'] });
    assert.equal(otro.phrase, 'No está entre los embutidos que has marcado.');
    expectLevel('croquetas de jamón', 'cuidado', { embutidos: ['jamon'] });
    expectLevel('pizza de chorizo', 'no', { embutido: 'no' });
  });

  test('los_como: crudo sigue «Mejor no» con el motivo', () => {
    const v = expectLevel('jamón ibérico', 'no', { embutido: 'los_como' });
    assert.match(v.phrase, /toxoplasmosis/);
    assert.match(v.phrase, /La decisión es tuya/);
    expectLevel('croquetas de jamón', 'cuidado', { embutido: 'los_como' });
  });

  test('cocinados: crudo «Mejor no», cocinado «Con cuidado»', () => {
    assert.equal(ct('fuet').phrase, 'En crudo, mejor no. Solo si va cocinado dentro del plato.');
    expectLevel('lentejas con chorizo', 'cuidado');
    expectLevel('huevos rotos con jamón', 'no');
  });

  test('sin perfil: nivel y frase base', () => {
    const v = ct('jamón ibérico', { embutido: null });
    assert.equal(v.level, 'no');
    assert.equal(v.phrase, FOOD_BY_ID['jamon-curado'].phrase);
  });

  test('fiambre de bandeja: siempre «Mejor no», da igual el perfil', () => {
    for (const embutido of [null, 'no', 'cocinados', 'los_como']) {
      const v = ct('jamón york', { embutido });
      assert.equal(v.level, 'no');
      assert.equal(v.phrase, FOOD_BY_ID['fiambre-loncheado'].phrase);
    }
  });

  test('embutido cocinado sin tipo en el texto: sin filtro de «cuáles come»', () => {
    expectLevel('fabada', 'cuidado', { embutidos: ['chorizo'] });
    expectLevel('fabada', 'no', { embutido: 'no' });
  });

  test('la frase sustituida solo gana si ese embutido es el peor', () => {
    const v = ct('croquetas de jamón y queso azul', { embutido: 'cocinados' });
    assert.equal(v.level, 'no');
    assert.equal(v.foodId, 'queso-azul');
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
    assert.equal(ct('té verde', { otra: 'te' }).level, 'cuidado');
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
    assert.equal(v.level, 'cuidado');
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
    assert.equal(classifyProduct({ name: 'Mahou 0,0 Tostada', categories: ['en:beers', 'en:non-alcoholic-beers'] }, BASE).level, 'si');
    assert.equal(classifyProduct({ name: 'Mahou Clásica', categories: ['en:beers'] }, BASE).level, 'no');
    assert.equal(classifyProduct({ name: 'Agua mineral natural' }, BASE).foodId, 'agua');
    // «agua» o «zumo de limón» entre los ingredientes no dicen nada del producto.
    assert.equal(classifyProduct({ name: 'Pan de molde', ingredientsText: 'harina de trigo, agua, sal' }, BASE).level, 'duda');
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
