#!/usr/bin/env node
// Batería de aceptación de extremo a extremo de «¿Puedo comerlo?» (QA: Alfred).
//
//   node tests/e2e/run.cjs            → todos los escenarios
//   node tests/e2e/run.cjs 3 4        → solo esos escenarios (el 11, consola, siempre resume lo ejecutado)
//   node tests/e2e/run.cjs --headed   → con ventana (si hay pantalla)
//
// Arranca él mismo `node server.js` (PORT libre, 5199 por defecto) y lo para al acabar. Si server.js aún no
// existe, sirve los estáticos con un servidor mínimo propio que responde 503 en /api/leer (como sin clave).
// Informe: stdout y tests/e2e/out/report.md (+ capturas .png, server.log, results.json).
//
// Variables: E2E_BASE_URL (usar un servidor ya arrancado), E2E_PORT, E2E_OCR_TIMEOUT (ms, 120000),
//            E2E_NO_PROXY=1 (no usar el proxy del entorno), E2E_SIN_VISION=1 (quita ANTHROPIC_API_KEY al servidor).

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, 'out');

const argv = process.argv.slice(2);
const ONLY = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const HEADED = argv.includes('--headed');
const OCR_TIMEOUT = Number(process.env.E2E_OCR_TIMEOUT || 120000);
const SCENARIO_TIMEOUT = Number(process.env.E2E_SCENARIO_TIMEOUT || 480000);

// ---------- Textos literales de la especificación ----------
const FOOTER = 'Orientativa. No sustituye el consejo de tu matrona, ginecólogo o médico.';
const TXT = {
  app: '¿Puedo comerlo?',
  portada: 'Para la carta y para el súper. Una respuesta corta, y el motivo solo si lo abres.',
  inicio: '¿Qué vas a comer?',
  inicioSub: 'En la mesa o en el súper. La respuesta, primero.',
  fuera: 'Foto de la carta, o el plato escrito. Si no se lee, no lo invento.',
  super: 'El código consulta Open Food Facts. Si no está, fotografía los ingredientes.',
  listaVacia: 'Todavía no hay nada. Cuando mires un plato o un producto, puedes dejarlo aquí.',
  noLeida: 'No he podido leer la carta. Acércala, o escribe el plato.',
  laCarta: 'La carta',
  borrar: 'Borrar los datos de este móvil',
};
const ALERGIAS = { leche: 'Leche', huevo: 'Huevo', gluten: 'Gluten', frutos_secos: 'Frutos secos', pescado: 'Pescado', marisco: 'Marisco', soja: 'Soja', sesamo: 'Sésamo' };
const DIETAS = { vegetariana: 'Vegetariana', vegana: 'Vegana', sin_cerdo: 'Sin cerdo', sin_lactosa: 'Sin lactosa (intolerancia)' };
const LEVEL_LABEL = { si: 'Sí', cuidado: 'Con cuidado', no: 'Mejor no', duda: 'No estoy segura' };
const COLORS = { 'Sí': [36, 84, 67], 'Con cuidado': [141, 67, 36], 'Mejor no': [122, 51, 44] };
const NAV = ['Inicio', 'Fuera', 'Súper', 'Lista'];
const FORBIDDEN = /semana|\bparto\b|fecha probable|toxoplasm|diabet|anal[ií]tic|glucos|\bpeso\b|\bedad\b|cu[aá]ntos a[nñ]os|trimestre|inmun|\bfpp\b|\bkg\b|kilos/i;
const PROFILE_BASE = { alergias: [], otra: '', dieta: [] };
// Lo que ya no debe existir en el arranque ni en Ajustes (la pregunta de embutidos se retiró).
const NO_EMBUTIDOS = /embutid|jam[oó]n|AESAN|toxoplasm|listeria|solo si van cocinados|qu[eé] has decidido/i;
// Estructura vieja que ya no existe (rediseño N5).
// (`.chip`/`.chips` vuelven en N8, pero solo dentro de «Ver más» como temas neutros; las de grupo siguen prohibidas)
const LEGACY_SEL = '.card, .sheet, .row, .link-btn, .answer .pill, .entry .pill';
const LEVEL_WORDS = Object.values(LEVEL_LABEL);
// N6: la pantalla de UNA respuesta toma el color del veredicto en el fondo del body.
const TONE_BG = { si: 'rgb(36, 84, 67)', cuidado: 'rgb(176, 79, 16)', no: 'rgb(122, 51, 44)', duda: 'rgb(134, 103, 42)' };
const TONE_META = { si: '#245443', cuidado: '#b04f10', no: '#7a332c', duda: '#86672a' };
const CREAM_RGB = 'rgb(243, 238, 230)';
const CREAM_HEX = '#f3eee6';
const WORD_CREAM = 'rgb(255, 253, 248)';
// Texto del nivel sobre las bandas de las listas y tinte de cada banda
const LVL_TEXT = { 'Sí': 'rgb(36, 84, 67)', 'Con cuidado': 'rgb(141, 67, 36)', 'Mejor no': 'rgb(122, 51, 44)' };
const BAND_BG = { si: 'rgb(224, 234, 227)', cuidado: 'rgb(248, 226, 208)', no: 'rgb(242, 223, 219)', duda: 'rgb(239, 230, 200)' };
const LEVEL_KEY = { 'Sí': 'si', 'Con cuidado': 'cuidado', 'Mejor no': 'no', 'No estoy segura': 'duda' };
const TONE_WAIT = 700; // el fondo tarda ~0,45 s en tomar el color

// Contraste WCAG entre dos «rgb(…)» / «rgba(…)» (un fondo con alfa se compone sobre el crema)
function parseRgb(c, over = [243, 238, 230]) {
  const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
  return [r, g, b].map((v, i) => Math.round(v * a + over[i] * (1 - a)));
}
function lum([r, g, b]) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function contrast(fg, bg) { const a = parseRgb(fg), b = parseRgb(bg); if (!a || !b) return 0; const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); }

let BASE = '';
let SERVER_KIND = '';
const CORPUS = []; // textos visibles recogidos en todos los escenarios (para el escenario 10)
const ALL_T = [];

// ---------- Utilidades ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
const short = (s, n = 160) => { const x = String(s ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isThirdParty(url) {
  try { return new URL(url).origin !== new URL(BASE).origin; } catch { return false; }
}

class Scenario {
  constructor(id, title) {
    this.id = id; this.title = title;
    this.items = []; this.events = []; this.requests = [];
    this.shots = []; this.contexts = []; this.page = null; this.n = 0;
    this.status = 'PENDIENTE'; this.ms = 0;
  }
  async shot(name, page = this.page) {
    if (!page || page.isClosed()) return null;
    const file = `${String(this.id).padStart(2, '0')}-${String(++this.n).padStart(2, '0')}-${slug(name)}.png`;
    try { await page.screenshot({ path: path.join(OUT, file), timeout: 10000 }); this.shots.push(file); return file; } catch { return null; }
  }
  async check(ok, what, detail = '', page) {
    const item = { kind: ok ? 'ok' : 'fail', what, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
    if (!ok) item.shot = await this.shot('fallo-' + what, page || this.page);
    this.items.push(item);
    console.log(`   ${ok ? '✓' : '✗'} ${what}${!ok && item.detail ? ' — ' + short(item.detail, 300) : ''}`);
    return !!ok;
  }
  warn(what, detail = '') { this.items.push({ kind: 'warn', what, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); console.log(`   ⚠ ${what}${detail ? ' — ' + short(typeof detail === 'string' ? detail : JSON.stringify(detail), 300) : ''}`); }
  info(what, detail = '') { this.items.push({ kind: 'info', what, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); console.log(`   · ${what}${detail ? ': ' + short(typeof detail === 'string' ? detail : JSON.stringify(detail), 300) : ''}`); }
  attach(page) {
    page.on('pageerror', (e) => this.events.push({ type: 'pageerror', text: String(e && e.message || e), url: page.url() }));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const loc = m.location() || {};
      this.events.push({ type: 'console.error', text: m.text(), url: loc.url || '' });
    });
    page.on('requestfailed', (r) => {
      const f = (r.failure() && r.failure().errorText) || '';
      if (/ERR_ABORTED/.test(f)) return;
      this.events.push({ type: 'requestfailed', text: f, url: r.url() });
    });
    page.on('request', (r) => this.requests.push({ url: r.url(), method: r.method(), at: Date.now(), post: r.method() === 'POST' ? r.postData() : null }));
    page.on('response', (r) => { if (r.status() >= 400) this.events.push({ type: 'http', status: r.status(), text: `HTTP ${r.status()}`, url: r.url() }); });
    page.on('dialog', (d) => { this.info(`Diálogo ${d.type()}`, d.message()); d.accept().catch(() => {}); });
  }
  async newPage(browser, opts = {}) {
    const ctx = await browser.newContext({ ...MOBILE, ...opts });
    this.contexts.push(ctx);
    ctx.on('page', (p) => this.attach(p));
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    this.page = page;
    return { ctx, page };
  }
  async close() { for (const c of this.contexts) await c.close().catch(() => {}); }
}

const MOBILE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true, // solo pruebas: el proxy del entorno re-termina TLS
};

// ---------- Helpers de página ----------
async function getHash(page) { return page.evaluate(() => location.hash).catch(() => ''); }

async function waitHash(page, re, timeout = 8000) {
  const end = Date.now() + timeout;
  let h = '';
  do { h = await getHash(page); if (re.test(h)) return h; await page.waitForTimeout(150); } while (Date.now() < end);
  return h;
}

async function appReady(page, timeout = 15000) {
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 15, null, { timeout }).catch(() => {});
  await page.waitForTimeout(350);
}

async function openApp(page, hash = '#/') {
  await page.goto(BASE + '/' + hash, { waitUntil: 'load', timeout: 30000 });
  await appReady(page);
}

async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(450);
}

async function bodyText(page) { return page.evaluate(() => document.body.innerText).catch(() => ''); }

async function storage(page) {
  return page.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return o;
  });
}
function parseJSON(s, d = null) { try { return JSON.parse(s); } catch { return d; } }

// Busca un control visible por su texto: botón, enlace, radio, checkbox… y, si no, el texto suelto.
async function find(page, text, { timeout = 6000, loose = true, scope } = {}) {
  const root = scope || page;
  const isRe = text instanceof RegExp;
  const exactRe = isRe ? text : new RegExp('^\\s*' + esc(text) + '\\s*$', 'i');
  const looseRe = isRe ? text : new RegExp(esc(text), 'i');
  const cands = [
    root.getByRole('button', { name: exactRe }), root.getByRole('link', { name: exactRe }),
    root.getByRole('radio', { name: exactRe }), root.getByRole('checkbox', { name: exactRe }),
    root.getByRole('switch', { name: exactRe }), root.getByRole('tab', { name: exactRe }),
    root.getByText(exactRe),
  ];
  if (loose && !isRe) cands.push(root.getByRole('button', { name: looseRe }), root.getByRole('link', { name: looseRe }), root.getByText(looseRe));
  const end = Date.now() + timeout;
  for (;;) {
    for (const c of cands) {
      const v = c.filter({ visible: true });
      if ((await v.count().catch(() => 0)) > 0) return v.first();
    }
    if (Date.now() > end) return null;
    await page.waitForTimeout(200);
  }
}

async function clickLoc(loc) {
  try { await loc.click({ timeout: 3000 }); return; } catch { /* sigue */ }
  const kind = await loc.evaluate((el) => (el.tagName === 'INPUT' ? el.type : el.tagName)).catch(() => '');
  if (kind === 'checkbox' || kind === 'radio') { await loc.evaluate((el) => el.click()); return; }
  await loc.click({ force: true, timeout: 3000 });
}

function addedLines(before, after) {
  const prev = new Set(String(before).split('\n').map((l) => l.trim()));
  return String(after).split('\n').map((l) => l.trim()).filter((l) => l && !prev.has(l));
}

async function tap(page, text, opts = {}) {
  const loc = await find(page, text, opts);
  if (!loc) throw new Error(`No encuentro «${text instanceof RegExp ? text.source : text}» en ${await getHash(page)}`);
  await clickLoc(loc);
  await page.waitForTimeout(opts.after ?? 400);
  return loc;
}

async function tapNav(page, name) {
  const nav = page.locator('nav, [role=navigation]');
  const re = new RegExp('^\\s*' + esc(name) + '\\s*$', 'i');
  const loc = nav.getByRole('link', { name: re }).or(nav.getByRole('button', { name: re })).or(nav.getByText(re)).filter({ visible: true });
  if (await loc.count()) { await clickLoc(loc.first()); await page.waitForTimeout(450); return true; }
  await tap(page, name);
  return false;
}

async function seen(page, text, { timeout = 6000, exact = true } = {}) {
  const loc = text instanceof RegExp ? page.getByText(text) : page.getByText(text, { exact });
  const end = Date.now() + timeout;
  for (;;) {
    const v = loc.filter({ visible: true });
    const n = await v.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      // descarta lo visualmente oculto (regiones aria-live de 1 px, .visually-hidden)
      const box = await v.nth(i).boundingBox().catch(() => null);
      if (box && box.width > 2 && box.height > 2) return true;
    }
    if (Date.now() > end) return false;
    await page.waitForTimeout(200);
  }
}

// Respuestas visibles: `article.answer` (respuesta única) y `ul.entries > li.entry` (filas), fuera de nav/pie.
// Cada una con la palabra del nivel (`.answer-word` / `.lvl`), su nombre, su frase y su color.
// (Se sigue llamando «pills» por historia: el resumen de la carta usa `.pill` y se lee aparte.)
function PILLS_FN() {
  const L = ['Sí', 'Con cuidado', 'Mejor no', 'No estoy segura'];
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const out = [];
  for (const el of document.querySelectorAll('article.answer, li.entry')) {
    if (el.closest('nav,footer,[role=navigation],[role=contentinfo]')) continue;
    if (!visible(el)) continue;
    const isAnswer = el.tagName === 'ARTICLE';
    const wordEl = el.querySelector(isAnswer ? '.answer-word' : '.lvl');
    const nameEl = el.querySelector(isAnswer ? '.answer-name' : '.entry-name');
    const phraseEl = el.querySelector(isAnswer ? '.answer-phrase' : '.entry-phrase');
    const cs = wordEl ? getComputedStyle(wordEl) : null;
    const b = wordEl ? getComputedStyle(wordEl.parentElement) : null;
    const lvCls = (String(el.className).match(/\blv-(si|cuidado|no|duda)\b/) || [])[1] || null;
    out.push({
      kind: isAnswer ? 'answer' : 'entry',
      label: wordEl ? clean(wordEl.textContent) : '', // textContent: «Sí» se pinta en mayúsculas por CSS (innerText daría «SÍ»)
      name: nameEl ? clean(nameEl.innerText) : '',
      phrase: phraseEl ? clean(phraseEl.innerText) : '',
      card: clean(el.innerText).slice(0, 500),
      level: el.dataset.level || null,
      lvCls,
      color: cs ? cs.color : null,
      fontFamily: cs ? cs.fontFamily : null,
      fontSize: cs ? cs.fontSize : null,
      markColor: b ? b.borderLeftColor : null,
      bg: getComputedStyle(el).backgroundColor,
      phraseColor: phraseEl ? getComputedStyle(phraseEl).color : null,
      hasMore: !!el.querySelector('.more-btn'),
      inLo: !!el.closest('section[aria-labelledby="lo-ultimo"]'),
      valid: !!wordEl && L.includes(clean(wordEl.textContent)),
    });
  }
  return out;
}
async function pills(page) { return page.evaluate(PILLS_FN).catch(() => []); }
async function mainPill(page, timeout = 6000) {
  const end = Date.now() + timeout;
  for (;;) {
    const p = (await pills(page)).filter((x) => !x.inLo);
    if (p.length || Date.now() > end) return p[0] || null;
    await page.waitForTimeout(250);
  }
}

// Estado de «pantalla entera del color»: atributo del body, fondo calculado, meta theme-color y «?» decorativos.
async function toneState(page) {
  return page.evaluate(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const marks = [...document.querySelectorAll('#tone span.tm')];
    const crosses = document.querySelectorAll('#tone .tcross').length;
    const foot = [...document.querySelectorAll('footer, [role=contentinfo]')][0];
    const fl = foot ? [...foot.querySelectorAll('*')].find((e) => e.children.length === 0 && /No sustituye/.test(e.textContent)) || foot : null;
    const word = document.querySelector('article.answer .answer-word');
    const phrase = document.querySelector('article.answer .answer-phrase');
    return {
      verdict: document.body.dataset.verdict || null,
      bg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      meta: meta ? meta.getAttribute('content') : null,
      marks: marks.length,
      cross: crosses,
      marksText: [...new Set(marks.map((m) => m.textContent.trim()))].join(''),
      footColor: fl ? getComputedStyle(fl).color : null,
      footBg: foot ? getComputedStyle(foot).backgroundColor : null,
      wordColor: word ? getComputedStyle(word).color : null,
      wordText: word ? word.textContent.trim() : null,
      phraseColor: phrase ? getComputedStyle(phrase).color : null,
    };
  }).catch(() => ({}));
}
// Espera a que el fondo tome el color (≥ 0,5 s) y devuelve el estado
async function settledTone(page, ms = TONE_WAIT) { await page.waitForTimeout(ms); return toneState(page); }
// Comprueba una pantalla de respuesta de color `level` (si|cuidado|no|duda) o, con null, crema sin veredicto
async function checkTone(t, page, level, what, st) {
  st = st || await settledTone(page);
  if (!level) {
    await t.check(st.verdict === null && st.bg === CREAM_RGB && st.meta === CREAM_HEX && st.marks === 0,
      `${what}: sin data-verdict, fondo crema, theme-color #f3eee6 y sin «?»`, JSON.stringify({ v: st.verdict, bg: st.bg, meta: st.meta, marks: st.marks }));
    return st;
  }
  await t.check(st.verdict === level && st.bg === TONE_BG[level] && st.meta === TONE_META[level],
    `${what}: body[data-verdict=${level}], fondo ${TONE_BG[level]} y theme-color ${TONE_META[level]}`, JSON.stringify({ v: st.verdict, bg: st.bg, meta: st.meta }));
  return st;
}

// Instantánea de textos para el escenario 10.
async function snap(page, t, screen) {
  const data = await page.evaluate((LEGACY) => {
    const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,[role=heading]')].filter(visible).map((h) => h.innerText.replace(/\s+/g, ' ').trim());
    const leaves = [];
    for (const el of document.querySelectorAll('body *')) {
      const tc = el.textContent; if (!tc || tc.length > 30 || el.children.length > 2) continue;
      if (!visible(el)) continue; const t = el.innerText.replace(/\s+/g, ' ').trim(); if (t) leaves.push(t);
    }
    const clean = (x) => (x || '').replace(/\s+/g, ' ').trim();
    const answers = [...document.querySelectorAll('article.answer, li.entry')].filter(visible).map((el) => {
      const a = el.tagName === 'ARTICLE';
      const q = (sel) => { const n = el.querySelector(sel); return n ? clean(n.innerText) : ''; };
      const tc = (sel) => { const n = el.querySelector(sel); return n ? clean(n.textContent) : ''; };
      return { label: tc(a ? '.answer-word' : '.lvl'), name: q(a ? '.answer-name' : '.entry-name'), phrase: q(a ? '.answer-phrase' : '.entry-phrase') };
    });
    const legacy = [...document.querySelectorAll(LEGACY)].map((n) => n.tagName.toLowerCase() + '.' + String(n.className).split(/\s+/).slice(0, 2).join('.'));
    const svgs = [...document.querySelectorAll('svg')].map((v) => ({
      cls: String(v.getAttribute('class') || '').slice(0, 30), hidden: v.closest('[aria-hidden=true]') !== null || v.getAttribute('aria-hidden') === 'true',
      text: v.querySelectorAll('text, tspan').length, image: v.querySelectorAll('image').length, fo: v.querySelectorAll('foreignObject').length, use: v.querySelectorAll('use').length,
      big: v.getBoundingClientRect().width > 100,
    }));
    return { text: document.body.innerText, headings, leaves: [...new Set(leaves)], answers, legacy, svgs };
  }, LEGACY_SEL).catch(() => null);
  if (data) CORPUS.push({ scenario: t.id, screen, hash: await getHash(page), ...data });
  return data;
}

// Recoge etiquetas/placeholders de todos los campos y las preguntas visibles.
async function formTexts(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const inputs = [];
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (el.type === 'hidden') continue;
      const parts = [];
      if (el.labels) for (const l of el.labels) parts.push(l.innerText);
      if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
      const lb = el.getAttribute('aria-labelledby');
      if (lb) lb.split(/\s+/).forEach((id) => { const x = document.getElementById(id); if (x) parts.push(x.innerText); });
      if (el.placeholder) parts.push('placeholder: ' + el.placeholder);
      if (el.title) parts.push(el.title);
      const fs = el.closest('fieldset'); if (fs) { const lg = fs.querySelector('legend'); if (lg) parts.push('legend: ' + lg.innerText); }
      inputs.push({ tag: el.tagName.toLowerCase(), type: el.type, visible: visible(el) || [...(el.labels || [])].some(visible), text: parts.join(' | ').replace(/\s+/g, ' ').trim() });
    }
    const questions = document.body.innerText.match(/¿[^?¿]{1,200}\?/g) || [];
    return { inputs, questions };
  });
}

// Botones y enlaces con aspecto de botón visibles, con su altura.
async function buttonSizes(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
      if (r.right <= 0 || r.left >= innerWidth || r.bottom + scrollY <= 0) return false; // fuera de pantalla (p. ej. «Saltar al contenido»)
      const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    const transparent = (c) => !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
    const out = [];
    for (const el of document.querySelectorAll('button, [role=button], input[type=button], input[type=submit], input[type=reset], summary, a[href], label')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      let kind = el.tagName === 'SUMMARY' ? 'summary' : el.tagName === 'A' ? 'enlace' : el.tagName === 'LABEL' ? 'opcion' : 'boton';
      if (kind === 'enlace') {
        const cls = typeof el.className === 'string' ? el.className : '';
        const looks = !transparent(cs.backgroundColor) || (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none' && parseFloat(cs.borderBottomWidth) >= 1) || el.closest('nav') || /(^|[\s_-])(btn|button|tile|chip|tab)([\s_-]|$)/.test(cls) || !!el.closest('.shortcuts, ul.entries');
        if (!looks && /\btext-link\b/.test(cls)) kind = 'enlace-texto';
        else if (!looks) continue;
        else kind = el.closest('nav') ? 'enlace-nav' : 'enlace-boton';
      }
      if (kind === 'opcion') {
        const inp = el.querySelector('input[type=checkbox],input[type=radio]') || (el.htmlFor && document.getElementById(el.htmlFor));
        if (!inp || !/checkbox|radio/.test(inp.type || '')) continue;
      }
      const r = el.getBoundingClientRect();
      out.push({ kind, text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), h: Math.round(r.height * 10) / 10, w: Math.round(r.width), radius: cs.borderTopLeftRadius });
    }
    return { buttons: out, scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
  });
}

// Comprueba el pie (texto exacto, dentro del viewport y no tapado).
async function footerState(page) {
  return page.evaluate((FOOTER) => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('body *')].filter((el) => n(el.textContent).includes('No sustituye') && n(el.innerText) === FOOTER);
    const leafs = els.filter((el) => ![...el.children].some((c) => n(c.innerText) === FOOTER));
    if (!leafs.length) {
      const partial = [...document.querySelectorAll('body *')].filter((el) => /No sustituye/.test(el.textContent || '') && el.children.length === 0).map((e) => n(e.innerText || e.textContent)).slice(0, 2);
      return { found: false, partial };
    }
    const res = leafs.map((el) => {
      const r = el.getBoundingClientRect();
      const inViewport = r.height > 0 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      const hit = document.elementFromPoint(cx, cy);
      const cs = getComputedStyle(el);
      return { inViewport, onTop: !!hit && (hit === el || el.contains(hit)), hit: hit ? hit.tagName + '.' + String(hit.className || '').slice(0, 30) : null, top: Math.round(r.top), bottom: Math.round(r.bottom), innerHeight, fontSize: cs.fontSize, visibility: cs.visibility, opacity: cs.opacity };
    });
    const good = res.find((x) => x.inViewport && x.onTop && x.visibility !== 'hidden' && Number(x.opacity) > 0.3);
    return { found: true, ok: !!good, all: res };
  }, FOOTER);
}

async function navState(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const navs = [...document.querySelectorAll('nav, [role=navigation]')].filter(visible).map((n) => {
      const r = n.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), position: getComputedStyle(n).position, items: [...n.querySelectorAll('a, button')].filter(visible).map((a) => a.innerText.replace(/\s+/g, ' ').trim()) };
    });
    const burger = [...document.querySelectorAll('button, a, [role=button]')].filter(visible).filter((b) => /men[uú]|hamburg|☰|≡/i.test([b.getAttribute('aria-label') || '', typeof b.className === 'string' ? b.className : '', b.title || '', b.id].join(' ')) || /^\s*(men[uú]|☰|≡)\s*$/i.test(b.innerText)).map((b) => (b.getAttribute('aria-label') || b.innerText || b.className).slice(0, 40));
    const name = [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 || el.tagName.match(/^H\d$/)).filter((el) => (el.innerText || '').trim() === '¿Puedo comerlo?' && visible(el)).map((el) => Math.round(el.getBoundingClientRect().top));
    const ajustes = [...document.querySelectorAll('a, button, [role=button]')].filter(visible).filter((b) => /ajustes/i.test([b.getAttribute('aria-label') || '', b.innerText, b.title || '', b.getAttribute('href') || ''].join(' '))).map((b) => ({ top: Math.round(b.getBoundingClientRect().top), text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) }));
    const historial = [...document.querySelectorAll('a, button')].filter(visible).some((b) => /historial/i.test((b.innerText || '') + ' ' + (b.getAttribute('href') || '') + ' ' + (b.getAttribute('aria-label') || '')));
    return { innerHeight, navs, burger, name, ajustes, historial };
  });
}

// Escribe en el buscador de Inicio («O escribe el plato») y devuelve la pastilla principal.
async function searchFromHome(page, q) {
  let input = page.getByPlaceholder(/sushi/i).filter({ visible: true });
  if (!(await input.count())) input = page.getByLabel(/escribe el plato/i).filter({ visible: true });
  if (!(await input.count())) input = page.getByRole('searchbox').filter({ visible: true });
  if (!(await input.count())) throw new Error('No encuentro el buscador «O escribe el plato» en Inicio');
  const el = input.first();
  await el.fill('');
  await el.fill(q);
  await page.waitForTimeout(300);
  await el.press('Enter').catch(() => {});
  await page.waitForTimeout(700);
  return mainPill(page, 6000);
}

async function seed(page, t, profile = {}) {
  const p = { ...PROFILE_BASE, ...profile };
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate((prof) => {
    localStorage.setItem('pc.v1.profile', JSON.stringify(prof));
    localStorage.setItem('pc.v1.onboarded', 'true');
    location.hash = '#/';
  }, p);
  await page.reload({ waitUntil: 'load' });
  await appReady(page);
  const h = await getHash(page);
  if (/arranque/.test(h)) {
    t.warn('La app no respeta el perfil sembrado en localStorage (pc.v1.profile + pc.v1.onboarded); hago el arranque por la interfaz', h);
    await onboardUI(page, p);
  }
}

async function onboardUI(page, p) {
  await openApp(page, '#/');
  await tap(page, 'Seguir');                       // 1 → 2 alergias
  for (const a of p.alergias || []) await tap(page, ALERGIAS[a], { loose: false });
  if (p.otra) await page.locator('input[name=otra]').fill(p.otra);
  await tap(page, 'Seguir');                       // 2 → 3 dietas
  for (const d of p.dieta || []) await tap(page, DIETAS[d], { loose: false });
  await tap(page, 'Seguir');                       // 3 → 4 privacidad
  await tap(page, 'Empezar');
  await appReady(page);
}

async function chooseFile(page, buttonText, file) {
  const fcP = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
  await tap(page, buttonText, { after: 50 });
  const fc = await fcP;
  if (fc) { await fc.setFiles(file); return 'filechooser'; }
  const inputs = page.locator('input[type=file]');
  const n = await inputs.count();
  if (!n) throw new Error(`Tras pulsar «${buttonText}» no se abre selector de archivos ni hay input[type=file]`);
  for (let i = 0; i < n; i++) {
    if (!(await inputs.nth(i).getAttribute('capture'))) { await inputs.nth(i).setInputFiles(file); return 'input[type=file]'; }
  }
  await inputs.first().setInputFiles(file);
  return 'input[type=file] (con capture)';
}

// Espera a que una lectura de foto termine: fichas en #/resultado o el mensaje honesto.
async function waitReading(page, timeout = OCR_TIMEOUT) {
  const t0 = Date.now();
  const statuses = new Set();
  let emptyResultSince = 0;
  for (;;) {
    const st = await page.evaluate(() => ({ hash: location.hash, text: document.body.innerText })).catch(() => ({ hash: '', text: '' }));
    for (const line of st.text.split('\n')) if (/leyendo|procesando|un momento|cargando|analizando|comprimiendo|reconociendo|lector/i.test(line) && line.length < 120) statuses.add(line.trim());
    if (/No he podido leer/i.test(st.text)) {
      const m = st.text.split('\n').find((l) => /No he podido leer/i.test(l));
      return { outcome: 'mensaje', message: m && m.trim(), ms: Date.now() - t0, statuses: [...statuses], hash: st.hash, pills: await pills(page) };
    }
    if (/resultado/.test(st.hash)) {
      const p = await pills(page);
      if (p.length) { await page.waitForTimeout(400); return { outcome: 'fichas', ms: Date.now() - t0, statuses: [...statuses], hash: st.hash, pills: await pills(page) }; }
      emptyResultSince = emptyResultSince || Date.now();
      if (Date.now() - emptyResultSince > 8000) return { outcome: 'resultado-vacio', ms: Date.now() - t0, statuses: [...statuses], hash: st.hash, pills: [], text: short(st.text, 400) };
    }
    if (Date.now() - t0 > timeout) return { outcome: 'timeout', ms: Date.now() - t0, statuses: [...statuses], hash: st.hash, pills: await pills(page), text: short(st.text, 400) };
    await page.waitForTimeout(500);
  }
}

