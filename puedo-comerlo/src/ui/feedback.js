// Respuesta táctil de los botones: un ripple tenue desde el punto de contacto (la escala 0,98 de
// :active vive en el CSS). Solo transform/opacity; sin movimiento si la persona lo pide.

const TARGET = '.btn, .tile';

export function installFeedback() {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (reduced && reduced.matches) return;
      if (e.button && e.button !== 0) return;
      const el = e.target instanceof Element ? e.target.closest(TARGET) : null;
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left - size / 2}px`;
      dot.style.top = `${e.clientY - r.top - size / 2}px`;
      el.append(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
      setTimeout(() => dot.remove(), 900);
    },
    { passive: true },
  );
}
