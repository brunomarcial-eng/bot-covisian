// Tests de la capa de captura: /api/leer (con cliente falso), Open Food Facts, códigos de barras,
// limpieza del OCR, utilidades de imagen/cámara y el servidor local.
//   node --test tests/capture.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import leerDefault, {
  createHandler,
  sanitizeReading,
  extractReading,
  buildRequest,
  SCHEMA,
  MODEL,
  MODELS,
  MAX_TOKENS,
  MAX_IMAGE_BASE64,
  RATE_LIMIT,
  resolveModel,
  clientIp,
  createRateLimiter,
} from '../api/leer.js';
import { normalizeProduct, fetchProduct, OFF_FIELDS } from '../src/capture/off.js';
import { isValidCode, cleanCode } from '../src/capture/barcode.js';
import { parseOcrText, splitIngredients, cleanLine } from '../src/capture/ocr.js';
import { normalizeReading } from '../src/capture/reader.js';
import { fitWithin, stripDataUrl } from '../src/capture/image.js';
import { mapCameraError, cameraAvailable } from '../src/capture/camera.js';
import { createServer, resolveStatic, ROOT } from '../server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');

// ---------- Utilidades ----------

const JPEG_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(120, 7)]).toString('base64');
const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]).toString('base64');

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

function okMessage(payload, extra = {}) {
  return {
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) },
    ],
    ...extra,
  };
}

function fakeClient(impl) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        async create(params, options) {
          calls.push({ params, options });
          return impl(params, calls.length);
        },
      },
    },
  };
}

const silent = () => {};

async function run(handler, req) {
  const res = fakeRes();
  await handler(req, res);
  await res.done;
  return res;
}

const validBody = (extra = {}) => ({ image: JPEG_B64, mediaType: 'image/jpeg', mode: 'carta', ...extra });

// ---------- /api/leer ----------

