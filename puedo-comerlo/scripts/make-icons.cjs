#!/usr/bin/env node
// Genera los iconos PNG de la app a partir de icon.svg, con el Chromium de Playwright.
//
//   node scripts/make-icons.cjs
//
// Salida (en la raíz del proyecto), todos opacos (PNG RGB, sin canal alfa):
//   icon-192.png            «any», el SVG tal cual
//   icon-512.png            «any», el SVG tal cual
//   icon-maskable-512.png   «maskable»: fondo salvia a sangre y el dibujo reducido al 80 %,
//                           dentro de la zona segura (círculo central del 80 %) con margen de sobra
//                           incluso para la máscara más pequeña de Android (66 %)
//   apple-touch-icon.png    180×180, sin transparencia (iOS pinta negro lo transparente)
//
// El PNG se codifica aquí (zlib) en vez de usar la captura de pantalla, para garantizar que no
// lleva canal alfa y que el tamaño es exacto.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SVG = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8');
const BG = '#245443';

// Dibujo sin el fondo: todo lo que va después del primer <rect> a sangre.
function glyphOnly(svg) {
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return body.replace(/<rect\s+width="512"\s+height="512"[^>]*\/>/, '').trim();
}

function maskableSvg(svg, scale) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    `<rect width="512" height="512" fill="${BG}"/>`,
    `<g transform="${t}">${glyphOnly(svg)}</g>`,
    '</svg>',
  ].join('');
}

// ---------- PNG RGB mínimo ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// rgba: Uint8 array de size×size×4. Se compone sobre el fondo para quitar el alfa.
function encodeRgbPng(rgba, size, bg) {
  const [br, bgG, bb] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filtro: ninguno
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = rgba[i + 3] / 255;
      raw[o++] = Math.round(rgba[i] * a + br * (1 - a));
      raw[o++] = Math.round(rgba[i + 1] * a + bgG * (1 - a));
      raw[o++] = Math.round(rgba[i + 2] * a + bb * (1 - a));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function rasterize(page, svg, size) {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const pixels = await page.evaluate(
    async ({ dataUrl, size }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
      return Array.from(ctx.getImageData(0, 0, size, size).data);
    },
    { dataUrl, size },
  );
  return Uint8Array.from(pixels);
}

const OUTPUTS = [
  { file: 'icon-192.png', size: 192, svg: () => SVG },
  { file: 'icon-512.png', size: 512, svg: () => SVG },
  { file: 'icon-maskable-512.png', size: 512, svg: () => maskableSvg(SVG, 0.8) },
  { file: 'apple-touch-icon.png', size: 180, svg: () => SVG },
];

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    for (const out of OUTPUTS) {
      const rgba = await rasterize(page, out.svg(), out.size);
      const png = encodeRgbPng(rgba, out.size, BG);
      fs.writeFileSync(path.join(ROOT, out.file), png);
      console.log(`${out.file}  ${out.size}×${out.size}  ${png.length} bytes`);
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