function jpegSize(buf) {
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

async function checkLeerRequests(t) {
  const reqs = t.requests.filter((r) => /\/api\/leer/.test(r.url));
  if (!reqs.length) { t.info('No hubo POST a /api/leer en esta lectura'); return; }
  const statuses = t.events.filter((e) => e.type === 'http' && /\/api\/leer/.test(e.url)).map((e) => e.status);
  t.info('/api/leer', `${reqs.length} petición(es); estados ≥400: ${statuses.join(', ') || 'ninguno'}`);
  const body = parseJSON(reqs[reqs.length - 1].post || '', null);
  if (!body) { t.warn('No pude leer el cuerpo JSON del POST a /api/leer'); return; }
  const keys = Object.keys(body).sort();
  await t.check(keys.every((k) => ['image', 'mediaType', 'mode'].includes(k)), 'Privacidad: el POST a /api/leer solo lleva image, mediaType y mode', 'claves: ' + keys.join(', '));
  await t.check(body.mediaType === 'image/jpeg', 'La foto se envía como JPEG', String(body.mediaType));
  const dims = body.image ? jpegSize(Buffer.from(body.image, 'base64')) : null;
  if (dims) await t.check(Math.max(dims.width, dims.height) <= 1280, 'La foto enviada tiene lado largo ≤ 1280 px', `${dims.width}×${dims.height}, ${Math.round(body.image.length * 0.75 / 1024)} KB`);
}

// ======================================================================
// Escenarios
// ======================================================================

// Estado vacío ilustrado (Lista, Historial, «Lo último»): plato suelto decorativo y la línea literal.
async function emptyArt(page) {
  return page.evaluate(() => {
    const e = document.querySelector('.empty.empty--art');
    if (!e) return null;
    const art = e.querySelector('.empty-art'); const svg = art && art.querySelector('svg');
    return { text: e.innerText.replace(/\s+/g, ' ').trim(), artHidden: art ? art.getAttribute('aria-hidden') : null, svg: !!svg, svgBad: svg ? svg.querySelectorAll('text, tspan, image, foreignObject, style').length : -1, w: svg ? Math.round(svg.getBoundingClientRect().width) : 0 };
  });
}

// Portada (N7/N7b): la mesa decorativa de 12 platos, «Seguir» a la vista sobre el pie y la nota tras el botón.
async function portadaChecks(t, page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2600); // acaba la entrada escalonada de los platos
  const c = await page.evaluate(() => {
    const art = document.querySelector('.cover-art');
    const main = document.querySelector('main');
    const seguir = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Seguir');
    const note = document.querySelector('.disclaimer-note');
    const foot = [...document.querySelectorAll('footer, [role=contentinfo]')][0];
    const sr = seguir && seguir.getBoundingClientRect();
    const fr = foot && foot.getBoundingClientRect();
    const plates = [...document.querySelectorAll('.cover-art .art-plato')];
    const svg = art && art.querySelector('svg');
    return {
      art: !!art, artHidden: art ? art.getAttribute('aria-hidden') : null, nPlates: plates.length,
      opac: plates.map((x) => Number(getComputedStyle(x).opacity)),
      isCover: !!main && main.classList.contains('is-cover'),
      steps: (document.querySelector('.steps-count') || {}).innerText || null,
      bar: document.querySelectorAll('.steps-bar span').length,
      seguir: sr ? { top: Math.round(sr.top), bottom: Math.round(sr.bottom), h: Math.round(sr.height) } : null,
      footTop: fr ? Math.round(fr.top) : null, innerH: innerHeight, innerW: innerWidth,
      noteAfter: !!(seguir && note && (seguir.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING)),
      noteText: note ? note.innerText.replace(/\s+/g, ' ').trim() : null,
      svgText: svg ? svg.querySelectorAll('text, tspan, image, foreignObject, style').length : -1,
      svgW: svg ? Math.round(svg.getBoundingClientRect().width) : 0, artH: art ? Math.round(art.getBoundingClientRect().height) : 0,
      scrollW: document.documentElement.scrollWidth, scrollY: scrollY,
    };
  });
  const L = `Portada ${label}`;
  await t.check(c.art && c.artHidden === 'true', `${L}: .cover-art decorativa (aria-hidden="true")`, JSON.stringify({ art: c.art, h: c.artHidden }));
  await t.check(c.nPlates === 12, `${L}: la mesa tiene 12 .art-plato`, String(c.nPlates));
  await t.check(c.opac.length === 12 && c.opac.every((o) => o > 0.99), `${L}: tras la entrada los 12 platos tienen opacidad 1`, c.opac.join(','));
  await t.check(c.svgText === 0, `${L}: el SVG de la mesa no contiene <text>, <image> ni <foreignObject>`, String(c.svgText));
  await t.check(c.isCover, `${L}: main.is-cover`);
  await t.check(c.steps === 'Paso 1 de 4' && c.bar === 4, `${L}: «Paso 1 de 4» y barra de 4 pasos`, JSON.stringify({ s: c.steps, bar: c.bar }));
  await t.check(!!c.seguir && c.seguir.top >= 0 && c.seguir.bottom <= c.innerH && c.seguir.bottom <= c.footTop, `${L}: «Seguir» dentro del viewport y por encima del pie (sin hacer scroll)`, JSON.stringify({ seguir: c.seguir, footTop: c.footTop, innerH: c.innerH }));
  if (c.seguir) t.info(`${L}: holgura entre «Seguir» y el pie`, `${c.footTop - c.seguir.bottom}px · mesa ${c.svgW}×${c.artH}`);
  await t.check(c.seguir && c.seguir.h >= 47.5, `${L}: «Seguir» ≥ 48 px`, String(c.seguir && c.seguir.h));
  await t.check(c.noteAfter && c.noteText === 'Es una guía orientativa, no una app médica. No hay un médico detrás y no sustituye a tu matrona, a tu ginecólogo ni a tu médico.', `${L}: .disclaimer-note va DESPUÉS de «Seguir» con su texto`, c.noteText);
  await t.check(c.scrollW <= c.innerW + 1, `${L}: sin scroll horizontal`, `${c.scrollW}/${c.innerW}`);
  const f = await footerState(page);
  await t.check(f.found && f.ok, `${L}: pie literal visible y no tapado`, f.found ? JSON.stringify(f.all) : 'no encontrado');
  await t.shot('portada-' + label.replace(/\W+/g, ''));
}

async function s1(t, browser) {
  const { page } = await t.newPage(browser);
  const forms = [];
  const arranque = []; // texto de cada paso del arranque
  const collect = async (step) => { const f = await formTexts(page); forms.push({ step, ...f }); await snap(page, t, step); };
  const stepInfo = async () => page.evaluate(() => ({
    count: (document.querySelector('.steps-count') || {}).innerText || null,
    back: [...document.querySelectorAll('.back-btn')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\s+/g, ' ').trim()),
    h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()),
  }));
  const pieOk = async (label) => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
    const f = await footerState(page);
    await t.check(f.found && f.ok, `${label}: pie literal visible en el viewport y no tapado`, f.found ? JSON.stringify(f.all) : 'no encontrado; parecido: ' + JSON.stringify(f.partial));
  };
  const seguirEnabled = async (n) => {
    const b = await find(page, 'Seguir', { timeout: 2000, loose: false });
    const off = !b || (await b.isDisabled().catch(() => false)) || (await b.getAttribute('aria-disabled')) === 'true';
    await t.check(!off, `Paso ${n}: «Seguir» no se desactiva (sin haber elegido nada)`);
  };

  // --- Paso 1: portada
  await openApp(page, '#/');
  await t.check(/#\/arranque\/1/.test(await waitHash(page, /arranque\/1/)), 'Sin arranque hecho, la app va a #/arranque/1', await getHash(page));
  await t.check(await seen(page, TXT.app), 'Portada: título «¿Puedo comerlo?»');
  await t.check(await seen(page, TXT.portada), 'Portada: texto literal «Para la carta y para el súper…»');
  await t.check(await seen(page, FOOTER), 'Portada: disclaimer literal');
  await t.check(!!(await find(page, 'Seguir', { timeout: 2000, loose: false })), 'Portada: botón «Seguir»');
  await portadaChecks(t, page, '390×844');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(500);
  await portadaChecks(t, page, '360×740');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  let si = await stepInfo();
  await t.check(si.count === 'Paso 1 de 4', 'Portada: «Paso 1 de 4» (.steps-count)', JSON.stringify(si));
  await t.check(si.back.length === 0, 'Portada: sin botón «Atrás»', JSON.stringify(si.back));
  await seguirEnabled(1);
  await pieOk('Paso 1');
  arranque.push(['1', await bodyText(page)]);
  await collect('arranque-1');
  await t.shot('portada');
  await tap(page, 'Seguir');

  // --- Paso 2: alergias e intolerancias
  await t.check(/arranque\/2/.test(await waitHash(page, /arranque\/2/)), 'Paso 2 en #/arranque/2', await getHash(page));
  si = await stepInfo();
  await t.check(si.count === 'Paso 2 de 4', 'Paso 2: «Paso 2 de 4»', JSON.stringify(si));
  await t.check(si.back.length === 1 && /atr[aá]s/i.test(si.back[0]), 'Paso 2: botón «Atrás» (.back-btn)', JSON.stringify(si.back));
  await t.check(si.h1.includes('Alergias e intolerancias'), 'Paso 2: título «Alergias e intolerancias»', JSON.stringify(si.h1));
  for (const a of Object.values(ALERGIAS)) await t.check(!!(await find(page, a, { timeout: 1500, loose: false })), `Paso 2: alergia «${a}»`);
  await t.check(await seen(page, 'Otra cosa que no quieras comer', { timeout: 1500 }), 'Paso 2: campo «Otra cosa que no quieras comer»');
  await seguirEnabled(2);
  await pieOk('Paso 2');
  arranque.push(['2', await bodyText(page)]);
  // «Atrás» vuelve a la portada, y «Seguir» sin elegir nada avanza
  await tap(page, /^atr[aá]s$/i, { loose: false });
  await t.check(/arranque\/1/.test(await waitHash(page, /arranque\/1/)), '«Atrás» del paso 2 vuelve a #/arranque/1', await getHash(page));
  await tap(page, 'Seguir');
  await t.check(/arranque\/2/.test(await waitHash(page, /arranque\/2/)), 'Otra vez en el paso 2', await getHash(page));
  await tap(page, ALERGIAS.leche, { loose: false });
  const free = page.locator('input[name=otra]').filter({ visible: true });
  if (await free.count()) {
    const f = free.first();
    const ml = await f.getAttribute('maxlength');
    await f.fill('x'.repeat(250));
    const len = (await f.inputValue()).length;
    await t.check(ml === '200' && len <= 200, 'Campo «Otra cosa» limitado a 200 caracteres', `maxlength=${ml}, admite ${len}`);
    await f.fill('cilantro');
  } else await t.check(false, 'Paso 2: campo libre corto para «otra cosa»');
  await collect('arranque-2');
  await t.shot('paso-2');
  await tap(page, 'Seguir');
  const pAfter2 = parseJSON((await storage(page))['pc.v1.profile'], {});
  await t.check(JSON.stringify(pAfter2.alergias) === '["leche"]' && pAfter2.otra === 'cilantro', 'Al avanzar del paso 2 se guarda el perfil (leche, cilantro)', JSON.stringify(pAfter2));

  // --- Paso 3: dietas y restricciones
  await t.check(/arranque\/3/.test(await waitHash(page, /arranque\/3/)), 'Paso 3 en #/arranque/3', await getHash(page));
  si = await stepInfo();
  await t.check(si.count === 'Paso 3 de 4', 'Paso 3: «Paso 3 de 4»', JSON.stringify(si));
  await t.check(si.h1.includes('Dietas y restricciones'), 'Paso 3: título «Dietas y restricciones»', JSON.stringify(si.h1));
  for (const d of Object.values(DIETAS)) await t.check(!!(await find(page, d, { timeout: 1500, loose: false })), `Paso 3: opción «${d}»`);
  await seguirEnabled(3);
  await pieOk('Paso 3');
  arranque.push(['3', await bodyText(page)]);
  await tap(page, DIETAS.vegetariana, { loose: false });
  await tap(page, DIETAS.sin_lactosa, { loose: false });
  await collect('arranque-3');
  await t.shot('paso-3');
  await tap(page, 'Seguir');

  // --- Paso 4: privacidad
  await t.check(/arranque\/4/.test(await waitHash(page, /arranque\/4/)), 'Paso 4 en #/arranque/4', await getHash(page));
  si = await stepInfo();
  await t.check(si.count === 'Paso 4 de 4', 'Paso 4: «Paso 4 de 4»', JSON.stringify(si));
  const txt4 = await bodyText(page);
  arranque.push(['4', txt4]);
  await t.check(/semana/i.test(txt4) && /anal[ií]tica/i.test(txt4), 'Privacidad: no pedimos semana ni analíticas', short(txt4, 300));
  await t.check(/m[oó]vil/i.test(txt4) && /cuenta/i.test(txt4), 'Privacidad: se queda en este móvil y no hay cuenta');
  await t.check(/no se guarda/i.test(txt4) && /reglas/i.test(txt4), 'Privacidad: la foto no se guarda; reglas fijas');
  await t.check(await seen(page, FOOTER), 'Paso 4: pie literal');
  await pieOk('Paso 4');
  await collect('arranque-4');
  await t.shot('paso-4');
  const pasoFuera = await page.evaluate(() => { location.hash = '#/arranque/5'; return null; }).then(() => waitHash(page, /arranque\/[1-4]/, 3000));
  await t.check(/arranque\/[1-4]/.test(pasoFuera), 'No existe el paso 5: #/arranque/5 vuelve a un paso válido', pasoFuera);
  await go(page, '#/arranque/4');
  await tap(page, 'Empezar', { loose: false });

  // (c) el arranque no habla de embutidos, jamón ni AESAN
  const malos = arranque.filter(([, tx]) => NO_EMBUTIDOS.test(tx)).map(([n, tx]) => `paso ${n}: «${(tx.match(NO_EMBUTIDOS) || [''])[0]}»`);
  await t.check(malos.length === 0, 'El arranque (4 pasos) no contiene «embutido», «jamón», «AESAN», toxoplasmosis ni «¿Qué has decidido?»', malos.join(' | '));
  await t.check(!arranque.some(([, tx]) => /Solo si van cocinados|Los como, y quiero ver|No quiero comer embutidos/i.test(tx)), 'El arranque no ofrece ninguna de las tres opciones de embutidos');

  await t.check(await seen(page, TXT.inicio, { timeout: 8000 }), 'Tras «Empezar» llega a «¿Qué vas a comer?»', await getHash(page));
  await t.check(/^#\/?$|^$/.test(await getHash(page)), 'Inicio en #/', await getHash(page));
  await t.check(await seen(page, TXT.inicioSub), 'Inicio: subtítulo literal');
  const tiles = await page.locator('a.tile').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute('href'), text: e.innerText.replace(/\s+/g, ' ').trim() })));
  await t.check(tiles.length === 2 && /Comer fuera/.test(tiles[0].text) && tiles[0].href === '#/fuera' && /En el súper/.test(tiles[1].text) && tiles[1].href === '#/super', 'Inicio: dos accesos a.tile «Comer fuera» y «En el súper»', JSON.stringify(tiles));
  await t.check(await seen(page, 'O escribe el plato', { timeout: 1500 }), 'Inicio: «O escribe el plato»');
  await t.check((await page.getByPlaceholder(/Sushi, tortilla, jam[oó]n/i).count()) > 0, 'Inicio: placeholder «Sushi, tortilla, jamón…»');
  await t.shot('inicio');
  const st = await storage(page);
  const prof = parseJSON(st['pc.v1.profile'], {});
  await t.check(JSON.stringify(prof.alergias) === '["leche"]' && prof.otra === 'cilantro' && JSON.stringify([...(prof.dieta || [])].sort()) === '["sin_lactosa","vegetariana"]',
    'Perfil guardado en pc.v1.profile = alergias [leche] / otra «cilantro» / dieta [vegetariana, sin_lactosa]', st['pc.v1.profile']);
  await t.check(Object.keys(st).every((k) => k.startsWith('pc.v1.')), 'Todo lo guardado usa el prefijo pc.v1.', Object.keys(st).join(', '));
  await t.check(st['pc.v1.onboarded'] === 'true', 'pc.v1.onboarded = true tras «Empezar»', String(st['pc.v1.onboarded']));
  await page.reload({ waitUntil: 'load' }); await appReady(page);
  await t.check(!/arranque/.test(await getHash(page)), 'Con el arranque hecho, al recargar no vuelve a pedirlo', await getHash(page));

  // Ajustes también pregunta cosas: se revisan sus campos y que no quede nada de embutidos
  try {
    await tap(page, /ajustes/i);
    await waitHash(page, /ajustes/);
    await collect('ajustes');
    const txtA = await bodyText(page);
    await t.check(!NO_EMBUTIDOS.test(txtA), 'Ajustes no contiene «embutido», «jamón», «AESAN» ni toxoplasmosis', (txtA.match(NO_EMBUTIDOS) || [''])[0]);
  } catch (e) { t.warn('No pude abrir Ajustes desde Inicio para revisar sus campos', e.message); }

  // Revisión: nada clínico
  const bad = [];
  for (const f of forms) {
    for (const i of f.inputs) {
      if (FORBIDDEN.test(i.text)) bad.push(`${f.step}: campo «${i.text}»`);
      if (/^(date|month|week|number|range|datetime-local)$/.test(i.type)) bad.push(`${f.step}: input type=${i.type} («${i.text}»)`);
    }
    for (const q of f.questions) if (FORBIDDEN.test(q)) bad.push(`${f.step}: pregunta «${q}»`);
  }
  const all = forms.flatMap((f) => f.inputs.filter((i) => i.visible).map((i) => `${f.step}: ${i.type} «${short(i.text, 60)}»`));
  t.info('Campos vistos en arranque + ajustes', `${all.length}: ${all.join(' · ')}`);
  t.info('Preguntas vistas', [...new Set(forms.flatMap((f) => f.questions))].join(' · '));
  await t.check(bad.length === 0, 'Ningún campo ni pregunta pide datos clínicos (semana, parto, toxoplasmosis, diabetes, analítica, glucosa, peso, edad)', bad.join(' | '));
}

