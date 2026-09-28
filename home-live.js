/* Aprimoramento progressivo: a página funciona sem JavaScript.
   Sem rastreamento, microfone, gravações, bibliotecas ou rede adicional. */
(() => {
  'use strict';
  const body = document.body;
  if (!body.classList.contains('home-live') || !window.matchMedia) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('.motion-toggle');
  const scenes = Array.from(document.querySelectorAll('[data-motion]'));
  let manualReduce = false;
  let observer = null;
  const lastPlayed = new WeakMap();
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  function reduceEnabled() { return preference.matches || manualReduce; }
  function updateMotion() {
    const reduced = reduceEnabled();
    body.classList.toggle('motion-off', reduced);
    if (toggle) {
      toggle.hidden = false;
      toggle.setAttribute('aria-pressed', String(reduced));
      toggle.disabled = preference.matches;
      toggle.textContent = preference.matches ? 'Movimento reduzido' : 'Reduzir movimento';
      toggle.title = preference.matches ? 'Seguindo a preferência de movimento reduzido do seu aparelho.' : 'Ativar ou desativar os movimentos decorativos desta página.';
    }
    if (observer) observer.disconnect();
    if (reduced || !('IntersectionObserver' in window)) {
      scenes.forEach(scene => scene.classList.add('is-seen'));
      return;
    }
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-seen');
        lastPlayed.set(entry.target, performance.now());
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.85 });
    scenes.filter(scene => !scene.classList.contains('is-seen')).forEach(scene => observer.observe(scene));
  }
  if (toggle) toggle.addEventListener('click', () => {
    manualReduce = !manualReduce;
    updateMotion();
  });
  if (preference.addEventListener) preference.addEventListener('change', updateMotion);
  else if (preference.addListener) preference.addListener(updateMotion);
  function replay(scene) {
    if (reduceEnabled() || !scene.classList.contains('is-seen')) return;
    const now = performance.now();
    if (now - (lastPlayed.get(scene) || 0) < 4500) return;
    lastPlayed.set(scene, now);
    scene.classList.remove('is-seen');
    void scene.offsetWidth;
    scene.classList.add('is-seen');
  }
  document.querySelectorAll('.product, .training-live').forEach(card => {
    const scene = card.querySelector('[data-motion]');
    if (!scene) return;
    card.addEventListener('pointerenter', () => { if (finePointer.matches) replay(scene); });
    card.addEventListener('focusin', () => replay(scene));
  });
  updateMotion();
  body.classList.add('motion-ready');
})();
