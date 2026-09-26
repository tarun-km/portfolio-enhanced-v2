// "404" glitches through glyphs every few seconds
const el = document.getElementById('code');
const G = '!<>-_/[]{}=+*^?#%@&$01';
const glitch = () => {
  let n = 0;
  const id = setInterval(() => {
    el.textContent = n++ < 8 ? [...'404'].map(() => G[(Math.random() * G.length) | 0]).join('') : '404';
    if (n > 8) clearInterval(id);
  }, 60);
};
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(glitch, 3200);
// the guardian keeps watch: animated where the browser supports transparent video
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = document.getElementById('guard');
  const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  if (safari) { g.innerHTML = '<img src="/assets/angel.webp" alt="">'; return; }
  const v = document.createElement('video');
  Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true, poster: '/assets/angel-poster.webp', src: '/assets/angel.webm' });
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.addEventListener('canplay', () => { g.replaceChildren(v); v.play().catch(() => {}); }, { once: true });
})();