async function s2(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t);
  // Vacíos ilustrados (todavía sin lista ni historial)
  for (const [hash, plate, literal] of [['#/lista', 'Lista', TXT.listaVacia], ['#/historial', 'Historial', 'Todavía no has consultado nada. Lo que busques o fotografíes aparecerá aquí.']]) {
    await go(page, hash);
    const e = await emptyArt(page);
    await t.check(!!e && e.artHidden === 'true' && e.svg && e.svgBad === 0 && e.w >= 100, `${plate} vacía: .empty.empty--art con .empty-art decorativo (SVG sin <text>/<image>)`, JSON.stringify(e));
    await t.check(!!e && e.text.includes(literal), `${plate} vacía: línea literal «${short(literal, 50)}»`, e && e.text);
    await snap(page, t, plate + '-vacia');
    await t.shot(plate.toLowerCase() + '-vacia');
  }
  await go(page, '#/');
  const eh = await emptyArt(page);
  await t.check(!!eh && /Aqu[ií] ir[aá]n tus [uú]ltimas respuestas\./.test(eh.text) && eh.artHidden === 'true' && eh.svgBad === 0, 'Inicio sin historial: «Lo último» con plato y «Aquí irán tus últimas respuestas.»', JSON.stringify(eh));
  await t.check(await seen(page, /^Lo [uú]ltimo/, { timeout: 1000 }), 'Inicio sin historial: se ve el rótulo «Lo último»');
  await snap(page, t, 'inicio-sin-historial');
  const screens = [
    ['Inicio', async () => { await tapNav(page, 'Inicio'); return /^#\/?$/; }],
    ['Fuera', async () => { await tapNav(page, 'Fuera'); return /#\/fuera/; }],
    ['Súper', async () => { await tapNav(page, 'Súper'); return /#\/super/; }],
    ['Lista', async () => { await tapNav(page, 'Lista'); return /#\/lista/; }],
    ['Ajustes', async () => { await tap(page, /ajustes/i, { loose: false }); return /#\/ajustes/; }],
    ['Buscar', async () => { await tapNav(page, 'Fuera'); await tap(page, 'Buscar un plato'); return /#\/buscar/; }],
    ['Ficha', async () => { await go(page, '#/ficha/tortilla-patata'); return /#\/ficha\/tortilla-patata/; }],
    ['Historial', async () => { await go(page, '#/historial'); return /#\/historial/; }],
  ];
  let historialLink = false;
  for (const [name, nav] of screens) {
    let re;
    try { re = await nav(); } catch (e) { await t.check(false, `${name}: se puede llegar`, e.message); continue; }
    const h = await waitHash(page, re, 4000);
    await t.check(re.test(h), `${name}: ruta ${re.source}`, h);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await snap(page, t, name);
    const f = await footerState(page);
    await t.check(f.found && f.ok, `${name}: pie literal visible en el viewport (arriba)`, f.found ? JSON.stringify(f.all) : 'no encontrado; parecido: ' + JSON.stringify(f.partial));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    const f2 = await footerState(page);
    await t.check(f2.found && f2.ok, `${name}: pie visible también al hacer scroll hasta abajo`, JSON.stringify(f2.all || f2.partial));
    await page.evaluate(() => window.scrollTo(0, 0));
    // N6: solo la ficha (una respuesta) lleva el color; el resto vuelve a crema
    const ts = await settledTone(page, 300);
    if (name === 'Ficha') {
      await checkTone(t, page, 'cuidado', 'Ficha tortilla', ts);
      await t.check(ts.marks >= 1 && ts.marksText === '?', 'Ficha «Con cuidado»: «?» decorativos (#tone span.tm)', `${ts.marks} «${ts.marksText}»`);
    } else await checkTone(t, page, null, name, ts);
    const n = await navState(page);
    const bottom = n.navs.find((x) => x.bottom >= n.innerHeight - 6 && x.top > n.innerHeight * 0.55);
    await t.check(!!bottom && JSON.stringify(bottom.items) === JSON.stringify(NAV), `${name}: navegación inferior con exactamente Inicio, Fuera, Súper, Lista`, JSON.stringify(n.navs));
    await t.check(n.burger.length === 0, `${name}: sin menú hamburguesa`, n.burger.join(', '));
    await t.check(n.name.some((top) => top < 140), `${name}: arriba el nombre «¿Puedo comerlo?»`, JSON.stringify(n.name));
    await t.check(n.ajustes.some((a) => a.top < 140), `${name}: arriba un acceso a Ajustes`, JSON.stringify(n.ajustes));
    if ((name === 'Inicio' || name === 'Ajustes') && n.historial) historialLink = true;
    await t.shot(name);
  }
  if (!historialLink) t.warn('No veo un acceso al Historial ni en Inicio ni en Ajustes (solo por URL #/historial)');
}

// Respuesta de Buscar para un texto: escribe en el campo, envía y devuelve la respuesta principal.
async function askBuscar(page, q) {
  const box = page.locator('#buscar-q');
  await box.fill('');
  await box.fill(q);
  await box.press('Enter');
  await page.waitForTimeout(700);
  return mainPill(page, 4000);
}

async function s3(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t);
  await t.check(await seen(page, 'O escribe el plato', { timeout: 3000 }), 'Inicio: buscador «O escribe el plato»');
  const p1 = await searchFromHome(page, 'sushi');
  await snap(page, t, 'busqueda-sushi');
  await t.check(p1 && p1.label === 'Mejor no', '«sushi» → respuesta principal «Mejor no»', p1 ? `${p1.label} — ${short(p1.card)}` : 'sin respuesta');
  const h1 = await getHash(page);
  await t.check(/^#\/buscar\?q=sushi$/.test(h1), 'Buscar: la URL es #/buscar?q=sushi (sin parámetro g)', h1);
  // estructura nueva de la respuesta
  const est = await page.evaluate(() => {
    const a = document.querySelector('article.answer');
    if (!a) return null;
    const q = (s) => !!a.querySelector(s);
    return { cls: a.className, level: a.dataset.level, word: q('.answer-word'), name: q('.answer-name'), phrase: q('.answer-phrase'), more: q('.more-btn') && q('.more'), nAnswers: document.querySelectorAll('article.answer').length };
  });
  await t.check(!!est && /\blv-no\b/.test(est.cls) && est.level === 'no' && est.word && est.name && est.phrase && est.more && est.nAnswers === 1,
    'Respuesta única: article.answer.lv-no[data-level=no] con .answer-word, .answer-name, .answer-phrase y .more-btn/.more', JSON.stringify(est));
  await t.check(p1 && p1.name === 'Sushi', 'La respuesta nombra lo escrito («Sushi»)', p1 && p1.name);
  // (a) Buscar solo muestra la respuesta
  const tb = await bodyText(page);
  await t.check(!/En la gu[ií]a/i.test(tb), 'Buscar no contiene «En la guía»', short(tb, 200));
  await t.check(!/No aparece/i.test(tb), 'Buscar no contiene el aviso «No aparece…»', short(tb, 200));
  // Los chips de «Para saber más» (N8) viven dentro de «Ver más»; fuera de él no debe haber chips ni pestañas de grupo
  const chips = await page.locator('.chip, .chips, [role=tablist], [role=tab]').evaluateAll((els) => els.filter((e) => !e.closest('.more')).length);
  await t.check(chips === 0, 'Buscar no tiene chips de grupo ni pestañas fuera de «Ver más»', String(chips));
  const grupos = ['Todo', 'Embutidos', 'Lácteos', 'Huevos', 'Carne', 'Pescado', 'En el restaurante', 'Bebidas', 'Supermercado'];
  const filtros = [];
  for (const g of grupos) { if (await page.getByRole('button', { name: new RegExp('^\\s*' + esc(g) + '\\s*$', 'i') }).filter({ visible: true }).count()) filtros.push(g); }
  await t.check(filtros.length === 0, 'Buscar no tiene filtros por grupo (Todo, Embutidos, Lácteos…)', filtros.join(', '));
  await t.check(!/\b\d+ (resultados?|alimentos?|fichas?|coincidencias?)\b/i.test(tb), 'Buscar no muestra contador de resultados', short(tb, 200));
  const nHeads = await page.locator('main h2, [role=main] h2').count();
  t.info('Encabezados h2 en Buscar con respuesta', String(nHeads));
  // «Añadir a la lista» a la vista sin abrir «Ver más»; «Ver la ficha» porque sushi es un único alimento
  await t.check(!!(await find(page, 'Añadir a la lista', { timeout: 1500, loose: false })), '«Añadir a la lista» visible en la respuesta (sin «Ver más»)');
  const verFicha = page.getByRole('link', { name: /^Ver la ficha$/ }).filter({ visible: true });
  await t.check((await verFicha.count()) === 1 && /ficha\/pescado-crudo/.test((await verFicha.first().getAttribute('href')) || ''), '«Ver la ficha» visible (sushi = un único alimento) → #/ficha/pescado-crudo', await verFicha.first().getAttribute('href').catch(() => 'no está'));
  const hist = parseJSON((await storage(page))['pc.v1.history'], []);
  await t.check(hist.some((e) => /sushi/i.test(e.title) && e.via === 'busqueda'), 'La búsqueda «sushi» queda en el historial (via busqueda)', JSON.stringify(hist.map((e) => [e.via, e.title, e.level])));
  await t.shot('sushi');

  await tapNav(page, 'Inicio');
  await waitHash(page, /^#\/?$/, 3000);
  const p2 = await searchFromHome(page, 'tortilla');
  await snap(page, t, 'busqueda-tortilla');
  await t.check(p2 && p2.label === 'Con cuidado', '«tortilla» → respuesta principal «Con cuidado» (sin alergias)', p2 ? `${p2.label} — ${short(p2.card)}` : 'sin respuesta');
  const all = await pills(page);
  t.info('Respuestas tras «tortilla»', all.map((x) => `${x.inLo ? '[Lo último] ' : ''}${x.label}: ${short(x.name + ' · ' + x.phrase, 80)}`).join(' | '));
  await t.shot('tortilla');

  // Pantalla Buscar escribiendo en su propio campo
  await go(page, '#/buscar');
  await t.check(/#\/buscar/.test(await getHash(page)), 'Ruta #/buscar');
  await t.check(await seen(page, 'Escribe un plato, un alimento o una bebida.', { timeout: 1500 }), 'Buscar vacío: línea de ayuda «Escribe un plato, un alimento o una bebida.»');
  const sc = await page.locator('ul.shortcuts a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  await t.check(sc.length === 10, 'Buscar vacío: los 10 atajos (ul.shortcuts a)', sc.join(', '));
  await t.check((await pills(page)).length === 0, 'Buscar vacío: ninguna respuesta');
  await snap(page, t, 'buscar-vacio');
  await t.shot('buscar-vacio');
  const box = page.locator('#buscar-q');
  if (await box.count()) {
    const pc = await askBuscar(page, 'cesar');
    await t.check(pc && pc.label === 'Con cuidado', 'Buscar «cesar» (sin tilde) → «Con cuidado»', pc ? `${pc.label} — ${short(pc.card)}` : 'sin respuesta');
    await t.check(/^#\/buscar\?q=cesar$/.test(await getHash(page)), 'La URL sigue #/buscar?q=cesar', await getHash(page));
    const vf = await page.getByRole('link', { name: /^Ver la ficha$/ }).filter({ visible: true }).first().getAttribute('href').catch(() => null);
    await t.check(/ficha\/ensalada-cesar/.test(vf || ''), '«cesar» → «Ver la ficha» de la Ensalada César', String(vf));
    await snap(page, t, 'buscar-cesar');
    const pj = await askBuscar(page, 'jamon');
    await t.check(pj && pj.label === 'Mejor no', 'Buscar «jamon» (sin tilde) → «Mejor no»', pj ? `${pj.label} — ${short(pj.card)}` : 'sin respuesta');
    const vj = await page.getByRole('link', { name: /^Ver la ficha$/ }).filter({ visible: true }).first().getAttribute('href').catch(() => null);
    await t.check(/ficha\/jamon-curado/.test(vj || ''), '«jamon» → «Ver la ficha» del Jamón curado', String(vj));
    await t.shot('buscar-jamon');

    // (b) sushi flameado: Mejor no, y sin «Ver la ficha» porque suma más de un alimento
    const pf = await askBuscar(page, 'sushi flameado');
    await t.check(pf && pf.label === 'Mejor no', '«sushi flameado» → «Mejor no»', pf ? `${pf.label} — ${short(pf.card)}` : 'sin respuesta');
    await t.check((await page.getByRole('link', { name: /^Ver la ficha$/ }).filter({ visible: true }).count()) === 0, '«sushi flameado» (varios alimentos) no enseña «Ver la ficha»');
    await t.check(!!(await find(page, 'Añadir a la lista', { timeout: 1000, loose: false })), '«sushi flameado»: «Añadir a la lista» sí se ve');
    await snap(page, t, 'buscar-sushi-flameado');
    await t.shot('sushi-flameado');
    // texto sin sentido
    const px = await askBuscar(page, 'xyzzy');
    await t.check(px && px.label === 'No estoy segura', '«xyzzy» → «No estoy segura»', px ? `${px.label} — ${short(px.card)}` : 'sin respuesta');
    await t.check((await page.getByRole('link', { name: /^Ver la ficha$/ }).filter({ visible: true }).count()) === 0, '«xyzzy» no enseña «Ver la ficha»');
    await snap(page, t, 'buscar-xyzzy');
    await t.shot('xyzzy');
    // otras: café con cuidado, cerveza 0,0 sí
    const pcafe = await askBuscar(page, 'café');
    await t.check(pcafe && pcafe.label === 'Sí', 'Buscar «café» → «Sí» (con «Ojo con esto»: moderación)', pcafe ? pcafe.label : 'sin respuesta');
    const pc00 = await askBuscar(page, 'cerveza 0,0');
    await t.check(pc00 && pc00.label === 'Sí', 'Buscar «cerveza 0,0» → «Sí»', pc00 ? pc00.label : 'sin respuesta');
    // «Ver más» en la respuesta: detalle y fuente; el campo vacío vuelve a la ayuda
    await tap(page, 'Ver más');
    const panel = await page.locator('article.answer .more').first().innerText().catch(() => '');
    await t.check(/AESAN|Ministerio de Sanidad|propia app/.test(panel), '«Ver más» en Buscar despliega detalle y fuente', short(panel, 200));
    await box.fill('');
    await page.waitForTimeout(600);
    await t.check((await pills(page)).length === 0 && /Escribe un plato/.test(await bodyText(page)), 'Con el campo vacío vuelve la ayuda y no hay respuesta');
  } else await t.check(false, 'Buscar: campo de texto #buscar-q');

  // Con el Enter en Buscar también se apunta en el historial
  const hist2 = parseJSON((await storage(page))['pc.v1.history'], []);
  await t.check(['cesar', 'jamon', 'sushi flameado', 'xyzzy'].every((q) => hist2.some((e) => e.via === 'busqueda' && e.title === q)), 'Lo enviado con Enter en Buscar queda en el historial', JSON.stringify(hist2.map((e) => e.title)));
}

async function s4(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t);
  await tapNav(page, 'Fuera');
  await t.check(await seen(page, TXT.fuera, { timeout: 3000 }), 'Fuera: texto literal «Foto de la carta, o el plato escrito…»');
  const atajos = ['jamón curado', 'pescado crudo', 'tortilla', 'ensalada César', 'ensaladilla', 'tarta de queso', 'gazpacho', 'mayonesa casera', 'queso blando', 'paella'];
  const sc = await page.locator('ul.shortcuts a').evaluateAll((els) => els.map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href'), h: Math.round(e.getBoundingClientRect().height) })));
  const miss = atajos.filter((a) => !sc.some((x) => norm(x.text) === norm(a)));
  await t.check(sc.length === 10 && miss.length === 0, 'Fuera: los 10 atajos en ul.shortcuts a', 'faltan: ' + miss.join(', ') + ' · hay ' + sc.length);
  await t.check(sc.every((x) => x.h >= 47.5), 'Fuera: cada atajo mide ≥ 48 px', sc.filter((x) => x.h < 47.5).map((x) => `${x.text} ${x.h}`).join(', '));
  await t.check(await page.locator('.chip, .chips').count() === 0, 'Fuera: los atajos no son chips');
  for (const b of ['Hacer una foto', 'Elegir una foto', 'Buscar un plato']) await t.check(!!(await find(page, b, { timeout: 1000 })), `Fuera: botón «${b}»`);
  await snap(page, t, 'fuera');
  await tap(page, 'tortilla', { loose: false });
  await t.check(/#\/ficha\/tortilla-patata/.test(await waitHash(page, /ficha/, 4000)), 'Atajo «tortilla» → #/ficha/tortilla-patata', await getHash(page));
  const p = await mainPill(page);
  await t.check(p && p.label === 'Con cuidado' && p.kind === 'answer', 'Ficha tortilla: respuesta «Con cuidado»', p ? p.label : 'sin respuesta');
  await t.check(p && p.name === 'Tortilla de patata', 'Ficha tortilla: nombre «Tortilla de patata»', p && p.name);
  await t.check(p && p.phrase && !/^con cuidado\s*[:,]/i.test(p.phrase), 'Ficha tortilla: la frase no repite «Con cuidado»', p && p.phrase);
  {
    const ts = await settledTone(page);
    await checkTone(t, page, 'cuidado', 'Ficha tortilla', ts);
    await t.check(ts.wordColor === WORD_CREAM && ts.wordText === 'Con cuidado', 'Ficha tortilla: .answer-word crema con el texto exacto «Con cuidado»', JSON.stringify({ w: ts.wordColor, t: ts.wordText }));
  }
  const srcRe = /AESAN|Ministerio de Sanidad|propia app/;
  const before = await bodyText(page);
  await t.check(!srcRe.test(before.replace(FOOTER, '')), 'Ficha mínima: la fuente no se ve hasta «Ver más»', short(before, 300));
  await t.check(!!(await find(page, 'Añadir a la lista', { timeout: 1500 })) && !!(await find(page, 'Guardar en favoritos', { timeout: 1500 })), 'Ficha: botones «Añadir a la lista» y «Guardar en favoritos»');
  await t.shot('ficha-cerrada');
  try {
    await tap(page, 'Ver más');
    const after = await bodyText(page);
    const add = addedLines(before, after).join(' / ');
    await t.check(add.length > 60 && srcRe.test(add), '«Ver más» despliega detalle y fuente', short(add, 400));
    const preg = await page.evaluate(() => ({ title: (document.querySelector('article.answer .ojo-q-title') || {}).textContent || null, q: (document.querySelector('article.answer .ojo-q') || {}).textContent || null, inMore: (document.querySelector('article.answer .more') || {}).textContent || '' }));
    await t.check(preg.title === 'Pregunta' && /¿[^?]+\?/.test(preg.q || ''), 'La pregunta para el camarero va bajo la frase, en el bloque «Pregunta» (.ojo-q)', JSON.stringify(preg.q));
    await t.check(!!preg.q && !preg.inMore.includes(preg.q.trim()), '…y ya no se repite dentro de «Ver más»', short(preg.inMore, 200));
    await snap(page, t, 'ficha-abierta');
    await t.shot('ficha-ver-mas');
  } catch (e) { await t.check(false, '«Ver más» en la ficha', e.message); }

  await tap(page, 'Añadir a la lista');
  const list = parseJSON((await storage(page))['pc.v1.list'], []);
  await t.check(list.some((e) => e.foodId === 'tortilla-patata'), 'Tras «Añadir a la lista» queda en pc.v1.list', JSON.stringify(list.map((e) => e.title)));
  await tapNav(page, 'Lista');
  await waitHash(page, /lista/, 3000);
  await t.check(await seen(page, /tortilla/i, { timeout: 3000 }), 'Lista: aparece la tortilla');
  const lp = await pills(page);
  const row = lp.find((x) => /tortilla/i.test(x.name));
  await t.check(!!row && row.kind === 'entry' && row.label === 'Con cuidado' && !!row.phrase, 'Lista: la tortilla es una fila ul.entries > li.entry con «Con cuidado» y frase', lp.map((x) => `${x.label}: ${short(x.name + ' · ' + x.phrase, 80)}`).join(' | '));
  await t.check(!!row && row.bg === BAND_BG.cuidado && row.color === LVL_TEXT['Con cuidado'] && contrast(row.color, row.bg) >= 4.5, 'Lista: la fila lleva banda suave de fondo (#f8e2d0) y la palabra en arcilla con contraste ≥ 4,5:1', row ? `${row.bg} / ${row.color} / ${contrast(row.color, row.bg).toFixed(1)}` : 'sin fila');
  await checkTone(t, page, null, 'Lista con filas');
  const q0 = await page.locator('button.quiet-btn').evaluateAll((els) => els.map((e) => ({ aria: e.getAttribute('aria-label'), text: e.innerText.trim(), h: Math.round(e.getBoundingClientRect().height) })));
  await t.check(q0.length === 1 && /^Quitar Tortilla/.test(q0[0].aria || '') && q0[0].text === 'Quitar', '«Quitar»: button.quiet-btn con aria-label «Quitar Tortilla de patata»', JSON.stringify(q0));
  await t.check(q0.every((x) => x.h >= 47.5), '«Quitar» mide ≥ 48 px', JSON.stringify(q0));
  await snap(page, t, 'lista-con-tortilla');
  await page.reload({ waitUntil: 'load' });
  await appReady(page);
  await t.check(/lista/.test(await getHash(page)) && await seen(page, /tortilla/i, { timeout: 4000 }), 'Tras recargar, la tortilla sigue en la Lista', await getHash(page));
  await t.shot('lista-tras-recargar');
  try {
    await page.locator('button.quiet-btn[aria-label^="Quitar"]').first().click();
    await page.waitForTimeout(500);
    const rest = (await pills(page)).filter((x) => /tortilla/i.test(x.name));
    const pl = parseJSON((await storage(page))['pc.v1.list'], []);
    await t.check(rest.length === 0 && !pl.some((e) => e.foodId === 'tortilla-patata'), '«Quitar» elimina la tortilla de la lista (pantalla y pc.v1.list)', rest.map((x) => short(x.card, 80)).join(' | ') + ' · list=' + JSON.stringify(pl.map((e) => e.title)));
    await t.check(await seen(page, TXT.listaVacia, { timeout: 2000 }), 'Lista vacía: texto literal «Todavía no hay nada…»');
    const ea = await emptyArt(page);
    await t.check(!!ea && ea.artHidden === 'true' && ea.svg && ea.svgBad === 0 && ea.text.includes(TXT.listaVacia), 'Lista vacía tras «Quitar»: .empty.empty--art con plato decorativo y la línea literal', JSON.stringify(ea));
    await snap(page, t, 'lista-vacia');
    await t.shot('lista-vacia');
  } catch (e) { await t.check(false, '«Quitar» en la lista', e.message); }
}

// Estado de carga ilustrado: el plato que gira (.status-art, decorativo) y el texto en .status-text; sin .spinner.
async function loadingState(page) {
  return page.evaluate(() => {
    const st = document.querySelector('.status');
    if (!st) return null;
    const art = st.querySelector('.status-art'); const svg = art && art.querySelector('svg');
    const anims = svg ? svg.getAnimations({ subtree: true }).length + (art.getAnimations ? art.getAnimations({ subtree: true }).length : 0) : 0;
    return {
      cls: st.className, role: st.getAttribute('role'), live: st.getAttribute('aria-live'),
      art: !!art, artHidden: art ? art.getAttribute('aria-hidden') : null, svg: !!svg, svgBad: svg ? svg.querySelectorAll('text, tspan, image, foreignObject, style').length : -1,
      text: (st.querySelector('.status-text') || {}).innerText || '', spinners: document.querySelectorAll('.spinner').length, anims,
      artSize: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
      skel: document.querySelectorAll('.status-body .skel').length,
    };
  }).catch(() => null);
}
async function checkLoading(t, page, what) {
  const ld = await page.waitForSelector('.status', { timeout: 4000 }).then(() => loadingState(page)).catch(() => null);
  if (!ld) { t.warn(`${what}: no llegué a ver el estado de carga (lectura demasiado rápida)`); return; }
  await t.check(/\bstatus--art\b/.test(ld.cls) && ld.art && ld.artHidden === 'true' && ld.svg && ld.svgBad === 0, `${what}: .status--art con .status-art decorativo (SVG sin <text>/<image>)`, JSON.stringify(ld));
  await t.check(ld.role === 'status' && ld.live === 'polite' && ld.text.trim().length > 3, `${what}: el texto vive en .status-text dentro de la región viva`, JSON.stringify({ role: ld.role, live: ld.live, text: ld.text }));
  await t.check(ld.spinners === 0, `${what}: ya no existe .spinner`, String(ld.spinners));
  await t.check(ld.skel >= 2, `${what}: dos barras .skel junto al texto`, String(ld.skel));
  t.info(`${what}: plato animado`, `${ld.artSize}px, ${ld.anims} animaciones, texto «${short(ld.text, 50)}»`);
}

// Lee una foto en Fuera y devuelve el resultado.
async function readPhoto(t, page, file) {
  await tapNav(page, 'Fuera');
  await waitHash(page, /fuera/, 3000);
  const how = await chooseFile(page, 'Elegir una foto', file);
  t.info('Foto entregada mediante', how);
  await checkLoading(t, page, 'Leyendo la foto');
  const r = await waitReading(page);
  t.info('Mensajes de progreso vistos', r.statuses.join(' / ') || '(ninguno)');
  const tess = t.requests.filter((x) => /tesseract/i.test(x.url));
  t.info('Peticiones a tesseract (OCR local)', String(tess.length) + (tess[0] ? ' — p. ej. ' + short(tess[0].url, 100) : ''));
  return r;
}

const CARTA_EXPECT = [
  ['Sushi', /sushi/, ['Mejor no']],
  ['Tortilla', /tortilla/, ['Con cuidado']],
  ['Tiramisú', /tiramis/, ['Mejor no']],
  ['Tinto de verano', /tinto de verano/, ['Mejor no']],
  ['Cerveza 0,0', /cerveza/, ['Sí', 'No estoy segura']],
  ['Entrecot poco hecho', /entrecot/, ['Mejor no']],
  ['Ensaladilla', /ensaladilla/, ['Con cuidado']],
  ['Croquetas de jamón', /croqueta/, ['Sí', 'No estoy segura']],
  ['Gazpacho', /gazpacho/, ['Sí', 'No estoy segura']],
  ['Lubina a la plancha', /lubina/, ['Sí', 'No estoy segura']],
  ['Tarta de queso', /tarta de queso/, ['Sí', 'No estoy segura']],
];

async function s5(t, browser) {
  // 5a — carta legible
  const { page } = await t.newPage(browser);
  await seed(page, t);
  const r = await readPhoto(t, page, path.join(FIX, 'carta.jpg'));
  await snap(page, t, 'carta-resultado');
  await t.shot('carta-resultado');
  if (r.outcome === 'fichas') {
    await page.evaluate(() => window.scrollTo(0, 0));
    const fr = await footerState(page);
    await t.check(fr.found && fr.ok, 'Resultado de la carta: pie literal visible (arriba)', fr.found ? JSON.stringify(fr.all) : 'no encontrado');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(200);
    const fr2 = await footerState(page);
    await t.check(fr2.found && fr2.ok, 'Resultado de la carta: pie visible también al hacer scroll hasta abajo', fr2.found ? JSON.stringify(fr2.all) : 'no encontrado');
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  const viaOcr = t.events.some((e) => e.type === 'http' && /\/api\/leer/.test(e.url));
  t.info('Resultado con carta.jpg', `${r.outcome} en ${Math.round(r.ms / 1000)} s; ${viaOcr ? '/api/leer respondió error → OCR local' : 'visión'}`);
  await checkLeerRequests(t);
  await t.check(r.outcome === 'fichas' || r.outcome === 'mensaje', 'carta.jpg → fichas o mensaje honesto', `${r.outcome} ${r.text || ''}`);
  if (r.outcome === 'mensaje') {
    await t.check(r.message === TXT.noLeida, 'Mensaje honesto literal', r.message);
    t.warn('La carta (legible y nítida) no se pudo leer: la usuaria no obtendría fichas', 'OCR local sin resultado útil');
  }
  if (r.outcome === 'fichas') {
    await t.check(await seen(page, TXT.laCarta, { timeout: 1500 }), 'Resultado con título «La carta»');
    await t.check(r.pills.length <= 12, 'Como mucho 12 platos', String(r.pills.length));
    const rise = await page.locator('ul.entries.entries--rise').count();
    await t.check(rise === 1, 'Carta leída: la lista es ul.entries.entries--rise', String(rise));
    const bands = r.pills.filter((x) => x.kind === 'entry' && (x.bg !== BAND_BG[LEVEL_KEY[x.label]] || x.lvCls !== LEVEL_KEY[x.label]));
    await t.check(bands.length === 0, 'Carta: cada fila lleva su banda suave de fondo del nivel', bands.map((x) => `${x.name}: ${x.label} ${x.bg}`).join(' | '));
    const lowc = r.pills.filter((x) => contrast(x.color, x.bg) < 4.5);
    await t.check(lowc.length === 0, 'Carta: la palabra del nivel sobre su banda con contraste ≥ 4,5:1', lowc.map((x) => `${x.name}: ${contrast(x.color, x.bg).toFixed(1)}`).join(' | '));
    await checkTone(t, page, null, 'Carta (varias respuestas)');
    const rw = await page.evaluate(() => { const u = document.querySelector('ul.entries'); const r = u.getBoundingClientRect(); return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(innerWidth - r.right), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    await t.check(rw.sw <= rw.iw + 1 && Math.abs(rw.left - rw.right) <= 2, 'Carta: las filas a sangre caben en 390 px sin scroll horizontal y centradas', JSON.stringify(rw));
    t.info('Filas', r.pills.map((x) => `${x.label}: ${short(x.name + ' · ' + x.phrase, 90)}`).join(' | '));
    await t.check(r.pills.every((x) => x.kind === 'entry' && x.valid && x.lvCls === x.level), 'Carta: cada plato es una fila li.entry.lv-<nivel>[data-level] con .lvl, .entry-name y .entry-phrase', r.pills.filter((x) => !(x.kind === 'entry' && x.valid && x.lvCls === x.level)).map((x) => x.name).join(', '));
    const resumen = await page.locator('.summary .pill').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    await t.check(resumen.length > 0 && resumen.every((x) => /^\d+ (mejor no|con cuidado|no estoy segura|sí)$/.test(x)), 'Carta: el resumen usa .pill con textos como «7 mejor no»', resumen.join(' | '));
    const totalRes = resumen.reduce((a, x) => a + Number(x.split(' ')[0]), 0);
    await t.check(totalRes === r.pills.length, 'Carta: el resumen suma tantos platos como filas', `${totalRes} vs ${r.pills.length}`);
    const rows = [];
    for (const [name, re, ok] of CARTA_EXPECT) {
      const hit = r.pills.find((x) => re.test(norm(x.name)));
      rows.push(`${name} → ${hit ? hit.label : '(no aparece)'}`);
      if (!hit) { t.warn(`No aparece ficha para «${name}»`); continue; }
      const important = CARTA_EXPECT.indexOf(CARTA_EXPECT.find((x) => x[0] === name)) < 6;
      if (important) await t.check(ok.includes(hit.label), `Carta: «${name}» sale ${ok.join(' o ')}`, `${hit.label} — ${short(hit.card)}`);
      else if (!ok.includes(hit.label)) t.warn(`Carta: «${name}» sale «${hit.label}» (esperado ${ok.join(' o ')})`, short(hit.card));
    }
    t.info('Niveles leídos', rows.join(' · '));
    // Carta leída con Claude (producción): ≥ 60 % de las filas reconocidas en «Sí». Con OCR local todo es «aproximado»: no se aplica.
    const sinRuido = r.pills.filter((x) => !/^(entrantes|principales|postres|bebidas|casa marisa|carta del mediodia)\b/.test(norm(x.name)));
    const nSi = sinRuido.filter((x) => x.label === 'Sí').length;
    // La carta de ejemplo incluye a propósito riesgos reales (sushi, entrecot poco hecho, tiramisú, tinto de verano): el 60 %
    // se mide sobre los platos que NO salen «Mejor no».
    const sinRiesgo = sinRuido.filter((x) => x.label !== 'Mejor no');
    if (!viaOcr) await t.check(sinRiesgo.length > 0 && nSi / sinRiesgo.length >= 0.6, 'Carta leída con Claude: al menos el 60 % de las filas sin riesgo real («Mejor no») en «Sí»', `${nSi}/${sinRiesgo.length} (de ${sinRuido.length}): ` + sinRuido.map((x) => x.label[0] + ':' + short(x.name, 18)).join(' | '));
    else t.info('Carta leída con OCR: no se aplica el umbral del 60 % de «Sí»', `${nSi}/${sinRuido.length} en «Sí»`);
    if (viaOcr) {
      const si = r.pills.filter((x) => x.label === 'Sí');
      await t.check(si.length === 0, 'Lectura incierta (OCR): ningún plato queda en «Sí» (baja a «No estoy segura»)', si.map((x) => short(x.card, 80)).join(' | '));
      const unsure = r.pills.filter((x) => x.label === 'No estoy segura');
      const prefixed = unsure.filter((x) => /No estoy segura de la lectura/i.test(x.phrase));
      t.info('Fichas «No estoy segura» con «No estoy segura de la lectura.»', `${prefixed.length}/${unsure.length}`);
    }
    const title = (x) => norm(x.name);
    const noise = r.pills.filter((x) => /^(entrantes|principales|postres|bebidas|casa marisa|carta del mediodia)\b/.test(title(x)) || /^[\d\s,.€]+$/.test(title(x).slice(0, 10)));
    if (noise.length) {
      const lost = CARTA_EXPECT.filter(([, re]) => !r.pills.some((x) => re.test(norm(x.name)))).map(([n]) => n);
      t.warn('Fichas de ruido: el nombre del restaurante / encabezados se leen como platos' + (lost.length ? ` y, con el tope de 12, se pierden platos reales (${lost.join(', ')})` : ''), noise.map((x) => short(x.name, 60)).join(' | '));
    }
    if (r.pills.some((x) => /€|\d+,\d\d/.test(x.name))) t.warn('Algún título de ficha conserva el precio («8,50 €»)');
    const hist = parseJSON((await storage(page))['pc.v1.history'], []);
    await t.check(hist.some((e) => e.via === 'foto'), 'La lectura de la carta queda en el historial (via foto)', JSON.stringify(hist.map((e) => [e.via, e.title])));
  }
  t.result = r;

  // 5b — imagen ilegible: nunca fichas inventadas
  const { page: p2 } = await t.newPage(browser);
  await seed(p2, t);
  const before = t.requests.length;
  const r2 = await readPhoto(t, p2, path.join(FIX, 'ilegible.jpg'));
  await snap(p2, t, 'ilegible');
  await t.shot('ilegible', p2);
  t.info('Resultado con ilegible.jpg', `${r2.outcome} en ${Math.round(r2.ms / 1000)} s`);
  await t.check(r2.outcome === 'mensaje' && r2.message === TXT.noLeida, 'ilegible.jpg → mensaje honesto literal «No he podido leer la carta. Acércala, o escribe el plato.»', `${r2.outcome}: ${r2.message || r2.text || ''}`, p2);
  await t.check(r2.pills.length === 0, 'ilegible.jpg → ninguna ficha inventada', r2.pills.map((x) => `${x.label}: ${short(x.card, 60)}`).join(' | '), p2);
  if (r2.outcome === 'mensaje') {
    const offer = (await find(p2, /escribe el plato|buscar un plato/i, { timeout: 1000 })) || (await p2.getByPlaceholder(/sushi/i).count());
    if (!offer) t.warn('Tras el mensaje honesto no veo a mano «Buscar un plato» o el buscador');
  }
  void before;
}

async function s6(t) {
  const browser = await chromium.launch(launchOpts(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']));
  t.ownBrowser = browser;
  // 6a — con cámara falsa
  const { ctx, page } = await t.newPage(browser);
  await ctx.grantPermissions(['camera'], { origin: BASE });
  await ctx.addInitScript(() => {
    window.__gum = [];
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) { const orig = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__gum.push(JSON.stringify(c)); return orig(c); }; }
  });
  await seed(page, t);
  await tapNav(page, 'Fuera');
  await tap(page, 'Hacer una foto');
  const playing = await page.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => !v.paused && v.readyState >= 2 && v.videoWidth > 0), null, { timeout: 10000 }).then(() => true).catch(() => false);
  await t.check(playing, 'Aparece un vídeo de cámara en reproducción');
  const gum = await page.evaluate(() => window.__gum || []);
  t.info('getUserMedia pedido con', gum.join(' | '));
  await t.check(gum.some((g) => /environment/.test(g)), 'Pide la cámara trasera (facingMode environment)', gum.join(' | '));
  await t.shot('camara-abierta');
  const shutter = (await find(page, /^(hacer la foto|disparar|capturar|tomar (la )?foto|sacar (la )?foto|foto)$/i, { timeout: 1500 }))
    || (await find(page, /hacer una foto/i, { timeout: 1000 }))
    || page.getByRole('button').filter({ hasText: /foto|captur|dispar/i }).filter({ hasNotText: /elegir|usar|galer/i }).filter({ visible: true }).first();
  const shutterOk = shutter && (await shutter.count().catch(() => 0));
  await t.check(!!shutterOk, 'Hay un botón para hacer la foto');
  if (shutterOk) {
    t.info('Botón de disparo', short(await shutter.innerText().catch(() => '?'), 40));
    await clickLoc(shutter);
    await t.check(await seen(page, 'Usar esta foto', { timeout: 6000 }), 'Tras la foto: «Usar esta foto»');
    await t.shot('previsualizacion');
    try {
      await tap(page, 'Usar esta foto', { loose: false });
      const streams = await page.evaluate(() => [...document.querySelectorAll('video')].map((v) => v.srcObject ? v.srcObject.getTracks().map((x) => x.readyState).join(',') : 'sin-stream'));
      if (streams.some((s) => /live/.test(s))) t.warn('La cámara sigue encendida tras «Usar esta foto» (pistas live)', streams.join(' | '));
      const r = await waitReading(page);
      t.info('Lectura de la foto de la cámara falsa', `${r.outcome} en ${Math.round(r.ms / 1000)} s; ${r.message || r.pills.map((x) => x.label + ': ' + short(x.card, 50)).join(' | ')}`);
      await t.check(['mensaje', 'fichas'].includes(r.outcome), 'La foto de la cámara termina en fichas o mensaje honesto', r.outcome + ' ' + (r.text || ''));
      await snap(page, t, 'camara-resultado');
      await t.shot('camara-resultado');
    } catch (e) { await t.check(false, '«Usar esta foto»', e.message); }
  }
  // 6b — sin cámara
  const { page: p2 } = await t.newPage(browser);
  await p2.context().addInitScript(() => {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
  });
  await seed(p2, t);
  await tapNav(p2, 'Fuera');
  const before = await bodyText(p2);
  await tap(p2, 'Hacer una foto');
  await p2.waitForTimeout(1500);
  const after = await bodyText(p2);
  const added = addedLines(before, after);
  t.info('Sin cámara, la app dice', added.join(' / ') || '(nada nuevo)');
  const says = added.some((l) => /c[aá]mara/i.test(l) && /\bno\b|sin /i.test(l));
  await t.check(says, 'Sin cámara: la app dice que no hay cámara', added.join(' / '), p2);
  const gal = (await find(p2, 'Elegir una foto', { timeout: 1000 })) || (await find(p2, /galer[ií]a/i, { timeout: 500 }));
  await t.check(!!gal, 'Sin cámara: ofrece la galería («Elegir una foto»)', '', p2);
  await snap(p2, t, 'sin-camara');
  await t.shot('sin-camara', p2);
}

async function s7(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t, { alergias: ['leche', 'frutos_secos'] });
  // /api/producto simulado (503: sin búsqueda web): ni en local ni en producción se hace ninguna llamada real
  await page.context().route('**/api/producto', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"sin_vision"}' }));
  await tapNav(page, 'Súper');
  await waitHash(page, /super/, 3000);
  await t.check(await seen(page, TXT.super, { timeout: 3000 }), 'Súper: texto literal «El código consulta Open Food Facts…»');
  const atajos = ['atún en lata', 'loncheados', 'queso rallado', 'paté', 'ahumado', 'café', 'alcohol', 'cerveza 0,0'];
  const sc = await page.locator('ul.shortcuts a').evaluateAll((els) => els.map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(e.getBoundingClientRect().height) })));
  const miss = atajos.filter((a) => !sc.some((x) => norm(x.text) === norm(a)));
  await t.check(sc.length === 8 && miss.length === 0, 'Súper: los 8 atajos en ul.shortcuts a', 'faltan: ' + miss.join(', ') + ' · hay ' + sc.length);
  await t.check(sc.every((x) => x.h >= 47.5), 'Súper: cada atajo mide ≥ 48 px', sc.filter((x) => x.h < 47.5).map((x) => `${x.text} ${x.h}`).join(', '));
  await snap(page, t, 'super');

  const codeInput = async () => {
    for (const c of [page.locator('input[inputmode=numeric]'), page.locator('input[type=tel]'), page.locator('input[type=number]'), page.getByLabel(/c[oó]digo|barras|d[ií]gitos/i), page.getByPlaceholder(/c[oó]digo|d[ií]gitos|\d{6,}/i), page.locator('input[type=text], input[type=search], input:not([type])')]) {
      const v = c.filter({ visible: true }); if (await v.count()) return v.first();
    }
    return null;
  };
  const offCount = () => t.requests.filter((r) => /openfoodfacts/.test(r.url)).length;
  const submit = async (code) => {
    const inp = await codeInput();
    if (!inp) throw new Error('No encuentro el campo para teclear el código');
    await inp.fill(code);
    const n0 = offCount();
    await inp.press('Enter').catch(() => {});
    await page.waitForTimeout(1200);
    if (offCount() === n0) {
      const b = await find(page, /^(buscar|consultar|comprobar|ver|mirar|ir|buscar c[oó]digo|consultar c[oó]digo|ver producto)$/i, { timeout: 800 });
      if (b) { await clickLoc(b); await page.waitForTimeout(1200); }
    }
    return inp;
  };

  // Nutella (con la respuesta de OFF retrasada para ver el estado de carga)
  await page.route('**/world.openfoodfacts.org/**', async (route) => { await sleep(4000); route.continue().catch(() => {}); });
  await submit('3017620422003');
  await checkLoading(t, page, 'Buscando en Open Food Facts');
  const gotN = await seen(page, /nutella/i, { timeout: 25000 });
  await t.check(gotN, '3017620422003 → aparece el producto «Nutella» de Open Food Facts', await getHash(page));
  const offReq = t.requests.filter((r) => /openfoodfacts/.test(r.url));
  t.info('Petición a OFF', offReq.map((r) => short(r.url, 140)).join(' | '));
  await t.check(offReq.some((r) => /world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003/.test(r.url)), 'Usa GET world.openfoodfacts.org/api/v2/product/{code}');
  await page.unroute('**/world.openfoodfacts.org/**').catch(() => {});
  const p = await mainPill(page);
  {
    const ts = await settledTone(page);
    await checkTone(t, page, 'no', 'Producto Nutella', ts);
    await t.check(ts.wordColor === WORD_CREAM && ts.wordText === 'Mejor no', 'Producto Nutella: .answer-word crema con el texto exacto «Mejor no»', JSON.stringify({ w: ts.wordColor, t: ts.wordText }));
  }
  await t.check(p && p.label === 'Mejor no' && p.kind === 'answer' && p.lvCls === 'no', 'Nutella con leche y frutos secos marcados → respuesta «Mejor no» (article.answer.lv-no)', p ? `${p.label} — ${short(p.card)}` : 'sin respuesta');
  await t.check(p && /nutella/i.test(p.name), 'La respuesta lleva el nombre del producto (.answer-name)', p && p.name);
  await t.check(p && /^Has marcado/.test(p.phrase), 'La frase de la respuesta empieza por «Has marcado…»', p && p.phrase);
  const txt = await bodyText(page);
  await t.check(/Has marcado/.test(txt), 'Aparece «Has marcado…»', short(txt, 300));
  await t.check(!!(await find(page, 'Añadir a la lista', { timeout: 1500, loose: false })), 'Producto: «Añadir a la lista» visible en la respuesta');
  const hm = (txt.match(/Has marcado[^.\n]*\./g) || []);
  t.info('Frase de alergia', hm.join(' '));
  await t.check(hm.some((x) => /leche|frutos secos/i.test(x)), '«Has marcado» nombra leche o frutos secos', hm.join(' '));
  await snap(page, t, 'nutella');
  await t.shot('nutella');
  const hist = parseJSON((await storage(page))['pc.v1.history'], []);
  await t.check(hist.some((e) => e.via === 'codigo'), 'La consulta por código queda en el historial (via codigo)', JSON.stringify(hist.map((e) => [e.via, e.title])));
  const leak = t.requests.filter((r) => isThirdParty(r.url) && /frutos_secos|alergi|leche/i.test(decodeURIComponent(r.url) + (r.post || '')));
  await t.check(leak.length === 0, 'Privacidad: ninguna petición a terceros lleva las alergias', leak.map((r) => short(r.url, 100)).join(' | '));

  // Código inexistente
  await tapNav(page, 'Súper');
  await waitHash(page, /super/, 3000);
  await submit('8410014312203');
  await page.waitForTimeout(1500);
  const nf = await seen(page, /no (est[aá]|aparece|lo (encuentro|tengo|he encontrado)|figura|hay datos|sale)|sin datos|no encontrad/i, { timeout: 15000 });
  const txtNf = await bodyText(page);
  await t.check(nf, '8410014312203 → dice que no está', short(txtNf, 300));
  await t.check(txtNf.includes('No lo encuentro. Fotografía los ingredientes y lo miro por ti.') && !/No está en Open Food Facts/.test(txtNf), '…con el texto literal «No lo encuentro. Fotografía los ingredientes y lo miro por ti.»', short(txtNf, 300));
  const offer = await find(page, /etiqueta|ingredientes/i, { timeout: 2000 });
  await t.check(!!offer && /foto|fotograf|etiqueta/i.test(txtNf), '…y ofrece fotografiar los ingredientes', short(txtNf, 300));
  await t.check(!!(await find(page, 'Fotografiar los ingredientes', { timeout: 1000, loose: false })), '…con el botón «Fotografiar los ingredientes»');
  await snap(page, t, 'no-encontrado');
  await t.shot('no-encontrado');

  // Etiqueta (opcional)
  if (offer) {
    try {
      const fcP = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
      await clickLoc(offer);
      let fc = await fcP;
      let how = 'filechooser';
      if (!fc) {
        if (await find(page, 'Elegir una foto', { timeout: 8000 })) how = await chooseFile(page, 'Elegir una foto', path.join(FIX, 'etiqueta.jpg'));
        else throw new Error('la oferta de etiqueta no abre selector ni muestra «Elegir una foto»');
      } else await fc.setFiles(path.join(FIX, 'etiqueta.jpg'));
      t.info('Etiqueta entregada mediante', how);
      const r = await waitReading(page);
      await snap(page, t, 'etiqueta');
      await t.shot('etiqueta');
      const lp = r.pills;
      t.info('Etiqueta (opcional)', `${r.outcome} en ${Math.round(r.ms / 1000)} s; ${r.message || lp.map((x) => x.label + ': ' + short(x.card, 100)).join(' | ')}`);
      if (r.outcome === 'fichas') {
        if (lp.length === 1) {
          const ts = await settledTone(page);
          await t.check(ts.verdict === LEVEL_KEY[lp[0].label] && ts.bg === TONE_BG[ts.verdict], 'Etiqueta de un solo plato: pantalla entera del color de su veredicto', JSON.stringify({ lvl: lp[0].label, v: ts.verdict, bg: ts.bg, meta: ts.meta }));
        }
        const lc = await page.locator('section.label-check li.check-row').count();
        t.info('Foto de los ingredientes (sin producto): filas de «Lo que he mirado en la etiqueta»', String(lc));
        if (!(lp[0] && lp[0].label === 'Mejor no' && /Has marcado/.test(lp[0].phrase))) t.warn('Queso fresco con alergia a la leche no sale «Mejor no» con «Has marcado…»', lp.map((x) => x.label + ': ' + short(x.card, 100)).join(' | '));
      } else if (r.outcome !== 'mensaje') t.warn('La lectura de la etiqueta no termina ni en fichas ni en mensaje', r.outcome);
    } catch (e) { t.warn('Flujo de etiqueta (opcional) no completado', e.message); }
  }

  // Código corto: validación sin petición
  await go(page, '#/super');
  await page.waitForTimeout(500);
  const n0 = offCount();
  const before = await bodyText(page);
  const inp = await submit('12345');
  await page.waitForTimeout(800);
  const after = await bodyText(page);
  const added = addedLines(before, after);
  const vm = await inp.evaluate((el) => ({ msg: el.validationMessage, invalid: el.getAttribute('aria-invalid') })).catch(() => ({}));
  t.info('Con 12345 la app muestra', (added.join(' / ') || '(nada nuevo)') + (vm.msg ? ` · validationMessage: ${vm.msg}` : ''));
  await t.check(offCount() === n0, '12345 (5 dígitos) → ninguna petición a Open Food Facts', String(offCount() - n0));
  await t.check(added.some((l) => /d[ií]gito|c[oó]digo|8|14/i.test(l)) || !!vm.msg || vm.invalid === 'true', '12345 → mensaje de validación', added.join(' / '));
  await t.shot('codigo-corto');
}

async function s8(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t);
  await go(page, '#/ficha/tortilla-patata');
  await tap(page, 'Añadir a la lista');
  try { await tap(page, 'Guardar en favoritos'); } catch (e) { t.warn('No pude pulsar «Guardar en favoritos»', e.message); }
  await tapNav(page, 'Inicio');
  await searchFromHome(page, 'sushi');
  const st0 = await storage(page);
  t.info('Claves antes de recargar', Object.keys(st0).join(', '));
  await page.reload({ waitUntil: 'load' });
  await appReady(page);
  await tapNav(page, 'Lista');
  await t.check(await seen(page, /tortilla/i, { timeout: 4000 }), 'Tras recargar: la lista conserva la tortilla');
  await t.check(await seen(page, 'Favoritos', { timeout: 1500 }), 'Tras recargar: la lista muestra «Favoritos» con la tortilla guardada');
  await tapNav(page, 'Inicio');
  await waitHash(page, /^#\/?$/, 3000);
  await t.check(await seen(page, /^Lo [uú]ltimo/, { timeout: 3000 }), 'Tras recargar: Inicio muestra «Lo último»');
  const lo = (await pills(page)).filter((x) => x.inLo);
  await t.check(lo.length >= 1 && lo.length <= 3 && lo.every((x) => x.kind === 'entry' && x.valid), '«Lo último» con 1–3 filas (li.entry) con su palabra de nivel', lo.map((x) => `${x.label}: ${short(x.name, 50)}`).join(' | '));
  const loLinks = await page.locator('section[aria-labelledby="lo-ultimo"] ul.entries a.entry-link').count();
  await t.check(loLinks === lo.length, '«Lo último»: cada fila es un enlace', `${loLinks}/${lo.length}`);
  await snap(page, t, 'inicio-lo-ultimo');
  await t.shot('inicio-lo-ultimo');
  await go(page, '#/historial');
  await t.check(await seen(page, /sushi/i, { timeout: 3000 }) && await seen(page, /tortilla/i, { timeout: 1000 }), 'Historial: sushi (búsqueda) y tortilla (ficha)');
  const hp = await pills(page);
  await t.check(hp.length >= 2 && hp.every((x) => x.valid), 'Historial con la palabra de nivel en cada fila', String(hp.length));
  const htxt = await bodyText(page);
  await t.check(/Ficha · /.test(htxt) && /B[uú]squeda · /.test(htxt) && !/Gu[ií]a · /.test(htxt), 'Historial: etiqueta «Ficha» (no «Guía») y «Búsqueda»', short(htxt, 300));
  await snap(page, t, 'historial');
  const st = await storage(page);
  await t.check(parseJSON(st['pc.v1.list'], []).length >= 1 && parseJSON(st['pc.v1.history'], []).length >= 2, 'pc.v1.list y pc.v1.history persisten tras recargar');

  // Ajustes permite cambiar todo; un cambio de alergia se aplica al motor
  await tap(page, /ajustes/i, { loose: false });
  await waitHash(page, /ajustes/, 3000);
  const miss = [];
  for (const x of [...Object.values(ALERGIAS), ...Object.values(DIETAS), 'Otra cosa que no quieras comer']) if (!(await find(page, x, { timeout: 400, loose: false }))) miss.push(x);
  await t.check(miss.length === 0, 'Ajustes permite cambiar alergias, «Otra cosa que no quieras comer» y dietas', 'faltan: ' + miss.join(', '));
  const aj = await page.evaluate(() => ({
    h2: [...document.querySelectorAll('h2')].map((x) => x.innerText.trim()),
    legends: [...document.querySelectorAll('legend')].map((x) => x.innerText.trim()),
  }));
  for (const hh of ['Historial', 'En la pantalla de inicio', 'Tus datos']) await t.check(aj.h2.includes(hh), `Ajustes: h2 «${hh}»`, JSON.stringify(aj.h2));
  await t.check(aj.legends.includes('Dietas y restricciones'), 'Ajustes: leyenda «Dietas y restricciones»', JSON.stringify(aj.legends));
  await snap(page, t, 'ajustes');
  await t.shot('ajustes');
  try {
    await tap(page, ALERGIAS.huevo, { loose: false });
    await tap(page, 'Guardar', { loose: false });
    await t.check(await seen(page, 'Guardado. Las respuestas ya usan estos ajustes.', { timeout: 2000 }), 'Ajustes: «Guardado. Las respuestas ya usan estos ajustes.»');
    await page.waitForTimeout(300);
    const prof = parseJSON((await storage(page))['pc.v1.profile'], {});
    await t.check((prof.alergias || []).includes('huevo'), 'Ajustes: marcar «Huevo» se guarda en el perfil', JSON.stringify(prof));
    await go(page, '#/ficha/tortilla-patata');
    const p = await mainPill(page);
    await t.check(p && p.label === 'Mejor no' && /Has marcado huevo/i.test(p.phrase), 'Con alergia a huevo, la ficha de tortilla pasa a «Mejor no» con «Has marcado huevo.»', p ? `${p.label} — ${short(p.card)}` : 'sin respuesta');
    await go(page, '#/buscar?q=tortilla');
    const pb = await mainPill(page);
    await t.check(pb && pb.label === 'Mejor no' && /Has marcado huevo/i.test(pb.phrase), 'Con alergia a huevo, Buscar «tortilla» → «Mejor no» con «Has marcado huevo.»', pb ? `${pb.label} — ${short(pb.card)}` : 'sin respuesta');
    await tapNav(page, 'Lista');
    const lp = (await pills(page)).find((x) => /tortilla/i.test(x.name));
    await t.check(!!lp && lp.label === 'Mejor no', 'La lista recalcula el semáforo de la tortilla con el perfil nuevo (alergia a huevo)', lp ? `${lp.label} — ${short(lp.card)}` : 'no está');
  } catch (e) { await t.check(false, 'Cambiar una alergia en Ajustes', e.message); }

  // Borrar los datos de este móvil
  await go(page, '#/ajustes');
  await page.waitForTimeout(300);
  await tap(page, TXT.borrar);
  await page.waitForTimeout(800);
  if (!/arranque/.test(await getHash(page))) {
    const confirmBtn = await find(page, /^(s[ií],? borrar( todo| los datos)?|borrar( todo| datos)?|confirmar|aceptar|s[ií])$/i, { timeout: 2500 });
    if (confirmBtn) { t.info('Confirmación propia', short(await confirmBtn.innerText().catch(() => ''), 40)); await clickLoc(confirmBtn); }
  }
  const h = await waitHash(page, /arranque\/1/, 5000);
  await t.check(/arranque\/1/.test(h), 'Tras borrar, vuelve al arranque (#/arranque/1)', h);
  await t.check(await seen(page, TXT.portada, { timeout: 3000 }), 'Tras borrar se ve la portada');
  const keys = Object.keys(await storage(page)).filter((k) => k.startsWith('pc.'));
  await t.check(keys.length === 0, 'Tras borrar no queda ninguna clave pc.* en localStorage', keys.join(', '));
  await t.shot('tras-borrar');
  await page.reload({ waitUntil: 'load' });
  await appReady(page);
  await t.check(/arranque\/1/.test(await getHash(page)), 'Tras borrar y recargar sigue en el arranque', await getHash(page));
  const keys2 = Object.keys(await storage(page)).filter((k) => k.startsWith('pc.'));
  if (keys2.length) t.info('Claves que la app vuelve a crear al cargar el arranque', keys2.join(', '));
}

// N6: transiciones de color en Buscar mientras se escribe, atrás/adelante y reduced-motion.
async function transicionesDeColor(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t);
  await go(page, '#/');
  await checkTone(t, page, null, 'Inicio');
  await go(page, '#/buscar');
  await checkTone(t, page, null, 'Buscar sin respuesta');
  const box = page.locator('#buscar-q');
  const seq = [['sushi', 'no', 'Mejor no'], ['lubina a la plancha', 'si', 'Sí'], ['tortilla', 'cuidado', 'Con cuidado'], ['xyzzy', 'duda', 'No estoy segura']];
  for (const [q, key, label] of seq) {
    await box.fill(q);
    await page.waitForTimeout(450); // debounce de 180 ms
    const early = await toneState(page);
    await t.check(early.verdict === key && early.meta === TONE_META[key], `Buscar «${q}»: data-verdict y theme-color cambian de inmediato (sin esperar al fundido)`, JSON.stringify({ v: early.verdict, meta: early.meta }));
    const st = await settledTone(page);
    await checkTone(t, page, key, `Buscar «${q}»`, st);
    await t.check(st.wordText === label && st.wordColor === WORD_CREAM, `Buscar «${q}»: .answer-word «${label}» en crema`, JSON.stringify({ w: st.wordText, c: st.wordColor }));
    const wantMarks = key === 'cuidado' ? [1, 3] : key === 'duda' ? [3, 8] : [0, 0];
    await t.check(st.marks >= wantMarks[0] && st.marks <= wantMarks[1] && (st.marks === 0 || st.marksText === '?'), `Buscar «${q}»: «?» decorativos solo con cuidado/duda (aquí ${wantMarks[0] === 0 ? 'ninguno' : wantMarks[0] + '–' + wantMarks[1]})`, `${st.marks} «${st.marksText}»`);
    await snap(page, t, 'buscar-tono-' + key);
    await t.shot('tono-' + key);
  }
  await box.fill('');
  await page.waitForTimeout(450);
  const e2 = await toneState(page);
  await t.check(e2.verdict === null && e2.meta === CREAM_HEX, 'Buscar vacío: se quita data-verdict y theme-color vuelve a #f3eee6 de inmediato', JSON.stringify({ v: e2.verdict, meta: e2.meta }));
  await checkTone(t, page, null, 'Buscar vacío tras la secuencia', await settledTone(page));
  await t.check((await pills(page)).length === 0, 'Buscar vacío: ya no hay respuesta');

  // Atrás / adelante
  await go(page, '#/');
  await go(page, '#/ficha/agua'); await page.waitForTimeout(TONE_WAIT);
  await go(page, '#/ficha/tortilla-patata'); await page.waitForTimeout(TONE_WAIT);
  const stepHist = async (dir, level, what) => {
    await page.evaluate((d) => (d < 0 ? history.back() : history.forward()), dir);
    await page.waitForTimeout(TONE_WAIT);
    await checkTone(t, page, level, what);
  };
  await stepHist(-1, 'si', 'Atrás a la ficha del agua');
  await stepHist(-1, null, 'Atrás a Inicio');
  await stepHist(1, 'si', 'Adelante a la ficha del agua');
  await stepHist(1, 'cuidado', 'Adelante a la ficha de la tortilla');
  await go(page, '#/lista'); await page.waitForTimeout(TONE_WAIT);
  await checkTone(t, page, null, 'De una ficha de color a Lista');

  // prefers-reduced-motion: cambio instantáneo y ninguna animación
  const { page: rp } = await t.newPage(browser, { reducedMotion: 'reduce' });
  await seed(rp, t);
  t.info('reduced-motion emulado', String(await rp.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)));
  const running = () => rp.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'pending').map((a) => (a.animationName || a.transitionProperty || a.constructor.name) + '@' + ((a.effect && a.effect.target && (a.effect.target.id || String(a.effect.target.className || '').slice(0, 20))) || '?')));
  await go(rp, '#/ficha/pescado-crudo');
  await rp.waitForTimeout(150);
  const r1 = await toneState(rp);
  await t.check(r1.verdict === 'no' && r1.bg === TONE_BG.no && r1.meta === TONE_META.no, 'Reduced-motion: la ficha toma el color al instante (sin esperar 0,5 s)', JSON.stringify({ v: r1.verdict, bg: r1.bg }));
  const an = await running();
  await t.check(an.length === 0, 'Reduced-motion: ninguna animación ni transición en marcha en la pantalla de color', an.join(', '));
  await go(rp, '#/ficha/tortilla-patata');
  await rp.waitForTimeout(150);
  const r2 = await toneState(rp);
  await t.check(r2.verdict === 'cuidado' && r2.bg === TONE_BG.cuidado && r2.marks >= 1, 'Reduced-motion: de un color a otro al instante y con los «?» ya puestos', JSON.stringify({ v: r2.verdict, bg: r2.bg, marks: r2.marks }));
  await go(rp, '#/');
  await rp.waitForTimeout(150);
  const r3 = await toneState(rp);
  await t.check(r3.verdict === null && r3.bg === CREAM_RGB && r3.meta === CREAM_HEX && r3.marks === 0, 'Reduced-motion: de vuelta a Inicio, crema al instante', JSON.stringify({ v: r3.verdict, bg: r3.bg }));
  // portada con reduced-motion: los 12 platos a la vista desde el primer momento y 0 animaciones
  const { page: cp } = await t.newPage(browser, { reducedMotion: 'reduce' });
  await openApp(cp, '#/');
  await cp.waitForTimeout(250);
  const cov = await cp.evaluate(() => ({ n: document.querySelectorAll('.cover-art .art-plato').length, op: [...document.querySelectorAll('.cover-art .art-plato')].map((x) => Number(getComputedStyle(x).opacity)), anims: document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'pending').length }));
  await t.check(cov.n === 12 && cov.op.every((o) => o === 1) && cov.anims === 0, 'Portada con reduced-motion: 12 .art-plato con opacidad 1 y 0 animaciones', JSON.stringify({ n: cov.n, op: cov.op.join(','), anims: cov.anims }), cp);
  await t.shot('portada-reduced', cp);
  // sin reduced-motion los platos entran escalonados (hay animación al principio y todo acaba a la vista)
  const { page: np } = await t.newPage(browser);
  await openApp(np, '#/');
  const anims0 = await np.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  t.info('Portada con movimiento: animaciones en marcha al abrir', String(anims0));
  await t.check(anims0 > 0, 'Portada sin reduced-motion: los platos entran con animación', String(anims0), np);
}

// Colores y listas a 360×740 (móvil pequeño): nada se corta ni se solapa con el pie.
async function colorEnPantalla360(t, browser) {
  const { page } = await t.newPage(browser, { viewport: { width: 360, height: 740 } });
  await seed(page, t);
  const problems = [];
  const measure = async (what, tone) => {
    await page.waitForTimeout(TONE_WAIT);
    const b = await buttonSizes(page);
    const bad = b.buttons.filter((x) => x.h < 47.5 && x.kind !== 'opcion' && x.kind !== 'enlace-texto');
    const f = await footerState(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(200);
    const f2 = await footerState(page);
    const over = await page.evaluate(() => {
      const foot = document.querySelector('footer, [role=contentinfo]'); const top = foot ? foot.getBoundingClientRect().top : innerHeight;
      const els = [...document.querySelectorAll('main a, main button, main h1, main p, main .answer-word')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const last = els.map((e) => e.getBoundingClientRect().bottom).reduce((a, c) => Math.max(a, c), 0);
      // lo decorativo (ilustración, destellos, «?», cruz) puede asomar: se recorta con overflow-x: clip; lo que cuenta es el scroll y el texto
      const wide = [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1) && !e.closest('.cover-art, #tone, .answer-art, .answer-fx, .entry-thumb, .home-plate, svg') && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden=true]'); }).map((e) => e.tagName + '.' + String(e.className).slice(0, 20));
      const w = document.querySelector('.answer-word'); let word = 0;
      if (w) { const rg = document.createRange(); rg.selectNodeContents(w); const rr = rg.getBoundingClientRect(); word = Math.max(0, Math.round(rr.right - innerWidth), Math.round(-rr.left)); }
      return { lastBottom: Math.round(last), footTop: Math.round(top), wide: wide.slice(0, 4), word };
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (b.scrollW > b.innerW + 1) problems.push(`${what}: scroll horizontal ${b.scrollW}`);
    if (bad.length) problems.push(`${what}: controles < 48 px: ${bad.map((x) => x.text + ' ' + x.h).join(', ')}`);
    if (!(f.found && f.ok && f2.found && f2.ok)) problems.push(`${what}: pie no visible`);
    if (over.lastBottom > over.footTop + 1) problems.push(`${what}: contenido tapado por el pie (${over.lastBottom} > ${over.footTop})`);
    if (over.wide.length) problems.push(`${what}: desborda por la derecha: ${over.wide.join(', ')}`);
    if (over.word > 1) problems.push(`${what}: la palabra del nivel desborda ${over.word}px`);
    if (tone) { const st = await toneState(page); if (st.bg !== TONE_BG[tone]) problems.push(`${what}: fondo ${st.bg}`); }
    await t.shot('360-' + slug(what));
    await snap(page, t, '360-' + what);
  };
  await go(page, '#/'); await measure('inicio', null);
  await go(page, '#/ficha/agua'); await measure('ficha si', 'si');
  await go(page, '#/ficha/tortilla-patata'); await measure('ficha cuidado', 'cuidado');
  await go(page, '#/ficha/pescado-crudo'); await measure('ficha no', 'no');
  await go(page, '#/buscar?q=xyzzy'); await measure('buscar duda', 'duda');
  await go(page, '#/buscar?q=' + encodeURIComponent('gulas con gambas y jamon serrano al ajillo y un poco de vino')); await measure('buscar largo', null);
  await tap(page, 'Ver más'); await measure('buscar largo con ver más', null);
  await page.evaluate(() => {
    const items = ['Sushi variado', 'Tortilla de patata', 'Tiramisú casero', 'Tinto de verano', 'Cerveza 0,0', 'Entrecot poco hecho al punto con salsa de roquefort y patatas', 'Lubina a la plancha', 'Croquetas de jamón'].map((n) => ({ name: n, ingredients: [], uncertain: false }));
    localStorage.setItem('pc.v1.result', JSON.stringify({ title: 'La carta', via: 'foto', items: [], notice: null, payload: { kind: 'carta', items } }));
  });
  await go(page, '#/resultado'); await measure('carta', null);
  await go(page, '#/ficha/tortilla-patata'); await tap(page, 'Añadir a la lista');
  await go(page, '#/lista'); await measure('lista con fila', null);
  await go(page, '#/historial'); await measure('historial con filas', null);
  await go(page, '#/ajustes'); await measure('ajustes', null);
  await t.check(problems.length === 0, 'A 360×740: respuestas de cada color, carta, lista e historial sin desbordes, sin scroll horizontal, controles ≥ 48 px y nada tapado por el pie', problems.join(' | '));
}

async function s9(t, browser) {
  const { page } = await t.newPage(browser);
  const sizes = [];
  const measure = async (screen) => {
    await page.waitForTimeout(300);
    const b = await buttonSizes(page);
    sizes.push({ screen, ...b });
  };
  // Arranque por la interfaz (para medir sus botones)
  await openApp(page, '#/');
  const base = await page.evaluate(async () => {
    await document.fonts.ready;
    const b = getComputedStyle(document.body); const h = document.querySelector('h1');
    return {
      bodySize: b.fontSize, bodyFamily: b.fontFamily, bodyBg: b.backgroundColor, htmlBg: getComputedStyle(document.documentElement).backgroundColor, color: b.color,
      h1Family: h ? getComputedStyle(h).fontFamily : null, h1Size: h ? getComputedStyle(h).fontSize : null,
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
      viewport: document.querySelector('meta[name=viewport]')?.content || null,
    };
  });
  t.info('Estilos base', JSON.stringify(base));
  await t.check(base.bodySize === '18px', 'font-size del body = 18px', base.bodySize);
  await t.check(/Source Sans 3/i.test(base.bodyFamily || ''), 'body usa Source Sans 3', base.bodyFamily);
  await t.check(/Fraunces/i.test(base.h1Family || ''), 'h1 usa Fraunces', base.h1Family);
  const loaded = new Set(base.loaded);
  if (![...loaded].some((f) => /Fraunces/.test(f)) || ![...loaded].some((f) => /Source Sans 3/.test(f))) t.warn('Fuentes declaradas pero no cargadas (¿red?)', [...loaded].join(', ') || 'ninguna');
  else t.info('Fuentes cargadas de verdad', [...loaded].join(', '));
  await t.check([base.bodyBg, base.htmlBg].includes('rgb(243, 238, 230)'), 'Fondo crema #f3eee6', `body ${base.bodyBg}, html ${base.htmlBg}`);
  await t.check(base.color === 'rgb(36, 31, 26)', 'Tinta #241f1a', base.color);
  if (parseFloat(base.h1Size) < 28) t.warn('Títulos poco grandes', base.h1Size);
  await t.check(!!base.viewport && /width=device-width/.test(base.viewport), '<meta name=viewport> con width=device-width', base.viewport);
  const seguir = await find(page, 'Seguir', { timeout: 3000, loose: false });
  if (seguir) {
    const bg = await seguir.evaluate((el) => getComputedStyle(el).backgroundColor);
    await t.check(bg === 'rgb(36, 84, 67)', 'Botón principal en salvia #245443', bg);
  }
  await measure('arranque-1');
  try {
    await tap(page, 'Seguir'); await measure('arranque-2');
    await tap(page, 'Seguir'); await measure('arranque-3');
    await tap(page, 'Seguir'); await measure('arranque-4');
    await tap(page, 'Empezar');
  } catch (e) { t.warn('No pude recorrer el arranque para medir botones', e.message); await seed(page, t); }
  for (const [screen, hash] of [['inicio', '#/'], ['fuera', '#/fuera'], ['super', '#/super'], ['lista', '#/lista'], ['buscar', '#/buscar'], ['ajustes', '#/ajustes'], ['historial', '#/historial']]) {
    await go(page, hash); await measure(screen);
  }
  await go(page, '#/ficha/tortilla-patata');
  try { await tap(page, 'Ver más'); } catch { /* medido igual */ }
  await measure('ficha');

  const bad = []; const badOpt = []; const radii = new Set(); const hscroll = [];
  for (const s of sizes) {
    if (s.scrollW > s.innerW + 1) hscroll.push(`${s.screen}: ${s.scrollW}px`);
    for (const b of s.buttons) {
      if (b.kind !== 'opcion' && b.kind !== 'enlace-texto') radii.add(b.radius);
      if (b.h < 47.5) (b.kind === 'opcion' || b.kind === 'enlace-texto' ? badOpt : bad).push(`${s.screen}: ${b.kind} «${b.text}» ${b.h}px`);
    }
  }
  await t.check(bad.length === 0, 'Botones y enlaces-botón visibles ≥ 48 px de alto', [...new Set(bad)].join(' | '));
  if (badOpt.length) t.warn('Opciones (casillas) o enlaces de texto de menos de 48 px', [...new Set(badOpt)].join(' | '));
  t.info('border-radius de botones', [...radii].join(', '));
  await t.check(hscroll.length === 0, 'Sin scroll horizontal a 390 px', hscroll.join(' | '));

  // N6: la pantalla de UNA respuesta toma el color en el fondo; la palabra (crema) conserva su texto exacto
  const fichaTone = [['agua', 'Sí', 'si'], ['tortilla-patata', 'Con cuidado', 'cuidado'], ['pescado-crudo', 'Mejor no', 'no']];
  for (const [id, label, key] of fichaTone) {
    await go(page, '#/ficha/' + id);
    const p = await mainPill(page, 4000);
    if (!p || p.label !== label) { await t.check(false, `Ficha ${id} muestra «${label}» para medir su color`, p ? p.label : 'sin respuesta'); continue; }
    const ts = await settledTone(page);
    await checkTone(t, page, key, `Ficha ${id}`, ts);
    await t.check(ts.wordColor === WORD_CREAM && ts.wordText === label, `.answer-word «${label}» es crema ${WORD_CREAM} (el color vive en el fondo)`, `${ts.wordColor} «${ts.wordText}»`);
    await t.check(contrast(ts.wordColor, ts.bg) >= 4.5 && contrast(ts.phraseColor, ts.bg) >= 4.5, `Ficha ${id}: palabra y frase sobre el fondo con contraste ≥ 4,5:1`, `${contrast(ts.wordColor, ts.bg).toFixed(1)} / ${contrast(ts.phraseColor, ts.bg).toFixed(1)}`);
    await t.check(contrast(ts.footColor, ts.footBg === 'rgba(0, 0, 0, 0)' ? ts.bg : ts.footBg) >= 4.5, `Ficha ${id}: el pie se lee sobre el color (contraste ≥ 4,5:1)`, `${ts.footColor} sobre ${ts.footBg}/${ts.bg} = ${contrast(ts.footColor, ts.footBg === 'rgba(0, 0, 0, 0)' ? ts.bg : ts.footBg).toFixed(1)}`);
    await t.check(/Fraunces/i.test(p.fontFamily || '') && parseFloat(p.fontSize) >= 40, `.answer-word «${label}» en Fraunces y grande (≥ 40 px)`, `${p.fontFamily} ${p.fontSize}`);
    if (key === 'si' || key === 'no') await t.check(ts.marks === 0, `«${label}»: sin «?» decorativos`, String(ts.marks));
    await t.check(ts.cross === (key === 'no' ? 1 : 0), key === 'no' ? '«Mejor no»: lleva su cruz (.tcross) y ningún «?»' : `«${label}»: sin cruz de «Mejor no»`, String(ts.cross));
  }
  await go(page, '#/buscar?q=xyzzy');
  const tsd = await settledTone(page);
  const pd = (await pills(page))[0];
  await t.check(!!pd && pd.label === 'No estoy segura', 'Buscar «xyzzy»: .answer-word «No estoy segura»', pd ? pd.label : 'sin respuesta');
  await checkTone(t, page, 'duda', 'Buscar «xyzzy»', tsd);
  await t.check(tsd.wordColor === WORD_CREAM && contrast(tsd.wordColor, tsd.bg) >= 4.5, '«No estoy segura»: palabra crema con contraste ≥ 4,5:1', `${tsd.wordColor} ${contrast(tsd.wordColor, tsd.bg).toFixed(1)}`);
  await t.check(tsd.marks >= 3 && tsd.marksText === '?', '«No estoy segura»: varios «?» decorativos (#tone span.tm)', `${tsd.marks} «${tsd.marksText}»`);
  if (pd) await t.check(parseFloat(pd.fontSize) >= 52 - 0.5 && parseFloat(pd.fontSize) <= 72 + 0.5, '.answer-word «No estoy segura» entre 3,25 y 4,5 rem', pd.fontSize);
  // Filas: banda suave del nivel con la palabra `.lvl` en su color de texto (Historial con las consultas de antes)
  await go(page, '#/historial');
  await page.waitForTimeout(TONE_WAIT);
  const rows = (await pills(page)).filter((x) => x.kind === 'entry');
  const badRows = rows.filter((x) => LVL_TEXT[x.label] && x.color !== LVL_TEXT[x.label]);
  await t.check(rows.length >= 3 && badRows.length === 0, 'Historial: cada .lvl con la palabra exacta y su color de texto (Sí #245443, Con cuidado #8d4324, Mejor no #7a332c)', badRows.map((x) => `${x.name}: ${x.label} ${x.color}`).join(' | ') + ` · ${rows.length} filas`);
  const badBand = rows.filter((x) => x.bg !== BAND_BG[LEVEL_KEY[x.label]]);
  await t.check(rows.length >= 3 && badBand.length === 0, 'Historial: cada fila lleva la banda suave de su nivel (#e0eae3, #f8e2d0, #f2dfdb, #efe6c8)', badBand.map((x) => `${x.name}: ${x.label} ${x.bg}`).join(' | '));
  const lowRows = rows.filter((x) => contrast(x.color, x.bg) < 4.5);
  await t.check(lowRows.length === 0, 'Historial: palabra del nivel sobre su banda ≥ 4,5:1', lowRows.map((x) => `${x.label} ${contrast(x.color, x.bg).toFixed(1)}`).join(' | '));
  await t.check(new Set(rows.map((x) => x.label)).size >= 3, 'Historial: las filas cubren Sí, Con cuidado y Mejor no', [...new Set(rows.map((x) => x.label))].join(', '));
  await checkTone(t, page, null, 'Historial');
  await t.shot('pastillas');

  // Historial a sangre: las filas son más anchas que la columna, pero caben y no hacen scroll horizontal
  const hw = await buttonSizes(page);
  await t.check(hw.scrollW <= hw.innerW + 1, 'Historial con filas: sin scroll horizontal a 390 px', `${hw.scrollW}/${hw.innerW}`);
  const hb = hw.buttons.filter((b) => b.h < 47.5 && b.kind !== 'opcion' && b.kind !== 'enlace-texto');
  await t.check(hb.length === 0, 'Historial con filas: botones y filas-enlace ≥ 48 px', hb.map((b) => `${b.kind} «${b.text}» ${b.h}`).join(' | '));

  await transicionesDeColor(t, browser);
  await colorEnPantalla360(t, browser);

  // Escritorio 1280: columna ≤ 32rem y centrada
  const { page: d } = await t.newPage(browser, { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  await seed(d, t);
  for (const hash of ['#/', '#/fuera', '#/ficha/tortilla-patata']) {
    await go(d, hash);
    const col = await d.evaluate(() => {
      const W = innerWidth;
      const start = document.querySelector('main, [role=main]') || document.body;
      const queue = [start]; let found = null;
      while (queue.length) {
        const el = queue.shift(); const r = el.getBoundingClientRect();
        if (r.width < W - 1 && r.width >= 250 && r.height > 100) { found = el; break; }
        queue.push(...el.children);
      }
      if (!found) return null;
      const r = found.getBoundingClientRect();
      return { tag: found.tagName.toLowerCase(), cls: String(found.className).slice(0, 40), width: Math.round(r.width), left: Math.round(r.left), right: Math.round(W - r.right) };
    });
    await t.check(!!col && col.width <= 512.5 && Math.abs(col.left - col.right) <= 2, `1280 px (${hash}): columna principal ≤ 32rem y centrada`, JSON.stringify(col), d);
  }
  // Con filas (historial), las bandas son 2 × gutter más anchas que la columna: caben y siguen centradas
  await go(d, '#/historial');
  const rowsW = await d.evaluate(() => { const u = document.querySelector('ul.entries'); const m = document.querySelector('main'); if (!u) return null; const r = u.getBoundingClientRect(); const mr = m.getBoundingClientRect(); return { ul: Math.round(r.width), main: Math.round(mr.width), left: Math.round(r.left), right: Math.round(innerWidth - r.right), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  await t.check(!!rowsW && rowsW.ul <= 512 + 40 && Math.abs(rowsW.left - rowsW.right) <= 2 && rowsW.sw <= rowsW.iw, '1280 px (#/historial): las filas a sangre ≤ 32rem + 2 gutter, centradas y sin scroll horizontal', JSON.stringify(rowsW), d);
  await t.shot('escritorio', d);
}

async function s10(t, browser) {
  // Con reduced-motion el color llega al instante: así se mide el fondo de las 145 fichas sin esperar al fundido
  const { page } = await t.newPage(browser, { reducedMotion: 'reduce' });
  await seed(page, t);
  const foods = await page.evaluate(async () => {
    const m = await import(new URL('src/engine/foods.js', location.href).href);
    return m.FOODS.map((f) => ({ id: f.id, name: f.name, level: f.level, source: f.source, question: f.question || null, ojo: f.ojo || [] }));
  }).catch((e) => { throw new Error('No puedo importar src/engine/foods.js: ' + e.message); });
  t.info('Fichas de la guía recorridas', String(foods.length));
  await t.check(foods.length === 145 && new Set(foods.map((f) => f.id)).size === 145, 'La guía tiene 145 alimentos (ids únicos)', String(foods.length));
  const noAnswer = []; const wrongLevel = []; const badWord = []; const noSource = []; const multi = []; const noName = []; const repeats = []; const noMore = []; const badColor = []; const badMarks = []; const badOjo = []; const badArt = [];
  for (const f of foods) {
    await go(page, '#/ficha/' + f.id);
    const p = (await pills(page)).filter((x) => !x.inLo);
    if (!p.length) { noAnswer.push(f.id); continue; }
    if (p.length > 1) multi.push(`${f.id} (${p.length})`);
    const a = p[0];
    if (!a.valid) badWord.push(`${f.id}: «${a.label}»`);
    if (a.label !== LEVEL_LABEL[f.level] || a.lvCls !== f.level || a.level !== f.level) wrongLevel.push(`${f.id}: base ${LEVEL_LABEL[f.level]}, ficha ${a.label} (${a.lvCls}/${a.level})`);
    const ts = await toneState(page);
    if (ts.verdict !== f.level || ts.bg !== TONE_BG[f.level] || ts.meta !== TONE_META[f.level] || ts.wordColor !== WORD_CREAM || contrast(ts.wordColor, ts.bg) < 4.5) badColor.push(`${f.id}: ${a.label} → ${ts.verdict}/${ts.bg}/${ts.meta}/${ts.wordColor}`);
    if ((f.level === 'duda' || f.level === 'cuidado') ? ts.marks < 1 : ts.marks !== 0) badMarks.push(`${f.id} (${f.level}): ${ts.marks} «?»`);
    if (ts.cross !== (f.level === 'no' ? 1 : 0)) badMarks.push(`${f.id} (${f.level}): ${ts.cross} cruz`);
    if (!a.name || norm(a.name) !== norm(f.name)) noName.push(`${f.id} («${f.name}» / «${a.name}»)`);
    if (new RegExp('^(' + LEVEL_WORDS.map(esc).join('|') + ')\\s*([:,]|por\\b)', 'i').test(a.phrase)) repeats.push(`${f.id}: «${short(a.phrase, 60)}»`);
    const vm = page.locator('article.answer button.more-btn');
    if (await vm.count()) {
      await vm.first().click().catch(() => {});
      await page.waitForTimeout(120);
    } else noMore.push(f.id);
    const more = await page.locator('article.answer .more').first().innerText().catch(() => '');
    if (!/Fuente:\s*.*(AESAN|Ministerio de Sanidad)/.test(more)) noSource.push(`${f.id} (${short(more.split('Fuente:')[1] || '', 40)})`);
    const af = await answerFacts(page);
    if (af) {
      if ((f.level === 'no' || f.level === 'duda') && (af.ojo || af.ojoItems.length)) badOjo.push(`${f.id} (${f.level}): lleva «Ojo con esto»`);
      if (af.ojo && (af.ojoTitle !== 'Ojo con esto' || af.ojoItems.length < 1 || af.ojoItems.length > 3 || af.ojoItems.some((x) => x.length > 70))) badOjo.push(`${f.id}: ojo ${JSON.stringify(af.ojoItems)}`);
      if (f.level === 'cuidado' && f.question && !(af.qTitle === 'Pregunta' && af.q)) badOjo.push(`${f.id}: «Con cuidado» sin bloque «Pregunta»`);
      if (f.level !== 'cuidado' && af.qTitle) badOjo.push(`${f.id} (${f.level}): bloque «Pregunta» fuera de «Con cuidado»`);
      if (f.level === 'si' && f.ojo.length && !af.ojo) badOjo.push(`${f.id}: «Sí» con aviso en la guía y sin «Ojo con esto»`);
      if (!af.cat || af.artHidden !== 'true' || af.svgBad || !af.nSvg) badArt.push(`${f.id}: cat=${af.cat} hidden=${af.artHidden} bad=${af.svgBad}`);
    }
    await snap(page, t, 'ficha-' + f.id);
  }
  await t.check(noAnswer.length === 0, 'Todas las fichas de la guía muestran su respuesta (article.answer)', `${noAnswer.length}/${foods.length} sin respuesta: ${noAnswer.join(', ')}`);
  if (foods.length - noAnswer.length > 0) {
    await t.check(multi.length === 0, 'Ficha mínima: una sola respuesta por ficha', multi.join(', '));
    await t.check(badWord.length === 0, 'Cada ficha muestra una palabra de nivel exacta (Sí, Con cuidado, Mejor no o No estoy segura)', badWord.join(' | '));
    await t.check(wrongLevel.length === 0, 'Con perfil neutro, cada ficha muestra su nivel base (palabra, clase lv-* y data-level)', wrongLevel.join(' | '));
    await t.check(badColor.length === 0, 'Cada ficha pone el body en el color de su nivel (data-verdict, fondo y theme-color) y la palabra en crema con contraste ≥ 4,5:1', badColor.slice(0, 8).join(' | '));
    await t.check(badMarks.length === 0, 'Los «?» decorativos salen solo en las fichas «Con cuidado» y «No estoy segura»', badMarks.slice(0, 8).join(' | '));
    await t.check(noName.length === 0, 'Cada ficha muestra su nombre (.answer-name)', noName.join(', '));
    await t.check(repeats.length === 0, '(d) En las fichas, la frase no empieza repitiendo la palabra del nivel', repeats.join(' | '));
    await t.check(badOjo.length === 0, '«Ojo con esto» solo en «Sí» y «Con cuidado» (1–3 avisos de ≤ 70 caracteres) y «Pregunta» solo en «Con cuidado»', badOjo.slice(0, 8).join(' | '));
    await t.check(badArt.length === 0, 'Cada ficha lleva su ilustración .answer-art[data-cat] decorativa y sin text/image/style', badArt.slice(0, 8).join(' | '));
    await t.check(noMore.length === 0, 'Cada ficha tiene «Ver más»', noMore.join(', '));
    await t.check(noSource.length === 0, 'Cada ficha cita AESAN o Ministerio de Sanidad tras «Ver más»', noSource.join(', '));
  }
  // Plato desconocido: fuente = la propia app
  await go(page, '#/buscar?q=' + encodeURIComponent('plato inventado xyz'));
  await page.waitForTimeout(600);
  const pu = await mainPill(page, 3000);
  if (pu) {
    await t.check(pu.label === 'No estoy segura', 'Plato desconocido → «No estoy segura»', pu.label);
    await t.check(/No lo tengo claro\. No lo doy por seguro\./.test(pu.phrase), 'Plato desconocido: frase «No lo tengo claro. No lo doy por seguro.»', short(pu.phrase));
    await tap(page, 'Ver más');
    const mu = await page.locator('article.answer .more').first().innerText().catch(() => '');
    await t.check(/propia app/i.test(mu), 'Plato desconocido: «Ver más» dice que la fuente es la propia app', short(mu, 200));
  } else await t.check(false, 'Buscar #/buscar?q=… muestra la respuesta del motor');
  await snap(page, t, 'desconocido');

  // (d) Ninguna fila ni respuesta recorrida repite la palabra del nivel al empezar la frase
  const rep = []; let nAns = 0; const badLbl = [];
  const startRe = new RegExp('^(' + LEVEL_WORDS.map(esc).join('|') + ')\\s*([:,]|por\\b)', 'i');
  for (const c of CORPUS) for (const a of c.answers || []) {
    nAns++;
    if (!LEVEL_WORDS.includes(a.label)) badLbl.push(`${c.screen}: «${a.label}»`);
    if (startRe.test(a.phrase)) rep.push(`${c.screen}: ${a.label} · «${short(a.phrase, 60)}»`);
  }
  t.info('Filas y respuestas analizadas', String(nAns));
  await t.check(rep.length === 0, '(d) En filas y respuestas, la frase no empieza repitiendo la palabra del nivel', [...new Set(rep)].slice(0, 8).join(' | '));
  await t.check(badLbl.length === 0, 'Toda fila y respuesta lleva una palabra de nivel exacta', [...new Set(badLbl)].slice(0, 8).join(' | '));
  const leg = CORPUS.filter((c) => (c.legacy || []).length).map((c) => `${c.screen}: ${[...new Set(c.legacy)].join(' ')}`);
  await t.check(leg.length === 0, 'Ninguna pantalla recorrida usa la estructura vieja (.card, .chip, .chips, .sheet, .row, .link-btn, .pill por respuesta)', [...new Set(leg)].slice(0, 6).join(' | '));
  const svgBad = []; let svgN = 0; let svgBig = 0;
  for (const c of CORPUS) for (const v of c.svgs || []) {
    svgN++; if (v.big) svgBig++;
    if (v.text || v.image || v.fo) svgBad.push(`${c.screen}: svg.${v.cls} text=${v.text} image=${v.image} foreignObject=${v.fo}`);
  }
  t.info('SVG analizados en las pantallas recorridas', `${svgN} (${svgBig} ilustraciones grandes)`);
  await t.check(svgBig >= 3 && svgBad.length === 0, 'Ningún SVG de las pantallas (portada, vacíos, iconos) contiene <text>, <tspan>, <image> ni <foreignObject>', [...new Set(svgBad)].slice(0, 6).join(' | ') + ` · grandes vistos: ${svgBig}`);
  const decor = CORPUS.flatMap((c) => (c.svgs || []).filter((v) => v.big && !v.hidden).map((v) => `${c.screen}: svg.${v.cls}`));
  await t.check(decor.length === 0, 'Las ilustraciones grandes son decorativas (aria-hidden)', [...new Set(decor)].slice(0, 6).join(' | '));
  const enBuscar = CORPUS.filter((c) => /^#\/buscar/.test(c.hash) && /En la gu[ií]a|No aparece/i.test(c.text)).map((c) => c.screen);
  await t.check(enBuscar.length === 0, '(a) Ninguna pantalla de Buscar contiene «En la guía» ni «No aparece»', enBuscar.join(', '));
  const arrq = CORPUS.filter((c) => /^#\/arranque/.test(c.hash) && NO_EMBUTIDOS.test(c.text)).map((c) => c.screen);
  await t.check(arrq.length === 0, '(c) Ninguna pantalla del arranque contiene «embutido», «jamón» ni «AESAN»', arrq.join(', '));

  // Análisis del lenguaje sobre todo lo recorrido (este escenario y los anteriores)
  const strip = (s) => s.replace(/No estoy segura( de la lectura)?/gi, '').replace(/No lo doy por seguro/gi, '');
  const badPills = []; const badHeads = new Set(); const mentions = new Set();
  for (const c of CORPUS) {
    for (const l of c.leaves) if (/^(evitar|ev[ií]talo|seguro|segura|apto|no apto|prohibido|peligro(so)?)[.!]?$/i.test(l)) badPills.push(`${c.screen}: «${l}»`);
    for (const h of c.headings) if (/\bevitar\b|\bsegur[oa]s?\b/i.test(strip(h))) badHeads.add(`${c.screen}: «${h}»`);
    for (const m of strip(c.text).matchAll(/.{0,40}\b(evitar|segur[oa]s?)\b.{0,40}/gi)) mentions.add(m[0].replace(/\s+/g, ' ').trim());
  }
  t.info('Pantallas analizadas', String(CORPUS.length));
  await t.check(badPills.length === 0, 'Ninguna pastilla/etiqueta dice «evitar», «seguro» o «segura» a secas', [...new Set(badPills)].join(' | '));
  if (badHeads.size) t.warn('Títulos con «evitar»/«seguro»', [...badHeads].slice(0, 12).join(' | '));
  if (mentions.size) t.info('Apariciones en texto corrido (revisar a mano)', [...mentions].slice(0, 15).join(' | '));
}

// ======================================================================
// N8: escaneo guiado, claves del embarazo y lista de la compra (escenarios 12–17)
// ======================================================================
// Todo lo que toca internet va simulado con page.route: ni en local ni en producción se llama de verdad a
// /api/producto (salvo UNA vez, en el escenario 17, con el código 8424289001480 como prueba de humo).

const VIEWPORTS = [{ w: 390, h: 844 }, { w: 360, h: 740 }];
const CODE = {
  sinIng: '8412345678905',   // OFF lo conoce («Ñoquis de patata») pero sin ingredientes; /api/producto → 503
  web: '8412345678912',      // OFF no lo tiene; internet: queso fresco con ingredientes (confianza media)
  webCruda: '8412345678929', // OFF no lo tiene; internet: leche cruda (confianza alta)
  webBaja: '8412345678936',  // OFF no lo tiene; internet con confianza baja (se ignoran los ingredientes)
  nada: '8412345678943',     // en ningún sitio: /api/producto → found:false
  nada503: '8412345678950',  // en ningún sitio: /api/producto → 503
  webLenta: '8412345678967', // OFF 404 rápido; internet tarda
  offLento: '8412345678974', // OFF tarda
};
const WEB_URL = 'https://www.compraonline.alcampo.es/products/queso-fresco-test';
const SMOKE_CODE = '8424289001480';
const MSG = {
  noLoEncuentro: 'No lo encuentro. Fotografía los ingredientes y lo miro por ti.',
  sinIng: 'No tengo los ingredientes de este producto. Fotografíalos y lo compruebo.',
  web: 'Datos encontrados en internet, sin confirmar con la etiqueta.',
  noLeidos: 'No he podido leer los ingredientes. Acércala, con buena luz.',
};
const jsonRoute = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});

function tagged(t, tag) {
  return {
    get id() { return t.id; },
    get requests() { return t.requests; },
    get events() { return t.events; },
    check: (ok, what, d, pg) => t.check(ok, `[${tag}] ${what}`, d, pg),
    warn: (w, d) => t.warn(`[${tag}] ${w}`, d),
    info: (w, d) => t.info(`[${tag}] ${w}`, d),
    shot: (n, pg) => t.shot(`${tag.replace(/[^\d×x]/g, '')}-${n}`, pg),
    newPage: (b, o) => t.newPage(b, o),
  };
}

// Simula Open Food Facts, /api/producto y /api/leer (si state.leerNext no es null).
async function mockN8(ctx, st) {
  st.off = []; st.producto = []; st.leerBodies = []; st.leerNext = null;
  await ctx.route('**/world.openfoodfacts.org/api/v2/product/*', async (route) => {
    const code = (route.request().url().match(/product\/(\d+)/) || [])[1];
    st.off.push(code);
    if (code === CODE.sinIng) return jsonRoute(route, { status: 1, code, product: { code, product_name: 'Ñoquis de patata', brands: 'Marca Test' } });
    if (code === CODE.offLento) await sleep(4500);
    return jsonRoute(route, { status: 0, status_verbose: 'product not found', code }, 404);
  });
  await ctx.route('**/api/producto', async (route) => {
    const body = parseJSON(route.request().postData() || '', {}) || {};
    st.producto.push(body);
    const web = (name, ingredientsText, confidence, brand = 'Marca Test') => ({ found: true, product: { code: body.code, name, brand, ingredientsText, allergens: [], traces: [], categories: [], labels: [], image: null }, source: 'web', sourceName: 'Alcampo', sourceUrl: WEB_URL, confidence });
    if (body.code === CODE.web) return jsonRoute(route, web('Queso fresco Test', 'leche pasteurizada de vaca, sal, cuajo', 'media'));
    if (body.code === CODE.webCruda) return jsonRoute(route, web('Queso de oveja Test', 'leche cruda de oveja, sal, cuajo', 'alta'));
    if (body.code === CODE.webBaja) return jsonRoute(route, web('Galletas Test', 'harina de trigo, azúcar, huevo', 'baja'));
    if (body.code === CODE.nada) return jsonRoute(route, { found: false });
    if (body.code === CODE.webLenta) { await sleep(4500); return jsonRoute(route, { found: false }); }
    return jsonRoute(route, { error: 'sin_vision' }, 503);
  });
  await ctx.route('**/api/leer', async (route) => {
    if (st.leerNext) { st.leerBodies.push(parseJSON(route.request().postData() || '', null)); return jsonRoute(route, st.leerNext); }
    return route.continue().catch(() => {});
  });
}

async function codeSubmit(page, code) {
  const inp = page.locator('#codigo');
  await inp.fill(code);
  await inp.press('Enter');
}

// Contraste de todo el texto del bloque `.guided` sobre su fondo efectivo (el del color de la pantalla o el crema de un botón).
async function guidedContrast(page, sel = '.guided') {
  const data = await page.evaluate((sel) => {
    const g = document.querySelector(sel); if (!g) return null;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const transparent = (c) => !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
    const eff = (el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; if (!transparent(bg)) return bg; } return bodyBg; };
    const out = [];
    for (const el of g.querySelectorAll('*')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      out.push({ text: el.textContent.trim().slice(0, 40), color: cs.color, bg: eff(el), op: Number(cs.opacity) });
    }
    return { bodyBg, out };
  }, sel);
  if (!data) return null;
  const low = data.out.filter((x) => {
    const bg = parseRgb(x.bg, parseRgb(data.bodyBg));
    const fg = parseRgb(x.color, bg);
    if (!bg || !fg) return false;
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return (l1 + 0.05) / (l2 + 0.05) < 4.5 || x.op < 0.6;
  });
  return { n: data.out.length, low: low.map((x) => `${x.text}: ${x.color} sobre ${x.bg}`) };
}

// Auditoría de maquetación de la pantalla actual: scroll horizontal, controles < 48 px, pie y contenido tapado.
async function auditScreen(page) {
  await page.waitForTimeout(TONE_WAIT);
  const problems = [];
  const b = await buttonSizes(page);
  const bad = b.buttons.filter((x) => x.h < 47.5 && x.kind !== 'opcion' && x.kind !== 'enlace-texto');
  if (b.scrollW > b.innerW + 1) problems.push(`scroll horizontal ${b.scrollW}/${b.innerW}`);
  if (bad.length) problems.push(`controles < 48 px: ${[...new Set(bad.map((x) => `${x.text} ${x.h}`))].join(', ')}`);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
  const f = await footerState(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(250);
  const f2 = await footerState(page);
  if (!(f.found && f.ok && f2.found && f2.ok)) problems.push('pie no visible');
  const over = await page.evaluate(() => {
    const foot = document.querySelector('footer, [role=contentinfo]'); const top = foot ? foot.getBoundingClientRect().top : innerHeight;
    const els = [...document.querySelectorAll('main a, main button, main h1, main h2, main p, main li, main label')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; });
    const last = els.map((e) => e.getBoundingClientRect().bottom).reduce((a, c) => Math.max(a, c), 0);
    // lo decorativo (ilustración, destellos, «?», cruz) puede asomar: se recorta con overflow-x: clip; no cuenta
    const wide = [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && !e.closest('.cover-art, #tone, .tone-marks, .answer-art, .answer-fx, .entry-thumb, .home-plate, svg') && !e.closest('[aria-hidden=true]') && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 20));
    const de = document.documentElement; const nav = document.querySelector('.tabbar, nav'); const nr = nav ? nav.getBoundingClientRect() : null;
    const clip = { html: getComputedStyle(de).overflowX, body: getComputedStyle(document.body).overflowX, sw: de.scrollWidth, cw: de.clientWidth, iw: innerWidth, navRight: nr ? Math.round(nr.right) : null, navLeft: nr ? Math.round(nr.left) : null };
    return { lastBottom: Math.round(last), footTop: Math.round(top), wide: wide.slice(0, 4), clip };
  });
  if (over.lastBottom > over.footTop + 1) problems.push(`contenido tapado por el pie (${over.lastBottom} > ${over.footTop})`);
  if (over.wide.length) problems.push(`desborda por la derecha: ${over.wide.join(', ')}`);
  const c = over.clip;
  if (c.sw > c.iw || c.cw > c.iw || (c.navRight !== null && (c.navRight > c.iw + 1 || c.navLeft < -1))) problems.push(`el layout viewport se ensancha o la barra inferior se sale: ${JSON.stringify(c)}`);
  if (!/^(clip|hidden)$/.test(c.html) || !/^(clip|hidden)$/.test(c.body)) problems.push(`html/body sin overflow-x: clip ni hidden (${c.html}/${c.body})`);
  await page.evaluate(() => window.scrollTo(0, 0));
  return problems;
}

const camaraNoEncontrada = () => {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
  navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
};

// Espera a una de varias cosas visibles: 'label' (section.label-check), 'mensaje' (texto) o 'timeout'.
async function waitLabelOrMessage(page, message, timeout = OCR_TIMEOUT) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.locator('section.label-check').count()) return 'label';
    if ((await bodyText(page)).includes(message)) return 'mensaje';
    await page.waitForTimeout(400);
  }
  return 'timeout';
}

async function resultInfo(page) {
  return page.evaluate(() => {
    const a = document.querySelector('article.answer');
    const g = document.querySelector('.guided');
    const q = (s, r = document) => r.querySelector(s);
    const need = q('section.need-label');
    const actions = [...document.querySelectorAll('main a.btn, main button.btn')].map((x) => ({ text: x.innerText.replace(/\s+/g, ' ').trim(), cls: x.className, href: x.getAttribute('href') }));
    const pos = (x, y) => !!(x && y && (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      hash: location.hash,
      word: a ? (q('.answer-word', a) || {}).textContent : null,
      name: a ? (q('.answer-name', a) || {}).textContent : null,
      phrase: a ? (q('.answer-phrase', a) || {}).textContent : null,
      guided: !!g,
      order: !!(a && g && pos(q('.answer-phrase', a), g) && pos(g, q('.more-btn', a))),
      needTitle: need ? (q('.need-label-title', need) || {}).textContent : null,
      needParas: need ? [...need.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()) : [],
      needBtn: need ? (() => { const b = q('a.btn', need); return b ? { text: b.innerText.replace(/\s+/g, ' ').trim(), href: b.getAttribute('href'), cls: b.className, h: Math.round(b.getBoundingClientRect().height) } : null; })() : null,
      web: (() => { const w = q('.web-notice'); if (!w) return null; const l = q('a.ext-link', w); return { text: w.textContent.replace(/\s+/g, ' ').trim(), link: l ? { href: l.getAttribute('href'), target: l.getAttribute('target'), rel: l.getAttribute('rel'), text: l.textContent.replace(/\s+/g, ' ').trim() } : null }; })(),
      label: (() => { const s = q('section.label-check'); if (!s) return null; return { title: (q('h2', s) || {}).textContent, rows: [...s.querySelectorAll('li.check-row')].map((r) => ({ topic: r.dataset.topic, status: r.dataset.status, cls: r.className, text: r.innerText.replace(/\s+/g, ' ').trim(), link: (q('a.check-link', r) || {}).getAttribute ? q('a.check-link', r).getAttribute('href') : null, linkText: (q('a.check-link', r) || {}).textContent || null })) }; })(),
      actions,
    };
  });
}

// ---------- 12. Escaneo guiado: producto sin ingredientes → foto de los ingredientes ----------
async function s12body(tv, browser, vp) {
  const { ctx, page } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h } });
  await ctx.addInitScript(camaraNoEncontrada);
  const st = {}; await mockN8(ctx, st);
  await seed(page, tv);
  await go(page, '#/super');
  await codeSubmit(page, CODE.sinIng);
  await waitHash(page, /resultado/, 20000);
  await page.waitForSelector('article.answer', { timeout: 10000 }).catch(() => {});
  const ts = await settledTone(page);
  const r = await resultInfo(page);
  await tv.check(/#\/resultado/.test(r.hash) && r.word === 'No estoy segura' && r.name === 'Ñoquis de patata', 'Producto de OFF sin ingredientes: respuesta «No estoy segura» de «Ñoquis de patata»', JSON.stringify({ h: r.hash, w: r.word, n: r.name }));
  await tv.check(r.phrase === MSG.sinIng, `La frase es «${MSG.sinIng}»`, r.phrase);
  await checkTone(tv, page, 'duda', 'Ñoquis sin ingredientes', ts);
  await tv.check(r.guided && r.order, 'El bloque .guided va bajo la frase y antes de «Ver más»', JSON.stringify({ g: r.guided, o: r.order }));
  await tv.check(r.needTitle === 'Me faltan los ingredientes', 'Bloque section.need-label con el título «Me faltan los ingredientes»', r.needTitle);
  await tv.check(r.needParas.includes('He encontrado el producto por su nombre, pero no trae la lista de ingredientes.'), 'Dice «He encontrado el producto por su nombre, pero no trae la lista de ingredientes.»', r.needParas.join(' | '));
  await tv.check(r.needParas.some((x) => /^Voy a mirar si lleva: .+\.$/.test(x) && /huevo/.test(x)), '«Voy a mirar si lleva: …» nombra el huevo (los ñoquis)', r.needParas.join(' | '));
  await tv.check(r.needParas.includes('Con la foto de la etiqueta te lo digo mejor.'), 'Dice «Con la foto de la etiqueta te lo digo mejor.»', r.needParas.join(' | '));
  await tv.check(!!r.needBtn && r.needBtn.text === 'Fotografiar los ingredientes' && r.needBtn.href === '#/super?ingredientes=1' && /btn--primary/.test(r.needBtn.cls) && r.needBtn.h >= 47.5, 'Botón principal «Fotografiar los ingredientes» (#/super?ingredientes=1, ≥ 48 px)', JSON.stringify(r.needBtn));
  const otro = r.actions.find((x) => x.text === 'Escanear otro código');
  await tv.check(!!otro && /btn--secondary/.test(otro.cls), '«Escanear otro código» pasa a secundario mientras haya que fotografiar', JSON.stringify(otro));
  await tv.check(r.web === null, 'Sin aviso de datos de internet (no vino de la web)');
  const body0 = st.producto[0] || null;
  await tv.check(!!body0 && body0.code === CODE.sinIng && Object.keys(body0).every((k) => ['code', 'name', 'brand'].includes(k)) && body0.name === 'Ñoquis de patata', '/api/producto recibe solo código, nombre y marca (sin datos de la persona)', JSON.stringify(body0));
  const gc = await guidedContrast(page);
  await tv.check(!!gc && gc.n > 3 && gc.low.length === 0, 'Contraste del bloque sobre el ocre ≥ 4,5:1 (texto, enlaces y botón)', gc ? gc.low.join(' | ') + ` · ${gc.n} textos` : 'sin bloque');
  await snap(page, tv, 'escaneo-sin-ingredientes');
  const pr = await auditScreen(page);
  await tv.check(pr.length === 0, 'Maquetación: sin desborde horizontal, controles ≥ 48 px, nada tapado por el pie', pr.join(' | '));
  await tv.shot('escaneo-sin-ingredientes');

  // «Cancelar» la cámara de los ingredientes vuelve al resultado
  await tap(page, 'Fotografiar los ingredientes', { loose: false });
  await waitHash(page, /super/, 5000);
  await tv.check(await seen(page, 'Cancelar', { timeout: 6000 }), 'La foto de los ingredientes ofrece «Cancelar»');
  await tv.check(await seen(page, /Elegir una foto de la galer[ií]a/, { timeout: 4000 }), 'Sin cámara, ofrece la galería');
  await tv.shot('foto-ingredientes');
  await tap(page, 'Cancelar', { loose: false });
  await tv.check(/#\/resultado/.test(await waitHash(page, /resultado/, 4000)) && (await seen(page, 'No estoy segura', { timeout: 2000 })), 'Cancelar vuelve al resultado del producto', await getHash(page));

  // Foto de los ingredientes (lectura simulada, para que haya huevo) → comprobación de la etiqueta
  st.leerNext = { readable: true, items: [{ name: 'Ñoquis', ingredients: ['patata cocida (80%)', 'huevo', 'harina de trigo', 'sal'], uncertain: false }] };
  await tap(page, 'Fotografiar los ingredientes', { loose: false });
  await chooseFile(page, 'Elegir una foto', path.join(FIX, 'etiqueta.jpg'));
  await waitHash(page, /resultado/, 20000);
  await page.waitForSelector('section.label-check', { timeout: 15000 }).catch(() => {});
  const ts2 = await settledTone(page);
  const r2 = await resultInfo(page);
  await tv.check(!!r2.label && r2.label.title === 'Lo que he mirado en la etiqueta', 'Tras la foto: section.label-check «Lo que he mirado en la etiqueta»', JSON.stringify(r2.label && r2.label.title));
  await tv.check(!!r2.label && r2.label.rows.length >= 1 && r2.label.rows.every((x) => x.topic && ['aparece', 'no-aparece'].includes(x.status)), 'Filas li.check-row con data-topic y data-status', JSON.stringify(r2.label && r2.label.rows.map((x) => [x.topic, x.status])));
  const huevo = r2.label && r2.label.rows.find((x) => x.topic === 'huevo-crudo');
  await tv.check(!!huevo && huevo.status === 'aparece' && /^Aparece: .*huevo/i.test(huevo.text) && /check-row--(found|ok)/.test(huevo.cls), 'Fila del huevo: «Aparece: …huevo…» (found o ok si el veredicto es «Sí»: cocinado, sin choque con el verde)', huevo && huevo.text);
  await tv.check(!!huevo && huevo.link === '#/claves/huevo-crudo' && huevo.linkText === 'Por qué importa', 'La fila hallada enlaza «Por qué importa» → #/claves/huevo-crudo', JSON.stringify(huevo && [huevo.link, huevo.linkText]));
  const firstNotFound = r2.label ? r2.label.rows.findIndex((x) => !/found|doubt/.test(x.cls)) : -1;
  const lastFound = r2.label ? r2.label.rows.map((x) => /found|doubt/.test(x.cls)).lastIndexOf(true) : -1;
  await tv.check(firstNotFound === -1 || lastFound < firstNotFound, 'Lo hallado va primero; lo tranquilizador y lo que no aparece, después', JSON.stringify(r2.label && r2.label.rows.map((x) => x.cls.replace('check-row ', ''))));
  await tv.check(r2.name === 'Ñoquis de patata' && r2.needTitle === null, 'El nombre es el del código y ya no se piden los ingredientes', JSON.stringify({ n: r2.name, need: r2.needTitle }));
  await tv.check(ts2.verdict === LEVEL_KEY[r2.word] && ts2.bg === TONE_BG[ts2.verdict], 'La pantalla toma el color del nuevo veredicto', JSON.stringify({ v: ts2.verdict, bg: ts2.bg, w: r2.word }));
  const gc2 = await guidedContrast(page);
  await tv.check(!!gc2 && gc2.n > 2 && gc2.low.length === 0, `Contraste del bloque de etiqueta sobre «${r2.word}» ≥ 4,5:1`, gc2 ? gc2.low.join(' | ') + ` · ${gc2.n} textos` : 'sin bloque');
  const hist = parseJSON((await storage(page))['pc.v1.history'], []);
  await tv.check(hist.filter((e) => /Ñoquis de patata/.test(e.title)).length === 1, 'El historial sustituye la entrada anterior del mismo producto (una sola)', JSON.stringify(hist.map((e) => e.title)));
  const lb = st.leerBodies[0];
  await tv.check(!!lb && Object.keys(lb).every((k) => ['image', 'mediaType', 'mode'].includes(k)) && lb.mode === 'etiqueta', 'Privacidad: el POST a /api/leer solo lleva image, mediaType y mode («etiqueta»)', lb ? Object.keys(lb).join(', ') + ' ' + lb.mode : 'sin POST');
  await snap(page, tv, 'tras-foto-ingredientes');
  const pr2 = await auditScreen(page);
  await tv.check(pr2.length === 0, 'Maquetación tras la foto: sin desborde, controles ≥ 48 px, nada tapado por el pie', pr2.join(' | '));
  await tv.shot('tras-foto');
  // «Por qué importa» abre la clave
  if (huevo) {
    await page.locator('section.label-check a.check-link').first().click();
    await waitHash(page, /claves/, 4000);
    await page.waitForTimeout(700);
    const open = await page.evaluate(() => [...document.querySelectorAll('li.clave')].filter((l) => l.querySelector('.clave-head').getAttribute('aria-expanded') === 'true').map((l) => l.dataset.clave));
    await tv.check(/#\/claves\/huevo-crudo/.test(await getHash(page)) && open.length === 1 && open[0] === 'huevo-crudo', '«Por qué importa» abre #/claves/huevo-crudo con esa clave abierta', JSON.stringify({ h: await getHash(page), open }));
  }

  // Foto REAL (etiqueta.jpg sin simular la lectura): o filas de etiqueta o el mensaje honesto
  st.leerNext = null;
  await go(page, '#/super');
  await codeSubmit(page, CODE.sinIng);
  await waitHash(page, /resultado/, 20000);
  await page.waitForSelector('a.btn[href="#/super?ingredientes=1"]', { timeout: 10000 }).catch(() => {});
  await page.locator('a.btn[href="#/super?ingredientes=1"]').click();
  await chooseFile(page, 'Elegir una foto', path.join(FIX, 'etiqueta.jpg'));
  const outcome = await waitLabelOrMessage(page, MSG.noLeidos);
  tv.info('etiqueta.jpg real sobre el producto sin ingredientes', outcome);
  if (outcome === 'label') {
    const r3 = await resultInfo(page);
    await tv.check(r3.label.rows.length >= 1 && r3.label.rows.every((x) => x.topic && x.status), 'Foto real: filas li.check-row[data-topic][data-status]', JSON.stringify(r3.label.rows.map((x) => [x.topic, x.status])));
    await tv.check(r3.name === 'Ñoquis de patata', 'Foto real: se conserva el nombre del código', r3.name);
    await tv.shot('foto-real-etiqueta');
  } else if (outcome === 'mensaje') {
    await tv.check(await seen(page, 'Fotografiar los ingredientes', { timeout: 2000 }), 'Sin leer: mensaje honesto «No he podido leer los ingredientes…» y el botón para repetir');
    tv.warn('etiqueta.jpg no se pudo leer en esta ejecución (lectura del entorno)');
  } else await tv.check(false, 'La foto real de los ingredientes termina en filas o en mensaje honesto', outcome);
}

async function s12(t, browser) {
  for (const vp of VIEWPORTS) await s12body(tagged(t, `${vp.w}×${vp.h}`), browser, vp);
}

// ---------- 13. Datos de internet, no encontrado y cancelar ----------
async function s13body(tv, browser, vp) {
  const { ctx, page } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h } });
  await ctx.addInitScript(camaraNoEncontrada);
  const st = {}; await mockN8(ctx, st);
  await seed(page, tv);
  const lookupCode = async (code) => { await go(page, '#/super'); await codeSubmit(page, code); await waitHash(page, /resultado/, 15000); await page.waitForSelector('article.answer', { timeout: 8000 }).catch(() => {}); };

  // (2) datos de internet: queso fresco pasteurizado saldría «Sí» → se rebaja a «No estoy segura»
  await lookupCode(CODE.web);
  const ts = await settledTone(page);
  const r = await resultInfo(page);
  await tv.check(r.word === 'No estoy segura' && r.name === 'Queso fresco Test', 'Datos de internet: el «Sí» se rebaja a «No estoy segura»', JSON.stringify({ w: r.word, n: r.name }));
  await tv.check(r.phrase === MSG.web, `La frase es «${MSG.web}»`, r.phrase);
  await tv.check(!!r.web && /^Datos encontrados en internet \(Alcampo.*\)\. Compruébalos con la etiqueta\.$/.test(r.web.text), 'Aviso «Datos encontrados en internet (Alcampo). Compruébalos con la etiqueta.»', r.web && r.web.text);
  await tv.check(!!r.web && !!r.web.link && r.web.link.href === WEB_URL && r.web.link.target === '_blank' && /noopener/.test(r.web.link.rel || ''), 'a.ext-link con la URL de la fuente, target _blank y rel noopener', JSON.stringify(r.web && r.web.link));
  await tv.check(!!r.web && /noreferrer/.test(r.web.link.rel || ''), 'El enlace externo lleva también noreferrer', r.web && r.web.link && r.web.link.rel);
  await tv.check(r.needTitle === 'Compruébalo con la etiqueta' && !r.needParas.some((x) => /He encontrado el producto por su nombre/.test(x)), 'Bloque «Compruébalo con la etiqueta» (sin la frase «He encontrado el producto…»)', JSON.stringify({ t: r.needTitle, p: r.needParas }));
  await tv.check(!!r.needBtn && r.needBtn.text === 'Fotografiar los ingredientes' && /btn--primary/.test(r.needBtn.cls), 'Botón «Fotografiar los ingredientes»', JSON.stringify(r.needBtn));
  await checkTone(tv, page, 'duda', 'Datos de internet', ts);
  const body = st.producto.find((x) => x.code === CODE.web);
  await tv.check(!!body && Object.keys(body).join() === 'code', '/api/producto sin pista cuando OFF no conoce el producto (solo el código)', JSON.stringify(body));
  const gc = await guidedContrast(page);
  await tv.check(!!gc && gc.n > 3 && gc.low.length === 0, 'Contraste del aviso, el enlace y el botón sobre el ocre ≥ 4,5:1', gc ? gc.low.join(' | ') : 'sin bloque');
  await snap(page, tv, 'web-queso');
  const pr = await auditScreen(page);
  await tv.check(pr.length === 0, 'Maquetación (datos de internet): sin desborde, controles ≥ 48 px, nada tapado', pr.join(' | '));
  await tv.shot('datos-de-internet');

  // Lo que sale «Mejor no» con datos de internet se queda «Mejor no» (y pide comprobar)
  await lookupCode(CODE.webCruda);
  const ts2 = await settledTone(page);
  const r2 = await resultInfo(page);
  await tv.check(r2.word === 'Mejor no' && !!r2.web && r2.needTitle === 'Compruébalo con la etiqueta', 'Leche cruda de internet: «Mejor no» (no se rebaja) con aviso y «Compruébalo con la etiqueta»', JSON.stringify({ w: r2.word, web: !!r2.web, t: r2.needTitle }));
  await checkTone(tv, page, 'no', 'Datos de internet «Mejor no»', ts2);
  const gc2 = await guidedContrast(page);
  await tv.check(!!gc2 && gc2.low.length === 0, 'Contraste del bloque sobre el vino ≥ 4,5:1', gc2 ? gc2.low.join(' | ') : 'sin bloque');

  // Confianza baja: se ignoran los ingredientes de internet
  await lookupCode(CODE.webBaja);
  const r3 = await resultInfo(page);
  await tv.check(r3.word === 'No estoy segura' && r3.needTitle === 'Me faltan los ingredientes' && r3.phrase === MSG.sinIng, 'Internet con confianza baja: se ignoran los ingredientes («Me faltan los ingredientes»)', JSON.stringify({ w: r3.word, t: r3.needTitle, p: r3.phrase }));

  // (3) No encontrado en ningún sitio
  for (const [code, how] of [[CODE.nada, 'internet responde «no encontrado»'], [CODE.nada503, 'internet no responde (503)']]) {
    await go(page, '#/'); // otra pantalla, para que el mensaje anterior no cuente
    await go(page, '#/super');
    await codeSubmit(page, code);
    await tv.check(await seen(page, MSG.noLoEncuentro, { timeout: 15000 }), `No encontrado (${how}): «${MSG.noLoEncuentro}»`, short(await bodyText(page), 200));
    await page.waitForSelector('.status', { state: 'detached', timeout: 5000 }).catch(() => {});
    const acts = await page.evaluate(() => [...document.querySelectorAll('main button.btn')].map((x) => ({ text: x.innerText.replace(/\s+/g, ' ').trim(), cls: x.className, h: Math.round(x.getBoundingClientRect().height) })));
    const ing = acts.find((x) => x.text === 'Fotografiar los ingredientes');
    const otro = acts.find((x) => x.text === 'Escanear otro código');
    await tv.check(!!ing && /btn--primary/.test(ing.cls) && !!otro && /btn--secondary/.test(otro.cls) && !acts.some((x) => x.text === 'Fotografiar la etiqueta'), 'El botón principal es «Fotografiar los ingredientes» y «Escanear otro código» es secundario', JSON.stringify(acts));
    await tv.check(!/No está en Open Food Facts/.test(await bodyText(page)), 'Ya no sale «No está en Open Food Facts…»');
  }
  await snap(page, tv, 'no-encontrado');
  const pr2 = await auditScreen(page);
  await tv.check(pr2.length === 0, 'Maquetación (no encontrado): sin desborde, controles ≥ 48 px, nada tapado', pr2.join(' | '));
  await tv.shot('no-encontrado');
  // Foto de los ingredientes de un producto que no está en ningún sitio
  st.leerNext = { readable: true, items: [{ name: 'Queso casero', ingredients: ['leche cruda', 'sal', 'cuajo'], uncertain: false }] };
  await tap(page, 'Fotografiar los ingredientes', { loose: false });
  await chooseFile(page, 'Elegir una foto', path.join(FIX, 'etiqueta.jpg'));
  await waitHash(page, /resultado/, 20000);
  await page.waitForSelector('article.answer', { timeout: 10000 }).catch(() => {});
  const ts4 = await settledTone(page);
  const r4 = await resultInfo(page);
  await tv.check(r4.name === 'Queso casero' && r4.word === 'Mejor no' && !!r4.label && r4.label.rows.length >= 1, 'Sin producto, el nombre sale de la foto: «Queso casero» → «Mejor no» con filas de etiqueta', JSON.stringify({ n: r4.name, w: r4.word, rows: r4.label && r4.label.rows.length }));
  await checkTone(tv, page, 'no', 'Etiqueta de un producto sin código', ts4);
  const leche = r4.label && r4.label.rows.find((x) => x.topic === 'listeria');
  await tv.check(!!leche && leche.status === 'aparece' && leche.link === '#/claves/listeria', 'Leche cruda: fila de listeria hallada con «Por qué importa» → #/claves/listeria', JSON.stringify(leche));
  const gc4 = await guidedContrast(page);
  await tv.check(!!gc4 && gc4.low.length === 0, 'Contraste del bloque de etiqueta sobre el vino ≥ 4,5:1', gc4 ? gc4.low.join(' | ') : 'sin bloque');
  await tv.shot('etiqueta-sin-codigo');

  // (4) Cancelar la búsqueda con la web retrasada
  const nHist = parseJSON((await storage(page))['pc.v1.history'], []).length;
  for (const [code, expectText, label] of [[CODE.offLento, /Buscando en Open Food Facts/, 'Open Food Facts'], [CODE.webLenta, /Buscando en internet/, 'internet']]) {
    await go(page, '#/super');
    await codeSubmit(page, code);
    await tv.check(await seen(page, expectText, { timeout: 8000, exact: false }), `Mientras busca en ${label}: «${label === 'internet' ? 'Buscando en internet…' : 'Buscando en Open Food Facts…'}»`, short(await bodyText(page), 200));
    const ld = await loadingState(page);
    await tv.check(!!ld && /status--art/.test(ld.cls) && ld.spinners === 0, 'Estado de carga con el plato animado (sin .spinner)', JSON.stringify(ld));
    const cb = page.getByRole('button', { name: 'Cancelar', exact: true });
    const box = await cb.boundingBox().catch(() => null);
    await tv.check(!!box && box.height >= 47.5, 'Botón «Cancelar» visible durante la búsqueda (≥ 48 px)', box ? String(Math.round(box.height)) : 'no está');
    await tv.shot('buscando-' + (label === 'internet' ? 'web' : 'off'));
    await cb.click();
    await page.waitForTimeout(500);
    await tv.check(await seen(page, 'En el súper', { timeout: 2000 }) && /#\/super/.test(await getHash(page)) && (await page.locator('.status').count()) === 0, 'Cancelar vuelve al Súper', await getHash(page));
    await page.waitForTimeout(5200); // llega tarde la respuesta retrasada: no debe pasar nada
    await tv.check(/#\/super/.test(await getHash(page)) && (await page.locator('article.answer').count()) === 0, 'Tras cancelar, la respuesta tardía no abre ningún resultado', await getHash(page));
  }
  const nHist2 = parseJSON((await storage(page))['pc.v1.history'], []).length;
  await tv.check(nHist2 === nHist, 'Cancelar no deja nada en el historial', `${nHist} → ${nHist2}`);
}

async function s13(t, browser) {
  for (const vp of VIEWPORTS) await s13body(tagged(t, `${vp.w}×${vp.h}`), browser, vp);
}

// ---------- 14. Claves del embarazo ----------
const CLAVE_IDS = ['listeria', 'toxoplasmosis', 'mercurio', 'huevo-crudo', 'pescado-crudo', 'alcohol', 'cafeina', 'hierbas'];

async function s14body(tv, browser, vp) {
  const { page } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h } });
  await seed(page, tv);

  // (5) «Ver más» de respuestas con temas
  for (const [q, ids] of [['tiramisu', ['huevo-crudo']], ['sushi', ['pescado-crudo']]]) {
    await go(page, '#/buscar?q=' + q);
    await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {});
    await tap(page, 'Ver más');
    const info = await page.evaluate(() => {
      const more = document.querySelector('article.answer .more');
      const chips = [...document.querySelectorAll('article.answer ul.chips a.chip')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), h: Math.round(a.getBoundingClientRect().height) }));
      const label = [...document.querySelectorAll('article.answer .more-label')].map((x) => x.textContent.trim());
      const links = [...document.querySelectorAll('article.answer .more a.text-link')].filter((a) => /Por qué importa/.test(a.textContent)).map((a) => a.getAttribute('href'));
      return { chips, label, links, vis: !!more && !more.hidden };
    });
    await tv.check(info.vis && info.label.includes('Para saber más'), `«${q}»: «Ver más» tiene «Para saber más»`, JSON.stringify(info.label));
    await tv.check(info.chips.length >= 1 && info.chips.every((c) => /^#\/claves\/[a-z-]+$/.test(c.href) && CLAVE_IDS.includes(c.href.split('/').pop())), `«${q}»: chips ul.chips a.chip hacia claves válidas`, JSON.stringify(info.chips));
    await tv.check(ids.every((id) => info.chips.some((c) => c.href === '#/claves/' + id)), `«${q}»: entre los chips está ${ids.join(', ')}`, JSON.stringify(info.chips));
    await tv.check(info.chips.every((c) => c.h >= 47.5), `«${q}»: los chips miden ≥ 48 px`, JSON.stringify(info.chips.map((c) => c.h)));
    await tv.check(info.links.length === 1 && info.links[0] === info.chips[0].href, `«${q}»: enlace «Por qué importa» al primer tema`, JSON.stringify(info.links));
    if (q === 'tiramisu') {
      await tv.shot('ver-mas-chips');
      await page.locator('article.answer ul.chips a.chip').first().click();
      await waitHash(page, /claves\//, 4000);
      await page.waitForTimeout(600);
      const open = await page.evaluate(() => [...document.querySelectorAll('li.clave')].filter((l) => l.querySelector('.clave-head').getAttribute('aria-expanded') === 'true').map((l) => l.dataset.clave));
      await tv.check(open.length === 1 && /#\/claves\/(.+)$/.exec(await getHash(page))[1] === open[0], 'Un chip abre su clave', JSON.stringify({ h: await getHash(page), open }));
    }
  }
  await go(page, '#/ficha/agua');
  await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {});
  await tap(page, 'Ver más');
  await tv.check((await page.locator('article.answer ul.chips').count()) === 0 && !/Para saber más/.test(await page.locator('article.answer .more').innerText()), 'Una respuesta «Sí» (agua) no lleva temas ni «Para saber más»');

  // (6) Pantalla de claves
  await go(page, '#/claves');
  await page.waitForTimeout(500);
  const h1 = await page.locator('h1').first().innerText();
  const claves = await page.evaluate(() => [...document.querySelectorAll('ul.claves > li.clave')].map((l) => ({ id: l.dataset.clave, exp: l.querySelector('.clave-head') ? l.querySelector('.clave-head').getAttribute('aria-expanded') : null, h: Math.round(l.querySelector('.clave-head').getBoundingClientRect().height), title: l.querySelector('.clave-title').textContent.trim(), resumen: l.querySelector('.clave-resumen').textContent.trim() })));
  await tv.check(h1 === 'Las claves del embarazo', 'Pantalla #/claves: h1 «Las claves del embarazo»', h1);
  await tv.check(claves.length === 8 && claves.map((c) => c.id).join() === CLAVE_IDS.join(), '8 filas li.clave[data-clave] en el orden de Laura', claves.map((c) => c.id).join());
  await tv.check(claves.every((c) => c.exp === 'false' && c.h >= 47.5 && c.title && c.resumen), 'Cada fila lleva .clave-head[aria-expanded=false] ≥ 48 px, título y resumen visibles', JSON.stringify(claves.map((c) => [c.id, c.exp, c.h])));
  await tv.check(await seen(page, 'Si tienes una duda sobre tu caso, pregúntasela a tu matrona.', { timeout: 1000 }), 'Cierre «Si tienes una duda sobre tu caso, pregúntasela a tu matrona.»');
  await checkTone(tv, page, null, 'Claves', await settledTone(page, 300));
  await snap(page, tv, 'claves');
  await tv.shot('claves');
  const openIds = () => page.evaluate(() => [...document.querySelectorAll('li.clave')].filter((l) => l.querySelector('.clave-head').getAttribute('aria-expanded') === 'true').map((l) => l.dataset.clave));
  const heads = page.locator('li.clave .clave-head');
  await heads.nth(0).click();
  await tv.check(JSON.stringify(await openIds()) === '["listeria"]' && /#\/claves\/listeria$/.test(await getHash(page)), 'Abrir la primera: solo ella abierta y la URL pasa a #/claves/listeria', JSON.stringify({ o: await openIds(), h: await getHash(page) }));
  await heads.nth(2).click();
  await tv.check(JSON.stringify(await openIds()) === '["mercurio"]', 'Abrir otra cierra la anterior: una sola abierta a la vez', JSON.stringify(await openIds()));
  await tv.check(/#\/claves\/mercurio$/.test(await getHash(page)), 'La URL sigue a la abierta sin repintar', await getHash(page));
  await page.waitForTimeout(800);
  await tv.shot('clave-abierta');
  await heads.nth(2).click();
  await tv.check((await openIds()).length === 0 && /#\/claves$/.test(await getHash(page)), 'Cerrar la abierta: ninguna abierta y URL #/claves', JSON.stringify({ o: await openIds(), h: await getHash(page) }));

  // Contenido de las ocho: fuente AESAN / Ministerio de Sanidad; nada de «evitar» ni «seguro/segura»
  const textos = [];
  for (let i = 0; i < 8; i++) {
    await heads.nth(i).click();
    const li = page.locator('li.clave').nth(i);
    const txt = (await li.innerText()).replace(/\s+/g, ' ');
    textos.push({ id: CLAVE_IDS[i], txt, src: await li.locator('.more-source').innerText().catch(() => '') });
  }
  await heads.nth(7).click();
  await tv.check(textos.every((x) => /^Fuente: .*(AESAN|Ministerio de Sanidad)/.test(x.src)), 'Las 8 claves citan a AESAN o al Ministerio de Sanidad como fuente', JSON.stringify(textos.map((x) => [x.id, x.src])));
  const vetadas = textos.filter((x) => /\bevit(ar|a|e|ando)\b|\bsegur[oa]s?\b/i.test(x.txt)).map((x) => `${x.id}: «${(x.txt.match(/.{0,30}(\bevit\w*|\bsegur[oa]s?\b).{0,30}/i) || [''])[0]}»`);
  await tv.check(vetadas.length === 0, 'Ninguna de las 8 claves dice «evitar» ni «seguro/segura»', vetadas.join(' | '));
  await tv.check(textos.every((x) => /Qué mirar en la etiqueta/.test(x.txt) && /Qué preguntar en la carta/.test(x.txt) && /Una alternativa/.test(x.txt) && /Dónde suele aparecer/.test(x.txt)), 'Cada clave abre por qué importa, qué mirar, qué preguntar, dónde aparece y una alternativa', textos.filter((x) => !/Qué mirar/.test(x.txt)).map((x) => x.id).join());
  const clin = textos.filter((x) => FORBIDDEN.test(x.txt.replace(/toxoplasm\w*/gi, ''))).map((x) => x.id);
  await tv.check(clin.length === 0, 'Las claves no piden ningún dato clínico', clin.join());

  // #/claves/<id> abre y baja a la clave; un id inventado no abre nada
  await go(page, '#/claves/huevo-crudo');
  await page.waitForTimeout(1200);
  const pos = await page.evaluate(() => { const l = document.querySelector('li.clave[data-clave="huevo-crudo"]'); const r = l.getBoundingClientRect(); return { top: Math.round(r.top), exp: l.querySelector('.clave-head').getAttribute('aria-expanded'), sy: Math.round(scrollY) }; });
  await tv.check(pos.exp === 'true' && pos.top >= -2 && pos.top < vp.h * 0.5, '#/claves/huevo-crudo abre la clave y baja hasta ella', JSON.stringify(pos));
  await go(page, '#/claves/inventado');
  await page.waitForTimeout(600);
  await tv.check((await openIds()).length === 0 && (await page.locator('li.clave').count()) === 8, '#/claves/inventado: se ven las 8 claves y no se abre ninguna', JSON.stringify(await openIds()));
  const pa = await auditScreen(page);
  await tv.check(pa.length === 0, 'Maquetación de las claves: sin desborde, controles ≥ 48 px, nada tapado', pa.join(' | '));
  await go(page, '#/claves/alcohol'); await page.waitForTimeout(900);
  await tv.shot('claves-alcohol');
  const pa2 = await auditScreen(page);
  await tv.check(pa2.length === 0, 'Maquetación con una clave abierta: sin desborde, controles ≥ 48 px, nada tapado', pa2.join(' | '));

  // Accesos: Inicio y Ajustes; no hay quinto destino en la barra
  await go(page, '#/');
  const cl = await page.evaluate(() => { const a = document.querySelector('a.claves-link'); return a ? { href: a.getAttribute('href'), text: a.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(a.getBoundingClientRect().height) } : null; });
  await tv.check(!!cl && cl.href === '#/claves' && /^Las claves del embarazo: los 8 temas que más se repiten/.test(cl.text), 'Inicio lleva siempre la línea «Las claves del embarazo: los 8 temas que más se repiten» → #/claves', JSON.stringify(cl));
  await tv.check(!!cl && cl.h >= 47.5, 'La línea de claves de Inicio mide ≥ 48 px', String(cl && cl.h));
  await go(page, '#/ajustes');
  await tv.check(!!(await find(page, 'Ver las claves', { timeout: 1000, loose: false })), 'Ajustes: sección «Las claves del embarazo» con «Ver las claves»');
  await tap(page, 'Ver las claves', { loose: false });
  await tv.check(/#\/claves$/.test(await waitHash(page, /claves/, 3000)), '«Ver las claves» lleva a #/claves', await getHash(page));
  for (const hh of ['#/', '#/claves', '#/claves/listeria', '#/lista', '#/ajustes']) {
    await go(page, hh);
    const n = await navState(page);
    const bottom = n.navs.find((x) => x.bottom >= n.innerHeight - 6 && x.top > n.innerHeight * 0.55);
    await tv.check(!!bottom && JSON.stringify(bottom.items) === JSON.stringify(NAV), `Barra inferior en ${hh}: exactamente Inicio, Fuera, Súper, Lista (sin quinto destino)`, JSON.stringify(bottom && bottom.items));
  }
}

async function s14(t, browser) {
  for (const vp of VIEWPORTS) await s14body(tagged(t, `${vp.w}×${vp.h}`), browser, vp);
}

// ---------- 15. Lista de la compra ----------
async function s15body(tv, browser, vp) {
  const { ctx, page } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h }, permissions: ['clipboard-read', 'clipboard-write'] });
  await seed(page, tv);
  const addFromBuscar = async (q) => {
    await go(page, '#/buscar?q=' + encodeURIComponent(q));
    await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {});
    await tap(page, 'Añadir a la lista', { loose: false });
  };
  const state = () => page.evaluate(() => ({
    h1: (document.querySelector('h1') || {}).innerText,
    count: (document.querySelector('.shop-count') || {}).innerText || null,
    pend: [...document.querySelectorAll('ul.shop-list--pend > li.entry--shop')].map((li) => ({ name: li.querySelector('.entry-name').innerText.trim(), level: li.dataset.level, done: li.dataset.done })),
    carro: [...document.querySelectorAll('ul.shop-list--carro > li.entry--shop')].map((li) => ({ name: li.querySelector('.entry-name').innerText.trim(), level: li.dataset.level, done: li.dataset.done })),
    toggle: (document.querySelector('.carro-toggle') || {}).innerText || null,
    toggleExp: (document.querySelector('.carro-toggle') || { getAttribute: () => null }).getAttribute('aria-expanded'),
    share: !!document.querySelector('button[data-action=compartir]'),
    vaciar: !!document.querySelector('button[data-action=vaciar-comprado]'),
    msg: (document.querySelector('.share-msg') || {}).innerText || '',
  })).then((s) => ({ ...s, toggle: s.toggle && s.toggle.replace(/\s+/g, ' ').trim() }));
  const box = (name) => page.locator('li.entry--shop', { has: page.locator('.entry-name', { hasText: new RegExp('^' + esc(name) + '$') }) }).locator('input.buy-box[data-action=comprado]');

  // Añadir cuatro respuestas de distinto nivel
  for (const q of ['sushi', 'tortilla', 'lubina a la plancha', 'xyzzy']) await addFromBuscar(q);
  await go(page, '#/lista');
  await page.waitForTimeout(500);
  let s = await state();
  await tv.check(s.h1 === 'Lista de la compra', 'h1 «Lista de la compra»', s.h1);
  await tv.check(await seen(page, 'Lo que vas a comprar. Márcalo cuando lo metas en el carro y compártela con quien vaya a la tienda.', { timeout: 1000 }), 'Entradilla «Lo que vas a comprar. Márcalo cuando lo metas en el carro y compártela con quien vaya a la tienda.»');
  await tv.check(s.count === '4 pendientes' && s.share, 'Barra: «4 pendientes» y «Compartir la lista»', JSON.stringify({ c: s.count, s: s.share }));
  await tv.check(s.pend.map((x) => x.level).join() === 'si,cuidado,duda,no' && s.pend.map((x) => x.name).join() === 'Lubina a la plancha,Tortilla,Xyzzy,Sushi', 'Pendiente ordenado Sí → Con cuidado → No estoy segura → Mejor no', JSON.stringify(s.pend));
  await tv.check(s.carro.length === 0 && s.toggle === null, 'Sin nada comprado no hay sección «En el carro»', JSON.stringify(s.toggle));
  const sec = await page.evaluate(() => [...document.querySelectorAll('h2')].map((h) => h.innerText.replace(/\s+/g, ' ').trim()));
  await tv.check(sec.includes('Pendiente'), 'Sección «Pendiente»', JSON.stringify(sec));
  const sizes = await page.evaluate(() => [...document.querySelectorAll('li.entry--shop')].map((li) => { const b = li.querySelector('input.buy-box').getBoundingClientRect(); const l = li.querySelector('label.buy').getBoundingClientRect(); return { box: Math.round(b.height), label: Math.round(l.height), w: Math.round(l.width), text: li.querySelector('.buy-text').innerText }; }));
  await tv.check(sizes.every((x) => x.box >= 23 && x.label >= 47.5 && x.w >= 47.5 && x.text === 'Comprado'), 'Casilla con «Comprado» debajo y zona de toque ≥ 48 px', JSON.stringify(sizes));
  await snap(page, tv, 'lista-compra');
  const pr = await auditScreen(page);
  await tv.check(pr.length === 0, 'Maquetación de la lista: sin desborde, controles ≥ 48 px, nada tapado por el pie', pr.join(' | '));
  await tv.shot('lista-compra');

  // Marcar comprado → baja a «En el carro (1)»
  await box('Lubina a la plancha').click();
  await page.waitForTimeout(400);
  s = await state();
  await tv.check(s.count === '3 pendientes' && s.toggle === 'En el carro (1)' && s.carro.length === 1 && s.carro[0].name === 'Lubina a la plancha' && s.carro[0].done === 'true', 'Marcar «Lubina» → «3 pendientes» y baja a «En el carro (1)»', JSON.stringify(s));
  const st1 = parseJSON((await storage(page))['pc.v1.list'], []);
  await tv.check(st1.filter((x) => x.done === true).map((x) => x.title).join() === 'lubina a la plancha' || st1.some((x) => /lubina/i.test(x.title) && x.done === true), 'pc.v1.list guarda done:true solo en la lubina', JSON.stringify(st1.map((x) => [x.title, x.done])));
  await tv.check(s.toggleExp === 'true' && s.vaciar, '«En el carro» se ve abierto y con «Vaciar lo comprado»', JSON.stringify({ e: s.toggleExp, v: s.vaciar }));
  await tv.shot('lista-en-el-carro');
  await page.reload({ waitUntil: 'load' });
  await appReady(page);
  s = await state();
  await tv.check(s.toggle === 'En el carro (1)' && s.carro[0] && s.carro[0].name === 'Lubina a la plancha' && s.pend.length === 3, 'Tras recargar, la lubina sigue «En el carro (1)»', JSON.stringify(s));
  // Plegar «En el carro»
  await page.locator('.carro-toggle').click();
  await tv.check((await page.locator('.carro-panel').isHidden()) && (await page.locator('.carro-toggle').getAttribute('aria-expanded')) === 'false', '«En el carro» se pliega (aria-expanded=false)');
  await page.locator('.carro-toggle').click();
  // Desmarcar
  await box('Lubina a la plancha').click();
  await page.waitForTimeout(400);
  s = await state();
  await tv.check(s.count === '4 pendientes' && s.carro.length === 0 && s.pend[0].name === 'Lubina a la plancha', 'Desmarcar devuelve la lubina a pendiente (y a su sitio en el orden)', JSON.stringify(s.pend.map((x) => x.name)));

  // Vaciar lo comprado
  await box('Lubina a la plancha').click(); await page.waitForTimeout(200);
  await box('Tortilla').click(); await page.waitForTimeout(300);
  s = await state();
  await tv.check(s.toggle === 'En el carro (2)' && s.count === '2 pendientes', 'Dos comprados: «En el carro (2)» y «2 pendientes»', JSON.stringify({ t: s.toggle, c: s.count }));
  const vb = await page.locator('button[data-action=vaciar-comprado]').boundingBox();
  await tv.check(!!vb && vb.height >= 47.5, '«Vaciar lo comprado» mide ≥ 48 px', vb ? String(Math.round(vb.height)) : 'no está');
  await page.locator('button[data-action=vaciar-comprado]').click();
  await page.waitForTimeout(400);
  s = await state();
  const st2 = parseJSON((await storage(page))['pc.v1.list'], []);
  await tv.check(s.carro.length === 0 && s.toggle === null && s.pend.map((x) => x.name).join() === 'Xyzzy,Sushi' && st2.length === 2, '«Vaciar lo comprado» borra los comprados y deja Xyzzy y Sushi', JSON.stringify({ s: s.pend, n: st2.length }));

  // Compartir: portapapeles (sin navigator.share)
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
  await page.locator('button[data-action=compartir]').click();
  await page.waitForTimeout(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERROR ' + e.message);
  await tv.check(clip === 'Mi lista de la compra\n- Xyzzy\n- Sushi\n\nHecha con ¿Puedo comerlo? · by Bruno Marcial\nhttps://puedo-comerlo.vercel.app', 'Compartir copia «Mi lista de la compra» y «- Nombre» de lo pendiente', JSON.stringify(clip));
  await tv.check(!/S[ií]\b|Con cuidado|Mejor no|No estoy segura|embarazo|semáforo|listeria/i.test(clip.replace(/Sushi/g, '')), 'El texto compartido no lleva semáforo, frases ni «embarazo»', JSON.stringify(clip));
  s = await state();
  await tv.check(s.msg === 'Lista copiada.', 'Aviso «Lista copiada.»', s.msg);
  // Con navigator.share
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shared = d; }, configurable: true }));
  await box('Xyzzy').click(); await page.waitForTimeout(300);
  await page.locator('button[data-action=compartir]').click();
  await page.waitForTimeout(400);
  const shared = await page.evaluate(() => window.__shared || null);
  await tv.check(!!shared && shared.title === 'Mi lista de la compra' && shared.text === 'Mi lista de la compra\n- Sushi\n\nHecha con ¿Puedo comerlo? · by Bruno Marcial\nhttps://puedo-comerlo.vercel.app', 'Con navigator.share se comparte solo lo pendiente (Xyzzy ya está en el carro)', JSON.stringify(shared));
  s = await state();
  await tv.check(s.msg === 'Lista compartida.', 'Aviso «Lista compartida.»', s.msg);
  // Sin pendientes no hay «Compartir la lista»
  await box('Sushi').click(); await page.waitForTimeout(300);
  s = await state();
  await tv.check(!s.share && s.count === '0 pendientes', 'Sin nada pendiente se oculta «Compartir la lista»', JSON.stringify({ c: s.count, sh: s.share }));
  await tv.check(await seen(page, 'No queda nada pendiente.', { timeout: 1000 }), 'Y dice «No queda nada pendiente.»');

  // Quitar todo → vacío con plato y la línea literal
  for (let i = 0; i < 3; i++) { const q = page.locator('button.quiet-btn[aria-label^="Quitar"]').first(); if (await q.count()) { await q.click(); await page.waitForTimeout(250); } }
  const ea = await emptyArt(page);
  await tv.check(!!ea && ea.artHidden === 'true' && ea.svgBad === 0 && ea.text.includes(TXT.listaVacia), 'Lista vacía: plato decorativo y la línea literal «Todavía no hay nada…»', JSON.stringify(ea));
  s = await state();
  await tv.check(!s.share && s.count === null, 'Lista vacía: sin barra de compartir', JSON.stringify(s));
  await tv.shot('lista-vacia');

  // Datos antiguos (sin `done`): cuentan como pendientes
  await page.evaluate(() => localStorage.setItem('pc.v1.list', JSON.stringify([
    { id: 'old1', via: 'busqueda', title: 'sushi', level: 'no', phrase: 'Crudo, mejor no.', foodId: 'pescado-crudo', at: Date.now() - 86400000, payload: { kind: 'texto', text: 'sushi' } },
    { id: 'old2', via: 'guia', title: 'Agua', level: 'si', phrase: 'Sí: agua.', foodId: 'agua', at: Date.now() - 1000 },
  ])));
  await page.reload({ waitUntil: 'load' }); await appReady(page);
  s = await state();
  await tv.check(s.count === '2 pendientes' && s.pend.length === 2 && s.pend.every((x) => x.done === 'false') && s.pend.map((x) => x.level).join() === 'si,no', 'Datos antiguos sin `done`: dos pendientes (Sí antes que Mejor no), ninguno marcado', JSON.stringify(s.pend));
  await box('Sushi').click(); await page.waitForTimeout(300);
  const st3 = parseJSON((await storage(page))['pc.v1.list'], []);
  await tv.check(st3.find((x) => x.id === 'old1').done === true && st3.find((x) => x.id === 'old2').done !== true, 'Marcar un dato antiguo escribe done:true solo en él', JSON.stringify(st3.map((x) => [x.id, x.done])));

  // Borrar todos los datos: lista (con comprados) y todo lo demás fuera
  await go(page, '#/ajustes');
  await tap(page, TXT.borrar);
  await tap(page, 'Borrar todo', { loose: false });
  await waitHash(page, /arranque\/1/, 5000);
  const keys = Object.keys(await storage(page)).filter((k) => k.startsWith('pc.'));
  await tv.check(keys.length === 0, 'Borrar los datos con lista, comprados y favoritos: no queda ninguna clave pc.*', keys.join(', '));
  void ctx;
}

async function s15note(tv, browser, vp) {
  // La nota «Sale «Mejor no» con tus ajustes» solo en «Mejor no» sin tema detrás (motivo personal).
  // Perfil: «Otra cosa que no quieras comer» = agua (la guía dice «Sí»: el único motivo es lo que ella marcó).
  const { page } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h } });
  await seed(page, tv, { otra: 'agua', alergias: ['huevo'] });
  for (const id of ['agua', 'pescado-crudo', 'tortilla-patata']) { await go(page, '#/ficha/' + id); await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {}); await tap(page, 'Añadir a la lista', { loose: false }); }
  await go(page, '#/lista');
  await page.waitForTimeout(500);
  const notes = await page.evaluate(() => [...document.querySelectorAll('li.entry--shop')].map((li) => ({ name: li.querySelector('.entry-name').innerText.trim(), level: li.dataset.level, note: (li.querySelector('.entry-note') || {}).innerText || null, phrase: (li.querySelector('.entry-phrase') || {}).innerText || '' })));
  const agua = notes.find((x) => /^Agua$/.test(x.name)); const pez = notes.find((x) => /Pescado crudo/.test(x.name)); const tort = notes.find((x) => /Tortilla/.test(x.name));
  await tv.check(!!agua && agua.level === 'no' && agua.note === 'Sale «Mejor no» con tus ajustes', 'Agua marcada como «otra cosa que no quiero»: «Mejor no» sin tema → nota «Sale «Mejor no» con tus ajustes»', JSON.stringify(notes));
  await tv.check(!!pez && pez.level === 'no' && pez.note === null, 'Pescado crudo (tiene tema): sin esa nota', JSON.stringify(pez));
  await tv.check(!!tort && tort.level === 'no' && /Has marcado huevo/.test(tort.phrase), 'Tortilla con alergia al huevo: «Mejor no» y la propia frase dice «Has marcado huevo.»', JSON.stringify(tort));
  tv.info('Tortilla con alergia al huevo: nota «con tus ajustes»', tort && tort.note ? 'sí' : 'no (tiene tema huevo-crudo y la frase ya lo explica)');
  await snap(page, tv, 'lista-nota');
}

async function s15(t, browser) {
  for (const vp of VIEWPORTS) {
    const tv = tagged(t, `${vp.w}×${vp.h}`);
    await s15body(tv, browser, vp);
    await s15note(tv, browser, vp);
  }
}

// ---------- 16. Prueba de humo de /api/producto real (UNA llamada) ----------
async function s16(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t);
  await go(page, '#/super');
  const before = t.requests.filter((r) => /\/api\/producto/.test(r.url)).length;
  await codeSubmit(page, SMOKE_CODE);
  const t0 = Date.now();
  let outcome = 'timeout';
  while (Date.now() - t0 < 70000) {
    const h = await getHash(page);
    const txt = await bodyText(page);
    if (/resultado/.test(h) && (await page.locator('article.answer').count())) { outcome = 'resultado'; break; }
    if (txt.includes(MSG.noLoEncuentro)) { outcome = 'no-encontrado'; break; }
    if (/No he podido consultar/.test(txt)) { outcome = 'red'; break; }
    await page.waitForTimeout(500);
  }
  const reqs = t.requests.filter((r) => /\/api\/producto/.test(r.url));
  t.info('Humo 8424289001480', `${outcome} en ${Math.round((Date.now() - t0) / 1000)} s; peticiones a /api/producto: ${reqs.length - before}`);
  await t.check(outcome === 'resultado' || outcome === 'no-encontrado', 'Prueba de humo con 8424289001480: la app termina en una respuesta o en «No lo encuentro…», sin colgarse', outcome);
  await t.check(reqs.length - before <= 1, 'Como mucho UNA llamada a /api/producto', String(reqs.length - before));
  // El estado real de /api/producto: 200 (con o sin producto). En local, sin clave de Anthropic, 503 es lo esperado;
  // en producción un 5xx es un fallo real del servicio (la app lo tolera y sigue con OFF y la foto, pero hay que saberlo).
  const local = /127\.0\.0\.1|localhost/.test(BASE);
  const bad = t.events.filter((e) => e.type === 'http' && /\/api\/producto/.test(e.url)).map((e) => e.status);
  t.info('Estado real de /api/producto', bad.length ? bad.join(', ') : '200');
  await t.check(!bad.length || (local && bad.every((x) => x === 503)), local ? '/api/producto local responde 200 o 503 (sin clave)' : '/api/producto en producción responde 200 (no 5xx)', 'estados ≥ 400: ' + bad.join(', '));
  if (outcome === 'resultado') {
    const r = await resultInfo(page);
    t.info('Humo: resultado', JSON.stringify({ n: r.name, w: r.word, web: r.web && r.web.text, need: r.needTitle, label: r.label && r.label.title }));
    await t.check(!!r.word && LEVEL_WORDS.includes(r.word) && !!r.name, 'El producto del humo muestra nombre y palabra de nivel exacta', JSON.stringify({ n: r.name, w: r.word }));
    if (r.web) {
      await t.check(!!r.web.link && /^https?:\/\//.test(r.web.link.href) && /noopener/.test(r.web.link.rel || ''), 'Si vino de internet, enlace externo con rel noopener', JSON.stringify(r.web.link));
      await t.check(r.word === 'No estoy segura' || r.word === 'Mejor no' || r.word === 'Con cuidado', 'Los datos de internet nunca dan «Sí»', r.word);
    }
  }
  await snap(page, t, 'humo');
  await t.shot('humo-' + outcome);
}

// ======================================================================
// N9: «Ojo con esto», «Pregunta», ilustración por categoría y animación (escenarios 17 y 18)
// ======================================================================
const CASOS_OJO = [
  // [texto, nivel, ¿con «Ojo con esto»?, frase, categoría]
  ['filete de ternera', 'Sí', true, 'omitida', 'carne'],
  ['pescado a la plancha', 'Sí', true, 'omitida', 'pescado'],
  ['ensalada mixta', 'Sí', true, 'omitida', 'ensalada'],
  ['hamburguesa', 'Sí', true, 'distinta', 'carne'],
  ['café', 'Sí', true, 'distinta', 'bebida'],
  ['tortilla', 'Con cuidado', false, 'presente', 'huevo'],
  ['sushi', 'Mejor no', false, 'presente', 'generico'],
  ['xyzzy', 'No estoy segura', false, 'presente', 'generico'],
];
const CATEGORIAS_NOMBRE = [
  ['queso fresco', 'queso'], ['paella de marisco', 'arroz'], ['pizza margarita', 'pasta'], ['gazpacho', 'cuenco'], ['tarta de queso', 'postre'],
  ['jamón serrano', 'embutido'], ['lentejas', 'legumbres'], ['pan con tomate', 'pan'], ['manzana', 'fruta'], 
  ['pollo asado', 'ave'], ['brócoli', 'verdura'], ['mojito', 'bebida'], ['tabla de quesos', 'queso'],
];
// Muestra de carta realista: nombre → nivel esperado con el perfil neutro (el reparto completo lo mide tests/engine.test.js)
const MUESTRA_CARTA = [
  ['Filete de ternera a la plancha', 'Sí'], ['Merluza a la plancha', 'Sí'], ['Ensalada mixta', 'Sí'], ['Hamburguesa con patatas', 'Sí'], ['Paella de marisco', 'Sí'],
  ['Croquetas de jamón', 'Sí'], ['Pizza margarita', 'Sí'], ['Lentejas estofadas', 'Sí'], ['Gazpacho andaluz', 'Sí'], ['Tarta de queso', 'Sí'], ['Helado de vainilla', 'Sí'],
  ['Café con leche', 'Sí'], ['Carrillera al vino tinto', 'Sí'], ['Empanada de atún', 'Sí'], ['Pollo asado', 'Sí'], ['Pan con tomate', 'Sí'], ['Mejillones al vapor', 'Sí'],
  ['Macarrones con tomate', 'Sí'], ['Fruta del tiempo', 'Sí'], ['Flan de huevo', 'Sí'],
  ['Tortilla de patata', 'Con cuidado'], ['Ensaladilla rusa', 'Con cuidado'], ['Ensalada César', 'Con cuidado'], ['Tabla de quesos', 'Con cuidado'], ['Helado casero', 'Con cuidado'],
  ['Sushi variado', 'Mejor no'], ['Jamón serrano', 'Mejor no'], ['Tiramisú', 'Mejor no'], ['Steak tartar', 'Mejor no'], ['Mojito', 'Mejor no'], ['Entrecot poco hecho', 'Mejor no'],
];

async function answerFacts(page) {
  return page.evaluate(() => {
    const a = document.querySelector('article.answer'); if (!a) return null;
    const q = (s) => a.querySelector(s);
    const art = q('.answer-art');
    const svgs = [...a.querySelectorAll('.answer-art svg')];
    return {
      level: a.dataset.level,
      word: (q('.answer-word') || {}).textContent,
      phrase: q('.answer-phrase') ? q('.answer-phrase').textContent.trim() : null,
      ojo: !!q('section.ojo .ojo-title'),
      ojoTitle: q('.ojo-title') ? q('.ojo-title').textContent.trim() : null,
      ojoItems: [...a.querySelectorAll('ul.ojo-list li')].map((x) => x.textContent.trim()),
      qTitle: q('.ojo-q-title') ? q('.ojo-q-title').textContent.trim() : null,
      q: q('.ojo-q') ? q('.ojo-q').textContent.trim() : null,
      more: a.querySelector('.more') ? a.querySelector('.more').textContent : '',
      cat: art ? art.dataset.cat : null,
      artHidden: art ? art.getAttribute('aria-hidden') : null,
      fx: !!q('.answer-fx'), fxHidden: q('.answer-fx') ? !!q('.answer-fx').closest('[aria-hidden=true]') : null,
      svgBad: svgs.reduce((n, s) => n + s.querySelectorAll('text, tspan, image, style, foreignObject, script').length, 0),
      nSvg: svgs.length,
    };
  });
}

async function s17body(tv, browser, vp) {
  const { page } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h } });
  await seed(page, tv);
  await go(page, '#/buscar');
  const box = page.locator('#buscar-q');
  let primerSi = false, primerCuidado = false;
  for (const [q, nivel, tieneOjo, frase, cat] of CASOS_OJO) {
    await box.fill(q); await box.press('Enter');
    await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {});
    const ts = await settledTone(page);
    const f = await answerFacts(page);
    if (!f) { await tv.check(false, `«${q}»: hay respuesta`); continue; }
    await tv.check(f.word === nivel, `«${q}» → «${nivel}»`, f.word);
    if (tieneOjo) {
      await tv.check(f.ojo && f.ojoTitle === 'Ojo con esto' && f.ojoItems.length >= 1 && f.ojoItems.length <= 3, `«${q}»: section.ojo con «Ojo con esto» y 1–3 avisos`, JSON.stringify(f.ojoItems));
      await tv.check(f.ojoItems.every((x) => x.length <= 70 && x.length >= 3), `«${q}»: ningún aviso pasa de 70 caracteres`, JSON.stringify(f.ojoItems.map((x) => x.length)));
      const norm2 = (x) => norm(x).replace(/[^a-z0-9 ]/g, '').replace(/^(si|con cuidado) /, '').trim();
      const dup = f.phrase !== null && f.ojoItems.some((x) => norm2(x) === norm2(f.phrase));
      if (frase === 'omitida') await tv.check(!dup, `«${q}»: la frase no repite ningún aviso (se omite si coincide)`, JSON.stringify({ phrase: f.phrase, ojo: f.ojoItems }));
      else await tv.check(f.phrase !== null && f.phrase.length > 3 && !dup, `«${q}»: frase y aviso distintos, los dos a la vista`, JSON.stringify({ phrase: f.phrase, ojo: f.ojoItems }));
      tv.info(`«${q}»: frase`, f.phrase === null ? '(omitida)' : f.phrase);
    } else {
      await tv.check(!f.ojo && f.ojoItems.length === 0, `«${q}»: sin «Ojo con esto»`, JSON.stringify(f.ojoItems));
      await tv.check(f.phrase !== null && f.phrase.length > 3, `«${q}»: lleva su frase`, String(f.phrase));
    }
    if (nivel === 'Con cuidado') {
      await tv.check(f.qTitle === 'Pregunta' && /^¿.+\?$/.test(f.q || ''), `«${q}»: bloque «Pregunta» con .ojo-q (una pregunta)`, JSON.stringify([f.qTitle, f.q]));
      await tv.check(!f.more.includes(f.q || '\u0000'), `«${q}»: la pregunta no se repite en «Ver más»`, short(f.more, 160));
    } else await tv.check(f.qTitle === null, `«${q}»: sin bloque «Pregunta»`, String(f.qTitle));
    await tv.check(f.cat === cat && f.artHidden === 'true' && f.svgBad === 0 && f.nSvg >= 1, `«${q}»: ilustración .answer-art[data-cat=${cat}] decorativa (SVG sin text/image/style)`, JSON.stringify({ cat: f.cat, h: f.artHidden, bad: f.svgBad }));
    await tv.check(nivel === 'Mejor no' ? !f.fx : (f.fx && f.fxHidden), nivel === 'Mejor no' ? `«${q}»: «Mejor no» sin destellos (lleva su cruz)` : `«${q}»: destellos .answer-fx decorativos`, JSON.stringify({ fx: f.fx, hidden: f.fxHidden }));
    await tv.check(ts.cross === (nivel === 'Mejor no' ? 1 : 0), nivel === 'Mejor no' ? `«${q}»: cruz .tcross` : `«${q}»: sin cruz`, String(ts.cross));
    if (tieneOjo && !primerSi && nivel === 'Sí') {
      primerSi = true;
      const gc = await guidedContrast(page, 'section.ojo');
      await tv.check(!!gc && gc.n >= 2 && gc.low.length === 0, '«Ojo con esto» sobre el verde con contraste ≥ 4,5:1', gc ? gc.low.join(' | ') : 'sin bloque');
      const pr = await auditScreen(page);
      await tv.check(pr.length === 0, '«Sí» con «Ojo con esto»: maquetación sin desborde, controles ≥ 48 px, nada tapado', pr.join(' | '));
      await tv.shot('si-filete');
    }
    if (nivel === 'Con cuidado' && !primerCuidado) {
      primerCuidado = true;
      const gc = await guidedContrast(page, 'section.ojo');
      await tv.check(!!gc && gc.n >= 2 && gc.low.length === 0, '«Pregunta» sobre el naranja con contraste ≥ 4,5:1', gc ? gc.low.join(' | ') : 'sin bloque');
      const pr = await auditScreen(page);
      await tv.check(pr.length === 0, '«Con cuidado» con «Pregunta»: maquetación sin desborde, controles ≥ 48 px, nada tapado', pr.join(' | '));
      await tv.shot('cuidado-tortilla');
    }
    await snap(page, tv, 'ojo-' + slug(q));
  }
  // Mapeo de categorías por palabras del nombre
  const malas = [];
  for (const [q, cat] of CATEGORIAS_NOMBRE) {
    await box.fill(q); await box.press('Enter');
    await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {});
    const f = await answerFacts(page);
    if (!f || f.cat !== cat) malas.push(`${q}: ${f && f.cat} (esperada ${cat})`);
  }
  await tv.check(malas.length === 0, `La categoría de la ilustración sale de las palabras del nombre (${CATEGORIAS_NOMBRE.length} muestras)`, malas.join(' | '));
  // Caso aparte: el nombre de la ficha («marisco cocido») no debe ganar al marisco con la palabra «cocido» (regla de «cuenco»)
  const cocidos = [];
  for (const [q, cat] of [['gambas al ajillo', 'marisco'], ['gambas', 'marisco'], ['jamón cocido', 'embutido'], ['huevo cocido', 'huevo']]) {
    await box.fill(q); await box.press('Enter');
    await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {});
    const f = await answerFacts(page);
    if (!f || f.cat !== cat) cocidos.push(`${q}: ${f && f.cat} (esperada ${cat})`);
  }
  await tv.check(cocidos.length === 0, 'Un plato con «cocido» en el nombre de su ficha (marisco cocido…) conserva su categoría y no pasa a «cuenco»', cocidos.join(' | '));

  // Filas: miniatura y segunda línea con el primer aviso
  for (const q of ['filete de ternera', 'tortilla', 'sushi', 'xyzzy', 'gazpacho', 'café']) {
    await box.fill(q); await box.press('Enter');
    await page.waitForSelector('article.answer', { timeout: 6000 }).catch(() => {});
    await tap(page, 'Añadir a la lista', { loose: false });
  }
  await go(page, '#/lista');
  await page.waitForTimeout(600);
  const rows = await page.evaluate(() => [...document.querySelectorAll('li.entry--shop')].map((li) => ({
    name: li.querySelector('.entry-name').innerText.trim(), level: li.dataset.level,
    thumb: li.querySelector('.entry-thumb') ? { cat: li.querySelector('.entry-thumb').dataset.cat, hidden: li.querySelector('.entry-thumb').getAttribute('aria-hidden'), bad: li.querySelectorAll('.entry-thumb svg text, .entry-thumb svg image, .entry-thumb svg style').length } : null,
    hasThumb: li.classList.contains('has-thumb'),
    ojo: li.querySelector('.entry-ojo-text') ? li.querySelector('.entry-ojo-text').textContent.trim() : null,
    phrase: li.querySelector('.entry-phrase') ? li.querySelector('.entry-phrase').textContent.trim() : null,
    more: li.querySelector('.more') ? li.querySelector('.more').textContent : '',
    ojoH: li.querySelector('.entry-ojo') ? Math.round(li.querySelector('.entry-ojo').getBoundingClientRect().height) : 0,
  })));
  await tv.check(rows.length === 6 && rows.every((x) => x.thumb && x.hasThumb && x.thumb.hidden === 'true' && x.thumb.bad === 0), 'Lista: cada fila lleva .entry-thumb[data-cat] decorativo (li.entry.has-thumb)', JSON.stringify(rows.map((x) => [x.name, x.thumb && x.thumb.cat])));
  const fil = rows.find((x) => /Filete/.test(x.name)); const cafe = rows.find((x) => /Caf/.test(x.name)); const tor = rows.find((x) => /Tortilla/.test(x.name)); const sus = rows.find((x) => /Sushi/.test(x.name)); const xyz = rows.find((x) => /Xyzzy/.test(x.name)); const gaz = rows.find((x) => /Gazpacho/.test(x.name));
  await tv.check(!!fil && fil.ojo === null && !!fil.phrase, 'Fila «Sí» cuyo aviso repite la frase (filete): solo la frase, sin segunda línea duplicada', JSON.stringify([fil && fil.ojo, fil && fil.phrase]));
  await tv.check(!!cafe && !!cafe.ojo && cafe.ojo.length <= 70 && !!cafe.phrase && norm(cafe.phrase) !== norm(cafe.ojo), 'Fila «Sí» con aviso distinto (café): frase y segunda línea .entry-ojo con el aviso', JSON.stringify([cafe && cafe.ojo, cafe && cafe.phrase]));
  await tv.check(!!gaz && gaz.level === 'si' && !!gaz.ojo && gaz.ojo.length <= 70 && norm(gaz.ojo) !== norm(gaz.phrase || ''), 'Fila «Sí» con 2 avisos (gazpacho): .entry-ojo con uno que no repite la frase', JSON.stringify([gaz && gaz.ojo, gaz && gaz.phrase]));
  await tv.check(!!sus && sus.ojo === null && !!xyz && xyz.ojo === null && !!tor, 'Filas «Mejor no» y «No estoy segura»: sin .entry-ojo', JSON.stringify([sus && sus.ojo, xyz && xyz.ojo]));
  await tv.check(rows.every((x) => x.ojo === null || x.ojoH <= 30), 'La línea de aviso de una fila ocupa una sola línea', JSON.stringify(rows.map((x) => x.ojoH)));
  await snap(page, tv, 'lista-ojo');
  const prl = await auditScreen(page);
  await tv.check(prl.length === 0, 'Lista con miniaturas y avisos: sin desborde, controles ≥ 48 px, nada tapado', prl.join(' | '));
  await tv.shot('lista-con-ojo');

  // Muestra de carta realista (resultado guardado) y su reparto
  await page.evaluate((names) => {
    const items = names.map((n) => ({ name: n, ingredients: [], uncertain: false }));
    localStorage.setItem('pc.v1.result', JSON.stringify({ title: 'La carta', via: 'foto', items: [], notice: null, payload: { kind: 'carta', items } }));
  }, MUESTRA_CARTA.map((x) => x[0]));
  await go(page, '#/resultado');
  await page.waitForTimeout(1200);
  const res = await pills(page);
  const malos = MUESTRA_CARTA.filter(([n, lv]) => { const r = res.find((x) => x.name === n); return !r || r.label !== lv; }).map(([n, lv]) => `${n}: ${(res.find((x) => x.name === n) || {}).label} (esperado ${lv})`);
  await tv.check(res.length === MUESTRA_CARTA.length && malos.length === 0, `Muestra de carta realista (${MUESTRA_CARTA.length} platos): cada plato con su nivel recalibrado`, malos.join(' | '));
  const cnt = (lv) => res.filter((x) => x.label === lv).length;
  const riesgo = MUESTRA_CARTA.filter((x) => x[1] === 'Mejor no').length;
  const sinRiesgo = res.length - riesgo;
  tv.info('Reparto de la muestra', `Sí ${cnt('Sí')} · Con cuidado ${cnt('Con cuidado')} · Mejor no ${cnt('Mejor no')} · No estoy segura ${cnt('No estoy segura')}`);
  await tv.check(cnt('Sí') / sinRiesgo >= 0.8 && cnt('Con cuidado') / res.length <= 0.2 && cnt('No estoy segura') === 0, 'Sin contar el riesgo real, la carta sale ≥ 80 % en «Sí» y sin «No estoy segura»', `${cnt('Sí')}/${sinRiesgo}`);
  const crow = await page.evaluate(() => [...document.querySelectorAll('ul.entries > li.entry')].map((li) => ({ name: li.querySelector('.entry-name').innerText.trim(), level: li.dataset.level, thumb: !!li.querySelector('.entry-thumb[data-cat]'), ojo: li.querySelector('.entry-ojo-text') ? li.querySelector('.entry-ojo-text').textContent.trim() : null, phrase: (li.querySelector('.entry-phrase') || {}).textContent || null })));
  const emp = await page.evaluate(() => { const li = [...document.querySelectorAll('ul.entries > li.entry')].find((x) => /Empanada/.test(x.querySelector('.entry-name').innerText)); if (!li) return null; const b = li.querySelector('.more-btn'); if (b) b.click(); return { first: (li.querySelector('.entry-ojo-text') || {}).textContent || null, more: (li.querySelector('.more') || {}).textContent || '' }; });
  await tv.check(!!emp && !!emp.first && /Ojo con esto/.test(emp.more), 'Fila con varios avisos (empanada de atún): el primero en la fila y el resto en «Ver más» bajo «Ojo con esto»', JSON.stringify(emp && [emp.first, short(emp.more, 160)]));
  await tv.check(crow.every((x) => x.thumb), 'Carta: cada fila lleva su miniatura .entry-thumb[data-cat]', crow.filter((x) => !x.thumb).map((x) => x.name).join(', '));
  await tv.check(crow.every((x) => x.ojo === null || (x.level !== 'no' && x.level !== 'duda' && x.ojo.length <= 70)), 'Carta: solo las filas «Sí» y «Con cuidado» llevan aviso (≤ 70 caracteres)', JSON.stringify(crow.filter((x) => x.ojo).map((x) => [x.level, x.ojo.length])));
  await snap(page, tv, 'carta-muestra');
  const prc = await auditScreen(page);
  await tv.check(prc.length === 0, 'Carta con miniaturas y avisos: sin desborde, controles ≥ 48 px, nada tapado', prc.join(' | '));
  await tv.shot('carta-muestra');
  // Historial
  await go(page, '#/historial');
  const hrows = await page.evaluate(() => [...document.querySelectorAll('ul.entries > li.entry')].map((li) => !!li.querySelector('.entry-thumb[data-cat]')));
  await tv.check(hrows.length >= 3 && hrows.every(Boolean), 'Historial: filas con miniatura', JSON.stringify(hrows));

  // Los avisos de toda la guía: 0–3, ≤ 70 caracteres, sin «evitar» ni «seguro»
  const foods = await page.evaluate(async () => { const m = await import(new URL('src/engine/foods.js', location.href).href); return m.FOODS.map((f) => ({ id: f.id, ojo: f.ojo || [] })); });
  const malosOjo = foods.filter((f) => f.ojo.length > 3 || f.ojo.some((x) => x.length > 70 || /\bevitar\b|\bsegur[oa]s?\b/i.test(x))).map((f) => f.id);
  await tv.check(foods.length === 145 && malosOjo.length === 0, 'Guía: ningún `ojo` pasa de 3 avisos ni de 70 caracteres ni dice «evitar»/«seguro»', malosOjo.join(', ') + ` · ${foods.filter((f) => f.ojo.length).length} fichas con aviso`);
}

