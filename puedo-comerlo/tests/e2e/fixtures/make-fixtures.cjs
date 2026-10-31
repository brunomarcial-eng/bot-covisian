#!/usr/bin/env node
// Genera las imágenes de prueba de la batería e2e de «¿Puedo comerlo?».
// Reproducible: HTML fijo, fuentes del sistema, sin red y sin aleatoriedad (el «ruido» usa un PRNG con semilla).
//
//   node tests/e2e/fixtures/make-fixtures.cjs
//
// Salida (en esta misma carpeta): carta.jpg, etiqueta.jpg, ilegible.jpg

'use strict';

const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;

const CARTA = {
  Entrantes: [
    ['Ensaladilla rusa', '8,50 €'],
    ['Croquetas de jamón', '9,00 €'],
    ['Gazpacho andaluz', '6,00 €'],
  ],
  Principales: [
    ['Tortilla de patatas', '7,00 €'],
    ['Lubina a la plancha', '18,00 €'],
    ['Sushi variado', '16,00 €'],
    ['Entrecot poco hecho', '22,00 €'],
  ],
  Postres: [
    ['Tarta de queso', '6,00 €'],
    ['Tiramisú', '6,50 €'],
  ],
  Bebidas: [
    ['Tinto de verano', '4,00 €'],
    ['Cerveza 0,0', '3,00 €'],
  ],
};

function cartaHtml() {
  const sections = Object.entries(CARTA)
    .map(
      ([title, dishes]) => `
      <section>
        <h2>${title}</h2>
        ${dishes.map(([n, p]) => `<div class="row"><span>${n}</span><span class="p">${p}</span></div>`).join('')}
      </section>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#faf7f0;}
    body{width:1000px;font-family:"DejaVu Serif","Liberation Serif",serif;color:#1d1a16;}
    .sheet{margin:36px;padding:44px 64px 52px;background:#fffdf7;border:3px double #b9ab92;}
    h1{font-size:58px;text-align:center;margin:0 0 6px;letter-spacing:1px;}
    .sub{text-align:center;font-size:24px;color:#5a5046;margin:0 0 30px;font-style:italic;}
    h2{font-size:38px;margin:30px 0 12px;border-bottom:2px solid #d8ccb5;padding-bottom:6px;}
    .row{display:flex;justify-content:space-between;font-size:34px;line-height:1.55;}
    .p{font-variant-numeric:tabular-nums;}
  </style></head><body><div class="sheet">
    <h1>Casa Marisa</h1><p class="sub">Carta del mediodía</p>${sections}
  </div></body></html>`;
}

function etiquetaHtml() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#e9eef2;}
    body{width:900px;font-family:"DejaVu Sans","Liberation Sans",sans-serif;color:#111;}
    .label{margin:40px;padding:40px 48px;background:#ffffff;border:4px solid #1f4e79;border-radius:24px;}
    h1{font-size:52px;margin:0 0 8px;color:#1f4e79;}
    .peso{font-size:28px;margin:0 0 28px;color:#333;}
    .ing{font-size:32px;line-height:1.5;margin:0 0 24px;}
    .ing b{font-weight:700;}
    .cons{font-size:26px;color:#333;margin:0;}
  </style></head><body><div class="label">
    <h1>Queso fresco de Burgos</h1>
    <p class="peso">Peso neto: 250 g</p>
    <p class="ing"><b>Ingredientes:</b> leche pasteurizada de vaca, sal, cuajo y cloruro cálcico.</p>
    <p class="cons">Conservar entre 1 y 6 °C. Consumir antes del: ver envase.</p>
  </div></body></html>`;
}

// Superficie lisa tipo mantel con un poco de grano (sin texto, sin formas). PRNG con semilla fija.
function ilegibleHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#c9b9a3;} canvas{display:block;}
  </style></head><body><canvas id="c" width="1000" height="1300"></canvas><script>
    const c = document.getElementById('c'); const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1000, 1300);
    g.addColorStop(0, '#d8c8b0'); g.addColorStop(1, '#b8a68e');
    x.fillStyle = g; x.fillRect(0, 0, 1000, 1300);
    let s = 1234567; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const img = x.getImageData(0, 0, 1000, 1300); const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    // un ligero desenfoque para que parezca una foto movida de una superficie
    x.filter = 'blur(1.2px)'; x.drawImage(c, 0, 0);
  </script></body></html>`;
}

async function shot(browser, html, file, { width, quality = 90 }) {
  const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  const target = path.join(OUT, file);
  await page.screenshot({ path: target, type: 'jpeg', quality, fullPage: true });
  const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  await page.close();
  console.log(`  ${file}  ${size[0]}×${size[1]}`);
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log('Generando fixtures en', OUT);
    await shot(browser, cartaHtml(), 'carta.jpg', { width: 1000 });
    await shot(browser, etiquetaHtml(), 'etiqueta.jpg', { width: 900 });
    await shot(browser, ilegibleHtml(), 'ilegible.jpg', { width: 1000, quality: 80 });
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
