// Cobertura de códigos de barras: cliente de Open Food Facts ampliado, /api/producto (con cliente falso: aquí no
// hay clave de Anthropic) y el orquestador lookupProduct (con fetch falso). Sin red.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import http from 'node:http';

import productoDefault, {
  createHandler,
  buildRequest,
  buildPrompt,
  resolveModel,
  searchToolFor,
  validateCode,
  gtinChecksumOk,
  sanitizeProduct,
  parseModelJson,
  SCHEMA,
  LIMITS,
  RATE_LIMIT,
  CACHE_TTL,
  MAX_TOKENS,
  MAX_USES,
} from '../api/producto.js';
import { normalizeProduct, fetchProduct, OFF_FIELDS } from '../src/capture/off.js';
import { lookupProduct, STATUS_OFF, STATUS_WEB } from '../src/capture/producto.js';
import { createServer } from '../server.js';

// ---------- Utilidades ----------

// EAN-13 válido a partir de 12 dígitos.
function ean13(first12) {
  const d = Array.from(first12, Number);
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += d[i] * w;
  return first12 + ((10 - (sum % 10)) % 10);
}
const CODE = ean13('843700800001'); // 8437008000015
const CODE2 = ean13('848000014002');
const CODE3 = ean13('843187600001');

function fakeRes() {
  const headers = {};
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    statusCode: 200,
    writableEnded: false,
    body: undefined,
    headers,
    done,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    end(body) {
      this.body = body;
      this.writableEnded = true;
      finish();
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

function jsonReq(body, { method = 'POST', headers = {} } = {}) {
  return { method, headers: { 'content-type': 'application/json', host: 'localhost:5173', ...headers }, body };
}

function streamReq(text, { method = 'POST', headers = {} } = {}) {
  const req = Readable.from([Buffer.from(text)]);
  req.method = method;
  req.headers = { 'content-type': 'application/json', ...headers };
  return req;
}

async function run(handler, req) {
  const res = fakeRes();
  await handler(req, res);
  await res.done;
  return res;
}

function fakeClient(impl) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        async create(params, options) {
          calls.push({ params, options });
          return impl(params, calls.length, options);
        },
      },
    },
  };
}

const FOUND = {
  found: true,
  name: 'Leche semidesnatada Hacendado',
  brand: 'Hacendado',
  ingredients_text: 'Leche semidesnatada pasteurizada.',
  allergens: ['leche'],
  source_url: 'https://www.mercadona.es/leche',
  source_name: 'Mercadona',
  confidence: 'alta',
};

// Respuesta del modelo tras una búsqueda web real (con bloques de la herramienta de servidor).
function searchMessage(payload, { urls = ['https://www.mercadona.es/leche'], extra = {}, searches = 1 } = {}) {
  return {
    stop_reason: 'end_turn',
    usage: { server_tool_use: { web_search_requests: searches } },
    content: [
      { type: 'text', text: 'Voy a buscarlo.' },
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: CODE } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: urls.map((url) => ({ type: 'web_search_result', url, title: 't', encrypted_content: 'x' })) },
      { type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) },
    ],
    ...extra,
  };
}

const silent = () => {};
const body = (extra = {}) => ({ code: CODE, ...extra });

// ---------- off.js ampliado ----------

