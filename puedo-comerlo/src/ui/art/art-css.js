// Reglas y @keyframes de categorias.js y destellos.js, para pegar tal cual en styles.css (el servidor
// solo sirve .js bajo src/). Todo con prefijo art-. Solo transform, opacity y stroke-dashoffset.
// Las animaciones solo corren si el <svg> lleva la clase `art-anim` (animada: true).

export const ART_CSS = `
/* ---- Categorías: entrada (pop y asentado) y detalles vivos ---- */
.art-cat.art-anim .art-pop { transform-box: fill-box; transform-origin: center; animation: art-cat-pop 0.46s cubic-bezier(0.2, 0.9, 0.3, 1.12) both; }
.art-cat.art-anim [data-anim] { transform-box: fill-box; transform-origin: center; }
.art-cat.art-anim [data-anim="vapor"] { animation: art-cat-vapor 4s ease-in-out infinite; animation-delay: calc(0.6s + var(--v, 0) * 1.1s); }
.art-cat.art-anim [data-anim="brillo"] { animation: art-cat-brillo 4.6s ease-in-out infinite; animation-delay: calc(0.8s + var(--v, 0) * 1.3s); }
.art-cat.art-anim [data-anim="gota"] { animation: art-cat-gota 3.8s ease-in-out infinite; animation-delay: calc(0.5s + var(--v, 0) * 1.2s); }
.art-cat.art-anim [data-anim="destello"] { animation: art-cat-destello 3.4s ease-in-out infinite; animation-delay: calc(0.9s + var(--v, 0) * 1.2s); }
@keyframes art-cat-pop {
  0% { opacity: 0; transform: scale(0.88) translateY(6px); }
  65% { opacity: 1; transform: scale(1.025) translateY(0); }
  100% { opacity: 1; transform: none; }
}
@keyframes art-cat-vapor {
  0%, 100% { opacity: 0.12; transform: translateY(3px); }
  50% { opacity: 0.55; transform: translateY(-4px); }
}
@keyframes art-cat-brillo {
  0%, 60%, 100% { opacity: 0.2; transform: translateX(-2px); }
  30% { opacity: 0.95; transform: translateX(2px); }
}
@keyframes art-cat-gota {
  0%, 100% { opacity: 0; transform: translateY(-3px) scale(0.6); }
  30%, 65% { opacity: 1; transform: none; }
}
@keyframes art-cat-destello {
  0%, 100% { opacity: 0; transform: scale(0.3) rotate(0deg); }
  42% { opacity: 1; transform: scale(1) rotate(45deg); }
}

/* ---- Destellos del veredicto ---- */
.art-dz.art-anim [data-anim] { transform-box: fill-box; transform-origin: center; }
.art-dz.art-anim [data-anim="chispa"] { animation: art-dz-chispa var(--t, 2.8s) ease-in-out infinite; animation-delay: var(--d, 0s); }
.art-dz.art-anim [data-anim="flota"] { animation: art-dz-flota 4.4s ease-in-out infinite; animation-delay: var(--d, 0s); }
.art-dz.art-anim [data-anim="traza"] { stroke-dasharray: 1; stroke-dashoffset: 1; animation: art-dz-traza 0.5s cubic-bezier(0.3, 0.7, 0.2, 1) forwards; animation-delay: calc(0.12s + var(--d, 0s)); }
@keyframes art-dz-chispa {
  0%, 100% { opacity: 0.15; transform: scale(0.4) rotate(0deg); }
  45% { opacity: 1; transform: scale(1) rotate(35deg); }
}
@keyframes art-dz-flota {
  0% { opacity: 0; transform: translateY(8px); }
  30%, 70% { opacity: 0.85; }
  100% { opacity: 0; transform: translateY(-12px); }
}
@keyframes art-dz-traza { to { stroke-dashoffset: 0; } }

/* ---- Movimiento reducido: todo visible y quieto ---- */
@media (prefers-reduced-motion: reduce) {
  .art-cat .art-pop,
  .art-cat [data-anim],
  .art-dz [data-anim] { animation: none !important; }
  .art-dz.art-anim [data-anim="traza"] { stroke-dasharray: none; stroke-dashoffset: 0; }
}
`;
