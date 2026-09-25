// ASCII engine — text scrambles + canvas character fields used across the site.
window.ASCII = (() => {
  const GLYPHS = '!<>-_\\/[]{}=+*^?#%@&$01';
  const RAMP = ' .·:-=+*x#%@';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (s) => s[(Math.random() * s.length) | 0];
  const FONT = '500 12px "JetBrains Mono", ui-monospace, monospace';

  // ---------- Text scramble ----------
  // Each character resolves at its own random moment, cycling glyphs until then.
  // from: 'text' keeps the original visible until its slot starts (hover),
  //       'blank' starts empty (reveal).
  function scramble(el, { text, duration = 0.8, delay = 0, from = 'text', chars = GLYPHS } = {}) {
    if (!el) return Promise.resolve();
    const final = text ?? (el.dataset.text ??= el.textContent);
    if (reduced) { el.textContent = final; return Promise.resolve(); }
    const token = (el._scr = (el._scr || 0) + 1);
    const start = el.textContent;
    const q = [...final].map((c, i) => {
      const s = Math.random() * 0.45;
      return { to: c, from: from === 'text' ? (start[i] ?? '') : '', s, e: s + 0.2 + Math.random() * 0.35, g: '' };
    });
    // lock width so neighbouring layout doesn't jitter
    return new Promise((resolve) => {
      const t0 = performance.now() + delay * 1000;
      const frame = (now) => {
        if (el._scr !== token) return resolve();
        const t = (now - t0) / (duration * 1000);
        let out = '';
        let done = 0;
        for (const c of q) {
          if (c.to === ' ' || c.to === '\n') { out += c.to; done++; continue; }
          if (t >= c.e) { out += c.to; done++; }
          else if (t >= c.s) {
            if (!c.g || Math.random() < 0.3) c.g = rand(chars);
            out += c.g;
          } else out += c.from;
        }
        el.textContent = out;
        if (done === q.length) { el.textContent = final; resolve(); }
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  // Bind a scramble to hover on `trigger`, animating `target` (defaults to trigger).
  function hover(trigger, target = trigger, opts = {}) {
    if (!target) return;
    target.dataset.text ??= target.textContent;
    trigger.addEventListener('mouseenter', () => scramble(target, { duration: 0.55, ...opts }));
    // touch devices have no hover: a tap re-encodes the text instead
    trigger.addEventListener('touchstart', () => scramble(target, { duration: 0.55, ...opts }), { passive: true });
  }

  // Wrap an element's first non-empty text node so it can be scrambled
  // without destroying sibling markup (icons, arrows).
  function wrapText(el) {
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return el.querySelector('.sc') || null;
    const span = document.createElement('span');
    span.className = 'sc';
    span.textContent = node.textContent.trim();
    const trailing = /\s$/.test(node.textContent) ? ' ' : '';
    node.replaceWith(span, trailing);
    return span;
  }

  // ---------- Canvas helpers ----------
  function fit(canvas, cell) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT.replace('12px', `${cell}px`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    return { ctx, w, h, cols: Math.ceil(w / cell), rows: Math.ceil(h / cell) };
  }
  const seeds = (n) => Float32Array.from({ length: n }, Math.random);
  const wave = (x, y, t) =>
    (Math.sin(x * 0.11 + t) + Math.sin(y * 0.15 - t * 1.3) + Math.sin((x + y) * 0.06 + t * 0.7) + Math.sin(Math.hypot(x - 40, y - 20) * 0.12 - t)) / 4;

  // ---------- Interactive band ----------
  // Plasma of characters; the cursor sends ripples through it and heats cells to brand red.
  function band(canvas) {
    const CELL = 14;
    let g, visible = false, raf = 0;
    const mouse = { x: -9999, y: -9999, amp: 0, target: 0 };
    const resize = () => { g = fit(canvas, CELL - 3); };
    resize();
    new ResizeObserver(resize).observe(canvas);
    canvas.parentElement.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.target = 1;
    });
    canvas.parentElement.addEventListener('mouseleave', () => { mouse.target = 0; });
    const draw = (now) => {
      if (!visible) return;
      const t = now / 1000;
      const { ctx, w, h, cols, rows } = g;
      mouse.amp += (mouse.target - mouse.amp) * 0.06;
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * CELL + CELL / 2;
          const py = y * CELL + CELL / 2;
          const d = Math.hypot(px - mouse.x, py - mouse.y);
          const ripple = mouse.amp * Math.exp(-(d * d) / 40000) * Math.sin(d * 0.06 - t * 5);
          const v = Math.max(0, Math.min(1, (wave(x * 0.8, y, t * 0.6) + 1) / 2 * 0.8 + ripple * 0.7));
          const ch = RAMP[Math.min(RAMP.length - 1, (v * RAMP.length) | 0)];
          if (ch === ' ') continue;
          const heat = mouse.amp * Math.max(0, 1 - d / 220);
          ctx.fillStyle = heat > 0.35 ? `rgba(180,196,164,${0.4 + heat * 0.6})` : `rgba(201,206,195,${0.08 + v * 0.45})`;
          ctx.fillText(heat > 0.6 && Math.random() < 0.3 ? rand(GLYPHS) : ch, px, py);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting && !reduced;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    }).observe(canvas);
  }

  // ---------- Image overlay ----------
  // On reveal: the image is fully "encoded" in characters that dissolve away.
  // On hover: a character lens follows the cursor.
  function overlay(box) {
    const canvas = document.createElement('canvas');
    canvas.className = 'ascii-overlay';
    box.appendChild(canvas);
    const CELL = 11;
    let g, sd, raf = 0, running = false;
    const st = { reveal: 1, lens: 0, lensTarget: 0, x: 0, y: 0 };
    const resize = () => { g = fit(canvas, CELL - 2); sd = seeds(g.cols * g.rows); };
    resize();
    new ResizeObserver(resize).observe(box);
    const R = 110;
    const draw = (now) => {
      const t = now / 1000;
      const { ctx, w, h, cols, rows } = g;
      st.lens += (st.lensTarget - st.lens) * 0.12;
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const px = x * CELL + CELL / 2;
          const py = y * CELL + CELL / 2;
          const rv = sd[i] < st.reveal ? 1 : 0;
          const d = Math.hypot(px - st.x, py - st.y);
          const ln = st.lens * Math.max(0, 1 - d / R);
          const m = Math.max(rv, ln);
          if (m < 0.04) continue;
          const v = (wave(x, y, t * 1.5) + 1) / 2;
          ctx.fillStyle = `rgba(5,7,5,${m * (rv ? 0.94 : 0.6)})`;
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          ctx.fillStyle = sd[i] > 0.93 ? `rgba(180,196,164,${m})` : `rgba(201,206,195,${m * (0.35 + v * 0.65)})`;
          ctx.fillText(ln > 0.5 && Math.random() < 0.15 ? rand(GLYPHS) : RAMP[1 + ((v * (RAMP.length - 1)) | 0)] || '#', px, py);
        }
      }
      if (st.reveal > 0 || st.lens > 0.01 || st.lensTarget > 0) raf = requestAnimationFrame(draw);
      else { running = false; ctx.clearRect(0, 0, w, h); }
    };
    const kick = () => { if (!running && !reduced) { running = true; raf = requestAnimationFrame(draw); } };
    box.addEventListener('mousemove', (e) => {
      const r = box.getBoundingClientRect();
      st.x = e.clientX - r.left; st.y = e.clientY - r.top;
    });
    box.addEventListener('mouseenter', () => { st.lensTarget = 1; kick(); });
    box.addEventListener('mouseleave', () => { st.lensTarget = 0; });
    if (reduced) st.reveal = 0;
    st.kick = kick;
    return st; // GSAP calls st.kick() and tweens st.reveal 1 -> 0 as the card scrolls in
  }

  // ---------- Cursor trail ----------
  function trail(canvas) {
    let g;
    const parts = [];
    let last = { x: 0, y: 0 }, raf = 0, running = false;
    const resize = () => { g = fit(canvas, 13); };
    resize();
    addEventListener('resize', resize);
    const draw = () => {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= 0.022; p.y += p.vy; p.x += p.vx;
        if (Math.random() < 0.2) p.c = rand(GLYPHS);
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(201,206,195,${p.life})`;
        ctx.fillText(p.c, p.x, p.y);
      }
      if (parts.length) raf = requestAnimationFrame(draw);
      else running = false;
    };
    addEventListener('mousemove', (e) => {
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 18) return;
      last = { x: e.clientX, y: e.clientY };
      parts.push({ x: e.clientX, y: e.clientY, vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.6, life: 1, c: rand(GLYPHS) });
      if (parts.length > 60) parts.shift();
      if (!running) { running = true; raf = requestAnimationFrame(draw); }
    });
  }

  // ASCII progress bar string
  const bar = (p, n = 24) => `[${'#'.repeat(Math.round(p * n))}${'·'.repeat(n - Math.round(p * n))}]`;

  return { scramble, hover, wrapText, band, overlay, trail, bar, GLYPHS, reduced };
})();
