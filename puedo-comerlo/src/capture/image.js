// Compresión de fotos en el navegador: JPEG, lado largo ≤ 1280 px, calidad ~0.7.
// Respeta la orientación EXIF (createImageBitmap con imageOrientation: 'from-image', o <img>, que ya la
// aplica en los navegadores actuales). La imagen no sale de la memoria del navegador salvo para leerla.

// Medidas finales sin ampliar nunca la imagen.
export function fitWithin(width, height, maxSide = 1280) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const longest = Math.max(w, h);
  if (longest <= maxSide) return { width: w, height: h };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// «data:image/jpeg;base64,AAAA» → «AAAA».
export function stripDataUrl(dataUrl) {
  const s = String(dataUrl ?? '');
  const comma = s.indexOf(',');
  return s.startsWith('data:') && comma !== -1 ? s.slice(comma + 1) : s;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.7) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(imageError('encode'))),
        type,
        quality,
      );
    } catch (err) {
      reject(imageError('encode', err));
    }
  });
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(stripDataUrl(reader.result));
    reader.onerror = () => reject(imageError('encode', reader.error));
    reader.readAsDataURL(blob);
  });
}

function imageError(code, cause) {
  const err = new Error(code === 'decode' ? 'No se ha podido abrir la imagen.' : 'No se ha podido preparar la imagen.');
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

async function decodeWithBitmap(blob) {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
  } catch {
    return null; // Safari antiguo o formato raro: probamos con <img>
  }
}

function decodeWithImg(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(imageError('decode'));
    };
    img.src = url;
  });
}

export async function compressImage(blobOrFile, { maxSide = 1280, quality = 0.7 } = {}) {
  if (!blobOrFile || typeof blobOrFile.size !== 'number' || blobOrFile.size === 0) throw imageError('decode');
  const decoded = (await decodeWithBitmap(blobOrFile)) ?? (await decodeWithImg(blobOrFile));
  try {
    if (!decoded.width || !decoded.height) throw imageError('decode');
    const { width, height } = fitWithin(decoded.width, decoded.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw imageError('encode');
    ctx.fillStyle = '#ffffff'; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    canvas.width = 0; // libera memoria en Safari
    canvas.height = 0;
    const base64 = await blobToBase64(blob);
    return { blob, base64, mediaType: 'image/jpeg', width, height };
  } finally {
    decoded.release();
  }
}