async function s17(t, browser) {
  for (const vp of VIEWPORTS) await s17body(tagged(t, `${vp.w}×${vp.h}`), browser, vp);
}

// ---------- 18. Animación e ilustración ----------
const LENTAS = /chispa|vapor|flota|float|destello|brillo|gota|steam|glint|tm-float/i;
const anims = (page, only = 'running') => page.evaluate((only) => document.getAnimations().filter((a) => only === 'all' || a.playState === 'running' || a.playState === 'pending').map((a) => ({ name: a.animationName || ('transition:' + a.transitionProperty), infinite: !!(a.effect && a.effect.getComputedTiming().iterations === Infinity), state: a.playState })), only);

async function s18body(tv, browser, vp) {
  // --- sin reducción de movimiento ---
  const { page } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h } });
  await seed(page, tv);
  await go(page, '#/');
  await page.waitForTimeout(500);
  const hp = await page.evaluate(() => { const p = document.querySelector('.home-plate'); if (!p) return null; return { hidden: p.getAttribute('aria-hidden'), bad: p.querySelectorAll('text, tspan, image, style').length, n: p.querySelectorAll('svg').length }; });
  await tv.check(!!hp && hp.hidden === 'true' && hp.bad === 0 && hp.n >= 1, 'Inicio: .home-plate decorativo (cuenco con vapor, sin text/image/style)', JSON.stringify(hp));

  // Dirección de la entrada: adelante, atrás, ninguna al abrir
  const dir = () => page.evaluate(() => (document.querySelector('main') || {}).dataset ? document.querySelector('main').dataset.dir || null : null);
  const viewport = () => page.evaluate(() => { const de = document.documentElement; const n = document.querySelector('.tabbar, nav'); const r = n ? n.getBoundingClientRect() : null; return { sw: de.scrollWidth, cw: de.clientWidth, iw: innerWidth, vv: window.visualViewport ? Math.round(window.visualViewport.width) : null, navL: r ? Math.round(r.left) : null, navR: r ? Math.round(r.right) : null }; });
  const okVp = (v) => v.sw <= v.iw && v.cw <= v.iw && (v.vv === null || v.vv <= v.iw) && v.navL >= -1 && v.navR <= v.iw + 1;
  const bad = [];
  const sample = async (what) => { for (const ms of [30, 120, 250, 600]) { await page.waitForTimeout(ms === 30 ? 30 : ms - [0, 30, 120, 250][[30, 120, 250, 600].indexOf(ms)]); const v = await viewport(); if (!okVp(v)) bad.push(`${what} @${ms}ms ${JSON.stringify(v)}`); } };
  await page.evaluate(() => { location.hash = '#/ficha/agua'; });
  await page.waitForTimeout(40);
  const d1 = await dir();
  await sample('adelante a la ficha');
  await page.evaluate(() => history.back());
  await page.waitForTimeout(40);
  const d2 = await dir();
  await sample('atrás a Inicio');
  await page.evaluate(() => history.forward());
  await page.waitForTimeout(40);
  const d3 = await dir();
  await sample('adelante otra vez');
  await tv.check(d1 === 'fwd' && d2 === 'back' && d3 === 'fwd', 'main[data-dir]: «fwd» al avanzar, «back» al volver', JSON.stringify([d1, d2, d3]));
  await tv.check(bad.length === 0, 'Navegar adelante y atrás no ensancha el layout viewport ni deja la barra inferior fuera (scrollWidth ≤ innerWidth durante la animación)', bad.join(' | '));
  const d0 = await (async () => { const { page: p0 } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h } }); await seed(p0, tv); const x = await p0.evaluate(() => document.querySelector('main').dataset.dir || null); await p0.close(); return x; })();
  await tv.check(d0 === 'none', 'Al abrir la app, main[data-dir=none] (sin entrada direccional)', String(d0));

  // Marca de la pestaña: se desliza entre destinos
  const tabs = {};
  for (const [name, hash, i] of [['Inicio', '#/', 0], ['Fuera', '#/fuera', 1], ['Súper', '#/super', 2], ['Lista', '#/lista', 3]]) {
    await go(page, hash); await page.waitForTimeout(700);
    tabs[name] = await page.evaluate(() => { const l = document.querySelector('.tabbar-list'); const a = getComputedStyle(l, '::after'); const m = a.transform && a.transform !== 'none' ? new DOMMatrix(a.transform).m41 : 0; return { i: getComputedStyle(l).getPropertyValue('--tab-i').trim(), tx: Math.round(m), op: a.opacity, has: !!document.querySelector('.tabbar.has-tab'), content: a.content }; });
  }
  await tv.check(['Inicio', 'Fuera', 'Súper', 'Lista'].every((n, i) => tabs[n].i === String(i) && tabs[n].has && tabs[n].op === '1'), 'Marca de pestaña (.tabbar-list::after): --tab-i 0,1,2,3 y visible en cada destino', JSON.stringify(tabs));
  await tv.check(tabs['Inicio'].tx === 0 && tabs['Fuera'].tx > 0 && tabs['Súper'].tx > tabs['Fuera'].tx && tabs['Lista'].tx > tabs['Súper'].tx, 'La marca se desliza: su desplazamiento crece de Inicio a Lista', JSON.stringify(Object.entries(tabs).map(([k, v]) => [k, v.tx])));
  await go(page, '#/ficha/agua'); await page.waitForTimeout(700);
  const noTab = await page.evaluate(() => ({ has: !!document.querySelector('.tabbar.has-tab'), op: getComputedStyle(document.querySelector('.tabbar-list'), '::after').opacity }));
  await tv.check(!noTab.has && noTab.op === '0', 'En una pantalla sin pestaña la marca desaparece', JSON.stringify(noTab));

  // Ripple: se crea al pulsar y se retira
  await go(page, '#/');
  await page.waitForTimeout(600);
  const rip = await page.evaluate(async () => {
    const el = document.querySelector('a.tile'); const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40, button: 0, pointerType: 'touch' }));
    const during = el.querySelectorAll('.ripple').length; const hid = el.querySelector('.ripple') ? el.querySelector('.ripple').getAttribute('aria-hidden') : null;
    await new Promise((res) => setTimeout(res, 1200));
    return { during, hid, after: el.querySelectorAll('.ripple').length };
  });
  await tv.check(rip.during === 1 && rip.hid === 'true' && rip.after === 0, 'Ripple de los botones: se crea (aria-hidden) al pulsar y se retira solo', JSON.stringify(rip));

  // Lista de la compra: check que se dibuja
  await go(page, '#/ficha/agua'); await tap(page, 'Añadir a la lista', { loose: false });
  await go(page, '#/lista'); await page.waitForTimeout(500);
  const tick = await page.evaluate(() => { const w = document.querySelector('.buy-wrap'); const t = w && w.querySelector('.buy-tick'); return t ? { hidden: t.getAttribute('aria-hidden'), path: t.querySelectorAll('path, polyline').length, bad: t.querySelectorAll('text, image, style').length } : null; });
  await tv.check(!!tick && tick.hidden === 'true' && tick.path >= 1 && tick.bad === 0, 'Casilla de compra: .buy-tick decorativo con el trazo del check', JSON.stringify(tick));
  await page.locator('input.buy-box').first().click();
  await page.waitForTimeout(150);
  const arr = await page.evaluate(() => ({ arriving: document.querySelectorAll('li.entry.is-arriving').length, checked: document.querySelectorAll('input.buy-box:checked').length }));
  await tv.check(arr.checked === 1, 'Marcar comprado: la casilla queda marcada (y la fila llega con .is-arriving)', JSON.stringify(arr));
  await page.waitForTimeout(1200);
  const arr2 = await page.evaluate(() => document.querySelectorAll('li.entry.is-arriving').length);
  tv.info('Filas .is-arriving a los 1,3 s', String(arr2));

  // Claves: acordeón sin `hidden`
  await go(page, '#/claves'); await page.waitForTimeout(500);
  const acc0 = await page.evaluate(() => [...document.querySelectorAll('li.clave')].map((l) => { const p = l.querySelector('.clave-panel'); const cs = getComputedStyle(p); return { hiddenAttr: p.hasAttribute('hidden'), vis: cs.visibility, h: Math.round(p.getBoundingClientRect().height), inner: !!l.querySelector('.clave-panel-in'), exp: l.querySelector('.clave-head').getAttribute('aria-expanded') }; }));
  await tv.check(acc0.length === 8 && acc0.every((x) => !x.hiddenAttr && x.inner && x.exp === 'false' && (x.vis === 'hidden' || x.h === 0)), 'Claves cerradas: sin `hidden`, con .clave-panel-in, aria-expanded=false y contenido invisible (visibility:hidden o altura 0)', JSON.stringify(acc0[0]));
  await page.locator('li.clave .clave-head').nth(1).click();
  await page.waitForTimeout(900);
  const acc1 = await page.evaluate(() => { const l = document.querySelectorAll('li.clave')[1]; const p = l.querySelector('.clave-panel'); const cs = getComputedStyle(p); return { hiddenAttr: p.hasAttribute('hidden'), vis: cs.visibility, h: Math.round(p.getBoundingClientRect().height), exp: l.querySelector('.clave-head').getAttribute('aria-expanded'), others: [...document.querySelectorAll('li.clave')].filter((x, i) => i !== 1 && getComputedStyle(x.querySelector('.clave-panel')).visibility !== 'hidden' && x.querySelector('.clave-panel').getBoundingClientRect().height > 0).length }; });
  await tv.check(acc1.exp === 'true' && acc1.vis === 'visible' && acc1.h > 40 && !acc1.hiddenAttr && acc1.others === 0, 'Clave abierta: aria-expanded=true y el contenido se ve; las demás siguen invisibles', JSON.stringify(acc1));
  const prc = await auditScreen(page);
  await tv.check(prc.length === 0, 'Claves (acordeón): sin desborde, controles ≥ 48 px, nada tapado por el pie', prc.join(' | '));

  // Respuesta «Sí»: hay animaciones al entrar y, pasados ~2 s, solo quedan bucles lentos permitidos
  await go(page, '#/buscar?q=' + encodeURIComponent('filete de ternera'));
  await page.waitForTimeout(250);
  const enter = await anims(page);
  await tv.check(enter.length > 0, '«Sí» (filete): hay animaciones al entrar (barrido, chispas, pop de la ilustración)', JSON.stringify(enter.slice(0, 6)));
  await page.waitForTimeout(2600);
  const later = await anims(page);
  const raras = later.filter((a) => !a.infinite || !LENTAS.test(a.name));
  tv.info('«Sí» a los ~2,8 s: animaciones en marcha', JSON.stringify(later.map((a) => a.name)));
  await tv.check(raras.length === 0, 'A los ~2 s solo quedan los bucles lentos permitidos (chispas, vapor, «?»); nada más corre', JSON.stringify(raras));

  // Carga con .skel
  const ctx2 = page.context();
  await ctx2.route('**/world.openfoodfacts.org/api/v2/product/*', async (route) => { await sleep(2500); route.fulfill({ status: 404, contentType: 'application/json', body: '{"status":0}' }).catch(() => {}); });
  await ctx2.route('**/api/producto', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"sin_vision"}' }));
  await go(page, '#/super');
  await codeSubmit(page, '8412345600001');
  await page.waitForSelector('.status', { timeout: 4000 }).catch(() => {});
  const sk = await page.evaluate(() => ({ n: document.querySelectorAll('.status-body .skel').length, hidden: [...document.querySelectorAll('.status-body .skel')].every((x) => x.getAttribute('aria-hidden') === 'true'), text: (document.querySelector('.status-body .status-text') || {}).textContent || '', empty: [...document.querySelectorAll('.status-body .skel')].every((x) => x.textContent.trim() === '') }));
  await tv.check(sk.n >= 2 && sk.hidden && sk.empty && /Buscando/.test(sk.text), 'Carga: dos barras .skel (aria-hidden, sin texto) junto al texto en .status-text', JSON.stringify(sk));
  await tv.shot('carga-skel');

  // --- con reducción de movimiento ---
  const { page: rp } = await tv.newPage(browser, { viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' });
  await seed(rp, tv);
  for (const [q, lv, key] of [['filete de ternera', 'Sí', 'si'], ['tortilla', 'Con cuidado', 'cuidado'], ['sushi', 'Mejor no', 'no'], ['xyzzy', 'No estoy segura', 'duda']]) {
    await go(rp, '#/buscar?q=' + encodeURIComponent(q));
    await rp.waitForTimeout(1600);
    const all = await anims(rp, 'all');
    const vis = await rp.evaluate(() => { const op = (s) => { const e = document.querySelector(s); return e ? Number(getComputedStyle(e).opacity) : null; }; const c = document.querySelector('#tone .tcross'); return { word: op('.answer-word'), art: op('.answer-art'), name: op('.answer-name'), phrase: op('.answer-phrase'), tm: [...document.querySelectorAll('#tone .tm')].map((x) => Number(getComputedStyle(x).opacity)), cross: c ? Number(getComputedStyle(c).opacity) : null }; });
    await tv.check(all.length === 0, `Reduced-motion «${lv}» (${q}): document.getAnimations().length === 0 a los 1,6 s`, JSON.stringify(all.slice(0, 6)));
    await tv.check(vis.word === 1 && vis.art === 1 && vis.name === 1 && (vis.phrase === null || vis.phrase === 1), `Reduced-motion «${lv}»: palabra, ilustración, nombre y frase visibles (opacidad 1)`, JSON.stringify(vis));
    if (key === 'no') await tv.check(vis.cross !== null && vis.cross > 0.05, 'Reduced-motion «Mejor no»: la cruz ya está dibujada y se ve', JSON.stringify(vis.cross));
    if (key === 'cuidado' || key === 'duda') await tv.check(vis.tm.length >= 1 && vis.tm.every((o) => o > 0.05), `Reduced-motion «${lv}»: los «?» quietos y visibles`, JSON.stringify(vis.tm));
    const ts = await toneState(rp);
    await tv.check(ts.verdict === key && ts.bg === TONE_BG[key], `Reduced-motion «${lv}»: fondo ya en su color`, JSON.stringify({ v: ts.verdict, bg: ts.bg }));
  }
  const rip2 = await rp.evaluate(async () => { await new Promise((r) => setTimeout(r, 50)); const el = document.querySelector('.btn'); if (!el) return null; const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10, button: 0 })); return document.querySelectorAll('.ripple').length; });
  await tv.check(rip2 === 0, 'Reduced-motion: no se crea ningún ripple', String(rip2));
  await go(rp, '#/'); await go(rp, '#/ficha/agua');
  const dirR = await rp.evaluate(() => document.querySelector('main').dataset.dir || null);
  await rp.waitForTimeout(400);
  const aR = await anims(rp, 'all');
  await tv.check(aR.length === 0, 'Reduced-motion: tras navegar no queda ninguna animación (ni entrada direccional)', JSON.stringify({ dir: dirR, a: aR.slice(0, 5) }));
}

