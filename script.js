const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- Text splitting ----------
// Lines are defined by <br> in the markup, so the reveal matches the authored line breaks.
$$('[data-split]').forEach((el) => {
  el.innerHTML = el.innerHTML
    .split(/<br\s*\/?>/i)
    .map((l) => `<span class="line"><span class="line__in">${l.trim()}</span></span>`)
    .join('');
});
$$('[data-words]').forEach((el) => {
  el.innerHTML = el.innerHTML
    .split(/<br\s*\/?>/i)
    .map((l) => l.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' '))
    .join('<br>');
});
$$('[data-letters]').forEach((el) => {
  el.innerHTML = [...el.textContent]
    .map((c) => `<span class="ch">${c === ' ' ? '&nbsp;' : c}</span>`)
    .join('');
});

// Parallax wrapper inside each image so hover-zoom (CSS) and parallax (GSAP) don't fight
$$('.case__img').forEach((box) => {
  const inner = document.createElement('div');
  inner.className = 'case__inner';
  while (box.firstChild) inner.appendChild(box.firstChild);
  box.appendChild(inner);
});

// ---------- Hero video ----------
// 1080p by default; the 4K master only for large high-DPI screens on a good connection.
(() => {
  const v = $('#heroVideo');
  const conn = navigator.connection || {};
  const big = screen.width * devicePixelRatio >= 2560;
  if (big && !conn.saveData && !/2g|3g/.test(conn.effectiveType || '')) {
    $('source', v).src = 'assets/hero.mp4';
    v.load();
  }
  if (reduced) { v.removeAttribute('autoplay'); return; }
  // Swapping sources can abort the first play() call, so retry once the video is ready
  const start = () => v.play().catch(() => {});
  v.addEventListener('canplay', start, { once: true });
  start();
  // Browsers pause background video while the tab is hidden; pick it back up on return
  document.addEventListener('visibilitychange', () => { if (!document.hidden && v.paused) start(); });
  window.playHeroVideo = start;
})();

// ---------- Clock ----------
const clock = $('#clock');
const tick = () => { clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false }); };
tick();
setInterval(tick, 1000);
$('#loaderYear').textContent = new Date().getFullYear();

// ---------- Background music ----------
// Browsers block audible autoplay, so playback starts on the visitor's first click/tap/key.
(() => {
  const tracks = [
    { title: 'Velvet Skyline', src: 'assets/audio/velvet-skyline.mp3' },
    { title: 'Chrome Boulevard', src: 'assets/audio/chrome-boulevard.mp3' },
    { title: 'Velvet Promenade', src: 'assets/audio/velvet-promenade.mp3' },
  ];
  const VOLUME = 0.35;
  const player = $('#player');
  const toggleBtn = $('#soundToggle');
  const stateEl = $('#soundState');
  const titleEl = $('#trackTitle');
  const audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 0;
  let index = 0;
  let on = false;
  let fadeId = 0;

  let optedOut = false;
  try { optedOut = localStorage.getItem('sound') === 'off'; } catch (e) {}
  const remember = (v) => { try { localStorage.setItem('sound', v); } catch (e) {} };

  const fade = (to, ms, done) => {
    const id = ++fadeId;
    const from = audio.volume;
    const start = performance.now();
    const step = (now) => {
      if (id !== fadeId) return;
      const t = Math.min((now - start) / ms, 1);
      audio.volume = from + (to - from) * t;
      t < 1 ? requestAnimationFrame(step) : done && done();
    };
    requestAnimationFrame(step);
  };

  const load = (i) => {
    index = (i + tracks.length) % tracks.length;
    audio.src = tracks[index].src;
    titleEl.dataset.text = tracks[index].title;
    ASCII.scramble(titleEl, { text: tracks[index].title, duration: 0.7 });
  };

  const render = () => {
    player.classList.toggle('is-playing', on);
    toggleBtn.setAttribute('aria-pressed', String(on));
    stateEl.textContent = on ? 'Sound on' : 'Sound off';
  };

  const play = () => audio.play().then(() => { on = true; render(); fade(VOLUME, 1500); }).catch(() => {});
  const pause = () => { on = false; render(); fade(0, 600, () => audio.pause()); };

  audio.addEventListener('ended', () => { load(index + 1); on && audio.play().catch(() => {}); });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (on) { pause(); remember('off'); } else { play(); remember('on'); }
  });
  $('#trackNext').addEventListener('click', (e) => {
    e.stopPropagation();
    fade(0, 400, () => { load(index + 1); play(); });
  });

  load(0);
  render();

  if (!optedOut) {
    audio.play().then(() => { on = true; render(); fade(VOLUME, 1500); }).catch(() => {
      const kick = () => {
        ['pointerdown', 'keydown', 'touchend'].forEach((ev) => removeEventListener(ev, kick, true));
        if (!on) play();
      };
      ['pointerdown', 'keydown', 'touchend'].forEach((ev) => addEventListener(ev, kick, true));
    });
  }
})();