describe('off.js: ingredientes y estado incompleto', () => {
  test('OFF_FIELDS pide quantity, lang, los idiomas de respaldo y la lista estructurada', () => {
    for (const f of ['quantity', 'lang', 'ingredients_text_es', 'ingredients_text', 'ingredients_text_en', 'ingredients_text_fr', 'ingredients_text_it', 'ingredients_text_pt', 'ingredients_text_ca', 'ingredients_text_de', 'ingredients']) {
      assert.ok(OFF_FIELDS.split(',').includes(f), f);
    }
  });

  test('orden: es, genérico, otro idioma, estructurada', () => {
    assert.equal(normalizeProduct({ product: { ingredients_text_es: 'harina', ingredients_text: 'flour' } }).ingredientsText, 'harina');
    assert.equal(normalizeProduct({ product: { ingredients_text: 'flour', ingredients_text_fr: 'farine' } }).ingredientsText, 'flour');
    const fr = normalizeProduct({ product: { ingredients_text_fr: 'lait cru', ingredients_text_de: 'milch' } });
    assert.equal(fr.ingredientsText, 'lait cru');
    assert.equal(fr.ingredientsLang, 'fr');
    assert.equal(normalizeProduct({ product: { ingredients_text_pt: 'leite', ingredients_text_ca: 'llet' } }).ingredientsText, 'leite');
    assert.equal(normalizeProduct({ product: { ingredients_text_ca: 'llet' } }).ingredientsLang, 'ca');
    assert.equal(normalizeProduct({ product: { ingredients_text_de: 'milch' } }).ingredientsLang, 'de');
    assert.equal(normalizeProduct({ product: { ingredients_text_it: 'latte' } }).ingredientsText, 'latte');
    // el genérico solo declara idioma si OFF lo dice y no es español
    assert.equal('ingredientsLang' in normalizeProduct({ product: { ingredients_text: 'x', lang: 'es' } }), false);
    assert.equal(normalizeProduct({ product: { ingredients_text: 'x', lang: 'en' } }).ingredientsLang, 'en');
    assert.equal('ingredientsLang' in normalizeProduct({ product: { ingredients_text: 'x' } }), false);
  });

  test('reconstruye el texto desde la lista estructurada si no hay texto', () => {
    const p = normalizeProduct({
      product: { ingredients: [{ id: 'en:milk', text: 'leche' }, { text: '  sal ' }, { id: 'en:x' }, null, { text: 5 }] },
    });
    assert.equal(p.ingredientsText, 'leche, sal');
    assert.equal(normalizeProduct({ product: { ingredients: [] } }).ingredientsText, '');
  });

  test('quantity solo si viene; el texto se limita a 3000 caracteres', () => {
    assert.equal(normalizeProduct({ product: { quantity: ' 1 l ' } }).quantity, '1 l');
    assert.equal('quantity' in normalizeProduct({ product: { product_name: 'x' } }), false);
    assert.equal(normalizeProduct({ product: { ingredients_text: 'a'.repeat(5000) } }).ingredientsText.length, 3000);
  });

  describe('fetchProduct (fetch simulado)', () => {
    const realFetch = globalThis.fetch;
    let calls;
    const mock = (impl) => {
      calls = [];
      globalThis.fetch = async (url, opts) => {
        calls.push({ url, opts });
        return impl(url, opts, calls.length);
      };
    };
    after(() => {
      globalThis.fetch = realFetch;
    });
    const offJson = (product) => new Response(JSON.stringify({ status: 1, code: CODE, product: { code: CODE, product_name: 'Leche', ...product } }), { status: 200 });
    const opts = { retryDelayMs: 0 };

    test('con ingredientes → incomplete:false y source off', async () => {
      mock(() => offJson({ ingredients_text_es: 'leche' }));
      const r = await fetchProduct(CODE, opts);
      assert.equal(r.found, true);
      assert.equal(r.source, 'off');
      assert.equal(r.incomplete, false);
      assert.equal(r.product.ingredientsText, 'leche');
    });

    test('sin ingredientes → incomplete:true', async () => {
      mock(() => offJson({}));
      const r = await fetchProduct(CODE, opts);
      assert.equal(r.found, true);
      assert.equal(r.incomplete, true);
      assert.equal(r.product.ingredientsText, '');
    });

    test('reintenta una vez ante fallo de red y ante 5xx', async () => {
      mock((u, o, n) => {
        if (n === 1) throw new TypeError('Failed to fetch');
        return offJson({ ingredients_text: 'leche' });
      });
      assert.equal((await fetchProduct(CODE, opts)).found, true);
      assert.equal(calls.length, 2);
      mock((u, o, n) => (n === 1 ? new Response('oops', { status: 502 }) : offJson({ ingredients_text: 'leche' })));
      assert.equal((await fetchProduct(CODE, opts)).found, true);
      assert.equal(calls.length, 2);
    });

    test('dos fallos seguidos → network (solo dos intentos); 404 y JSON roto no se reintentan', async () => {
      mock(() => new Response('oops', { status: 503 }));
      await assert.rejects(fetchProduct(CODE, opts), (e) => e.code === 'network');
      assert.equal(calls.length, 2);
      mock(() => new Response('<html>', { status: 200 }));
      await assert.rejects(fetchProduct(CODE, opts), (e) => e.code === 'network');
      assert.equal(calls.length, 1);
      mock(() => new Response('{"status":0}', { status: 404 }));
      assert.deepEqual(await fetchProduct(CODE, opts), { found: false });
      assert.equal(calls.length, 1);
    });

    test('cancelado con signal → AbortError, sin reintento', async () => {
      const ctrl = new AbortController();
      mock((u, o) => new Promise((_, reject) => o.signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))));
      const p = fetchProduct(CODE, { ...opts, signal: ctrl.signal });
      setTimeout(() => ctrl.abort(), 10);
      await assert.rejects(p, (e) => e.name === 'AbortError');
      assert.equal(calls.length, 1);
    });
  });
});

// ---------- /api/producto ----------