async function s18svg(tv, browser) {
  // Los SVG de src/ui/art/*: ni <text>, <image>, <style>, <script> ni <foreignObject>; decorativos con aria-hidden
  const { page } = await tv.newPage(browser);
  await seed(page, tv);
  const r = await page.evaluate(async () => {
    const base = (f) => new URL('src/ui/art/' + f, location.href).href;
    const out = [];
    const check = (name, markup, expectHidden) => {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      const svg = doc.documentElement;
      const err = doc.querySelector('parsererror');
      out.push({ name, xml: !err, bad: svg.querySelectorAll('text, tspan, image, style, script, foreignObject, use').length, hidden: svg.getAttribute('aria-hidden') === 'true', size: markup.length, expectHidden });
    };
    const mesa = await import(base('mesa.js'));
    check('mesa', mesa.mesaSvg({ animada: false, decorativa: true, encuadre: 'xMidYMax' }), true);
    const platos = await import(base('platos.js'));
    for (const t of ['tortilla', 'ensalada', 'fruta', 'cuenco']) check('plato-' + t, platos.platoSvg(t, { decorativa: true }), true);
    check('cargando', platos.cargandoSvg({ decorativa: true, animada: false }), true);
    const cat = await import(base('categorias.js'));
    for (const id of cat.CATEGORIAS) { check('cat-' + id, cat.categoriaSvg(id, { decorativa: true, animada: true }), true); check('cat-q-' + id, cat.categoriaSvg(id, { decorativa: true, animada: false }), true); }
    const dz = await import(base('destellos.js'));
    for (const t of ['si', 'cuidado', 'duda', 'no', 'si-check']) check('destello-' + t, dz.destellosSvg(t, { decorativa: true, animada: true }), true);
    return out;
  });
  const malos = r.filter((x) => !x.xml || x.bad || (x.expectHidden && !x.hidden));
  await tv.check(r.length >= 40 && malos.length === 0, `Los ${r.length} SVG de src/ui/art/* (mesa, platos, 18 categorías, destellos) son XML válido, decorativos (aria-hidden) y sin <text>, <image>, <style>, <script> ni <foreignObject>`, malos.map((x) => `${x.name}: xml=${x.xml} bad=${x.bad} hidden=${x.hidden}`).join(' | '));
  const gordos = r.filter((x) => x.size > 80000);
  await tv.check(gordos.length === 0, 'Ningún SVG pasa de 80 KB', gordos.map((x) => `${x.name} ${x.size}`).join(', '));
}