// Without GSAP (e.g. CDN blocked) just show the site
if (!window.gsap) {
  $('#loader').remove();
  document.body.classList.remove('is-loading');
  throw new Error('GSAP failed to load; animations disabled.');
}

gsap.registerPlugin(ScrollTrigger);

// ---------- Smooth scroll ----------
let lenis = null;
if (window.Lenis && !reduced) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const href = a.getAttribute('href');
  if (href === '#') { e.preventDefault(); return; } // placeholder links
  const target = $(href);
  if (!target) return;
  e.preventDefault();
  lenis ? lenis.scrollTo(target, { duration: 1.6 }) : target.scrollIntoView();
}));

// ---------- Loader ----------
const loader = $('#loader');
const count = $('#loaderCount');
const bar = $('#loaderBar');
const status = $('#loaderStatus');

const pageLoaded = new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r)));

const pad = (n) => String(n).padStart(3, '0');

async function runLoader() {
  // Everything eases in together: labels, name, line — no noise, no glyph churn
  gsap.to(['.loader__top', '.loader__bottom'], { opacity: 1, duration: 1.2, ease: 'power2.out', delay: 0.2 });
  gsap.to('.lt > *', { y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.06, delay: 0.15 });
  gsap.to('.loader__meta', { opacity: 1, duration: 1, ease: 'power2.out', delay: 0.7 });

  const c = { v: 0 };
  const draw = () => {
    count.textContent = pad(Math.round(c.v));
    bar.style.transform = `scaleX(${c.v / 100})`;
  };
  await gsap.to(c, { v: 90, duration: reduced ? 0.2 : 2.6, ease: 'power3.inOut', onUpdate: draw });
  await Promise.all([pageLoaded, document.fonts.ready]);
  status.textContent = 'Ready';
  await gsap.to(c, { v: 100, duration: 0.5, ease: 'power2.out', onUpdate: draw });
  exitLoader();
}