describe('api/leer', () => {
  let savedKey;
  before(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  after(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  });

  test('405 en GET, con Allow: POST', async () => {
    const h = createHandler({ client: fakeClient(() => okMessage({ readable: false, items: [] })), log: silent });
    const res = await run(h, jsonReq(undefined, { method: 'GET' }));
    assert.equal(res.statusCode, 405);
    assert.equal(res.getHeader('allow'), 'POST');
    assert.equal(res.getHeader('cache-control'), 'no-store');
  });

  test('400 sin imagen, con mode inválido, con mediaType no admitido o con imagen que no es lo que dice', async () => {
    const client = fakeClient(() => okMessage({ readable: false, items: [] }));
    const h = createHandler({ client, log: silent });
    const cases = [
      [{ mediaType: 'image/jpeg', mode: 'carta' }, 'imagen'],
      [validBody({ image: '' }), 'imagen'],
      [validBody({ mode: 'receta' }), 'modo'],
      [validBody({ mode: undefined }), 'modo'],
      [validBody({ mediaType: 'image/gif' }), 'tipo'],
      [validBody({ mediaType: 'application/pdf' }), 'tipo'],
      [validBody({ image: 'esto no es base64!' }), 'imagen'],
      [validBody({ image: PNG_B64 }), 'imagen'], // dice jpeg pero es png
    ];
    for (const [body, code] of cases) {
      const res = await run(h, jsonReq(body));
      assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 80));
      assert.deepEqual(res.json(), { error: code });
    }
    assert.equal(client.calls.length, 0);
  });

  test('400 con JSON roto leyendo el cuerpo del stream', async () => {
    const h = createHandler({ client: fakeClient(() => okMessage({})), log: silent });
    const res = await run(h, streamReq('{"image": '));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'json' });
  });

  test('413 con una imagen enorme', async () => {
    const client = fakeClient(() => okMessage({ readable: false, items: [] }));
    const h = createHandler({ client, log: silent });
    const huge = '/9j/' + 'A'.repeat(MAX_IMAGE_BASE64);
    const res = await run(h, jsonReq(validBody({ image: huge })));
    assert.equal(res.statusCode, 413);
    // También si llega como stream sin parsear.
    const res2 = await run(h, streamReq(JSON.stringify(validBody({ image: huge }))));
    assert.equal(res2.statusCode, 413);
    assert.equal(client.calls.length, 0);
  });

  test('415 si no es JSON y 403 si viene de otro sitio', async () => {
    const h = createHandler({ client: fakeClient(() => okMessage({})), log: silent });
    const r1 = await run(h, jsonReq(validBody(), { headers: { 'content-type': 'text/plain' } }));
    assert.equal(r1.statusCode, 415);
    const r2 = await run(h, jsonReq(validBody(), { headers: { origin: 'https://otro.example' } }));
    assert.equal(r2.statusCode, 403);
    const r3 = await run(h, jsonReq(validBody(), { headers: { 'sec-fetch-site': 'cross-site' } }));
    assert.equal(r3.statusCode, 403);
    const r4 = await run(h, jsonReq(validBody({ mode: 'mal' }), { headers: { origin: 'http://localhost:5173' } }));
    assert.equal(r4.statusCode, 400, 'misma origen pasa el filtro');
  });

  test('503 sin_vision sin clave y sin cliente inyectado', async () => {
    assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
    const res = await run(createHandler({ log: silent }), jsonReq(validBody()));
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { error: 'sin_vision' });
    const res2 = await run(leerDefault, jsonReq(validBody()));
    assert.equal(res2.statusCode, 503);
    assert.equal(res2.getHeader('cache-control'), 'no-store');
    assert.equal(res2.getHeader('access-control-allow-origin'), undefined, 'sin CORS');
  });

  test('200 con saneado: máximo 12, sin ítems sin nombre, tipos forzados y recortes', async () => {
    const items = [
      { name: '', ingredients: ['x'], uncertain: false },
      { name: 42, ingredients: [], uncertain: false },
      { ingredients: ['huevo'], uncertain: false },
      { name: 'Ensalada César', ingredients: ['lechuga', 7, null, '  pollo  ', ''], uncertain: 'sí' },
      { name: 'X'.repeat(300), ingredients: Array.from({ length: 60 }, (_, i) => `ing${i} ${'y'.repeat(100)}`), uncertain: true },
    ];
    for (let i = 0; i < 14; i++) items.push({ name: `Plato ${i}`, ingredients: 'no es lista', uncertain: true, extra: 'fuera' });
    const client = fakeClient(() => okMessage({ readable: true, items, sobra: 1 }));
    const res = await run(createHandler({ client, log: silent }), jsonReq(validBody()));
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.getHeader('cache-control'), 'no-store');
    const out = res.json();
    assert.deepEqual(Object.keys(out).sort(), ['items', 'readable']);
    assert.equal(out.readable, true);
    assert.equal(out.items.length, 12);
    assert.deepEqual(out.items[0], { name: 'Ensalada César', ingredients: ['lechuga', 'pollo'], uncertain: false });
    assert.equal(Array.from(out.items[1].name).length, 120);
    assert.equal(out.items[1].ingredients.length, 40);
    assert.ok(out.items[1].ingredients.every((s) => Array.from(s).length <= 80));
    assert.equal(out.items[1].uncertain, true);
    assert.deepEqual(out.items[2], { name: 'Plato 0', ingredients: [], uncertain: true });
    for (const it of out.items) assert.deepEqual(Object.keys(it), ['name', 'ingredients', 'uncertain']);
  });

  test('etiqueta: un solo ítem; sin nombre pero con ingredientes → «La etiqueta»', async () => {
    const client = fakeClient(() =>
      okMessage({
        readable: true,
        items: [
          { name: '', ingredients: ['Leche pasteurizada', 'sal', 'cuajo', 'Puede contener trazas de frutos de cáscara'], uncertain: false },
          { name: 'Otro', ingredients: [], uncertain: false },
        ],
      }),
    );
    const res = await run(createHandler({ client, log: silent }), jsonReq(validBody({ mode: 'etiqueta' })));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      readable: true,
      items: [{ name: 'La etiqueta', ingredients: ['Leche pasteurizada', 'sal', 'cuajo', 'Puede contener trazas de frutos de cáscara'], uncertain: false }],
    });
  });

  test('refusal, texto no JSON, sin bloque de texto o readable:false → { readable:false, items:[] }', async () => {
    const responses = [
      { stop_reason: 'refusal', content: [{ type: 'text', text: '{"readable":true,"items":[{"name":"A","ingredients":[],"uncertain":false}]}' }] },
      okMessage('Lo siento, no puedo leer esto.'),
      okMessage('{"readable": true, "items": [{"name": "Corta'),
      { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] },
      okMessage({ readable: false, items: [{ name: 'Inventado', ingredients: [], uncertain: false }] }),
      okMessage({ readable: true, items: [] }),
      okMessage([1, 2, 3]),
    ];
    for (const r of responses) {
      const res = await run(createHandler({ client: fakeClient(() => r), log: silent }), jsonReq(validBody()));
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { readable: false, items: [] });
    }
  });

  test('error del cliente → 502 { error: "vision" } sin reintentos y sin registrar contenido', async () => {
    const logs = [];
    const client = fakeClient(() => {
      const err = new Error('500 Internal server error');
      err.status = 500;
      throw err;
    });
    const res = await run(createHandler({ client, log: (...a) => logs.push(a) }), jsonReq(validBody()));
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.json(), { error: 'vision' });
    assert.equal(client.calls.length, 1);
    assert.equal(logs.length, 1);
    assert.ok(!JSON.stringify(logs).includes(JPEG_B64.slice(0, 16)), 'el log no lleva la imagen');
  });

  test('400 por el parámetro fallbacks/beta → un único reintento sin ellos', async () => {
    const client = fakeClient((params, n) => {
      if (n === 1) {
        const err = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"fallbacks: not supported"}}');
        err.status = 400;
        throw err;
      }
      return okMessage({ readable: true, items: [{ name: 'Gazpacho', ingredients: [], uncertain: false }] });
    });
    const res = await run(createHandler({ client, log: silent }), jsonReq(validBody()));
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().items[0].name, 'Gazpacho');
    assert.equal(client.calls.length, 2);
    assert.equal(client.calls[0].params.fallbacks, 'default');
    assert.equal('fallbacks' in client.calls[1].params, false);
    assert.equal('betas' in client.calls[1].params, false);
    assert.deepEqual(client.calls[1].params.output_config, client.calls[0].params.output_config);
  });

  test('400 por otra causa → 502 sin reintento; si el reintento también falla → 502', async () => {
    const c1 = fakeClient(() => {
      const err = new Error('400 Could not process image');
      err.status = 400;
      throw err;
    });
    const r1 = await run(createHandler({ client: c1, log: silent }), jsonReq(validBody()));
    assert.equal(r1.statusCode, 502);
    assert.equal(c1.calls.length, 1);

    const c2 = fakeClient(() => {
      const err = new Error('400 anthropic-beta: unknown beta');
      err.status = 400;
      throw err;
    });
    const r2 = await run(createHandler({ client: c2, log: silent }), jsonReq(validBody()));
    assert.equal(r2.statusCode, 502);
    assert.equal(c2.calls.length, 2);
  });

  test('la petición al modelo: claude-opus-5-5, imagen base64 + texto, salida json_schema, effort low, fallbacks', async () => {
    const client = fakeClient(() => okMessage({ readable: false, items: [] }));
    await run(createHandler({ client, log: silent }), jsonReq(validBody({ mediaType: 'image/png', image: PNG_B64, mode: 'etiqueta' })));
    assert.equal(client.calls.length, 1);
    const { params, options } = client.calls[0];
    assert.equal(params.model, 'claude-opus-5-5');
    assert.equal(MODEL, 'claude-opus-5-5');
    assert.ok(params.max_tokens >= 2048 && params.max_tokens <= 8192);
    assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(params.fallbacks, 'default');
    assert.equal(params.output_config.effort, 'low');
    assert.equal(params.output_config.format.type, 'json_schema');
    assert.deepEqual(params.output_config.format.schema, SCHEMA);
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking', 'system']) assert.equal(k in params, false, k);
    assert.equal(params.messages.length, 1);
    const [img, txt] = params.messages[0].content;
    assert.deepEqual(img, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } });
    assert.equal(txt.type, 'text');
    assert.match(txt.text, /transcriptor/i);
    assert.match(txt.text, /La etiqueta/);
    assert.match(txt.text, /trazas/);
    assert.match(txt.text, /No inventes/);
    assert.ok(options?.signal, 'con señal de cancelación');
  });

  test('max_tokens 2048 en todas las peticiones', async () => {
    assert.equal(MAX_TOKENS, 2048);
    const client = fakeClient(() => okMessage({ readable: false, items: [] }));
    await run(createHandler({ client, log: silent }), jsonReq(validBody()));
    assert.equal(client.calls[0].params.max_tokens, 2048);
    for (const model of MODELS) assert.equal(buildRequest({ model, image: JPEG_B64, mediaType: 'image/jpeg', mode: 'carta' }).max_tokens, 2048);
  });

  test('modelo por VISION_MODEL: los tres admitidos; vacío o desconocido → claude-opus-5-5', async () => {
    const saved = process.env.VISION_MODEL;
    try {
      const cases = [
        ['claude-sonnet-5-5', 'claude-sonnet-5-5'],
        ['claude-haiku-5-5', 'claude-haiku-5-5'],
        [' claude-opus-5-5 ', 'claude-opus-5-5'],
        ['claude-opus-4-8', 'claude-opus-5-5'],
        ['gpt-loquesea', 'claude-opus-5-5'],
        ['', 'claude-opus-5-5'],
        [undefined, 'claude-opus-5-5'],
      ];
      for (const [env, expected] of cases) {
        if (env === undefined) delete process.env.VISION_MODEL;
        else process.env.VISION_MODEL = env;
        const client = fakeClient(() => okMessage({ readable: false, items: [] }));
        const res = await run(createHandler({ client, log: silent }), jsonReq(validBody()));
        assert.equal(res.statusCode, 200);
        assert.equal(client.calls[0].params.model, expected, String(env));
        assert.equal(client.calls[0].params.output_config.effort, 'low');
      }
      assert.equal(resolveModel(42), MODEL);
    } finally {
      if (saved === undefined) delete process.env.VISION_MODEL;
      else process.env.VISION_MODEL = saved;
    }
  });

  test('fallbacks solo con Opus 5.5 y Sonnet 5.5; con Haiku 5.5 ni fallbacks ni beta, y sin reintento', async () => {
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
      const client = fakeClient(() => okMessage({ readable: false, items: [] }));
      await run(createHandler({ client, model, log: silent }), jsonReq(validBody()));
      assert.equal(client.calls[0].params.fallbacks, 'default', model);
      assert.deepEqual(client.calls[0].params.betas, ['server-side-fallback-2026-07-01'], model);
    }
    const haiku = fakeClient(() => okMessage({ readable: false, items: [] }));
    await run(createHandler({ client: haiku, model: 'claude-haiku-5-5', log: silent }), jsonReq(validBody()));
    assert.equal(haiku.calls[0].params.model, 'claude-haiku-5-5');
    assert.equal('fallbacks' in haiku.calls[0].params, false);
    assert.equal('betas' in haiku.calls[0].params, false);
    const forced = buildRequest({ model: 'claude-haiku-5-5', image: JPEG_B64, mediaType: 'image/jpeg', mode: 'carta', withFallbacks: true });
    assert.equal('fallbacks' in forced, false, 'ni forzándolo');
    // Un 400 que menciona «beta» con Haiku no provoca reintento (no se mandó ninguna beta).
    const failing = fakeClient(() => {
      const err = new Error('400 anthropic-beta: unknown beta');
      err.status = 400;
      throw err;
    });
    const res = await run(createHandler({ client: failing, model: 'claude-haiku-5-5', log: silent }), jsonReq(validBody()));
    assert.equal(res.statusCode, 502);
    assert.equal(failing.calls.length, 1);
  });

  test('límite: 429 { error: "limite" } con Retry-After tras 20 fotos de la misma IP en 10 minutos', async () => {
    assert.equal(RATE_LIMIT.perIp, 20);
    let t = 1_000_000;
    const client = fakeClient(() => okMessage({ readable: false, items: [] }));
    const h = createHandler({ client, log: silent, now: () => t });
    const from = (ip) => jsonReq(validBody(), { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });
    for (let i = 0; i < 20; i++) {
      const ok = await run(h, from('203.0.113.7'));
      assert.equal(ok.statusCode, 200, `petición ${i + 1}`);
      t += 1000;
    }
    const res = await run(h, from('203.0.113.7'));
    assert.equal(res.statusCode, 429);
    assert.deepEqual(res.json(), { error: 'limite' });
    const retry = Number(res.getHeader('retry-after'));
    assert.ok(retry > 0 && retry <= 600, `Retry-After ${retry}`);
    assert.equal(res.getHeader('cache-control'), 'no-store');
    assert.equal(client.calls.length, 20, 'la 21.ª no llega a la API');
    // Otra IP sigue pudiendo.
    assert.equal((await run(h, from('198.51.100.2'))).statusCode, 200);
    // Pasados 10 minutos desde la primera, vuelve a poder.
    t += 10 * 60 * 1000;
    assert.equal((await run(h, from('203.0.113.7'))).statusCode, 200);
    // Las peticiones no válidas no gastan cupo.
    const h2 = createHandler({ client, log: silent, now: () => t });
    for (let i = 0; i < 25; i++) await run(h2, jsonReq(validBody({ mode: 'mal' }), { headers: { 'x-forwarded-for': '192.0.2.9' } }));
    assert.equal((await run(h2, jsonReq(validBody(), { headers: { 'x-forwarded-for': '192.0.2.9' } }))).statusCode, 200);
  });

  test('límite global: 300 fotos al día por instancia; IP de x-forwarded-for o del socket', () => {
    let t = 0;
    const lim = createRateLimiter({ ...RATE_LIMIT, perDay: 3 }, () => t);
    assert.equal(lim.take('a'), null);
    assert.equal(lim.take('b'), null);
    assert.equal(lim.take('c'), null);
    const wait = lim.take('d');
    assert.ok(wait > 0 && wait <= 24 * 3600);
    t += 24 * 3600 * 1000;
    assert.equal(lim.take('d'), null, 'al día siguiente se reinicia');
    assert.equal(RATE_LIMIT.perDay, 300);
    assert.equal(clientIp({ headers: { 'x-forwarded-for': ' 203.0.113.5 , 10.0.0.1' } }), '203.0.113.5');
    assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
    assert.equal(clientIp({ headers: {} }), 'desconocida');
  });

  test('con el SDK real (fetch simulado, sin red): cabecera beta, fallbacks en el cuerpo y reintento ante 400', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const seen = [];
    const fakeFetch = async (url, init) => {
      seen.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
      if (seen.length === 1) {
        return new Response(
          JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: Extra inputs are not permitted' } }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: '{"readable":true,"items":[{"name":"Sushi variado","ingredients":[],"uncertain":false}]}' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const client = new Anthropic({ apiKey: 'sk-test', fetch: fakeFetch, maxRetries: 0 });
    const res = await run(createHandler({ client, log: silent }), jsonReq(validBody()));
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().items[0].name, 'Sushi variado');
    assert.equal(seen.length, 2);
    assert.match(seen[0].url, /\/v1\/messages/);
    assert.match(seen[0].headers.get('anthropic-beta') ?? '', /server-side-fallback-2026-07-01/);
    assert.equal(seen[0].body.fallbacks, 'default');
    assert.equal('betas' in seen[0].body, false, 'betas va en la cabecera, no en el cuerpo');
    assert.equal(seen[0].body.output_config.format.type, 'json_schema');
    assert.equal(seen[1].headers.get('anthropic-beta'), null);
    assert.equal('fallbacks' in seen[1].body, false);
  });

  test('esquema JSON: additionalProperties:false y required en todo', () => {
    assert.equal(SCHEMA.additionalProperties, false);
    assert.deepEqual(SCHEMA.required, ['readable', 'items']);
    const item = SCHEMA.properties.items.items;
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, ['name', 'ingredients', 'uncertain']);
    const carta = buildRequest({ image: JPEG_B64, mediaType: 'image/jpeg', mode: 'carta' });
    assert.match(carta.messages[0].content[1].text, /12 platos/);
  });

  test('cuerpo leído del stream (sin req.body) y con prefijo data: → 200', async () => {
    const client = fakeClient(() => okMessage({ readable: true, items: [{ name: 'Paella', ingredients: ['arroz', 'marisco'], uncertain: false }] }));
    const h = createHandler({ client, log: silent });
    const res = await run(h, streamReq(JSON.stringify(validBody({ image: `data:image/jpeg;base64,${JPEG_B64}` }))));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().items, [{ name: 'Paella', ingredients: ['arroz', 'marisco'], uncertain: false }]);
    assert.equal(client.calls[0].params.messages[0].content[0].source.data, JPEG_B64);
  });

  test('sanitizeReading y extractReading puros', () => {
    assert.deepEqual(sanitizeReading(null, 'carta'), { readable: false, items: [] });
    assert.deepEqual(sanitizeReading({ readable: 'true', items: [{ name: 'A', ingredients: [], uncertain: false }] }, 'carta'), {
      readable: false,
      items: [],
    });
    assert.deepEqual(extractReading({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"readable":tr' }] }, 'carta'), {
      readable: false,
      items: [],
    });
    const many = { readable: true, items: Array.from({ length: 5 }, (_, i) => ({ name: `P${i}`, ingredients: [], uncertain: false })) };
    assert.equal(sanitizeReading(many, 'etiqueta').items.length, 1);
    assert.deepEqual(sanitizeReading({ readable: true, items: [{ name: ' Tarta\n de\tqueso ', ingredients: ['queso\u0000'], uncertain: 1 }] }, 'carta'), {
      readable: true,
      items: [{ name: 'Tarta de queso', ingredients: ['queso'], uncertain: false }],
    });
  });
});