async function s18(t, browser) {
  await s18svg(tagged(t, 'svg'), browser);
  for (const vp of VIEWPORTS) await s18body(tagged(t, `${vp.w}×${vp.h}`), browser, vp);
}

function s11(t, list) {
  const problems = []; const third = []; const expected = [];
  for (const s of list) {
    for (const e of s.events) {
      const tag = `[${s.id}] ${e.type}`;
      if (s.id === 16 && /\/api\/producto/.test(e.url || '')) continue; // el humo real lo valora su propio escenario
      const line = `${tag}: ${short(e.text, 200)}${e.url ? ' @ ' + short(e.url, 120) : ''}`;
      if (e.type === 'pageerror') { problems.push(line); continue; }
      const url = e.url || '';
      if (/\/api\/(leer|producto)/.test(url) && (e.status === 503 || /503/.test(e.text))) { expected.push(line); continue; }
      if (/openfoodfacts/.test(url) && (e.status === 404 || /404/.test(e.text))) { expected.push(line); continue; }
      if (/\/api\/producto/.test(url) && (e.status === 404 || /404/.test(e.text))) { expected.push(line); continue; }
      if (e.type === 'http') { if (!isThirdParty(url)) problems.push(line); else third.push(line); continue; }
      if (url && isThirdParty(url)) { third.push(line); continue; }
      if (e.type === 'console.error' && /Failed to load resource/.test(e.text) && !url) { third.push(line); continue; }
      problems.push(line);
    }
  }
  const dedupe = (a) => [...new Map(a.map((x) => [x.replace(/^\[\d+\] /, ''), x])).values()];
  t.info('Esperados (503 de /api/leer sin clave, 404 de OFF para código inexistente)', String(expected.length));
  if (third.length) t.info('Red de terceros (ajenos)', dedupe(third).slice(0, 10).join('\n'));
  return { problems: dedupe(problems) };
}