function exitLoader() {
  const navLogo = $('.nav__logo-img');
  const navKM = $('.nav__km');
  const loaderFont = getComputedStyle($('.loader__name')).fontSize;

  // FLIP pairs: each loader piece -> its matching piece in the nav lockup.
  // Clones are lifted out of the loader's clipping masks so they can travel freely.
  const pairs = [
    [$('.lt--logo img'), navLogo],
    ...$$('.lt--fly > span').map((el, i) => [el, $$('span', navKM)[i]]),
  ].map(([src, target]) => {
    const from = src.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    let fly;
    if (src.tagName === 'IMG') {
      fly = src.cloneNode();
      fly.className = 'loader__fly';
      Object.assign(fly.style, { width: `${from.width}px`, height: `${from.height}px` });
    } else {
      fly = document.createElement('span');
      fly.className = 'loader__fly loader__fly--txt';
      fly.textContent = src.textContent;
      fly.style.fontSize = loaderFont;
    }
    Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px` });
    document.body.appendChild(fly);
    src.style.visibility = 'hidden';
    return { fly, x: to.left - from.left, y: to.top - from.top, s: to.height / from.height };
  });

  // Swap clones for the real nav lockup the instant they land, so the handoff is invisible
  const land = () => {
    navLogo.style.opacity = 1;
    navKM.style.opacity = 1;
    pairs.forEach((p) => p.fly.remove());
  };

  const tl = gsap.timeline({
    defaults: { ease: 'expo.inOut' },
    onComplete() {
      window.playHeroVideo && window.playHeroVideo();
      loader.remove();
      document.body.classList.remove('is-loading');
      lenis && lenis.start();
      ScrollTrigger.refresh();
    },
  });

  const FLY_AT = 0.35;
  const FLY_DUR = 1.4;

  tl.to(['.loader__top', '.loader__bottom', '.loader__meta'], { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0)
    // T, R, U, N sink away softly, leaving the logo + KM behind
    .to('.lt:not(.lt--logo):not(.lt--fly) > *', { yPercent: -110, opacity: 0, duration: 0.9, ease: 'power3.inOut', stagger: 0.04 }, 0)
    .add(() => {}, FLY_AT);
  pairs.forEach((p, i) => {
    tl.to(p.fly, { x: p.x, y: p.y, scale: p.s, transformOrigin: '0% 0%', duration: FLY_DUR }, FLY_AT + i * 0.04);
  });
  tl.add(land, FLY_AT + FLY_DUR + (pairs.length - 1) * 0.04)
    // The frosted veil thaws: blur and ink clear together, revealing the live video
    .to('.loader__veil', { opacity: 0, backdropFilter: 'blur(0px) saturate(1)', webkitBackdropFilter: 'blur(0px) saturate(1)', duration: 1.8, ease: 'power2.inOut' }, 0.45)
    // Video eases back from a slight zoom as it comes into focus
    .from('.hero__media', { scale: 1.18, duration: 2.6, ease: 'expo.out' }, 0.45)
    .from('.hero .line__in', { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.09 }, 1.25)
    .add(() => $$('.hero .line__in').forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 1.4, delay: i * 0.1 })), 1.3)
    .add(() => $$('.nav__group a, .nav__label, .nav__toggle').forEach((el, i) => {
      const t = el.matches('.nav__label') ? ASCII.wrapText(el) : el;
      ASCII.scramble(t, { from: 'blank', duration: 0.8, delay: i * 0.03 });
    }), 1.35)
    .from('.corners i', { scale: 0, duration: 0.6, ease: 'back.out(3)', stagger: 0.06 }, 1.5)
    .from('.nav__group, .nav__clock, .nav__toggle', { y: -24, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07 }, 1.35)
    .from('.hud', { y: 90, opacity: 0, duration: 1.2, ease: 'expo.out' }, 1.5)
    .from('.hud > *', { scale: 0.85, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 1.7)
    .from('.signal', { x: 60, opacity: 0, duration: 1.2, ease: 'expo.out' }, 1.8);
}

runLoader();

// ---------- Scroll animations ----------
if (!reduced) {
  // Hero: image drifts and zooms, copy lifts and fades as you scroll away
  gsap.to('.hero__video', { yPercent: 18, scale: 1.12, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__content', { yPercent: -40, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: true } });

  // Manifesto: words light up in reading order, tied to scroll
  $$('[data-words]').forEach((h) => {
    const words = $$('.w', h);
    gsap.fromTo(words, { opacity: 0.1, y: 12 }, {
      opacity: 1, y: 0, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: h, start: 'top 85%', end: 'bottom 45%', scrub: 0.6 },
    });
    // each time a statement enters, its words decode from glyphs in reading order
    ScrollTrigger.create({
      trigger: h, start: 'top 80%',
      onEnter: () => words.forEach((w, i) => ASCII.scramble(w, { duration: 0.7, delay: i * 0.05 })),
      onEnterBack: () => words.forEach((w, i) => ASCII.scramble(w, { duration: 0.5, delay: i * 0.03 })),
    });
    // hovering a word re-encodes it
    words.forEach((w) => ASCII.hover(w, w, { duration: 0.4 }));
  });
  $$('.guides i').forEach((g, i) => {
    gsap.from(g, { scaleY: 0, transformOrigin: 'top', ease: 'none', scrollTrigger: { trigger: '.manifesto', start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Section headers: labels slide in, intro lines rise
  $$('.block__head').forEach((head) => {
    const labels = $$('.m', head).map(ASCII.wrapText);
    const tl = gsap.timeline({ scrollTrigger: { trigger: head, start: 'top 80%' } });
    tl.from($$('.block__meta > *, .m', head), { y: 30, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08 })
      .add(() => [...labels, ...$$('.block__meta .xs', head)].forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 0.9, delay: i * 0.08 })), 0)
      .from($$('.line__in', head), { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, 0.2)
      .add(() => $$('.line__in', head).forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 1, delay: i * 0.08 })), 0.2);
  });

  // Case & insight cards: clip-path wipe reveal, inner zoom-out, parallax, caption rise
  $$('.case, .insight').forEach((card) => {
    const box = $('.case__img', card);
    const inner = $('.case__inner', card);
    const texts = $$(':scope > h4, :scope > p, :scope > .plus', card);
    const ov = ASCII.overlay(box);
    const tl = gsap.timeline({ scrollTrigger: { trigger: card, start: 'top 88%' } });
    tl.fromTo(box, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.inOut', onStart: ov.kick })
      .from(inner, { scale: 1.35, duration: 1.8, ease: 'expo.out' }, 0.2)
      // image arrives "encoded" as characters, then decodes cell by cell
      .to(ov, { reveal: 0, duration: 1.6, ease: 'power2.inOut' }, 0.5)
      .from(texts, { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06 }, 0.7)
      .add(() => $$(':scope > h4, :scope > p', card).forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 0.8, delay: i * 0.06 })), 0.7);

    // 3D tilt toward the cursor
    const rx = gsap.quickTo(box, 'rotationX', { duration: 0.8, ease: 'power3.out' });
    const ry = gsap.quickTo(box, 'rotationY', { duration: 0.8, ease: 'power3.out' });
    gsap.set(box, { transformPerspective: 1000 });
    box.addEventListener('mousemove', (e) => {
      const r = box.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 8);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
    });
    box.addEventListener('mouseleave', () => { rx(0); ry(0); });
    gsap.fromTo(inner, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Grids skew slightly with scroll velocity
  const skewTargets = $$('.cases, .insights, .log__stats');
  const setSkew = gsap.quickTo(skewTargets, 'skewY', { duration: 0.5, ease: 'power3.out' });
  ScrollTrigger.create({
    onUpdate(self) { setSkew(gsap.utils.clamp(-3, 3, self.getVelocity() / -400)); },
  });

  // Services: first slide rises in; the boarding pass floats in beside it
  gsap.from('.slide.is-active .line__in, .slide.is-active .btn', {
    yPercent: 110, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08,
    scrollTrigger: { trigger: '.services', start: 'top 65%' },
  });
  // The pass drifts up and settles flat as you reach it, like it's being handed to you
  gsap.matchMedia().add({ desktop: '(min-width: 992px)', mobile: '(max-width: 991px)' }, (ctx) => {
    // narrow screens get a gentler swing so the pass never pokes past the edge
    const r = ctx.conditions.desktop ? [-7, 2] : [-2, 1];
    gsap.fromTo('.pass', { rotate: r[0], y: 120 }, { rotate: r[1], y: -40, ease: 'none', scrollTrigger: { trigger: '.services', start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  gsap.from('.pass__card', { opacity: 0, rotationX: 35, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.services__pass', start: 'top 80%' } });

  // Footer: contact rows, logo spin-in, giant letters rise one by one
  gsap.from('.footer__cell', { y: 60, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: '.footer', start: 'top 75%' } });
  // The name that opened the site rises one last time, logo in place of the A
  const band = gsap.timeline({ scrollTrigger: { trigger: '.footer__band', start: 'top 88%' } });
  band.from('.footer__band', { clipPath: 'inset(50% 0% 50% 0% round .8rem)', duration: 1.4, ease: 'expo.inOut' })
    .from('.footer__name > *', { yPercent: 115, duration: 1.4, ease: 'expo.out', stagger: 0.05 }, 0.5)
    .from('.footer__logo', { rotate: -12, scale: 0.8, duration: 1.8, ease: 'expo.out' }, 0.55)
    .add(() => $$('.footer__name .ch:not(.ch--space)').forEach((c, i) => ASCII.scramble(c, { from: 'blank', duration: 0.9, delay: i * 0.05 })), 0.5);
  gsap.fromTo('.footer__logo', { y: 20 }, { y: -20, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  ScrollTrigger.create({ trigger: '.footer__end', start: 'top 90%', onEnter: () => ASCII.scramble($('.footer__end-line'), { from: 'blank', duration: 1.6 }) });
  gsap.from('.footer__bottom > *', { y: 30, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: '.footer__bottom', start: 'top 98%' } });

  // ASCII band: copy decodes on entry, heading drifts against the field
  ScrollTrigger.create({
    trigger: '.ascii-band', start: 'top 70%',
    onEnter: () => {
      $$('.ascii-band [data-scramble]').forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 1.2, delay: i * 0.3 }));
      $$('.ascii-band .line__in').forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 1.4, delay: 0.15 + i * 0.12 }));
    },
  });
  gsap.from('.ascii-band .line__in', { yPercent: 110, duration: 1.3, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.ascii-band', start: 'top 70%' } });
  gsap.matchMedia().add('(min-width: 992px)', () => {
    gsap.fromTo('.ascii-band__content', { y: 80 }, { y: -80, ease: 'none', scrollTrigger: { trigger: '.ascii-band', start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Footer: contact lines decode as they rise
  ScrollTrigger.create({
    trigger: '.footer', start: 'top 75%',
    onEnter: () => $$('.footer__cell .sc').forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 1, delay: i * 0.12 })),
  });

  // Nav hides on scroll down, returns on scroll up
  const nav = $('.nav');
  ScrollTrigger.create({
    start: 'top -120',
    onUpdate(self) {
      gsap.to(nav, { yPercent: self.direction === 1 ? -110 : 0, duration: 0.5, ease: 'power3.out', overwrite: true });
    },
  });
}

// ---------- ASCII hover layer ----------
ASCII.band($('#asciiBand'));

// Links & buttons re-encode their label on hover
$$('.footer__cell').forEach((el) => ASCII.wrapText(el));
[
  ...$$('.nav__group a, .dock a, .footer__bottom a, .menu__list a'),
].forEach((el) => ASCII.hover(el));
$$('.btn, .footer__cell, .pass').forEach((el) => {
  const target = el.querySelector('.sc') || ASCII.wrapText(el);
  ASCII.hover(el, target);
});
$$('.case, .insight').forEach((card) => ASCII.hover(card, $('h4', card), { duration: 0.6 }));
ASCII.hover($('.nav__toggle'));
ASCII.hover($('.hud__cta'), $('.hud__cta .sc'));
ASCII.hover($('.nav__logo'), $('.nav__km'), { duration: 0.5 });
ASCII.hover($('.player'), $('#trackTitle'));

// "House of KM": each letter glitches and jumps when touched
$$('.footer__name .ch:not(.ch--space)').forEach((ch) => {
  ch.dataset.text = ch.textContent;
  const glitch = () => {
    ASCII.scramble(ch, { duration: 0.5 });
    gsap.fromTo(ch, { yPercent: 0 }, { yPercent: -18, duration: 0.25, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: 'auto' });
  };
  ch.addEventListener('mouseenter', glitch);
  ch.addEventListener('touchstart', glitch, { passive: true });
});

// ---------- Storyline: chapters ----------
// The site is one journey: a signal in the static (hero) -> the belief behind it -> what was built ->
// the passage in -> where the work is made -> notes from the field -> arrival.
const chapters = $$('[data-chapter]');
chapters.forEach((sec) => {
  const el = document.createElement('div');
  el.className = 'chapter';
  el.innerHTML = `<span class="chapter__no">CH.${sec.dataset.chapter}</span><span class="chapter__title">${sec.dataset.title}</span><span class="chapter__rule"></span><span class="chapter__line">${sec.dataset.line}</span>`;
  sec.prepend(el);
  if (reduced) return;
  const parts = $$('.chapter__no, .chapter__title, .chapter__line', el);
  ScrollTrigger.create({
    trigger: sec, start: 'top 75%',
    onEnter: () => {
      parts.forEach((p, i) => ASCII.scramble(p, { from: 'blank', duration: 0.9, delay: i * 0.15 }));
      gsap.fromTo($('.chapter__rule', el), { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: 'expo.out' });
    },
  });
});

// Dock: live chapter tracker + journey progress; click jumps to the next stop
(() => {
  const dock = $('#dock');
  const hudBar = $('#hudBar');
  const label = $('#dockChapter');
  const prog = $('#dockProgress');
  let active = 0;
  let prevActive = 0;
  const setActive = (i) => {
    if (i === active) return;
    active = i;
    const c = chapters[i];
    ASCII.scramble(label, { text: `CH.${c.dataset.chapter} — ${c.dataset.title}`, duration: 0.6 });
    gsap.to('.hud__mark', { rotation: `+=${i > prevActive ? 90 : -90}`, duration: 0.8, ease: 'expo.out' });
    prevActive = i;
  };
  chapters.forEach((sec, i) => ScrollTrigger.create({
    trigger: sec, start: 'top 50%', end: 'bottom 50%',
    onToggle: (self) => self.isActive && setActive(i),
  }));
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      prog.textContent = `${String(Math.round(self.progress * 100)).padStart(3, '0')}%`;
      hudBar.style.transform = `scaleX(${self.progress})`;
    },
  });
  dock.addEventListener('click', () => {
    const next = chapters[(active + 1) % chapters.length];
    lenis ? lenis.scrollTo(next, { duration: 1.8 }) : next.scrollIntoView();
  });
})();

// ---------- Boarding pass ----------
(() => {
  const pass = $('#pass');
  if (!pass) return;
  const card = $('.pass__card', pass);
  const stub = $('.pass__stub', pass);

  // Unique-feeling pass number + today's date
  const d = new Date();
  $('#passNo').textContent = `TK-${d.getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  $('#passDate').textContent = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();

  // Barcode: random bar widths, regenerated when you hover (the pass "re-prints")
  const barcode = $('#passBarcode');
  const printBarcode = () => {
    barcode.innerHTML = Array.from({ length: 34 }, () => `<i style="flex:${[1, 1, 2, 3][Math.floor(Math.random() * 4)]}"></i>`).join('');
  };
  printBarcode();

  // City names re-encode on hover: IDEA and LAUNCH flicker like a departures board
  const cities = $$('.pass__city', pass);
  pass.addEventListener('mouseenter', () => {
    cities.forEach((c, i) => ASCII.scramble(c, { duration: 0.8, delay: i * 0.15, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }));
    printBarcode();
  });

  if (!reduced && finePointer) {
    const rx = gsap.quickTo(card, 'rotationX', { duration: 0.9, ease: 'power3.out' });
    const ry = gsap.quickTo(card, 'rotationY', { duration: 0.9, ease: 'power3.out' });
    pass.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ry((px - 0.5) * 16);
      rx(-(py - 0.5) * 12);
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
    });
    pass.addEventListener('mouseleave', () => { rx(0); ry(0); });
  }

  // Click: punch the stub, flash "BOARDED", then travel to the contact section
  pass.addEventListener('click', (e) => {
    const r = stub.getBoundingClientRect();
    const hole = document.createElement('span');
    hole.className = 'pass__hole';
    hole.style.left = `${Math.min(Math.max(e.clientX - r.left, 20), r.width - 20)}px`;
    hole.style.top = `${Math.min(Math.max(e.clientY - r.top, 20), r.height - 20)}px`;
    stub.appendChild(hole);
    gsap.to(hole, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
    gsap.fromTo(card, { scale: 0.97 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const status = $('.pass__status', pass);
    status.lastChild.textContent = 'Boarded';
    ASCII.scramble($('.pass__cta .sc', pass), { text: 'Boarding — see you there', duration: 0.6 });
  });
})();

// Footer local clock (the "arrival time")
(() => {
  const el = $('#footerTime');
  const t = () => { el.textContent = `arrived ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} local`; };
  t();
  setInterval(t, 30000);
})();

// ---------- Artifact cards ----------
// Hero signal: a live ASCII waveform, drifting frequency and an uptime counter
(() => {
  const wave = $('#signalWave');
  const freq = $('#signalFreq');
  const up = $('#signalUptime');
  if (!wave) return;
  const RAMP = ' .:-=+*#%@';
  const W = 30, H = 3;
  const born = new Date(2024, 0, 1);
  let t = 0;
  const draw = () => {
    t += 0.12;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const v = (Math.sin(x * 0.45 + t) * 0.5 + Math.sin(x * 0.17 - t * 1.7) * 0.5 + 1) / 2;
        const level = Math.abs(v * H - (H - 1 - y) - 0.5);
        row += level < 0.6 ? RAMP[Math.min(RAMP.length - 1, Math.floor((1 - level) * RAMP.length))] : ' ';
      }
      rows.push(row);
    }
    wave.textContent = rows.join('\n');
  };
  draw();
  if (!reduced) setInterval(draw, 90);
  setInterval(() => { freq.textContent = `${(88.2 + Math.random() * 0.5).toFixed(1)} MHz`; }, 1600);
  const days = Math.floor((Date.now() - born) / 864e5);
  up.textContent = `${days} days`;
})();

// Terminal in The Static: types a short conversation, then loops
(() => {
  const body = $('#termBody');
  if (!body) return;
  const script = [
    ['> ', 'whoami'],
    ['', 'tarun km — engineer, designer & developer', 'ok'],
    ['> ', 'ls ./stack'],
    ['', 'react/  next/  node/  python/  esp32/  figma/', 'ok'],
    ['> ', 'cat ai.txt'],
    ['', 'llms · vlms · agents · n8n · local diffusion', 'ok'],
    ['> ', 'status --now'],
    ['', 'open for projects ✓', 'ok'],
  ];
  let running = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    if (running) return;
    running = true;
    while (true) {
      body.innerHTML = '';
      for (const [prompt, text, cls] of script) {
        const line = document.createElement('div');
        if (cls) line.className = cls;
        body.appendChild(line);
        if (prompt) {
          for (let i = 0; i <= text.length; i++) {
            line.innerHTML = `${prompt}${text.slice(0, i)}<span class="term__caret"></span>`;
            await sleep(reduced ? 0 : 55 + Math.random() * 60);
          }
          line.textContent = prompt + text;
          await sleep(350);
        } else {
          await ASCII.scramble(line, { text, from: 'blank', duration: 0.5 });
          await sleep(500);
        }
      }
      const caret = document.createElement('div');
      caret.innerHTML = '> <span class="term__caret"></span>';
      body.appendChild(caret);
      await sleep(4200);
    }
  };
  new IntersectionObserver(([e]) => e.isIntersecting && run()).observe(body);
})();

