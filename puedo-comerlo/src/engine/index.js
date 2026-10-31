// API pública del motor de reglas (docs/CONTRATO.md). Puro: sin DOM, sin red, sin fecha, sin aleatoriedad.
export { LEVELS, LEVEL_LABEL, worstLevel } from './levels.js';
export { FOODS, GROUPS, FOOD_BY_ID } from './foods.js';
export { normalize } from './normalize.js';
export { searchFoods, verdictForFood, classifyText, classifyProduct } from './classify.js';
export { checkLabel, LABEL_TOPICS } from './etiqueta.js';
export { CLAVE_IDS, topicsForFood, missingForFood } from './temas.js';