describe('api/producto', () => {
  let savedKey;
  let savedModel;
  before(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    savedModel = process.env.PRODUCT_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.PRODUCT_MODEL;
  });
  after(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedModel !== undefined) process.env.PRODUCT_MODEL = savedModel;
    else delete process.env.PRODUCT_MODEL;
  });

  const ok = (payload = FOUND, opts) => () => searchMessage(payload, opts);
  const handlerWith = (impl, extra = {}) => {
    const client = fakeClient(impl);
    return { client, handler: createHandler({ client, log: silent, ...extra }) };
  };

  test('sin clave → 503 sin_vision (el export por defecto también)', async () => {
    const res = await run(productoDefault, jsonReq(body()));
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { error: 'sin_vision' });
    assert.equal(res.getHeader('cache-control'), 'no-store');
  });

  test('405 en GET con Allow: POST y no-store', async () => {
    const { handler, client } = handlerWith(ok());
    const res = await run(handler, jsonReq(undefined, { method: 'GET' }));
    assert.equal(res.statusCode, 405);
    assert.equal(res.getHeader('allow'), 'POST');
    assert.equal(res.getHeader('cache-control'), 'no-store');
    assert.equal(client.calls.length, 0);
  });

  test('mismo origen: 403 con Origin ajeno o Sec-Fetch-Site cross-site; 415 si no es JSON', async () => {
    const { handler, client } = handlerWith(ok());
    assert.equal((await run(handler, jsonReq(body(), { headers: { origin: 'https://otro.example' } }))).statusCode, 403);
    assert.equal((await run(handler, jsonReq(body(), { headers: { 'sec-fetch-site': 'cross-site' } }))).statusCode, 403);
    assert.equal((await run(handler, jsonReq(body(), { headers: { origin: 'http://localhost:5173' } }))).statusCode, 200);
    assert.equal((await run(handler, jsonReq(body(), { headers: { 'content-type': 'text/plain' } }))).statusCode, 415);
    assert.equal(client.calls.length, 1); // solo la petición de mismo origen llegó a la API
    assert.equal((await run(handler, jsonReq(body(), { headers: { origin: 'http://localhost:5173' } }))).getHeader('access-control-allow-origin'), undefined);
  });

  test('400 con código no válido (formato, tipo y dígito de control); 400 con JSON roto; 413 enorme', async () => {
    const { handler, client } = handlerWith(ok());
    const bad = [
      {},
      { code: '1234567' },
      { code: '123456789012345' },
      { code: CODE.slice(0, 5) + 'a' + CODE.slice(6) },
      { code: ' ' + CODE },
      { code: Number(CODE) },
      { code: [CODE] },
      { code: CODE.slice(0, 12) + ((Number(CODE[12]) + 1) % 10) }, // dígito de control mal
      { code: '../../etc/passwd' },
    ];
    for (const b of bad) {
      const res = await run(handler, jsonReq(b));
      assert.equal(res.statusCode, 400, JSON.stringify(b));
      assert.deepEqual(res.json(), { error: 'codigo' });
    }
    const arr = await run(handler, jsonReq([CODE]));
    assert.equal(arr.statusCode, 400);
    assert.deepEqual(arr.json(), { error: 'json' });
    const broken = await run(handler, streamReq('{"code": '));
    assert.equal(broken.statusCode, 400);
    assert.deepEqual(broken.json(), { error: 'json' });
    const big = await run(handler, streamReq(JSON.stringify({ code: CODE, x: 'a'.repeat(10_000) })));
    assert.equal(big.statusCode, 413);
    assert.equal(client.calls.length, 0);
  });

  test('validateCode / gtinChecksumOk', () => {
    assert.equal(validateCode(CODE), true);
    assert.equal(validateCode('12345670'), true); // EAN-8 / UPC-E: no se comprueba
    assert.equal(validateCode('12345678'), true);
    assert.equal(validateCode(ean13('400638133393')), true);
    assert.equal(validateCode('4006381333932'), false);
    assert.equal(gtinChecksumOk('4006381333931'), true);
    assert.equal(validateCode(ean13('001234567890').slice(1)), true); // UPC-A de 12 dígitos
  });

  test('la petición lleva la búsqueda web, el esquema, esfuerzo bajo y el prompt con el código', async () => {
    const { handler, client } = handlerWith(ok());
    const res = await run(handler, jsonReq(body()));
    assert.equal(res.statusCode, 200);
    assert.equal(client.calls.length, 1);
    const p = client.calls[0].params;
    assert.equal(p.model, 'claude-sonnet-5-5');
    assert.equal(p.max_tokens, MAX_TOKENS);
    assert.equal(MAX_TOKENS, 2048);
    assert.deepEqual(p.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }]);
    assert.equal(MAX_USES, 3);
    assert.deepEqual(p.output_config, { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } });
    assert.deepEqual(SCHEMA.required, ['found', 'name', 'brand', 'ingredients_text', 'allergens', 'source_url', 'source_name', 'confidence']);
    assert.deepEqual(SCHEMA.properties.confidence.enum, ['alta', 'media', 'baja']);
    assert.equal(SCHEMA.additionalProperties, false);
    assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(p.fallbacks, 'default');
    assert.equal(p.messages.length, 1);
    assert.equal(p.messages[0].role, 'user');
    const prompt = p.messages[0].content;
    assert.match(prompt, new RegExp(CODE));
    assert.match(prompt, /COPIA LITERALMENTE/);
    assert.match(prompt, /no los completes de memoria/);
    assert.match(prompt, /ingredients_text vacío/);
    assert.match(prompt, /found=false/);
    assert.match(prompt, /No des consejos de salud/);
    assert.equal(p.temperature, undefined);
    assert.equal(p.thinking, undefined);
    assert.ok(client.calls[0].options.signal, 'lleva plazo (AbortSignal)');
  });

  test('modelo: PRODUCT_MODEL con lista blanca; Haiku usa la búsqueda básica y no lleva respaldo', async () => {
    assert.equal(resolveModel(undefined), 'claude-sonnet-5-5');
    assert.equal(resolveModel('gpt-4'), 'claude-sonnet-5-5');
    assert.equal(resolveModel(' claude-opus-5-5 '), 'claude-opus-5-5');
    assert.equal(resolveModel('claude-haiku-5-5'), 'claude-haiku-5-5');
    const hk = handlerWith(ok(), { model: 'claude-haiku-5-5' });
    await run(hk.handler, jsonReq(body()));
    const p = hk.client.calls[0].params;
    assert.equal(p.model, 'claude-haiku-5-5');
    assert.deepEqual(p.tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
    assert.equal(p.betas, undefined);
    assert.equal(p.fallbacks, undefined);
    // por variable de entorno, leída en cada petición
    const env = handlerWith(ok());
    process.env.PRODUCT_MODEL = 'claude-opus-5-5';
    try {
      await run(env.handler, jsonReq(body()));
    } finally {
      delete process.env.PRODUCT_MODEL;
    }
    assert.equal(env.client.calls[0].params.model, 'claude-opus-5-5');
    assert.equal(searchToolFor('claude-opus-5-5').type, 'web_search_20260209');
  });

  test('200 con producto encontrado: forma exacta de la respuesta', async () => {
    const { handler } = handlerWith(ok());
    const res = await run(handler, jsonReq(body()));
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('cache-control'), 'no-store');
    assert.deepEqual(res.json(), {
      found: true,
      product: {
        code: CODE,
        name: 'Leche semidesnatada Hacendado',
        brand: 'Hacendado',
        ingredientsText: 'Leche semidesnatada pasteurizada.',
        allergens: [],
        traces: [],
        categories: [],
        labels: [],
        image: null,
      },
      source: 'web',
      sourceName: 'Mercadona',
      sourceUrl: 'https://www.mercadona.es/leche',
      confidence: 'alta',
      incomplete: false,
      allergensText: ['leche'],
    });
  });

  test('sin ingredientes en la página → found con incomplete:true', async () => {
    const { handler } = handlerWith(ok({ ...FOUND, ingredients_text: '' }));
    const r = (await run(handler, jsonReq(body()))).json();
    assert.equal(r.found, true);
    assert.equal(r.incomplete, true);
    assert.equal(r.product.ingredientsText, '');
  });

  test('saneado: tipos, longitudes, caracteres de control, URL no http y «Ingredientes:» de cabecera', async () => {
    const dirty = {
      found: true,
      name: 'N\u0000ombre\n\n' + 'x'.repeat(400),
      brand: 'B'.repeat(300),
      ingredients_text: 'Ingredientes: ' + 'harina, '.repeat(900) + '​',
      allergens: Array.from({ length: 40 }, (_, i) => `alérgeno ${i}`).concat([5, null, '']),
      source_url: 'javascript:alert(1)',
      source_name: 'S'.repeat(500),
      confidence: 'altísima',
    };
    const { handler } = handlerWith(ok(dirty));
    const r = (await run(handler, jsonReq(body()))).json();
    assert.ok(r.product.name.length <= LIMITS.name);
    assert.doesNotMatch(r.product.name, /[\u0000\n]/);
    assert.ok(r.product.brand.length <= LIMITS.brand);
    assert.ok(r.product.ingredientsText.length <= LIMITS.ingredients);
    assert.match(r.product.ingredientsText, /^harina, /);
    assert.equal(r.allergensText.length, 20);
    assert.equal(r.sourceUrl, '');
    assert.ok(r.sourceName.length <= LIMITS.sourceName);
    assert.equal(r.confidence, 'baja'); // valor fuera de la lista, y sin fuente
    // otras URL: solo http/https, ≤ 300, sin credenciales
    for (const bad of ['ftp://x.es/a', 'data:text/html,x', 'https://u:p@x.es/', 'https://x.es/' + 'a'.repeat(300), 'no es una url', 5, null]) {
      assert.equal(sanitizeProduct({ ...FOUND, source_url: bad }, CODE).sourceUrl, '', String(bad).slice(0, 30));
    }
    assert.equal(sanitizeProduct({ ...FOUND, source_url: 'http://x.es/a' }, CODE).sourceUrl, 'http://x.es/a');
    // tipos raros
    assert.equal(sanitizeProduct(null, CODE), null);
    assert.equal(sanitizeProduct([], CODE), null);
    assert.equal(sanitizeProduct({ ...FOUND, found: 'true' }, CODE), null);
    assert.equal(sanitizeProduct({ ...FOUND, name: 5 }, CODE), null);
    assert.equal(sanitizeProduct({ ...FOUND, ingredients_text: ['a'], allergens: 'x' }, CODE).product.ingredientsText, '');
  });

  test('confianza baja si la fuente citada no está entre los resultados de la búsqueda, o no hay fuente', () => {
    const urls = ['https://www.mercadona.es/leche'];
    assert.equal(sanitizeProduct(FOUND, CODE, urls).confidence, 'alta');
    assert.equal(sanitizeProduct({ ...FOUND, source_url: 'https://www.mercadona.es/leche/' }, CODE, urls).confidence, 'alta');
    assert.equal(sanitizeProduct({ ...FOUND, source_url: 'https://mercadona.es/leche#x' }, CODE, urls).confidence, 'alta');
    assert.equal(sanitizeProduct({ ...FOUND, source_url: 'https://otra.es/leche' }, CODE, urls).confidence, 'baja');
    assert.equal(sanitizeProduct({ ...FOUND, source_url: '' }, CODE, urls).confidence, 'baja');
    assert.equal(sanitizeProduct(FOUND, CODE, []).confidence, 'alta'); // sin lista de resultados no se puede comprobar
    assert.equal(sanitizeProduct({ ...FOUND, ingredients_text: '', source_url: '' }, CODE, urls).confidence, 'alta');
  });

  test('found:false → { found:false } sin motivo; found sin nombre también', async () => {
    const { handler } = handlerWith(ok({ ...FOUND, found: false }));
    const res = await run(handler, jsonReq(body()));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { found: false });
    const h2 = handlerWith(ok({ ...FOUND, name: '  ' }));
    assert.deepEqual((await run(h2.handler, jsonReq(body()))).json(), { found: false });
  });

  test('si el modelo contesta sin haber buscado (de memoria), no se aprovecha', async () => {
    const { handler } = handlerWith(() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(FOUND) }] }));
    const res = await run(handler, jsonReq(body()));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { found: false, reason: 'web_no_disponible' });
  });

  test('JSON dentro de texto, o en un bloque anterior: se extrae; basura → no disponible', () => {
    assert.deepEqual(parseModelJson({ content: [{ type: 'text', text: 'Aquí: {"found":false}' }] }), { found: false });
    assert.deepEqual(parseModelJson({ content: [{ type: 'text', text: '{"a":1}' }, { type: 'text', text: 'listo' }] }), { a: 1 });
    assert.equal(parseModelJson({ content: [{ type: 'text', text: 'nada' }] }), null);
    assert.equal(parseModelJson({ content: [{ type: 'text', text: '[1,2]' }] }), null);
    assert.equal(parseModelJson(null), null);
  });

  test('la herramienta falla (error en el bloque, no lanza) → 200 web_no_disponible; no se guarda 1 h', async () => {
    let now = 1_000_000;
    let n = 0;
    const impl = () => {
      n += 1;
      if (n === 1) {
        return {
          stop_reason: 'end_turn',
          content: [
            { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } },
            { type: 'web_search_tool_result', tool_use_id: 's1', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } },
            { type: 'text', text: JSON.stringify({ ...FOUND, found: false }) },
          ],
        };
      }
      return searchMessage(FOUND);
    };
    const { handler, client } = handlerWith(impl, { now: () => now });
    const first = await run(handler, jsonReq(body()));
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), { found: false, reason: 'web_no_disponible' });
    now += 60_000; // 1 min: sigue en caché (5 min)
    assert.deepEqual((await run(handler, jsonReq(body()))).json(), { found: false, reason: 'web_no_disponible' });
    assert.equal(client.calls.length, 1);
    now += CACHE_TTL.unavailable; // pasado el plazo corto se vuelve a intentar
    const again = (await run(handler, jsonReq(body()))).json();
    assert.equal(again.found, true);
    assert.equal(client.calls.length, 2);
  });

  test('max_uses_exceeded en un bloque no es un fallo si hubo otras búsquedas: se respeta found:false', async () => {
    const msg = {
      stop_reason: 'end_turn',
      content: [
        { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
        { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://a.es/x', title: 't', encrypted_content: 'x' }] },
        { type: 'server_tool_use', id: 's2', name: 'web_search', input: {} },
        { type: 'web_search_tool_result', tool_use_id: 's2', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
        { type: 'text', text: JSON.stringify({ ...FOUND, found: false }) },
      ],
    };
    const { handler } = handlerWith(() => msg);
    assert.deepEqual((await run(handler, jsonReq(body()))).json(), { found: false });
  });

  test('error de la API (5xx, red, tiempo) → 200 web_no_disponible, una sola llamada', async () => {
    for (const make of [
      () => Object.assign(new Error('boom'), { status: 529 }),
      () => Object.assign(new Error('boom'), { status: 500 }),
      () => Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' }),
      () => Object.assign(new Error('rate'), { status: 429 }),
    ]) {
      const { handler, client } = handlerWith(() => {
        throw make();
      });
      const res = await run(handler, jsonReq(body()));
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { found: false, reason: 'web_no_disponible' });
      assert.equal(client.calls.length, 1);
    }
  });

  test('rechazo 400 (herramienta no habilitada, esquema…) → un único segundo intento prudente, sin bucle', async () => {
    const logs = [];
    let n = 0;
    const { handler, client } = handlerWith(
      () => {
        n += 1;
        if (n === 1) throw Object.assign(new Error('web search is not enabled for this organization'), { status: 400 });
        return searchMessage(JSON.stringify(FOUND));
      },
      { log: (...a) => logs.push(a) },
    );
    const res = await run(handler, jsonReq(body()));
    assert.equal(res.json().found, true);
    assert.equal(client.calls.length, 2);
    const second = client.calls[1].params;
    assert.deepEqual(second.tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
    assert.equal(second.output_config.format, undefined);
    assert.equal(second.betas, undefined);
    assert.equal(second.fallbacks, undefined);
    assert.match(second.messages[0].content, /Responde únicamente con un objeto JSON/);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(CODE));

    // y si también el segundo es rechazado: no disponible, dos llamadas y se acabó
    const both = handlerWith(() => {
      throw Object.assign(new Error('no'), { status: 403 });
    });
    const res2 = await run(both.handler, jsonReq(body()));
    assert.deepEqual(res2.json(), { found: false, reason: 'web_no_disponible' });
    assert.equal(both.client.calls.length, 2);
  });

  test('pause_turn: se reanuda reenviando lo que llevaba el asistente; con tope', async () => {
    const paused = { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } }], usage: { server_tool_use: { web_search_requests: 1 } } };
    let n = 0;
    const { handler, client } = handlerWith(() => {
      n += 1;
      return n === 1 ? paused : searchMessage(FOUND, { searches: 0 });
    });
    const res = await run(handler, jsonReq(body()));
    assert.equal(res.json().found, true);
    assert.equal(client.calls.length, 2);
    const msgs = client.calls[1].params.messages;
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'user');
    assert.deepEqual(msgs[1], { role: 'assistant', content: paused.content });

    const stuck = handlerWith(() => paused);
    const r2 = await run(stuck.handler, jsonReq(body()));
    assert.deepEqual(r2.json(), { found: false, reason: 'web_no_disponible' });
    assert.equal(stuck.client.calls.length, 3); // 1 + 2 reanudaciones, ni una más
  });

  test('rechazo del modelo (refusal) → no disponible', async () => {
    const { handler } = handlerWith(() => searchMessage(FOUND, { extra: { stop_reason: 'refusal' } }));
    assert.deepEqual((await run(handler, jsonReq(body()))).json(), { found: false, reason: 'web_no_disponible' });
  });

  test('plazo agotado: se aborta la llamada y se responde web_no_disponible', async () => {
    const { handler } = handlerWith((p, n, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'APIUserAbortError' })))), { deadlineMs: 20 });
    const res = await run(handler, jsonReq(body()));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { found: false, reason: 'web_no_disponible' });
  });

  test('caché: mismo código no vuelve a la API (24 h si está, 1 h si no está)', async () => {
    let now = 5_000_000;
    let found = true;
    const { handler, client } = handlerWith(() => searchMessage(found ? FOUND : { ...FOUND, found: false }), { now: () => now });
    const a = (await run(handler, jsonReq(body()))).json();
    const b = (await run(handler, jsonReq(body()))).json();
    assert.deepEqual(a, b);
    assert.equal(client.calls.length, 1);
    now += CACHE_TTL.found - 1000;
    await run(handler, jsonReq(body()));
    assert.equal(client.calls.length, 1);
    now += 2000;
    await run(handler, jsonReq(body()));
    assert.equal(client.calls.length, 2);
    // «no encontrado»: 1 h
    found = false;
    const ra = await run(handler, jsonReq(body({ code: CODE2 })));
    assert.deepEqual(ra.json(), { found: false });
    assert.equal(client.calls.length, 3);
    now += CACHE_TTL.notFound - 1000;
    await run(handler, jsonReq(body({ code: CODE2 })));
    assert.equal(client.calls.length, 3);
    now += 2000;
    await run(handler, jsonReq(body({ code: CODE2 })));
    assert.equal(client.calls.length, 4);
    assert.equal(CACHE_TTL.found, 24 * 3600 * 1000);
    assert.equal(CACHE_TTL.notFound, 3600 * 1000);
  });

  test('peticiones simultáneas del mismo código comparten una sola búsqueda', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const { handler, client } = handlerWith(async () => {
      await gate;
      return searchMessage(FOUND);
    });
    const p1 = run(handler, jsonReq(body()));
    const p2 = run(handler, jsonReq(body()));
    const p3 = run(handler, jsonReq(body(), { headers: { 'x-forwarded-for': '9.9.9.9' } }));
    await new Promise((r) => setTimeout(r, 10));
    release();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.equal(client.calls.length, 1);
    for (const r of [r1, r2, r3]) assert.equal(r.json().found, true);
  });

  test('límite por IP: 6 búsquedas cada 10 min, 429 con Retry-After; la caché no cuenta; otra IP sí puede', async () => {
    assert.equal(RATE_LIMIT.perIp, 6);
    assert.equal(RATE_LIMIT.windowMs, 600_000);
    assert.equal(RATE_LIMIT.perDay, 60);
    let now = 10_000_000;
    const { handler, client } = handlerWith(ok(), { now: () => now });
    const codes = ['843700800001', '843700800002', '843700800003', '843700800004', '843700800005', '843700800006', '843700800007'].map(ean13);
    const ip = { 'x-forwarded-for': '1.2.3.4' };
    for (let i = 0; i < 6; i++) assert.equal((await run(handler, jsonReq(body({ code: codes[i] }), { headers: ip }))).statusCode, 200);
    // repetir un código ya consultado sale de la caché y no gasta cupo
    assert.equal((await run(handler, jsonReq(body({ code: codes[0] }), { headers: ip }))).statusCode, 200);
    assert.equal(client.calls.length, 6);
    const limited = await run(handler, jsonReq(body({ code: codes[6] }), { headers: ip }));
    assert.equal(limited.statusCode, 429);
    assert.deepEqual(limited.json(), { error: 'limite' });
    assert.ok(Number(limited.getHeader('retry-after')) >= 1);
    assert.equal(limited.getHeader('cache-control'), 'no-store');
    assert.equal(client.calls.length, 6);
    // otra IP no está limitada
    assert.equal((await run(handler, jsonReq(body({ code: codes[6] }), { headers: { 'x-forwarded-for': '5.6.7.8' } }))).statusCode, 200);
    // pasada la ventana, la primera IP vuelve a poder
    now += RATE_LIMIT.windowMs + 1000;
    assert.equal((await run(handler, jsonReq(body({ code: ean13('843700800008') }), { headers: ip }))).statusCode, 200);
  });

  test('límite diario por instancia: 60', async () => {
    const { handler, client } = handlerWith(ok(), { rateLimit: { perIp: 1000, perDay: 3 } });
    for (let i = 1; i <= 3; i++) {
      const r = await run(handler, jsonReq(body({ code: ean13(`84370080010${i}`) }), { headers: { 'x-forwarded-for': `1.1.1.${i}` } }));
      assert.equal(r.statusCode, 200);
    }
    const r = await run(handler, jsonReq(body({ code: ean13('843700800199') }), { headers: { 'x-forwarded-for': '1.1.1.9' } }));
    assert.equal(r.statusCode, 429);
    assert.ok(Number(r.getHeader('retry-after')) > 0);
    assert.equal(client.calls.length, 3);
  });

  test('las peticiones inválidas no gastan cupo', async () => {
    const { handler, client } = handlerWith(ok(), { rateLimit: { perIp: 2 } });
    for (let i = 0; i < 5; i++) assert.equal((await run(handler, jsonReq({ code: 'x' }))).statusCode, 400);
    assert.equal((await run(handler, jsonReq(body({ code: CODE })))).statusCode, 200);
    assert.equal((await run(handler, jsonReq(body({ code: CODE2 })))).statusCode, 200);
    assert.equal((await run(handler, jsonReq(body({ code: CODE3 })))).statusCode, 429);
    assert.equal(client.calls.length, 2);
  });

  test('buildPrompt / buildRequest puros', () => {
    assert.match(buildPrompt(CODE), new RegExp(`código de barras \\(EAN\\): ${CODE}`));
    assert.doesNotMatch(buildPrompt(CODE), /Responde únicamente con un objeto JSON/);
    assert.match(buildPrompt(CODE, { jsonInPrompt: true }), /Responde únicamente con un objeto JSON/);
    const r = buildRequest({ model: 'claude-opus-5-5', code: CODE });
    assert.equal(r.tools[0].type, 'web_search_20260209');
    assert.equal(r.fallbacks, 'default');
  });

  test('server.js: /api/producto enrutado (POST 200, GET 405) y las demás /api/* siguen en 404', async () => {
    const client = fakeClient(ok());
    const s = createServer({ producto: createHandler({ client, log: silent }) });
    const port = await new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
    const req = (opts, payload) =>
      new Promise((resolve, reject) => {
        const rq = http.request({ host: '127.0.0.1', port, ...opts }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        rq.on('error', reject);
        if (payload) rq.write(payload);
        rq.end();
      });
    try {
      const post = await req({ method: 'POST', path: '/api/producto', headers: { 'content-type': 'application/json' } }, JSON.stringify({ code: CODE }));
      assert.equal(post.status, 200);
      assert.equal(JSON.parse(post.body).found, true);
      assert.equal(post.headers['cache-control'], 'no-store');
      assert.equal(post.headers['x-content-type-options'], 'nosniff');
      assert.equal((await req({ method: 'GET', path: '/api/producto' })).status, 405);
      assert.equal((await req({ method: 'GET', path: '/api/otra' })).status, 404);
      assert.equal((await req({ method: 'GET', path: '/api/producto.js' })).status, 404);
    } finally {
      await new Promise((r) => s.close(r));
    }
  });
});