// Availability card: 12-month strip, current month lit, a few months "booked"
(() => {
  const el = $('#availMonths');
  if (!el) return;
  const now = new Date();
  $('#availYear').textContent = now.getFullYear();
  const names = 'JFMAMJJASOND';
  el.innerHTML = [...names].map((m, i) => {
    const cls = i === now.getMonth() ? 'is-now' : (i > now.getMonth() && i <= now.getMonth() + 2 ? 'is-booked' : '');
    return `<span class="${cls}">${m}</span>`;
  }).join('');
})();

// Works: numbered tags + a "go" button on each project image
$$('.case').forEach((card, i) => {
  const box = $('.case__img', card);
  const tag = document.createElement('span');
  tag.className = 'case__tag';
  tag.innerHTML = `<b>No.${String(i + 1).padStart(2, '0')}</b> Artifact · ${new Date().getFullYear()}`;
  const go = document.createElement('span');
  go.className = 'case__go';
  go.textContent = '↗';
  box.append(tag, go);
});

// Phones: lift the signal card off the hero (it would cover the figure) and
// place it at the start of the manifesto, where the "received signal" leads into the code.
(() => {
  const card = $('.signal');
  if (!card) return;
  const home = card.parentElement;
  const homeNext = card.nextElementSibling;
  const manifesto = $('.manifesto');
  const place = (mobile) => {
    if (mobile) manifesto.insertBefore(card, manifesto.querySelector('h3'));
    else home.insertBefore(card, homeNext);
    card.classList.toggle('signal--inline', mobile);
  };
  const mq = matchMedia('(max-width: 991px)');
  place(mq.matches);
  mq.addEventListener('change', (e) => { place(e.matches); ScrollTrigger.refresh(); });
})();