// ======================================================================
// Infraestructura
// ======================================================================

function launchOpts(args = []) {
  const proxy = process.env.E2E_NO_PROXY ? null : process.env.HTTPS_PROXY || process.env.https_proxy;
  return { headless: !HEADED, args, ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}) };
}

function freePort(pref) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => { const s2 = net.createServer(); s2.listen(0, '127.0.0.1', () => { const p = s2.address().port; s2.close(() => resolve(p)); }); });
    s.listen(pref, '127.0.0.1', () => s.close(() => resolve(pref)));
  });
}

function httpStatus(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
    req.setTimeout(3000, () => { req.destroy(); resolve(0); });
  });
}

async function startServer() {
  if (process.env.E2E_BASE_URL) { SERVER_KIND = 'externo (E2E_BASE_URL)'; return { base: process.env.E2E_BASE_URL.replace(/\/$/, ''), stop() {} }; }
  const port = await freePort(Number(process.env.E2E_PORT || 5199));
  if (fs.existsSync(path.join(ROOT, 'server.js'))) {
    const log = fs.createWriteStream(path.join(OUT, 'server.log'));
    const env = { ...process.env, PORT: String(port) };
    if (process.env.E2E_SIN_VISION) delete env.ANTHROPIC_API_KEY;
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log); child.stderr.pipe(log);
    let exited = null;
    child.on('exit', (code) => { exited = code; });
    const end = Date.now() + 20000;
    for (;;) {
      if (exited !== null) throw new Error(`server.js terminó al arrancar (código ${exited}); mira tests/e2e/out/server.log`);
      for (const host of ['127.0.0.1', 'localhost']) {
        const st = await httpStatus(`http://${host}:${port}/`);
        if (st) { SERVER_KIND = `node server.js (PORT=${port})`; return { base: `http://${host}:${port}`, stop: () => { child.kill('SIGTERM'); } }; }
      }
      if (Date.now() > end) { child.kill('SIGKILL'); throw new Error('server.js no responde en 20 s'); }
      await sleep(300);
    }
  }
  // Respaldo: estáticos + /api/leer → 503 (como sin ANTHROPIC_API_KEY)
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/leer') { req.resume(); res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"error":"sin_vision"}'); }
    let rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^[/\\]+/, '');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || /(^|[/\\])(node_modules|\.git)([/\\]|$)/.test(rel)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end('no encontrado'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  SERVER_KIND = `servidor estático del runner (server.js no existe), PORT=${port}`;
  return { base: `http://127.0.0.1:${port}`, stop: () => srv.close() };
}