// ---------- Open Food Facts ----------

// Respuesta real de OFF (Nutella, 3017620422003), recortada.
const NUTELLA = {
  code: '3017620422003',
  product: {
    allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'],
    brands: 'Nutella, Ferrero',
    categories_tags: ['en:breakfasts', 'en:spreads', 'en:sweet-spreads'],
    code: '3017620422003',
    image_front_small_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.200.jpg',
    ingredients_text: 'sugar, palm oil',
    ingredients_text_es:
      'AZÚCAR, ACEITE VEGETAL, AVELLANAS (13%), LECHE DESCREMADA EN POLVO (8,7%), CACAO MAGRO EN POLVO7,4%), EMULSIONANTE: LECITINA, SABORIZANTE IDENTICO AL NATURAL: VAINILLINA',
    labels_tags: ['en:vegetarian', 'en:no-gluten', 'fr:triman'],
    product_name: 'Nutella',
    product_name_es: 'Nutella',
    traces_tags: [],
  },
  status: 1,
  status_verbose: 'product found',
};

describe('off.js', () => {
  test('normalizeProduct con una respuesta real', () => {
    assert.deepEqual(normalizeProduct(NUTELLA), {
      code: '3017620422003',
      name: 'Nutella',
      brand: 'Nutella',
      image: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.200.jpg',
      ingredientsText: NUTELLA.product.ingredients_text_es,
      allergens: ['en:milk', 'en:nuts', 'en:soybeans'],
      traces: [],
      categories: ['en:breakfasts', 'en:spreads', 'en:sweet-spreads'],
      labels: ['en:vegetarian', 'en:no-gluten', 'fr:triman'],
    });
  });

  test('normalizeProduct: preferencias y valores por defecto', () => {
    const p = normalizeProduct({
      code: '8400000000017',
      product: { product_name: 'Mix de picos', ingredients_text: 'harina de trigo, aceite', image_front_small_url: 'javascript:alert(1)', traces_tags: 'en:nuts' },
    });
    assert.equal(p.code, '8400000000017');
    assert.equal(p.name, 'Mix de picos');
    assert.equal(p.brand, '');
    assert.equal(p.image, null);
    assert.equal(p.ingredientsText, 'harina de trigo, aceite');
    assert.deepEqual(p.allergens, []);
    assert.deepEqual(p.traces, []);
    assert.deepEqual(normalizeProduct(null), {
      code: '',
      name: '',
      brand: '',
      image: null,
      ingredientsText: '',
      allergens: [],
      traces: [],
      categories: [],
      labels: [],
    });
    // También acepta el objeto product suelto.
    assert.equal(normalizeProduct(NUTELLA.product).name, 'Nutella');
  });

  describe('fetchProduct (fetch simulado)', () => {
    const realFetch = globalThis.fetch;
    let calls;
    const mock = (impl) => {
      calls = [];
      globalThis.fetch = async (url, opts) => {
        calls.push({ url, opts });
        return impl(url, opts);
      };
    };
    after(() => {
      globalThis.fetch = realFetch;
    });

    test('200 con status 1 → found:true y URL con fields', async () => {
      mock(() => new Response(JSON.stringify(NUTELLA), { status: 200, headers: { 'content-type': 'application/json' } }));
      const r = await fetchProduct('3017620422003');
      assert.equal(r.found, true);
      assert.equal(r.product.name, 'Nutella');
      assert.equal(calls[0].url, `https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=${OFF_FIELDS}`);
      assert.match(calls[0].url, /fields=code,product_name,product_name_es,brands,image_front_small_url,ingredients_text_es,ingredients_text,allergens_tags,traces_tags,categories_tags,labels_tags$/);
    });

    test('404 con JSON (no existe) → found:false, no es error de red', async () => {
      mock(() => new Response('{"code":"12345678901239","status":0,"status_verbose":"product not found"}', { status: 404 }));
      assert.deepEqual(await fetchProduct('12345678901239'), { found: false });
    });

    test('200 con status 0 → found:false', async () => {
      mock(() => new Response('{"status":0}', { status: 200 }));
      assert.deepEqual(await fetchProduct('00000123'), { found: false });
    });

    test('sin red, 5xx, JSON roto o tiempo agotado → Error con code "network"', async () => {
      mock(() => {
        throw new TypeError('Failed to fetch');
      });
      await assert.rejects(fetchProduct('3017620422003'), (e) => e.code === 'network');
      mock(() => new Response('oops', { status: 503 }));
      await assert.rejects(fetchProduct('3017620422003'), (e) => e.code === 'network');
      mock(() => new Response('<html>', { status: 200 }));
      await assert.rejects(fetchProduct('3017620422003'), (e) => e.code === 'network');
      mock(
        (url, opts) =>
          new Promise((_, reject) => {
            opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      await assert.rejects(fetchProduct('3017620422003', { timeoutMs: 20 }), (e) => e.code === 'network');
    });

    test('código no válido → found:false sin llamar a la red', async () => {
      mock(() => new Response('{}'));
      assert.deepEqual(await fetchProduct('123'), { found: false });
      assert.deepEqual(await fetchProduct('../../x'), { found: false });
      assert.equal(calls.length, 0);
    });
  });
});

// ---------- Códigos de barras ----------

describe('barcode.js', () => {
  test('isValidCode: 8–14 dígitos y solo dígitos', () => {
    for (const ok of ['12345678', '8410000000017', '3017620422003', '12345678901234', '012345678905']) assert.equal(isValidCode(ok), true, ok);
    for (const bad of ['1234567', '123456789012345', '12345678a', ' 12345678', '1234 5678', '', null, undefined, 12345678, '١٢٣٤٥٦٧٨']) {
      assert.equal(isValidCode(bad), false, String(bad));
    }
  });

  test('cleanCode quita espacios, puntos y guiones', () => {
    assert.equal(cleanCode(' 8 410000-00001.7 '), '8410000000017');
    assert.equal(isValidCode(cleanCode('3017 6204 22003')), true);
  });
});

// ---------- OCR (limpieza del texto) ----------

describe('ocr.js parseOcrText', () => {
  test('carta: quita precios, rellenos, encabezados y líneas cortas; todo incierto', () => {
    const text = [
      'RESTAURANTE',
      'Entrantes',
      'Croquetas de jamón ........ 9,50 €',
      'Ensalada César   12,00',
      '€ 7',
      '—',
      'xx',
      'Postres:',
      'Tarta de queso .... 6€',
      'Tarta de queso ...... 6 €',
      'IVA incluido',
      'www.restaurante.es',
      '~|; ¬ 1 2 3',
      '• Tiramisú casero',
    ].join('\n');
    const items = parseOcrText(text, 'carta');
    assert.deepEqual(
      items.map((i) => i.name),
      ['RESTAURANTE', 'Croquetas de jamón', 'Ensalada César', 'Tarta de queso', 'Tiramisú casero'],
    );
    assert.ok(items.every((i) => i.uncertain === true && Array.isArray(i.ingredients) && i.ingredients.length === 0));
  });

  test('carta: recoge como mucho 20 líneas (la interfaz se queda con 12)', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Plato número ${i}`).join('\n');
    assert.equal(parseOcrText(text, 'carta').length, 20);
  });

  test('carta: «Carta del mediodía» y «Menú del día» son encabezados, no platos', () => {
    const items = parseOcrText('Carta del mediodía\nMenú del día 14,00 €\nTortilla de patatas 7,00 €', 'carta');
    assert.deepEqual(items.map((i) => i.name), ['Tortilla de patatas']);
  });

  test('etiqueta: trozos tras «Ingredientes:» separados por comas, sin romper paréntesis ni decimales', () => {
    const text = [
      'QUESO TIERNO',
      'Ingredientes: leche pasteurizada de vaca, sal, cuajo, fermentos lácticos,',
      'conservador (E-252, E-235). Puede contener trazas de frutos de cáscara.',
      'Información nutricional por 100 g: valor energético 1500 kJ',
    ].join('\n');
    assert.deepEqual(parseOcrText(text, 'etiqueta'), [
      {
        name: 'La etiqueta',
        ingredients: [
          'leche pasteurizada de vaca',
          'sal',
          'cuajo',
          'fermentos lácticos',
          'conservador (E-252, E-235)',
          'Puede contener trazas de frutos de cáscara',
        ],
        uncertain: true,
      },
    ]);
    assert.deepEqual(splitIngredients('AVELLANAS (13%), LECHE DESCREMADA EN POLVO (8,7%); CACAO 7,4%'), [
      'AVELLANAS (13%)',
      'LECHE DESCREMADA EN POLVO (8,7%)',
      'CACAO 7,4%',
    ]);
  });

  test('etiqueta: tolera «lngredientes» mal leído; sin lista → []', () => {
    const items = parseOcrText('lngredientes: harina de trigo, azúcar, huevo', 'etiqueta');
    assert.deepEqual(items[0].ingredients, ['harina de trigo', 'azúcar', 'huevo']);
    assert.deepEqual(parseOcrText('', 'etiqueta'), []);
    assert.deepEqual(parseOcrText('Hola\nMundo', 'etiqueta'), []);
    assert.deepEqual(parseOcrText('   \n  ', 'carta'), []);
  });

  test('cleanLine', () => {
    assert.equal(cleanLine('  Pulpo a la gallega ..... 18,50€ '), 'Pulpo a la gallega');
    assert.equal(cleanLine('- Gazpacho andaluz 6,00 EUR'), 'Gazpacho andaluz');
  });
});

// ---------- Lector, imagen y cámara (partes puras) ----------

describe('reader.js / image.js / camera.js (puros)', () => {
  test('normalizeReading: JSON raro → null (pasa al OCR); readable:false se respeta', () => {
    assert.equal(normalizeReading(null), null);
    assert.equal(normalizeReading({ error: 'sin_vision' }), null);
    assert.equal(normalizeReading({ readable: 'yes', items: [] }), null);
    assert.deepEqual(normalizeReading({ readable: false, items: [{ name: 'X' }] }), { readable: false, items: [] });
    assert.deepEqual(normalizeReading({ readable: true, items: [{ name: '' }] }), { readable: false, items: [] });
    const many = { readable: true, items: Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, ingredients: ['a', 3], uncertain: 'x' })) };
    const carta = normalizeReading(many, 'carta');
    assert.equal(carta.items.length, 12);
    assert.deepEqual(carta.items[0], { name: 'P0', ingredients: ['a'], uncertain: false });
    assert.equal(normalizeReading(many, 'etiqueta').items.length, 1);
  });

  test('fitWithin: lado largo ≤ 1280 y sin ampliar', () => {
    assert.deepEqual(fitWithin(4032, 3024), { width: 1280, height: 960 });
    assert.deepEqual(fitWithin(3024, 4032), { width: 960, height: 1280 });
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
    assert.deepEqual(fitWithin(1280, 1280), { width: 1280, height: 1280 });
    assert.deepEqual(fitWithin(10000, 10, 1280), { width: 1280, height: 1 });
  });

  test('stripDataUrl', () => {
    assert.equal(stripDataUrl('data:image/jpeg;base64,QUJD'), 'QUJD');
    assert.equal(stripDataUrl('QUJD'), 'QUJD');
  });

  test('mapCameraError y cameraAvailable', () => {
    assert.equal(mapCameraError({ name: 'NotFoundError' }), 'no-camera');
    assert.equal(mapCameraError({ name: 'OverconstrainedError' }), 'no-camera');
    assert.equal(mapCameraError({ name: 'NotAllowedError' }), 'denied');
    assert.equal(mapCameraError({ name: 'SecurityError' }), 'denied');
    assert.equal(mapCameraError({ name: 'NotReadableError' }), 'error');
    assert.equal(mapCameraError(undefined), 'error');
    assert.equal(cameraAvailable(), false); // Node no tiene mediaDevices
  });
});

// ---------- Servidor local ----------

function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

describe('server.js', () => {
  let server;
  let port;
  let savedKey;
  before(async () => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    server = createServer();
    port = await listen(server);
  });
  after(async () => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    await new Promise((r) => server.close(r));
  });

  test('la raíz es la del proyecto', () => {
    assert.equal(ROOT, PROJECT);
  });

  test('/ sirve index.html si existe', async () => {
    const r = await request(port, { path: '/' });
    if (existsSync(path.join(PROJECT, 'index.html'))) {
      assert.equal(r.status, 200);
      assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
    } else {
      assert.equal(r.status, 404);
    }
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.match(r.headers['permissions-policy'], /camera=\(self\)/);
  });

  test('sirve src/ con el MIME correcto (GET y HEAD)', async () => {
    const r = await request(port, { path: '/src/capture/off.js' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.match(r.body, /normalizeProduct/);
    const h = await request(port, { method: 'HEAD', path: '/src/capture/off.js' });
    assert.equal(h.status, 200);
    assert.equal(h.body, '');
  });

  test('NO sirve package.json, tests, docs, api, node_modules, .git ni rutas con ..', async () => {
    const paths = [
      '/package.json',
      '/package-lock.json',
      '/server.js',
      '/vercel.json',
      '/tests/capture.test.js',
      '/docs/CONTRATO.md',
      '/api/leer.js',
      '/node_modules/@anthropic-ai/sdk/package.json',
      '/.git/HEAD',
      '/.gitignore',
      '/../package.json',
      '/src/../package.json',
      '/%2e%2e/package.json',
      '/src/%2e%2e/package.json',
      '/src/capture/..%2f..%2fpackage.json',
      '/src/capture/%2e%2e%5c%2e%2e%5cpackage.json',
      '/src/%00.js',
      '/src/',
      '/src',
      '//etc/passwd',
      '/%E0%A4%A',
    ];
    for (const p of paths) {
      const r = await request(port, { path: p });
      assert.ok(r.status === 404 || r.status === 400, `${p} → ${r.status}`);
      assert.doesNotMatch(r.body, /"dependencies"|anthropic-ai|root:x:/, p);
    }
  });

  test('métodos: POST a un estático → 405; GET /api/leer → 405; /api/otra → 404', async () => {
    assert.equal((await request(port, { method: 'POST', path: '/src/capture/off.js' })).status, 405);
    const g = await request(port, { path: '/api/leer' });
    assert.equal(g.status, 405);
    assert.equal((await request(port, { path: '/api/otra' })).status, 404);
  });

  test('POST /api/leer sin clave → 503 sin_vision, no-store y cabeceras de seguridad', async () => {
    const body = JSON.stringify(validBody());
    const r = await request(port, {
      method: 'POST',
      path: '/api/leer',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      body,
    });
    assert.equal(r.status, 503);
    assert.deepEqual(JSON.parse(r.body), { error: 'sin_vision' });
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  });

  test('POST /api/leer con cliente falso: 200, y 413 con un cuerpo enorme', async () => {
    const client = fakeClient(() => okMessage({ readable: true, items: [{ name: 'Tortilla de patata', ingredients: [], uncertain: false }] }));
    const s = createServer({ leer: createHandler({ client, log: silent }) });
    const p = await listen(s);
    try {
      const body = JSON.stringify(validBody());
      const ok = await request(p, { method: 'POST', path: '/api/leer', headers: { 'content-type': 'application/json' }, body });
      assert.equal(ok.status, 200);
      assert.deepEqual(JSON.parse(ok.body), { readable: true, items: [{ name: 'Tortilla de patata', ingredients: [], uncertain: false }] });
      const big = JSON.stringify(validBody({ image: '/9j/' + 'A'.repeat(MAX_IMAGE_BASE64 + 1000) }));
      const tooBig = await request(p, { method: 'POST', path: '/api/leer', headers: { 'content-type': 'application/json' }, body: big });
      assert.equal(tooBig.status, 413);
    } finally {
      await new Promise((r) => s.close(r));
    }
  });

  test('raíz temporal: index.html, iconos y enlaces simbólicos que se escapan', async () => {
    const base = mkdtempSync(path.join(tmpdir(), 'pc-server-'));
    const root = path.join(base, 'app');
    try {
      mkdirSync(path.join(root, 'src'), { recursive: true });
      writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>x</title>');
      writeFileSync(path.join(root, 'manifest.webmanifest'), '{}');
      writeFileSync(path.join(root, 'icon.svg'), '<svg/>');
      writeFileSync(path.join(root, 'styles.css'), 'body{}');
      writeFileSync(path.join(root, 'secret.txt'), 'no');
      writeFileSync(path.join(base, 'fuera.js'), 'secreto');
      symlinkSync(path.join(base, 'fuera.js'), path.join(root, 'src', 'enlace.js'));
      const s = createServer({ root });
      const p = await listen(s);
      try {
        const home = await request(p, { path: '/' });
        assert.equal(home.status, 200);
        assert.match(home.body, /<title>x<\/title>/);
        assert.equal((await request(p, { path: '/manifest.webmanifest' })).headers['content-type'], 'application/manifest+json; charset=utf-8');
        assert.equal((await request(p, { path: '/icon.svg' })).headers['content-type'], 'image/svg+xml');
        assert.equal((await request(p, { path: '/styles.css' })).headers['content-type'], 'text/css; charset=utf-8');
        assert.equal((await request(p, { path: '/secret.txt' })).status, 404);
        const link = await request(p, { path: '/src/enlace.js' });
        assert.equal(link.status, 404);
        assert.doesNotMatch(link.body, /secreto/);
      } finally {
        await new Promise((r) => s.close(r));
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('resolveStatic', () => {
    assert.equal(resolveStatic('/'), path.join(PROJECT, 'index.html'));
    assert.equal(resolveStatic('/src/capture/reader.js'), path.join(PROJECT, 'src', 'capture', 'reader.js'));
    assert.equal(resolveStatic('/icon-192.png'), path.join(PROJECT, 'icon-192.png'));
    for (const bad of ['/package.json', '/src/../package.json', '/src/.hidden.js', '/src/a//b.js', '/src/x.exe', '/tests/a.js', '/src\\..\\package.json']) {
      assert.equal(resolveStatic(bad), null, bad);
    }
  });
});