// Print-shop registration marks on each card
$$('.signal, .spec, .term, .avail, .log__stat').forEach((card) => {
  const m = document.createElement('span');
  m.className = 'card-marks';
  m.innerHTML = '<i></i><i></i><i></i><i></i>';
  card.appendChild(m);
});

// Cards float with scroll and tilt toward the cursor
if (!reduced) {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 992px)', () => {
    $$('.spec').forEach((card, i) => {
      gsap.fromTo(card, { y: 120 * (i ? 1 : -0.5), rotate: i ? 4 : -5 }, {
        y: -120 * (i ? 1 : 0.5), rotate: i ? -2 : 3, ease: 'none',
        scrollTrigger: { trigger: '.manifesto', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  });
  $$('.spec').forEach((card) => {
    gsap.from(card, { opacity: 0, scale: 0.9, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: card, start: 'top 85%' } });
  });
  gsap.from('.term', { y: 60, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.ascii-band', start: 'top 60%' } });
  gsap.from('.avail', { y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.footer', start: 'top 70%' } });
  if (finePointer) {
    $$('.signal, .spec, .term, .avail, .log__stat').forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.8, ease: 'power3.out' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.8, ease: 'power3.out' });
      gsap.set(card, { transformPerspective: 900 });
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry((px - 0.5) * 12);
        rx(-(py - 0.5) * 12);
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
      });
      card.addEventListener('mouseleave', () => { rx(0); ry(0); });
    });
  }
}

