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
  // artwork moves into the parallax layer; plate captions stay pinned to the paper
  [...box.childNodes].filter((n) => !(n.classList && n.classList.contains('plate__cap'))).forEach((n) => inner.appendChild(n));
  box.prepend(inner);
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
      audio.volume = Math.min(1, Math.max(0, from + (to - from) * t));
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

  // The launch screen asks first-time visitors; it drives playback through this API
  window.music = {
    on: () => { play(); remember('on'); },
    off: () => { if (on) pause(); remember('off'); },
    get playing() { return on; },
  };
  let firstVisit = true;
  try { firstVisit = !localStorage.getItem('tk.profile'); } catch (e) {}

  if (!optedOut && !firstVisit) {
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
// One path for every in-page jump: close the menu first (it pauses smooth scroll),
// then travel, leaving room for the fixed nav.
function goTo(target) {
  const menuEl = $('#menu');
  const wasOpen = menuEl && menuEl.classList.contains('is-open');
  if (wasOpen) window.setMenu(false);
  const offset = target.id === 'top' ? 0 : -64;
  const run = () => {
    if (lenis) {
      lenis.start();
      // content above can change height mid-flight (lazy media, reveals), so re-aim on arrival
      lenis.scrollTo(target, {
        offset, duration: 1.6, force: true,
        onComplete: () => {
          if (Math.abs(target.getBoundingClientRect().top + offset) > 4) lenis.scrollTo(target, { offset, duration: 0.6, force: true });
        },
      });
    }
    else window.scrollTo({ top: target.getBoundingClientRect().top + scrollY + offset, behavior: reduced ? 'auto' : 'smooth' });
    if (history.replaceState && target.id) history.replaceState(null, '', `#${target.id}`);
  };
  wasOpen ? setTimeout(run, 380) : run();
}
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const href = a.getAttribute('href');
  e.preventDefault();
  if (href === '#') return; // placeholder links
  const target = $(href);
  if (target) goTo(target);
}));

// ---------- Loader ----------
const loader = $('#loader');
const count = $('#loaderCount');
const bar = $('#loaderBar');
const status = $('#loaderStatus');

const pageLoaded = new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r)));

const pad = (n) => String(n).padStart(3, '0');

// ---------- Theme: dark signal ⇄ light negative ----------
(() => {
  const btn = $('#themeToggle');
  if (!btn) return;
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const sync = () => {
    const light = root.dataset.theme === 'light';
    btn.setAttribute('aria-pressed', String(light));
    btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    $('.theme-toggle__label', btn).textContent = light ? 'Dark' : 'Light';
    if (meta) meta.setAttribute('content', light ? '#f3f0f3' : '#050705');
  };
  const apply = (next) => {
    root.dataset.theme = next;
    try { localStorage.setItem('tk.theme', next); } catch (e) {}
    sync();
  };
  sync();
  const switchTo = (next, from = btn) => {
    if (next === root.dataset.theme) return;
    if (!document.startViewTransition || reduced) return apply(next);
    const r = from.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    document.startViewTransition(() => apply(next));
  };
  window.setTheme = switchTo;
  btn.addEventListener('click', () => switchTo(root.dataset.theme === 'light' ? 'dark' : 'light'));
})();

// ---------- Image shield ----------
// A deterrent layer over every artwork: no right-click save, drag-out, long-press save or
// "open image in new tab". (Nothing on the web can stop a screenshot — this stops casual copying.)
(() => {
  const MEDIA = '.plate, .case__img, .angel-slot, .hero__media, .footer__band, .ticker, .pass, .lt--logo, .nav__logo';
  // A transparent shield sits above the pixels of each artwork container
  $$('.case__img, .angel-slot, .hero__media').forEach((box) => {
    if (box.querySelector(':scope > .shield')) return;
    const sh = document.createElement('span');
    sh.className = 'shield';
    sh.setAttribute('aria-hidden', 'true');
    box.appendChild(sh);
  });
  const isMedia = (t) => t instanceof Element && (t.matches('img, video, canvas, picture, svg image, .shield') || t.closest(MEDIA));
  document.addEventListener('contextmenu', (e) => { if (isMedia(e.target)) e.preventDefault(); }, true);
  document.addEventListener('dragstart', (e) => { if (isMedia(e.target) || e.target instanceof HTMLImageElement) e.preventDefault(); }, true);
  // images added later (angel video, lazy art) are covered by the same rules
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (n instanceof HTMLImageElement || n instanceof HTMLVideoElement) { n.draggable = false; n.setAttribute('draggable', 'false'); if (n instanceof HTMLVideoElement) { n.disablePictureInPicture = true; n.setAttribute('controlslist', 'nodownload'); } }
  }))).observe(document.body, { childList: true, subtree: true });
  $$('img, video').forEach((n) => { n.draggable = false; n.setAttribute('draggable', 'false'); });
})();

