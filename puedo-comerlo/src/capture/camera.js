// Cámara trasera con getUserMedia. Nada se graba: capture() devuelve un único fotograma en memoria.
// Errores con .code: 'no-camera' (no hay cámara o no hay mediaDevices), 'denied' (permiso denegado o
// contexto no seguro), 'error' (cualquier otra cosa).

import { canvasToBlob } from './image.js';

const MESSAGES = {
  'no-camera': 'No encuentro una cámara en este dispositivo.',
  denied: 'No hay permiso para usar la cámara.',
  error: 'No se ha podido abrir la cámara.',
};

export function cameraError(code, cause) {
  const err = new Error(MESSAGES[code] ?? MESSAGES.error);
  err.code = MESSAGES[code] ? code : 'error';
  if (cause) err.cause = cause;
  return err;
}

// Traduce un DOMException de getUserMedia a nuestro código.
export function mapCameraError(err) {
  switch (err?.name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'no-camera';
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    default:
      return 'error';
  }
}

export function cameraAvailable() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function waitForMetadata(videoEl, timeoutMs = 10000) {
  if (videoEl.readyState >= 1 && videoEl.videoWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('video'));
    };
    function cleanup() {
      clearTimeout(timer);
      videoEl.removeEventListener('loadedmetadata', onReady);
      videoEl.removeEventListener('error', onError);
    }
    videoEl.addEventListener('loadedmetadata', onReady);
    videoEl.addEventListener('error', onError);
  });
}

async function requestStream(width) {
  const constraints = { video: { facingMode: { ideal: 'environment' }, width }, audio: false };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // Algún navegador rechaza las restricciones aunque sean «ideal»: un intento con lo mínimo.
    if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err2) {
        throw cameraError(mapCameraError(err2), err2);
      }
    }
    throw cameraError(mapCameraError(err), err);
  }
}

// Abre la cámara trasera en <video> y devuelve { stream, stop }. Lo usan openCamera y el escáner.
export async function openVideo(videoEl, { width = { ideal: 1920 } } = {}) {
  if (!cameraAvailable()) throw cameraError('no-camera');
  if (!videoEl) throw cameraError('error');
  const stream = await requestStream(width);

  // iOS Safari: sin playsinline abre el vídeo a pantalla completa; sin muted no reproduce solo.
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.setAttribute('muted', '');
  videoEl.muted = true;
  videoEl.autoplay = true;
  videoEl.srcObject = stream;

  let stopped = false;
  let watchdog = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(watchdog);
    for (const track of stream.getTracks()) track.stop();
    if (videoEl.srcObject === stream) {
      try {
        videoEl.pause();
      } catch {
        /* nada */
      }
      videoEl.srcObject = null;
    }
  };

  try {
    await waitForMetadata(videoEl);
    await videoEl.play();
  } catch (err) {
    stop();
    throw cameraError(err?.name === 'NotAllowedError' ? 'denied' : 'error', err);
  }

  // Red de seguridad: si la interfaz quita el <video> del documento sin llamar a stop(), se apaga la cámara.
  let wasConnected = videoEl.isConnected;
  watchdog = setInterval(() => {
    if (videoEl.isConnected) wasConnected = true;
    else if (wasConnected) stop();
    if (stream.getVideoTracks().every((t) => t.readyState === 'ended')) stop();
  }, 1000);

  return { stream, stop, isStopped: () => stopped };
}

export async function openCamera(videoEl) {
  const video = await openVideo(videoEl, { width: { ideal: 1920 } });
  return {
    stop: video.stop,
    async capture() {
      if (video.isStopped()) throw cameraError('error');
      const width = videoEl.videoWidth;
      const height = videoEl.videoHeight;
      if (!width || !height) throw cameraError('error');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw cameraError('error');
      ctx.drawImage(videoEl, 0, 0, width, height);
      try {
        // Calidad alta aquí: compressImage la reduce después a 1280 px y 0.7.
        return await canvasToBlob(canvas, 'image/jpeg', 0.92);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
  };
}