// ---------- The Log ----------
(() => {
  const stats = $$('.log__stat strong');
  const fmt = (el, v) => {
    const dec = +(el.dataset.dec || 0);
    const n = dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-IN');
    el.textContent = `${el.dataset.prefix || ''}${n}`;
  };
  stats.forEach((el) => {
    const target = parseFloat(el.dataset.count);
    if (reduced) { fmt(el, target); return; }
    fmt(el, 0);
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => gsap.to(o, { v: target, duration: 2, ease: 'power3.out', onUpdate: () => fmt(el, o.v) }),
    });
  });

  const rows = $$('.log__row');
  rows.forEach((row) => ASCII.hover(row, $('.log__role', row), { duration: 0.5 }));
  if (!reduced) {
    gsap.from('.log__stat', { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: '.log__stats', start: 'top 85%' } });
    rows.forEach((row) => {
      ScrollTrigger.create({
        trigger: row, start: 'top 92%', once: true,
        onEnter: () => {
          gsap.from(row, { y: 30, opacity: 0, duration: 1, ease: 'expo.out' });
          $$('.log__role, .log__org, .log__date', row).forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 0.8, delay: i * 0.08 }));
        },
      });
    });
  }
})();

// ---------- Services slider ----------
const slides = $$('.slide');
let current = 0;
let sliding = false;
const show = (next, dir) => {
  if (sliding) return;
  next = (next + slides.length) % slides.length;
  const out = slides[current];
  const inn = slides[next];
  sliding = true;
  gsap.timeline({ onComplete: () => { sliding = false; } })
    .to($$('.line__in, .btn', out), { yPercent: -110 * dir, opacity: 0, duration: 0.6, ease: 'power3.in', stagger: 0.04 })
    .add(() => { out.classList.remove('is-active'); inn.classList.add('is-active'); })
    .fromTo($$('.line__in, .btn', inn), { yPercent: 110 * dir, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.06 });
  current = next;
  ASCII.scramble($('#slideIndex'), { text: String(next + 1).padStart(2, '0'), duration: 0.5 });
};
$('.slider__btn--prev').addEventListener('click', () => show(current - 1, -1));
$('.slider__btn--next').addEventListener('click', () => show(current + 1, 1));