// ---------- Privacy-first analytics ----------
// Anonymous visitor id + a handful of named events, sent to /api/collect.
// Nothing is sent when the browser asks not to be tracked (GPC / Do Not Track).
const track = (() => {
  const optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  let excluded = false; // the owner's own browser (set when signing in to /admin) never counts
  try { excluded = localStorage.getItem('tk.exclude') === '1'; } catch (e) {}
  if (optedOut || excluded) return () => {};
  if (navigator.webdriver) { // automated browser: tell the server once (it only counts it), record nothing
    fetch('/api/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: true }), keepalive: true }).catch(() => {});
    return () => {};
  }
  let vid;
  try { vid = localStorage.getItem('tk.vid'); if (!vid) { vid = crypto.randomUUID(); localStorage.setItem('tk.vid', vid); } }
  catch (e) { vid = crypto.randomUUID(); }
  let queue = [];
  let timer = 0;
  const flush = () => {
    clearTimeout(timer);
    if (!queue.length) return;
    const body = JSON.stringify({ vid, events: queue.splice(0, 20) });
    fetch('/api/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
    if (queue.length) flush();
  };
  addEventListener('pagehide', flush);
  return (type, data = {}) => { queue.push({ type, ...data }); clearTimeout(timer); timer = setTimeout(flush, 1500); };
})();
window.track = track;

(() => {
  const w = innerWidth;
  track('visit', { device: w < 768 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop', lang: navigator.language, referrer: document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '' });
  const t0 = performance.now();
  let depth = 0;
  addEventListener('scroll', () => { depth = Math.max(depth, Math.round(((scrollY + innerHeight) / document.documentElement.scrollHeight) * 100)); }, { passive: true });
  let sent = false;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !sent) { sent = true; track('leave', { seconds: (performance.now() - t0) / 1000, depth }); }
  });
  // what people act on
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a, button');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const name = a.id === 'pass' ? 'pass'
      : a.matches('.hud__cta') ? 'hud_cta'
      : a.id === 'soundToggle' ? (window.music && window.music.playing ? 'sound_off' : 'sound_on')
      : a.matches('[data-replay]') ? 'replay'
      : href.includes('docs.google.com/forms') ? 'brief'
      : href.includes('drive.google.com') ? 'resume'
      : href.includes('instagram.com') ? 'instagram'
      : href.includes('linkedin.com') ? 'linkedin'
      : href.startsWith('tel:') ? 'phone' : null;
    if (name) track('action', { name });
  }, true);
})();

// ---------- Launch: a short conversation before the experience ----------
// Runs once, between the loader reaching 100% and the logo flying into the nav.
// Answers personalise the site and are remembered (localStorage) for next time.
const PROFILE_KEY = 'tk.profile';
const readProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { return null; } };
const saveProfile = (p) => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {} };
let launchStart = null;

const ROLES = {
  hiring:   { label: 'Hiring',              reply: "Then the experience log and the wins will matter most — they're one tap away.", cta: 'Hire me' },
  project:  { label: 'Starting a project',  reply: 'Good. The boarding pass further down is your way in — no forms to fear.',   cta: 'Start a project' },
  collab:   { label: 'Collaborating',       reply: 'I like building with people. The stack and the log will tell you how I work.', cta: 'Build together' },
  explore:  { label: 'Just exploring',      reply: 'Perfect. Wander freely — every section is a chapter of the same story.',      cta: 'Say hello' },
};
const STARTS = [
  ['#works', 'The work'], ['#services', 'Services'], ['#experience', 'Experience'],
  ['#insights', 'Achievements'], ['#contact', 'Contact'], ['#top', 'Full tour'],
];

