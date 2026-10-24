// Vista de cámara para fotografiar la carta o una etiqueta, con galería de respaldo.
// La captura se carga de forma perezosa. La cámara se para al salir de la pantalla.

import { h, icon, uid, fill } from './dom.js';
import { notice } from './components.js';

// <input type="file"> oculto, sin «capture», para que abra la galería.
export function galleryInput(onFile) {
  const input = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
    dataset: { role: 'galeria' },
  });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (file) onFile(file);
  });
  return input;
}

export function cameraErrorText(code, fallback = 'Puedes elegir una foto de la galería.') {
  if (code === 'denied') {
    return `No tengo permiso para usar la cámara. Puedes darlo en los ajustes del navegador. ${fallback}`;
  }
  if (code === 'error') return `No he podido usar la cámara. ${fallback}`;
  return `No encuentro la cámara. ${fallback}`;
}

// Pinta la vista de cámara en `host`. Llama a onPhoto(blob) al confirmar, onCancel() al cancelar.
export function photoFlow(host, { signal, subject = 'la carta', onPhoto, onCancel, openGallery }) {
  let cam = null;
  let url = null;
  let blob = null;
  let destroyed = false;
  let opening = 0;

  const headingId = uid('camara');
  const heading = h('h2', { id: headingId, class: 'visually-hidden', tabindex: '-1' }, `Foto de ${subject}`);

  const stop = () => {
    if (cam) {
      try {
        cam.stop();
      } catch {
        /* nada */
      }
      cam = null;
    }
  };
  const revoke = () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
  const destroy = () => {
    destroyed = true;
    stop();
    revoke();
  };
  signal?.addEventListener('abort', destroy, { once: true });

  const cancel = () => {
    destroy();
    onCancel?.();
  };

  function showNoCamera(code) {
    stop();
    const msg = notice(cameraErrorText(code), 'problem');
    msg.setAttribute('tabindex', '-1');
    fill(host, 
      heading,
      msg,
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => openGallery?.() }, icon('image', 22), 'Elegir una foto de la galería'),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: cancel }, 'Cancelar'),
      ),
    );
    msg.focus();
  }

  async function openLive() {
    const attempt = ++opening;
    revoke();
    blob = null;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showNoCamera('no-camera');
      return;
    }
    const video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-label': 'Vista de la cámara' });
    video.muted = true;
    const hint = h('p', { class: 'camera-hint', role: 'status', 'aria-live': 'polite' }, 'Abriendo la cámara…');
    const shoot = h(
      'button',
      { type: 'button', class: 'btn btn--primary', disabled: true },
      icon('camera', 22),
      'Hacer la foto',
    );
    fill(host, 
      heading,
      h('div', { class: 'camera-frame' }, video),
      hint,
      h(
        'div',
        { class: 'camera-actions' },
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: cancel }, 'Cancelar'),
        shoot,
      ),
    );
    heading.focus();

    try {
      const { openCamera } = await import('../capture/camera.js');
      if (destroyed || attempt !== opening) return;
      const handle = await openCamera(video);
      if (destroyed || attempt !== opening) {
        handle?.stop?.();
        return;
      }
      cam = handle;
      shoot.disabled = false;
      hint.textContent = `Cámara lista. Encuadra ${subject}, con buena luz.`;
    } catch (err) {
      if (destroyed || attempt !== opening) return;
      showNoCamera(err && err.code);
      return;
    }

    shoot.addEventListener('click', async () => {
      if (!cam || shoot.disabled) return;
      shoot.disabled = true;
      try {
        blob = await cam.capture();
      } catch (err) {
        console.warn('No he podido hacer la foto:', err);
        blob = null;
      }
      if (destroyed) return;
      stop();
      if (!blob) {
        showNoCamera('error');
        return;
      }
      showFrozen();
    });
  }

  function showFrozen() {
    url = URL.createObjectURL(blob);
    const use = h('button', { type: 'button', class: 'btn btn--primary' }, icon('check', 22), 'Usar esta foto');
    use.addEventListener('click', () => {
      const b = blob;
      destroy();
      onPhoto?.(b);
    });
    fill(host, 
      heading,
      h('div', { class: 'camera-frame' }, h('img', { src: url, alt: `La foto de ${subject} que acabas de hacer`, class: 'is-photo' })),
      h('p', { class: 'camera-hint' }, '¿Se lee bien? Si no, repítela más cerca.'),
      h(
        'div',
        { class: 'camera-actions camera-actions--3' },
        use,
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => openLive() }, icon('repeat', 22), 'Repetir'),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: cancel }, 'Cancelar'),
      ),
    );
    use.focus();
  }

  openLive();
  return { destroy };
}

// Vista de «leyendo»: miniatura de la foto + estado en región viva.
export function readingView(host, blob, firstStatus) {
  const url = URL.createObjectURL(blob);
  const text = h('span', null, firstStatus);
  const status = h(
    'div',
    { class: 'status', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }),
    text,
  );
  fill(host, 
    h('div', { class: 'camera-frame camera-frame--thumb' }, h('img', { src: url, alt: 'La foto que estoy leyendo', class: 'is-photo' })),
    h('div', { class: 'mt-md' }, status),
  );
  return {
    set(msg) {
      if (msg) text.textContent = msg;
    },
    done() {
      URL.revokeObjectURL(url);
    },
  };
}