// ---------- lookupProduct (cliente) ----------

describe('lookupProduct (fetch simulado)', () => {
  const realFetch = globalThis.fetch;
  let calls;
  // routes: { off, web } — cada uno es una función (url, opts, n) → Response | throw
  const mock = ({ off, web }) => {
    calls = { off: [], web: [] };
    globalThis.fetch = async (url, opts) => {
      if (String(url).startsWith('https://world.openfoodfacts.org/')) {
        calls.off.push({ url, opts });
        return off(url, opts, calls.off.length);
      }
      if (url === '/api/producto') {
        calls.web.push({ url, opts });
        return web(url, opts, calls.web.length);
      }
      throw new Error(`URL inesperada ${url}`);
    };
  };
  after(() => {
    globalThis.fetch = realFetch;
  });

  const offOk = (product) => () => new Response(JSON.stringify({ status: 1, code: CODE, product: { code: CODE, product_name: 'Leche OFF', brands: 'Hacendado, Otra', ...product } }), { status: 200 });
  const offNotFound = () => new Response('{"status":0}', { status: 404 });
  const offDown = () => {
    throw new TypeError('Failed to fetch');
  };
  const webJson = (payload, status = 200) => () => new Response(JSON.stringify(payload), { status });
  const WEB_FOUND = {
    found: true,
    product: { code: CODE, name: 'Leche Web', brand: 'Marca Web', ingredientsText: 'Leche pasteurizada.', allergens: [], traces: [], categories: [], labels: [], image: null },
    source: 'web',
    sourceName: 'Mercadona',
    sourceUrl: 'https://www.mercadona.es/leche',
    confidence: 'alta',
    incomplete: false,
  };
  const quick = { offOptions: { retryDelayMs: 0 } };

  test('OFF lo tiene completo → no se llama a la web', async () => {
    mock({ off: offOk({ ingredients_text_es: 'leche' }), web: () => assert.fail('no debe llamar a la web') });
    const statuses = [];
    const r = await lookupProduct(CODE, { ...quick, onStatus: (t) => statuses.push(t) });
    assert.equal(r.found, true);
    assert.equal(r.source, 'off');
    assert.equal(r.incomplete, false);
    assert.equal(r.webTried, false);
    assert.equal(r.ingredientsSource, 'off');
    assert.equal(r.product.ingredientsText, 'leche');
    assert.deepEqual(statuses, ['Buscando en Open Food Facts…']);
    assert.equal(calls.web.length, 0);
  });

  test('OFF no lo tiene → web; textos de estado en orden; POST JSON del mismo origen', async () => {
    mock({ off: offNotFound, web: webJson(WEB_FOUND) });
    const statuses = [];
    const r = await lookupProduct(` ${CODE.slice(0, 7)} ${CODE.slice(7)} `, { ...quick, onStatus: (t) => statuses.push(t) });
    assert.deepEqual(statuses, [STATUS_OFF, STATUS_WEB]);
    assert.equal(STATUS_WEB, 'Buscando en internet…');
    assert.equal(r.found, true);
    assert.equal(r.source, 'web');
    assert.equal(r.productSource, 'web');
    assert.equal(r.ingredientsSource, 'web');
    assert.equal(r.sourceName, 'Mercadona');
    assert.equal(r.sourceUrl, 'https://www.mercadona.es/leche');
    assert.equal(r.confidence, 'alta');
    assert.equal(r.incomplete, false);
    assert.equal(r.webTried, true);
    assert.equal(r.product.name, 'Leche Web');
    assert.equal(r.product.ingredientsText, 'Leche pasteurizada.');
    const w = calls.web[0];
    assert.equal(w.opts.method, 'POST');
    assert.equal(w.opts.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(w.opts.body), { code: CODE });
    assert.equal(w.opts.credentials, 'same-origin');
  });

  test('OFF incompleto + web con ingredientes → combina: nombre y marca de OFF, ingredientes de la web', async () => {
    mock({ off: offOk({ ingredients_text_fr: '' }), web: webJson(WEB_FOUND) });
    const r = await lookupProduct(CODE, quick);
    assert.equal(r.found, true);
    assert.equal(r.source, 'web');
    assert.equal(r.productSource, 'off');
    assert.equal(r.ingredientsSource, 'web');
    assert.equal(r.incomplete, false);
    assert.equal(r.product.name, 'Leche OFF');
    assert.equal(r.product.brand, 'Hacendado');
    assert.equal(r.product.ingredientsText, 'Leche pasteurizada.');
    assert.equal(r.sourceUrl, 'https://www.mercadona.es/leche');
    assert.equal(r.webTried, true);
  });

  test('OFF incompleto sin nombre ni marca → se completan con los de la web', async () => {
    mock({ off: offOk({ product_name: '', brands: '' }), web: webJson(WEB_FOUND) });
    const r = await lookupProduct(CODE, quick);
    assert.equal(r.product.name, 'Leche Web');
    assert.equal(r.product.brand, 'Marca Web');
  });

  test('OFF incompleto y la web no aporta ingredientes / no lo encuentra / falla → resultado de OFF', async () => {
    for (const web of [
      webJson({ ...WEB_FOUND, product: { ...WEB_FOUND.product, ingredientsText: '' }, incomplete: true }),
      webJson({ found: false }),
      webJson({ found: false, reason: 'web_no_disponible' }),
      webJson({ error: 'sin_vision' }, 503),
      webJson({ error: 'limite' }, 429),
      webJson({ error: 'interno' }, 500),
      () => {
        throw new TypeError('Failed to fetch');
      },
      () => new Response('<html>', { status: 200 }),
    ]) {
      mock({ off: offOk({}), web });
      const r = await lookupProduct(CODE, quick);
      assert.equal(r.found, true);
      assert.equal(r.source, 'off');
      assert.equal(r.incomplete, true);
      assert.equal(r.webTried, true);
      assert.equal(r.ingredientsSource, null);
      assert.equal(r.product.name, 'Leche OFF');
      assert.equal(r.product.ingredientsText, '');
    }
  });

  test('ingredientes de la web con confianza baja: no se usan (se prefiere no saber a saber mal)', async () => {
    mock({ off: offOk({}), web: webJson({ ...WEB_FOUND, confidence: 'baja' }) });
    const r = await lookupProduct(CODE, quick);
    assert.equal(r.incomplete, true);
    assert.equal(r.product.ingredientsText, '');
    assert.equal(r.source, 'off');
    mock({ off: offNotFound, web: webJson({ ...WEB_FOUND, confidence: 'baja' }) });
    const w = await lookupProduct(CODE, quick);
    assert.equal(w.found, true);
    assert.equal(w.source, 'web');
    assert.equal(w.incomplete, true);
    assert.equal(w.product.ingredientsText, '');
    assert.equal(w.ingredientsSource, null);
    assert.equal(w.product.name, 'Leche Web');
  });

  test('ni OFF ni la web → found:false', async () => {
    mock({ off: offNotFound, web: webJson({ found: false }) });
    const r = await lookupProduct(CODE, quick);
    assert.equal(r.found, false);
    assert.equal(r.webTried, true);
    assert.equal(r.product, null);
    assert.equal(r.offFailed, undefined);
  });

  test('OFF caído pero la web responde → usa la web (offFailed); si la web no lo encuentra, found:false', async () => {
    mock({ off: offDown, web: webJson(WEB_FOUND) });
    const r = await lookupProduct(CODE, quick);
    assert.equal(r.found, true);
    assert.equal(r.source, 'web');
    assert.equal(r.offFailed, true);
    mock({ off: offDown, web: webJson({ found: false }) });
    const n = await lookupProduct(CODE, quick);
    assert.equal(n.found, false);
    assert.equal(n.offFailed, true);
  });

  test('OFF caído y la web también → Error con code "network"', async () => {
    for (const web of [webJson({ error: 'sin_vision' }, 503), webJson({ found: false, reason: 'web_no_disponible' }), () => {
      throw new TypeError('Failed to fetch');
    }]) {
      mock({ off: offDown, web });
      await assert.rejects(lookupProduct(CODE, quick), (e) => e.code === 'network');
    }
  });

  test('código no válido → found:false sin red', async () => {
    mock({ off: () => assert.fail('no'), web: () => assert.fail('no') });
    for (const c of ['123', '../x', '', null, undefined]) {
      const r = await lookupProduct(c, quick);
      assert.equal(r.found, false);
      assert.equal(r.webTried, false);
    }
    assert.equal(calls.off.length + calls.web.length, 0);
  });

  test('cancelable con signal (en OFF y en la web)', async () => {
    const hang = (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError'))));
    // durante OFF
    mock({ off: hang, web: () => assert.fail('no') });
    let ctrl = new AbortController();
    let p = lookupProduct(CODE, { ...quick, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 10);
    await assert.rejects(p, (e) => e.name === 'AbortError');
    // durante la web
    mock({ off: offNotFound, web: hang });
    ctrl = new AbortController();
    p = lookupProduct(CODE, { ...quick, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 20);
    await assert.rejects(p, (e) => e.name === 'AbortError');
    // ya cancelado
    mock({ off: () => assert.fail('no'), web: () => assert.fail('no') });
    ctrl = new AbortController();
    ctrl.abort();
    await assert.rejects(lookupProduct(CODE, { signal: ctrl.signal }), (e) => e.name === 'AbortError');
  });

  test('tiempo agotado de la web (sin cancelar el usuario) cuenta como fallo de la web', async () => {
    const hang = (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError'))));
    mock({ off: offOk({}), web: hang });
    const r = await lookupProduct(CODE, { ...quick, webTimeoutMs: 20 });
    assert.equal(r.found, true);
    assert.equal(r.incomplete, true);
    assert.equal(r.webTried, true);
  });

  test('sanea la respuesta de la web (URL no http, tipos raros)', async () => {
    mock({ off: offNotFound, web: webJson({ ...WEB_FOUND, sourceUrl: 'javascript:alert(1)', confidence: 'rara', product: { ...WEB_FOUND.product, ingredientsText: 5 } }) });
    const r = await lookupProduct(CODE, quick);
    assert.equal(r.found, true);
    assert.equal(r.sourceUrl, '');
    assert.equal(r.confidence, 'baja');
    assert.equal(r.product.ingredientsText, '');
    mock({ off: offNotFound, web: webJson({ found: true, product: { name: '' } }) });
    assert.equal((await lookupProduct(CODE, quick)).found, false);
  });

  test('un fallo en onStatus no rompe la consulta', async () => {
    mock({ off: offOk({ ingredients_text: 'leche' }), web: () => assert.fail('no') });
    const r = await lookupProduct(CODE, {
      ...quick,
      onStatus: () => {
        throw new Error('ui');
      },
    });
    assert.equal(r.found, true);
  });
});