function applyProfile(p) {
  if (!p) return;
  document.documentElement.classList.toggle('calm', p.motion === 'calm');
  const role = ROLES[p.role];
  const cta = $('.hud__cta .sc');
  if (role && cta) { cta.textContent = role.cta; cta.dataset.text = role.cta; }
  const line = $('.hero .chapter__line');
  if (line && p.name) line.textContent = `Signal received, ${p.name}.`;
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast mono xs';
  t.textContent = text;
  document.body.appendChild(t);
  gsap.fromTo(t, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
  gsap.to(t, { y: -10, opacity: 0, duration: 0.6, delay: 3.6, onComplete: () => t.remove() });
}

async function runLaunch() {
  const saved = readProfile();
  if (saved) {
    // returning visitor: no questions, just a greeting once the site is open
    applyProfile(saved);
    setTimeout(() => toast(saved.name ? `Welcome back, ${saved.name}.` : 'Welcome back.'), 2600);
    return;
  }

  const root = $('#launch');
  const thread = $('#launchThread');
  const reply = $('#launchReply');
  const stepEl = $('#launchStep');
  const bar = $('#launchBar');
  const TOTAL = 6;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const profile = { name: '', role: 'explore', sound: 'off', motion: 'full', theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', start: '#top' };
  let skipped = false;
  let skipResolve;
  const skipped$ = new Promise((r) => { skipResolve = r; });

  const setStep = (n) => {
    stepEl.textContent = `${String(n).padStart(2, '0')} / ${String(TOTAL).padStart(2, '0')}`;
    gsap.to(bar, { scaleX: n / TOTAL, duration: 0.8, ease: 'expo.out' });
  };

  // Bot message: typing dots, then the text streams in with a glyph "print head" at its tip
  const say = async (text) => {
    if (skipped) return;
    const row = document.createElement('div');
    row.className = 'msg msg--bot';
    row.innerHTML = '<span class="msg__who mono">TKM</span><p class="msg__bubble"><span class="msg__dots"><i></i><i></i><i></i></span></p>';
    thread.appendChild(row);
    gsap.from(row, { y: 16, opacity: 0, filter: 'blur(6px)', duration: 0.6, ease: 'expo.out', clearProps: 'filter' });
    pin();
    await sleep(420 + Math.min(text.length * 9, 700));
    const bubble = $('.msg__bubble', row);
    bubble.textContent = '';
    const txt = document.createElement('span');
    const head = document.createElement('span');
    head.className = 'msg__head';
    bubble.append(txt, head);
    if (reduced) { txt.textContent = text; head.remove(); return; }
    for (let i = 0; i < text.length; i++) {
      if (skipped) break;
      txt.textContent = text.slice(0, i + 1);
      head.textContent = ASCII.GLYPHS[(Math.random() * ASCII.GLYPHS.length) | 0];
      if (i % 12 === 0) thread.scrollTop = thread.scrollHeight;
      const ch = text[i];
      await new Promise((r) => setTimeout(r, /[.,—!?]/.test(ch) ? 110 : 16 + Math.random() * 14));
    }
    txt.textContent = text;
    head.remove();
    await sleep(160);
  };

  const echo = (text) => {
    const row = document.createElement('div');
    row.className = 'msg msg--you';
    row.innerHTML = `<p class="msg__bubble"></p><span class="msg__who mono">${profile.name ? profile.name.slice(0, 12) : 'You'}</span>`;
    $('.msg__bubble', row).textContent = text;
    thread.appendChild(row);
    gsap.from(row, { x: 28, opacity: 0, scale: 0.96, transformOrigin: '100% 100%', duration: 0.6, ease: 'expo.out' });
    pin();
  };

  // Offer choices; resolves with the chosen value. Number keys pick options too.
  let lastChip = null;
  // Keep the newest message in view whenever the thread or the reply area changes size
  // (instant jump after layout: new messages already animate in, so this reads as smooth and never lags behind)
  const pin = () => { const go = () => { thread.scrollTop = thread.scrollHeight; }; go(); requestAnimationFrame(go); setTimeout(go, 60); setTimeout(go, 400); };
  new ResizeObserver(pin).observe(reply);

  const enter = (els) => gsap.fromTo(els,
    { y: 18, opacity: 0, clipPath: 'inset(0% 0% 100% 0% round 14px)' },
    { y: 0, opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 14px)', duration: 0.7, ease: 'expo.out', stagger: 0.06, clearProps: 'clipPath' });

  // Offer choices; resolves with the chosen value. Number keys pick options too.
  const ask = (options) => new Promise((resolve) => {
    if (skipped) return resolve(null);
    reply.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = `opts ${options.length === 2 ? 'opts--2' : 'opts--grid'}`;
    wrap.setAttribute('role', 'group');
    const buttons = options.map(([value, label], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      const key = document.createElement('span'); key.className = 'opt__key mono'; key.textContent = String(i + 1).padStart(2, '0');
      const text = document.createElement('span'); text.className = 'opt__label'; text.textContent = label;
      const go = document.createElement('span'); go.className = 'opt__go'; go.setAttribute('aria-hidden', 'true'); go.textContent = '→';
      b.append(key, text, go);
      b.addEventListener('click', () => { lastChip = b; done(value, label, b); });
      wrap.appendChild(b);
      return b;
    });
    reply.appendChild(wrap);
    enter(buttons);
    pin();
    buttons[0].focus({ preventScroll: true });
    let chosen = false;
    const onKey = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= options.length) { e.preventDefault(); lastChip = buttons[n - 1]; done(...options[n - 1], buttons[n - 1]); }
    };
    document.addEventListener('keydown', onKey);
    skipped$.then(() => { document.removeEventListener('keydown', onKey); resolve(null); });
    function done(value, label, btn) {
      if (chosen) return;
      chosen = true;
      document.removeEventListener('keydown', onKey);
      buttons.forEach((x) => { x.disabled = true; });
      btn.classList.add('is-chosen');
      const others = buttons.filter((x) => x !== btn);
      gsap.timeline({ onComplete: () => { reply.replaceChildren(); echo(label); resolve(value); } })
        .to(others, { opacity: 0, y: 8, scale: 0.97, duration: reduced ? 0 : 0.3, ease: 'power2.in', stagger: 0.03 })
        .to(btn, { scale: 1.02, duration: reduced ? 0 : 0.18, ease: 'power2.out' }, 0)
        .to(btn, { opacity: 0, y: -10, duration: reduced ? 0 : 0.28, ease: 'power2.in' }, reduced ? 0 : 0.28);
    }
  });

  const askName = () => new Promise((resolve) => {
    if (skipped) return resolve('');
    reply.innerHTML = `
      <form class="name-form" autocomplete="off">
        <label class="sr-only" for="launchName">Your name</label>
        <div class="name-form__field">
          <span class="name-form__prompt mono" aria-hidden="true">&gt;</span>
          <input id="launchName" class="name-form__input" maxlength="24" placeholder="Type your name…" enterkeyhint="done" spellcheck="false">
          <span class="name-form__count mono" aria-hidden="true">0/24</span>
        </div>
        <div class="name-form__actions">
          <button class="opt opt--solid" type="submit"><span class="opt__label">Continue</span><span class="opt__go" aria-hidden="true">↵</span></button>
          <button class="opt" type="button" data-anon><span class="opt__label">Stay anonymous</span><span class="opt__go" aria-hidden="true">→</span></button>
        </div>
      </form>`;
    const form = $('form', reply);
    const input = $('input', form);
    const count = $('.name-form__count', form);
    input.addEventListener('input', () => { count.textContent = `${input.value.length}/24`; });
    enter([$('.name-form__field', form), ...$$('.opt', form)]);
    pin();
    setTimeout(() => input.focus({ preventScroll: true }), 60);
    const finish = (name) => {
      gsap.to(form, { opacity: 0, y: -10, duration: reduced ? 0 : 0.3, ease: 'power2.in', onComplete: () => { reply.replaceChildren(); resolve(name); } });
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/[<>]/g, '').slice(0, 24);
      if (!name) { gsap.fromTo($('.name-form__field', form), { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }); input.focus(); return; }
      profile.name = name;
      echo(name);
      finish(name);
    });
    $('[data-anon]', form).addEventListener('click', () => { echo('I’d rather stay anonymous'); finish(''); });
    skipped$.then(() => finish(''));
  });

  // ---- open ----
  root.hidden = false;
  document.body.classList.add('launching');
  gsap.to('.loader__center', { opacity: 0, duration: 0.5 });
  gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.6 });
  gsap.from('.launch__frame', { y: 40, scale: 0.97, duration: 1, ease: 'expo.out' });
  const onEsc = (e) => { if (e.key === 'Escape') skip(); };
  document.addEventListener('keydown', onEsc);
  function skip() { if (skipped) return; skipped = true; skipResolve(); }
  $('#launchSkip').addEventListener('click', skip);

  // ---- the conversation ----
  const convo = (async () => {
    setStep(1);
    await say("Hello, I'm Tarun.");
    await say('This is my portfolio — part engineer, part designer, part developer.');
    await say('Before we get into the full experience, let me know who you are.');
    await askName();

    setStep(2);
    await say(profile.name ? `Good to meet you, ${profile.name}. What brings you here?` : 'No problem. What brings you here?');
    const role = await ask(Object.entries(ROLES).map(([k, v]) => [k, v.label]));
    if (role) { profile.role = role; await say(ROLES[role].reply); }

    setStep(3);
    await say('Would you like music on? Three tracks I made with Gemini play quietly in the background.');
    const sound = await ask([['on', 'Sound on ♪'], ['off', 'Keep it quiet']]);
    if (sound) {
      profile.sound = sound;
      sound === 'on' ? window.music.on() : window.music.off();   // inside the click = allowed to play
      await say(sound === 'on' ? 'Nice. You can mute it anytime from the bar at the bottom.' : 'Silence it is. The bar at the bottom can change that later.');
    }

    setStep(4);
    await say('How much motion do you like?');
    const motion = await ask([['full', 'Full cinema'], ['calm', 'Keep it calm']]);
    if (motion) { profile.motion = motion; document.documentElement.classList.toggle('calm', motion === 'calm'); }

    setStep(5);
    await say('Dark signal, or a light negative? You can flip it anytime from the top bar.');
    const theme = await ask([['dark', '● Dark signal'], ['light', '○ Light negative']]);
    if (theme) {
      profile.theme = theme;
      window.setTheme && window.setTheme(theme, lastChip || $('#themeToggle'));
      await say(theme === 'light' ? 'Inverted. Every engraving now prints as a negative.' : 'Dark it stays — the way the signal was drawn.');
    }

    setStep(6);
    await say('Last one — where should we begin?');
    const start = await ask(STARTS);
    if (start) profile.start = start;
    await say(profile.name ? `Tuning in for you, ${profile.name}…` : 'Tuning in…');
    await sleep(500);
  })();

  await Promise.race([convo, skipped$]);
  document.removeEventListener('keydown', onEsc);
  if (skipped) profile.skipped = true;
  saveProfile(profile);
  applyProfile(profile);
  track('launch', { name: profile.name, role: profile.role, sound: profile.sound, motion: profile.motion, theme: profile.theme, start: profile.start, skipped: !!profile.skipped });
  launchStart = profile.start !== '#top' ? profile.start : null;

  // ---- close: the conversation folds away and the loader's name returns for the fly-in ----
  await gsap.timeline()
    .to('.launch__frame', { y: -30, opacity: 0, duration: 0.6, ease: 'power3.in' })
    .to(root, { opacity: 0, duration: 0.4 }, 0.3)
    .to('.loader__center', { opacity: 1, duration: 0.5 }, 0.45);
  root.remove();
  document.body.classList.remove('launching');
}

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
  await gsap.to(c, { v: 90, duration: reduced ? 0.2 : 1.6, ease: 'power3.inOut', onUpdate: draw });
  await Promise.all([pageLoaded, document.fonts.ready]);
  status.textContent = 'Ready';
  await gsap.to(c, { v: 100, duration: 0.5, ease: 'power2.out', onUpdate: draw });
  await runLaunch();
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
      if (launchStart) { const t = $(launchStart); t && setTimeout(() => goTo(t), 500); }
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
      .from(inner, { scale: box.classList.contains('plate') ? 1.06 : 1.35, duration: 1.8, ease: 'expo.out' }, 0.2)
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
    const drift = box.classList.contains('plate') ? 2 : 6;
    gsap.fromTo(inner, { yPercent: -drift }, { yPercent: drift, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
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
  gsap.from('.channel', { y: 60, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: '.footer', start: 'top 75%' } });
  // The name that opened the site rises one last time, logo in place of the A
  const band = gsap.timeline({ scrollTrigger: { trigger: '.footer__band', start: 'top 88%' } });
  band.from('.footer__band', { clipPath: 'inset(50% 0% 50% 0% round .8rem)', duration: 1.4, ease: 'expo.inOut' })
    .from('.footer__name > *', { yPercent: 115, duration: 1.4, ease: 'expo.out', stagger: 0.05 }, 0.5)
    .from('.footer__logo', { rotate: -12, scale: 0.8, duration: 1.8, ease: 'expo.out' }, 0.55)
    .add(() => $$('.footer__name .ch:not(.ch--space)').forEach((c, i) => ASCII.scramble(c, { from: 'blank', duration: 0.9, delay: i * 0.05 })), 0.5);
  gsap.fromTo('.footer__logo', { y: 20 }, { y: -20, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  gsap.from('.footer__meta > *', { y: 20, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.06, scrollTrigger: { trigger: '.footer__meta', start: 'top 98%' } });

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
    onEnter: () => $$('.channel .sc').forEach((el, i) => ASCII.scramble(el, { from: 'blank', duration: 1, delay: i * 0.12 })),
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
[
  ...$$('.nav__group a, .dock a, .footer__meta a, .menu__list a'),
].forEach((el) => ASCII.hover(el));
$$('.btn, .channel, .pass').forEach((el) => {
  const target = el.querySelector('.sc') || ASCII.wrapText(el);
  ASCII.hover(el, target);
});
$$('.case, .insight').forEach((card) => ASCII.hover(card, $('h4', card), { duration: 0.6 }));
// plate captions swap to the hover artwork's title (works) as the image changes
$$('.case').forEach((card) => {
  const t = $('.plate__title', card);
  if (!t || !t.dataset.alt) return;
  const main = t.textContent;
  card.addEventListener('mouseenter', () => ASCII.scramble(t, { text: t.dataset.alt, duration: 0.5 }));
  card.addEventListener('mouseleave', () => ASCII.scramble(t, { text: main, duration: 0.5 }));
});
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
  el.innerHTML = `<span class="chapter__kind">${sec.dataset.kind}</span><span class="chapter__no">CH.${sec.dataset.chapter}</span><span class="chapter__title">${sec.dataset.title}</span><span class="chapter__rule"></span><span class="chapter__line">${sec.dataset.line}</span>`;
  sec.prepend(el);
  if (reduced) return;
  ScrollTrigger.create({ trigger: sec, start: 'top 60%', once: true, onEnter: () => track('chapter', { name: sec.dataset.chapter }) });
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
    ASCII.scramble(label, { text: `${c.dataset.chapter} · ${c.dataset.kind}`, duration: 0.6 });
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
    barcode.replaceChildren(...Array.from({ length: 34 }, () => { const i = document.createElement('i'); i.style.flex = String([1, 1, 2, 3][Math.floor(Math.random() * 4)]); return i; }));
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

// Footer year
$('#footerYear').textContent = new Date().getFullYear();

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
    // insert before the first statement block (a direct child of the manifesto)
    if (mobile) manifesto.insertBefore(card, manifesto.querySelector(':scope > .stmt'));
    else home.insertBefore(card, homeNext);
    card.classList.toggle('signal--inline', mobile);
  };
  const mq = matchMedia('(max-width: 991px)');
  place(mq.matches);
  mq.addEventListener('change', (e) => { place(e.matches); ScrollTrigger.refresh(); });
})();