async function networkProbe(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const res = [];
  for (const u of ['https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name', 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/package.json', 'https://fonts.googleapis.com/css2?family=Fraunces&display=swap']) {
    try { const r = await page.goto(u, { timeout: 20000 }); res.push(`${new URL(u).host} ${r.status()}`); } catch (e) { res.push(`${new URL(u).host} ERROR ${e.message.split('\n')[0]}`); }
  }
  await ctx.close();
  return res;
}

const SCENARIOS = [
  [1, 'Arranque completo sin datos clínicos', s1],
  [2, 'Pie y navegación en cada pantalla', s2],
  [3, 'Búsqueda: sushi y tortilla', s3],
  [4, 'Ficha y lista', s4],
  [5, 'Foto de carta (carta.jpg e ilegible.jpg)', s5],
  [6, 'Cámara (dispositivo falso) y sin cámara', s6],
  [7, 'Súper por código de barras', s7],
  [8, 'Persistencia y borrado', s8],
  [9, 'Diseño verificable', s9],
  [10, 'Lenguaje del semáforo y fichas de la guía', s10],
  [12, 'Escaneo guiado: producto sin ingredientes y foto de los ingredientes', s12],
  [13, 'Datos de internet, no encontrado y cancelar la búsqueda', s13],
  [14, 'Claves del embarazo', s14],
  [15, 'Lista de la compra', s15],
  [16, 'Prueba de humo de /api/producto (una llamada real)', s16],
  [17, '«Ojo con esto», «Pregunta», categorías y carta realista', s17],
  [18, 'Animación e ilustración (con y sin reduced-motion)', s18],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/\.(png|md|json|log)$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  const started = new Date();
  console.log('E2E «¿Puedo comerlo?» —', started.toISOString());

  const need = ['index.html', 'src/app.js', 'src/engine/index.js', 'src/engine/foods.js', 'src/capture/reader.js', 'server.js'];
  const missing = need.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  for (const fx of ['carta.jpg', 'etiqueta.jpg', 'ilegible.jpg']) if (!fs.existsSync(path.join(FIX, fx))) { console.error(`Falta la fixture ${fx}: ejecuta node tests/e2e/fixtures/make-fixtures.cjs`); process.exit(2); }
  if (!fs.existsSync(path.join(ROOT, 'index.html')) || !fs.existsSync(path.join(ROOT, 'src/app.js'))) {
    const msg = `La app aún no existe (faltan: ${missing.join(', ')}). La batería está lista: node tests/e2e/run.cjs`;
    console.log(msg);
    fs.writeFileSync(path.join(OUT, 'report.md'), `# E2E «¿Puedo comerlo?»\n\n${msg}\n`);
    process.exit(2);
  }
  if (missing.length) console.log('Aviso: faltan', missing.join(', '));

  const server = await startServer();
  BASE = server.base;
  const browser = await chromium.launch(launchOpts());
  const netInfo = await networkProbe(browser);
  console.log('Servidor:', SERVER_KIND, '·', BASE);
  console.log("Chromium", browser.version(), "· red:", netInfo.join(" · "));

  const list = SCENARIOS.filter(([id]) => !ONLY.length || ONLY.includes(id));
  for (const [id, title, fn] of list) {
    const t = new Scenario(id, title);
    ALL_T.push(t);
    console.log(`\n▶ ${id}. ${title}`);
    const t0 = Date.now();
    try {
      await Promise.race([fn(t, browser), sleep(SCENARIO_TIMEOUT).then(() => { throw new Error(`tiempo agotado (${SCENARIO_TIMEOUT / 1000} s)`); })]);
    } catch (e) {
      t.error = e.message.split('\n')[0];
      t.items.push({ kind: 'fail', what: 'Error: ' + t.error, detail: (e.stack || '').split('\n').slice(1, 3).join(' '), shot: await t.shot('error') });
      console.log('   ✗ ERROR', t.error);
    }
    if (t.page && !t.page.isClosed()) await t.shot('final');
    await t.close();
    if (t.ownBrowser) await t.ownBrowser.close().catch(() => {});
    t.ms = Date.now() - t0;
    t.status = t.items.some((i) => i.kind === 'fail') ? 'FALLO' : 'OK';
    console.log(`  → ${t.status} (${Math.round(t.ms / 1000)} s)`);
  }

  // 11. Consola
  const t11 = new Scenario(11, 'Consola: pageerror y console.error');
  console.log('\n▶ 11. Consola');
  const { problems } = s11(t11, ALL_T.slice());
  await t11.check(problems.length === 0, 'Sin pageerror ni console.error propios en los escenarios ejecutados', problems.slice(0, 25).join('\n'));
  t11.status = problems.length ? 'FALLO' : 'OK';
  ALL_T.push(t11);

  await browser.close();
  server.stop();
  writeReport(started, netInfo, missing);
  const fails = ALL_T.filter((t) => t.status !== 'OK').length;
  process.exit(fails ? 1 : 0);
}

function writeReport(started, net, missing) {
  const L = [];
  L.push('# E2E «¿Puedo comerlo?» — informe', '');
  L.push(`- Fecha: ${started.toISOString()}`);
  L.push(`- Servidor: ${SERVER_KIND} · ${BASE}`);
  L.push(`- Red desde Chromium: ${net.join(' · ')}`);
  if (missing.length) L.push(`- Archivos que faltaban: ${missing.join(', ')}`);
  L.push(`- Viewport 390×844, isMobile, hasTouch, es-ES · OCR timeout ${OCR_TIMEOUT / 1000} s`, '');
  L.push('| # | Escenario | Resultado | Fallos | Avisos | Tiempo |', '|---|---|---|---|---|---|');
  for (const t of ALL_T) L.push(`| ${t.id} | ${t.title} | **${t.status}** | ${t.items.filter((i) => i.kind === 'fail').length} | ${t.items.filter((i) => i.kind === 'warn').length} | ${Math.round(t.ms / 1000)} s |`);
  L.push('');
  for (const t of ALL_T) {
    L.push(`## ${t.id}. ${t.title} — ${t.status}`, '');
    for (const i of t.items) {
      const icon = { ok: '✓', fail: '✗ **FALLO**', warn: '⚠ Aviso', info: '·' }[i.kind];
      const det = i.detail ? (i.kind === 'ok' ? '' : ` — ${short(i.detail, 600).replace(/\|/g, '¦')}`) : '';
      L.push(`- ${icon} ${i.what}${det}${i.shot ? ` (captura: \`out/${i.shot}\`)` : ''}`);
    }
    if (t.shots.length) L.push('', `Capturas: ${t.shots.map((s) => '`out/' + s + '`').join(', ')}`);
    L.push('');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n'));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(ALL_T.map((t) => ({ id: t.id, title: t.title, status: t.status, ms: t.ms, items: t.items, events: t.events })), null, 2));

  console.log('\n================ RESUMEN ================');
  for (const t of ALL_T) {
    console.log(`${t.status === 'OK' ? 'OK   ' : 'FALLO'}  ${t.id}. ${t.title}`);
    for (const i of t.items.filter((x) => x.kind === 'fail')) console.log(`        ✗ ${i.what}${i.detail ? ' — ' + short(i.detail, 220) : ''}${i.shot ? ' [out/' + i.shot + ']' : ''}`);
  }
  console.log(`\nInforme: ${path.join(OUT, 'report.md')}`);
}

main().catch((e) => { console.error('Error del runner:', e); process.exit(3); });