// ---------- Menu ----------
const toggle = $('#menuToggle');
const menu = $('#menu');
const setMenu = (open) => {
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  toggle.setAttribute('aria-expanded', String(open));
  toggle.dataset.text = open ? 'Close' : 'Discover';
  ASCII.scramble(toggle, { text: toggle.dataset.text, duration: 0.5 });
  document.body.classList.toggle('menu-open', open);
  // The HUD bar steps aside while the menu owns the screen, then glides back
  gsap.to('.hud', open
    ? { yPercent: 180, autoAlpha: 0, duration: 0.6, ease: 'power3.in', overwrite: true }
    : { yPercent: 0, autoAlpha: 1, duration: 0.9, ease: 'expo.out', delay: 0.35, overwrite: true });
  if (open) {
    lenis && lenis.stop();
    gsap.fromTo('.menu__list a', { yPercent: 110 }, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.3 });
    $$('.menu__list a').forEach((a, i) => ASCII.scramble(a, { from: 'blank', duration: 0.9, delay: 0.3 + i * 0.06 }));
    gsap.fromTo('.menu__bar', { yPercent: 120 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', delay: 0.5 });
  } else {
    lenis && lenis.start();
  }
};
toggle.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
$$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));

// ---------- Cursor + magnetic buttons ----------
if (finePointer && !reduced) {
  const cursor = $('#cursor');
  const cursorLabel = $('span', cursor);
  document.documentElement.classList.add('has-cursor');
  ASCII.trail($('#cursorTrail'));

  // Cursor states, most specific first. The disc is always in difference mode,
  // so growing it over big type / images / UI inverts their colours under it.
  const MAJOR = '.h-xl, .h-l, .footer__band, .loader__name, .nav__logo, .hud, .menu__list a, .ascii-band__content, .signal, .spec, .term, .avail, .log__stat';
  const LINK = 'a, button';
  const TEXT = '.l, .m, .xs, p';
  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    const view = t.closest('.case, .insight, [data-cursor]');
    cursorLabel.textContent = (view && view.dataset.cursor) || 'View';
    const major = !view && t.closest(MAJOR);
    const link = !view && !major && t.closest(LINK);
    const text = !view && !major && !link && t.closest(TEXT);
    cursor.classList.toggle('is-view', !!view);
    cursor.classList.toggle('is-major', !!major);
    cursor.classList.toggle('is-link', !!link);
    cursor.classList.toggle('is-text', !!text);
  });
  addEventListener('mousedown', () => cursor.classList.add('is-down'));
  addEventListener('mouseup', () => cursor.classList.remove('is-down'));
  const cx = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' });
  const cy = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' });
  addEventListener('mousemove', (e) => { cx(e.clientX); cy(e.clientY); });
  document.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
  document.addEventListener('mouseenter', () => cursor.classList.remove('is-hidden'));

  $$('.btn, .slider__btn, .nav__toggle').forEach((el) => {
    const mx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const my = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      mx((e.clientX - r.left - r.width / 2) * 0.35);
      my((e.clientY - r.top - r.height / 2) * 0.35);
    });
    el.addEventListener('mouseleave', () => { mx(0); my(0); });
  });
} else {
  $('#cursor').remove();
  $('#cursorTrail').remove();
}