// ---------- The guardian (animated angel) ----------
// Every .angel-slot shares one loader: VP9-alpha WebM for Chrome/Firefox/Edge/Android,
// animated WebP for Safari (no VP9 alpha), a still for reduced motion. Files are
// fetched once and cached; each copy pauses itself when off screen.
const ANGEL = { webm: 'assets/angel.webm', webp: 'assets/angel.webp', poster: 'assets/angel-poster.webp' };
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
function mountAngel(slot) {
  if (!slot || slot.dataset.mounted) return;
  slot.dataset.mounted = '1';
  if (reduced || isSafari) {
    slot.innerHTML = `<img src="${reduced ? ANGEL.poster : ANGEL.webp}" alt="" decoding="async">`;
    return;
  }
  const v = document.createElement('video');
  Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true, poster: ANGEL.poster, src: ANGEL.webm });
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  slot.appendChild(v);
  v.play().catch(() => {});
  new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause())).observe(slot);
}
// slots mount when they come near
const angelIO = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { angelIO.unobserve(e.target); mountAngel(e.target); }
}), { rootMargin: '800px 0px' });
$$('.angel-slot[data-angel="lazy"]').forEach((el) => angelIO.observe(el));

if (!reduced) {
  // The Static: rises out of the field as you scroll through the chapter
  const fig = $('#angel');
  gsap.from(fig, { opacity: 0, scale: 0.85, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: '.ascii-band', start: 'top 70%' } });
  gsap.matchMedia().add('(min-width: 992px)', () => {
    gsap.fromTo(fig, { yPercent: -35 }, { yPercent: -65, ease: 'none', scrollTrigger: { trigger: '.ascii-band', start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

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

// ---------- Kinetic tickers ----------
$$('.ticker').forEach((tk, i) => {
  const track = $('.ticker__track', tk);
  const dir = i % 2 ? 1 : -1;
  if (reduced) return;
  const loop = gsap.fromTo(track, { xPercent: dir < 0 ? 0 : -50 }, { xPercent: dir < 0 ? -50 : 0, duration: 38, ease: 'none', repeat: -1 });
  // scroll speed pushes the ticker, then it eases back to cruise
  ScrollTrigger.create({
    trigger: tk, start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => {
      const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 300, 6);
      gsap.to(loop, { timeScale: boost * (self.direction || 1), duration: 0.25, overwrite: true });
      gsap.to(loop, { timeScale: 1, duration: 1.2, delay: 0.25, ease: 'power2.out' });
    },
  });
  tk.addEventListener('mouseenter', () => gsap.to(loop, { timeScale: 0.25, duration: 0.6 }));
  tk.addEventListener('mouseleave', () => gsap.to(loop, { timeScale: 1, duration: 0.6 }));
});

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
  toggle.dataset.text = open ? 'Close' : 'Index';
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
    mountAngel($('.menu__angel'));
    gsap.fromTo('.menu__angel', { opacity: 0, y: 60 }, { opacity: 0.16, y: 0, duration: 1.6, ease: 'expo.out', delay: 0.35, overwrite: true });
  } else {
    lenis && lenis.start();
  }
};
toggle.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
window.setMenu = setMenu;
$('[data-replay]') && $('[data-replay]').addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); try { localStorage.removeItem(PROFILE_KEY); } catch (x) {} location.href = location.pathname; }, true);
// external menu links (résumé) still close the menu; in-page ones are handled by goTo()
$$('a:not([href^="#"])', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));

// Active section: nav + menu links light up for the chapter you're reading
(() => {
  const links = $$('.nav__group a[href^="#"], .menu__list a[href^="#"]');
  const ids = [...new Set(links.map((a) => a.getAttribute('href').slice(1)))];
  ids.forEach((id) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => links.forEach((a) => {
        if (a.getAttribute('href') === `#${id}`) a.classList.toggle('is-active', self.isActive);
      }),
    });
  });
})();

// Keyboard: J / K step through chapters (skipped while typing or when the menu is open)
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k !== 'j' && k !== 'k') return;
  const secs = $$('[data-chapter]');
  const y = scrollY + innerHeight * 0.3;
  let i = secs.findIndex((s) => s.offsetTop > y);
  if (i === -1) i = secs.length;
  const next = k === 'j' ? secs[Math.min(i, secs.length - 1)] : secs[Math.max(i - 2, 0)];
  if (next) goTo(next);
});
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
