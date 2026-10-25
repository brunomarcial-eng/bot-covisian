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
const LEGACY_SEL = '.card, .chip, .chips, .sheet, .row, .link-btn, .answer .pill, .entry .pill';
const LEVEL_WORDS = Object.values(LEVEL_LABEL);

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
      label: wordEl ? clean(wordEl.innerText) : '',
      name: nameEl ? clean(nameEl.innerText) : '',
      phrase: phraseEl ? clean(phraseEl.innerText) : '',
      card: clean(el.innerText).slice(0, 500),
      level: el.dataset.level || null,
      lvCls,
      color: cs ? cs.color : null,
      fontFamily: cs ? cs.fontFamily : null,
      fontSize: cs ? cs.fontSize : null,
      markColor: b ? b.borderLeftColor : null,
      hasMore: !!el.querySelector('.more-btn'),
      inLo: !!el.closest('section[aria-labelledby="lo-ultimo"]'),
      valid: !!wordEl && L.includes(clean(wordEl.innerText)),
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
      return { label: q(a ? '.answer-word' : '.lvl'), name: q(a ? '.answer-name' : '.entry-name'), phrase: q(a ? '.answer-phrase' : '.entry-phrase') };
    });
    const legacy = [...document.querySelectorAll(LEGACY)].map((n) => n.tagName.toLowerCase() + '.' + String(n.className).split(/\s+/).slice(0, 2).join('.'));
    return { text: document.body.innerText, headings, leaves: [...new Set(leaves)], answers, legacy };
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
  const chips = await page.locator('.chip, .chips, [role=tablist], [role=tab]').count();
  await t.check(chips === 0, 'Buscar no tiene chips de grupo (.chip, .chips, tabs)', String(chips));
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
    await t.check(pcafe && pcafe.label === 'Con cuidado', 'Buscar «café» → «Con cuidado»', pcafe ? pcafe.label : 'sin respuesta');
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
    await t.check(/¿[^?]+\?/.test(add) || /pregunt|camarero/i.test(add), '«Ver más» incluye la pregunta para el camarero', short(add, 300));
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
    await snap(page, t, 'lista-vacia');
    await t.shot('lista-vacia');
  } catch (e) { await t.check(false, '«Quitar» en la lista', e.message); }
}

// Lee una foto en Fuera y devuelve el resultado.
async function readPhoto(t, page, file) {
  await tapNav(page, 'Fuera');
  await waitHash(page, /fuera/, 3000);
  const how = await chooseFile(page, 'Elegir una foto', file);
  t.info('Foto entregada mediante', how);
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
  ['Gazpacho', /gazpacho/, ['Con cuidado']],
  ['Lubina a la plancha', /lubina/, ['Sí', 'No estoy segura']],
  ['Tarta de queso', /tarta de queso/, ['Con cuidado']],
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

  // Nutella
  await submit('3017620422003');
  const gotN = await seen(page, /nutella/i, { timeout: 25000 });
  await t.check(gotN, '3017620422003 → aparece el producto «Nutella» de Open Food Facts', await getHash(page));
  const offReq = t.requests.filter((r) => /openfoodfacts/.test(r.url));
  t.info('Petición a OFF', offReq.map((r) => short(r.url, 140)).join(' | '));
  await t.check(offReq.some((r) => /world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003/.test(r.url)), 'Usa GET world.openfoodfacts.org/api/v2/product/{code}');
  const p = await mainPill(page);
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
  const offer = await find(page, /etiqueta|ingredientes/i, { timeout: 2000 });
  await t.check(!!offer && /foto|fotograf|etiqueta/i.test(txtNf), '…y ofrece fotografiar la etiqueta', short(txtNf, 300));
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
        if (!(await seen(page, 'La etiqueta', { timeout: 1000 }))) t.warn('El resultado de la etiqueta no se titula «La etiqueta»');
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

  // La palabra del nivel: texto exacto, en Fraunces y en su color
  for (const [id, label] of [['agua', 'Sí'], ['tortilla-patata', 'Con cuidado'], ['pescado-crudo', 'Mejor no']]) {
    await go(page, '#/ficha/' + id);
    const p = await mainPill(page, 4000);
    if (!p || p.label !== label) { await t.check(false, `Ficha ${id} muestra «${label}» para medir su color`, p ? p.label : 'sin respuesta'); continue; }
    const want = `rgb(${COLORS[label].join(', ')})`;
    await t.check(p.color === want, `.answer-word «${label}» en ${want}`, p.color);
    await t.check(/Fraunces/i.test(p.fontFamily || '') && parseFloat(p.fontSize) >= 40, `.answer-word «${label}» en Fraunces y grande (≥ 40 px)`, `${p.fontFamily} ${p.fontSize}`);
  }
  await go(page, '#/buscar?q=xyzzy');
  await page.waitForTimeout(500);
  const pd = (await pills(page))[0];
  await t.check(!!pd && pd.label === 'No estoy segura', 'Buscar «xyzzy»: .answer-word «No estoy segura»', pd ? pd.label : 'sin respuesta');
  if (pd) t.info('Color de «No estoy segura» (arena)', `${pd.color} · marca lateral ${pd.markColor} · ${pd.fontSize}`);
  if (pd) await t.check(parseFloat(pd.fontSize) < 56 + 0.5, '«No estoy segura» baja de tamaño para caber en una línea', pd.fontSize);
  // Filas: la palabra `.lvl` en el color del nivel (Historial con las tres consultas de antes)
  await go(page, '#/historial');
  const rows = (await pills(page)).filter((x) => x.kind === 'entry');
  const badRows = rows.filter((x) => COLORS[x.label] && x.color !== `rgb(${COLORS[x.label].join(', ')})`);
  await t.check(rows.length >= 3 && badRows.length === 0, 'Historial: cada .lvl muestra la palabra exacta y en su color (Sí #245443, Con cuidado #8d4324, Mejor no #7a332c)', badRows.map((x) => `${x.name}: ${x.label} ${x.color}`).join(' | ') + ` · ${rows.length} filas`);
  await t.check(new Set(rows.map((x) => x.label)).size >= 3, 'Historial: las filas cubren Sí, Con cuidado y Mejor no', [...new Set(rows.map((x) => x.label))].join(', '));
  await t.shot('pastillas');

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
  await t.shot('escritorio', d);
}

