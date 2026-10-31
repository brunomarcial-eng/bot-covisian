// Escáner de códigos de barras (EAN-13, EAN-8, UPC-A, UPC-E) con la cámara trasera.
// Usa BarcodeDetector si el navegador lo trae (Chrome Android); si no (Safari iOS), ZXing por CDN con
// versión exacta, cargado solo cuando hace falta. Llama a onCode(code) una sola vez y apaga la cámara.
// Errores al arrancar con .code: 'no-camera' | 'denied' | 'error' (cámara) o 'no-scanner' (no hay lector).

import { openVideo } from './camera.js';

export const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_INTERVAL_MS = 250; // ~4 intentos por segundo
const ZXING_MAX_WIDTH = 960;

export function isValidCode(s) {
  return typeof s === 'string' && /^\d{8,14}$/.test(s);
}

// Deja solo los dígitos de lo que se teclea («8 410000 00001 7» → «8410000000017»).
export function cleanCode(s) {
  return String(s ?? '').replace(/[\s.-]/g, '');
}

function scannerError(code, cause) {
  const err = new Error(code === 'no-scanner' ? 'No puedo leer códigos en este navegador.' : 'No se ha podido escanear.');
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

async function nativeDetector(videoEl) {
  const BD = globalThis.BarcodeDetector;
  if (typeof BD !== 'function') return null;
  let formats = FORMATS;
  try {
    if (typeof BD.getSupportedFormats === 'function') {
      const supported = await BD.getSupportedFormats();
      formats = FORMATS.filter((f) => supported.includes(f));
    }
  } catch {
    return null;
  }
  if (!formats.length) return null;
  let detector;
  try {
    detector = new BD({ formats });
  } catch {
    return null;
  }
  return {
    async detect() {
      if (videoEl.readyState < 2) return null;
      const found = await detector.detect(videoEl);
      for (const b of found ?? []) {
        const code = cleanCode(b?.rawValue);
        if (isValidCode(code)) return code;
      }
      return null;
    },
    release() {},
  };
}

let zxingPromise = null;

function loadZXing() {
  if (!zxingPromise) {
    zxingPromise = import(/* @vite-ignore */ ZXING_URL).catch((err) => {
      zxingPromise = null;
      throw err;
    });
  }
  return zxingPromise;
}

async function zxingDetector(videoEl) {
  let Z;
  try {
    Z = await loadZXing();
  } catch (err) {
    throw scannerError('no-scanner', err);
  }
  const reader = new Z.MultiFormatReader();
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
    Z.BarcodeFormat.EAN_13,
    Z.BarcodeFormat.EAN_8,
    Z.BarcodeFormat.UPC_A,
    Z.BarcodeFormat.UPC_E,
  ]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    async detect() {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      if (!ctx || videoEl.readyState < 2 || !vw || !vh) return null;
      const scale = Math.min(1, ZXING_MAX_WIDTH / vw);
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(videoEl, 0, 0, w, h);
      try {
        const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
        const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(source));
        const result = reader.decodeWithState(bitmap);
        const code = cleanCode(result?.getText?.());
        return isValidCode(code) ? code : null;
      } catch {
        return null; // NotFoundException en casi todos los fotogramas: es lo normal
      } finally {
        reader.reset?.();
      }
    },
    release() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

export async function startScanner(videoEl, onCode) {
  const video = await openVideo(videoEl, { width: { ideal: 1280 } }); // lanza con .code si no hay cámara
  let detector = null;
  let timer = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    video.stop();
    detector?.release();
  };

  try {
    detector = (await nativeDetector(videoEl)) ?? (await zxingDetector(videoEl));
  } catch (err) {
    stop();
    throw err?.code ? err : scannerError('error', err);
  }
  if (stopped) return { stop };

  const tick = async () => {
    if (stopped) return;
    if (video.isStopped()) {
      stop(); // la cámara se apagó (p. ej. el <video> salió de la página)
      return;
    }
    let code = null;
    try {
      code = await detector.detect();
    } catch {
      code = null;
    }
    if (stopped) return;
    if (code) {
      stop();
      try {
        onCode?.(code);
      } catch {
        /* nada */
      }
      return;
    }
    timer = setTimeout(tick, SCAN_INTERVAL_MS);
  };
  tick();

  return { stop };
}