async function s10(t, browser) {
  const { page } = await t.newPage(browser);
  await seed(page, t);
  const foods = await page.evaluate(async () => {
    const m = await import(new URL('src/engine/foods.js', location.href).href);
    return m.FOODS.map((f) => ({ id: f.id, name: f.name, level: f.level, source: f.source }));
  }).catch((e) => { throw new Error('No puedo importar src/engine/foods.js: ' + e.message); });
  t.info('Fichas de la guía recorridas', String(foods.length));
  await t.check(foods.length === 140 && new Set(foods.map((f) => f.id)).size === 140, 'La guía tiene 140 alimentos (ids únicos)', String(foods.length));
  const noAnswer = []; const wrongLevel = []; const badWord = []; const noSource = []; const multi = []; const noName = []; const repeats = []; const noMore = []; const badColor = [];
  for (const f of foods) {
    await go(page, '#/ficha/' + f.id);
    const p = (await pills(page)).filter((x) => !x.inLo);
    if (!p.length) { noAnswer.push(f.id); continue; }
    if (p.length > 1) multi.push(`${f.id} (${p.length})`);
    const a = p[0];
    if (!a.valid) badWord.push(`${f.id}: «${a.label}»`);
    if (a.label !== LEVEL_LABEL[f.level] || a.lvCls !== f.level || a.level !== f.level) wrongLevel.push(`${f.id}: base ${LEVEL_LABEL[f.level]}, ficha ${a.label} (${a.lvCls}/${a.level})`);
    if (COLORS[a.label] && a.color !== `rgb(${COLORS[a.label].join(', ')})`) badColor.push(`${f.id}: ${a.label} ${a.color}`);
    if (!a.name || norm(a.name) !== norm(f.name)) noName.push(`${f.id} («${f.name}» / «${a.name}»)`);
    if (new RegExp('^(' + LEVEL_WORDS.map(esc).join('|') + ')\\s*([:,]|por\\b)', 'i').test(a.phrase)) repeats.push(`${f.id}: «${short(a.phrase, 60)}»`);
    const vm = page.locator('article.answer button.more-btn');
    if (await vm.count()) {
      await vm.first().click().catch(() => {});
      await page.waitForTimeout(120);
    } else noMore.push(f.id);
    const more = await page.locator('article.answer .more').first().innerText().catch(() => '');
    if (!/Fuente:\s*.*(AESAN|Ministerio de Sanidad)/.test(more)) noSource.push(`${f.id} (${short(more.split('Fuente:')[1] || '', 40)})`);
    await snap(page, t, 'ficha-' + f.id);
  }
  await t.check(noAnswer.length === 0, 'Todas las fichas de la guía muestran su respuesta (article.answer)', `${noAnswer.length}/${foods.length} sin respuesta: ${noAnswer.join(', ')}`);
  if (foods.length - noAnswer.length > 0) {
    await t.check(multi.length === 0, 'Ficha mínima: una sola respuesta por ficha', multi.join(', '));
    await t.check(badWord.length === 0, 'Cada ficha muestra una palabra de nivel exacta (Sí, Con cuidado, Mejor no o No estoy segura)', badWord.join(' | '));
    await t.check(wrongLevel.length === 0, 'Con perfil neutro, cada ficha muestra su nivel base (palabra, clase lv-* y data-level)', wrongLevel.join(' | '));
    await t.check(badColor.length === 0, 'La palabra de cada ficha va en el color de su nivel', badColor.slice(0, 8).join(' | '));
    await t.check(noName.length === 0, 'Cada ficha muestra su nombre (.answer-name)', noName.join(', '));
    await t.check(repeats.length === 0, '(d) En las fichas, la frase no empieza repitiendo la palabra del nivel', repeats.join(' | '));
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

function s11(t, list) {
  const problems = []; const third = []; const expected = [];
  for (const s of list) {
    for (const e of s.events) {
      const tag = `[${s.id}] ${e.type}`;
      const line = `${tag}: ${short(e.text, 200)}${e.url ? ' @ ' + short(e.url, 120) : ''}`;
      if (e.type === 'pageerror') { problems.push(line); continue; }
      const url = e.url || '';
      if (/\/api\/leer/.test(url) && (e.status === 503 || /503/.test(e.text))) { expected.push(line); continue; }
      if (/openfoodfacts/.test(url) && (e.status === 404 || /404/.test(e.text))) { expected.push(line); continue; }
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
