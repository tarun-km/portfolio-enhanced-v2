// TKM Admin dashboard.
// Security note: every value that came from a visitor is inserted with textContent / SVG text nodes —
// never innerHTML — so a name like "<img onerror=…>" is shown, not executed.

const app = document.getElementById('app');
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const DEMO = LOCAL && new URLSearchParams(location.search).has('demo'); // generated numbers never appear on the live site

// ---------- tiny DOM helpers ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = String(text);
  return el;
}

// ---------- formatting & labels ----------
const nf = new Intl.NumberFormat('en-IN');
const fmt = (n) => nf.format(Math.round(n || 0));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const dur = (sec) => { sec = Math.round(sec || 0); const m = Math.floor(sec / 60); return m ? `${m}m ${String(sec % 60).padStart(2, '0')}s` : `${sec}s`; };
const regionName = (() => { try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return (c) => (c && c !== '??' ? d.of(c) || c : 'Unknown'); } catch { return (c) => c || 'Unknown'; } })();
const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const hr = Math.round(m / 60); if (hr < 24) return `${hr}h ago`; return `${Math.round(hr / 24)}d ago`; };

const L = {
  role: { hiring: 'Hiring', project: 'Starting a project', collab: 'Collaborating', explore: 'Just exploring', unknown: 'Not answered' },
  sound: { on: 'Sound on', off: 'Quiet', unknown: 'Not answered' },
  motion: { full: 'Full cinema', calm: 'Calm', unknown: 'Not answered' },
  theme: { dark: 'Dark signal', light: 'Light negative', unknown: 'Not answered' },
  start: { '#works': 'The work', '#services': 'Services', '#experience': 'Experience', '#insights': 'Achievements', '#contact': 'Contact', '#top': 'Full tour', unknown: 'Not answered' },
  chapter: { '00': 'Home', '01': 'About', '02': 'Work', '03': 'Experience', '04': 'Services', '05': 'Skills', '06': 'Achievements', '07': 'Contact' },
  action: { pass: 'Boarding pass', brief: 'Brief form', resume: 'Résumé', instagram: 'Instagram', linkedin: 'LinkedIn', phone: 'Phone call', hud_cta: 'Bottom-bar CTA', sound_on: 'Turned sound on', sound_off: 'Turned sound off', replay: 'Replayed intro' },
  device: { mobile: 'Phone', tablet: 'Tablet', desktop: 'Desktop', unknown: 'Unknown' },
};
const lab = (map, k) => (map[k] !== undefined ? map[k] : k);
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
// sequential blue for magnitude on the dark surface: near-zero recedes into the surface
const RAMP = ['#16263a', '#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef'];
const rampColor = (t) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))))];

// ---------- API ----------
async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  if (r.status === 401) throw Object.assign(new Error('auth'), { status: 401 });
  const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || `HTTP ${r.status}`), { status: r.status });
  return body;
}

// ---------- boot ----------
let state = { days: 30, data: null, filter: '', health: null, audit: [], auto: true };
let refreshTimer = 0;
const excludeMe = () => { try { localStorage.setItem('tk.exclude', '1'); } catch (e) {} };

async function boot() {
  if (DEMO) return renderDash(true);
  try { const me = await api('/api/admin/me'); state.health = me.health; excludeMe(); renderDash(false); }
  catch (e) { renderLogin(e.status === 503 ? 'The admin panel is not configured yet — set ADMIN_PASSWORD_HASH and SESSION_SECRET in Vercel.' : ''); }
}

function renderLogin(msg = '') {
  const err = h('p', { class: 'error', role: 'alert' }, msg);
  const input = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, minlength: '12' });
  const btn = h('button', { class: 'btn btn--solid', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'login__card', onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; err.textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: input.value }) });
      input.value = ''; excludeMe();
      const me = await api('/api/admin/me'); state.health = me.health; renderDash(false);
    }
    catch (x) { err.textContent = x.status === 401 ? 'Wrong password.' : x.message; btn.disabled = false; input.focus(); }
  } },
    h('span', { class: 'eyebrow' }, h('span', { class: 'pulse' }), 'TKM · Signal control'),
    h('div', { class: 'lockup', 'aria-label': 'Tarun' }, 'T', h('img', { src: '/assets/logo.webp', alt: '' }), 'RUN'),
    h('p', { class: 'muted' }, 'Private dashboard for the portfolio. Every number here comes from real visits.'),
    h('div', { class: 'field' }, h('label', { for: 'pw' }, 'Password'), input),
    btn, err,
  );
  app.replaceChildren(h('div', { class: 'grain', 'aria-hidden': 'true' }), h('div', { class: 'login' }, form));
  input.focus();
}

// ---------- dashboard ----------
function renderDash(demo) {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Date range' },
    [7, 30, 90, 365].map((d) => h('button', { type: 'button', 'aria-pressed': String(d === state.days), onclick: () => { state.days = d; load(demo); } }, d === 365 ? '1y' : `${d}d`)));
  const top = h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('img', { src: '/assets/logo.webp', alt: '' }), h('b', {}, 'Signal control'), h('span', { id: 'updated' }, '')),
    h('span', { class: 'live', title: 'Visitors active in the last 5 minutes' }, h('span', { class: 'pulse' }), h('span', { id: 'liveNow' }, '—')),
    seg,
    h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: state.auto, onchange: (e) => { state.auto = e.target.checked; schedule(demo); } }), 'Auto-refresh'),
    h('button', { class: 'btn', type: 'button', onclick: () => load(demo) }, 'Refresh'),
    demo ? null : h('a', { class: 'btn', id: 'export', href: `/api/admin/export?days=${state.days}` }, 'Export CSV'),
    demo ? h('a', { class: 'btn', href: '/admin/' }, 'Exit demo') : h('button', { class: 'btn', type: 'button', onclick: async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); clearTimeout(refreshTimer); renderLogin(); } }, 'Log out'),
  );
  const main = h('main', { class: 'dash', id: 'dash' }, h('p', { class: 'muted span-12' }, 'Loading…'));
  app.replaceChildren(h('div', { class: 'grain', 'aria-hidden': 'true' }), top, demo ? h('p', { class: 'demo mono' }, 'Demo mode (local only) — generated sample data, nothing here is real.') : '', main, drawer());
  load(demo);
}

async function load(demo) {
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === (state.days === 365 ? '1y' : `${state.days}d`))));
  const ex = document.getElementById('export'); if (ex) ex.href = `/api/admin/export?days=${state.days}`;
  try {
    const [data, audit] = demo ? [demoData(state.days), { entries: demoAudit() }] : await Promise.all([api(`/api/admin/stats?days=${state.days}`), api('/api/admin/audit')]);
    state.data = data; state.audit = audit.entries || [];
    document.getElementById('liveNow').textContent = `${fmt(data.live || 0)} live now`;
    document.getElementById('updated').textContent = `updated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    draw();
    schedule(demo);
  } catch (e) {
    if (e.status === 401) return renderLogin('Session expired — sign in again.');
    document.getElementById('dash').replaceChildren(h('p', { class: 'error span-12' }, `Couldn’t load stats: ${e.message}`));
  }
}
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
function schedule(demo) { clearTimeout(refreshTimer); if (state.auto && !document.hidden) refreshTimer = setTimeout(() => load(demo), 60000); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.data && state.auto) schedule(DEMO); });

function draw() {
  const d = state.data;
  const dash = document.getElementById('dash');
  figNo = 0;
  const visitors = d.kpi.visitors || 0;
  const launched = (d.launch.completed || 0) + (d.launch.skipped || 0);
  const soundOn = (d.sound.find((x) => x.k === 'on') || {}).n || 0;
  const soundAns = d.sound.filter((x) => x.k !== 'unknown').reduce((a, x) => a + x.n, 0);

  const delta = (cur, prev) => {
    if (!prev) return h('span', { class: 'muted' }, 'no earlier data');
    const ch = Math.round(((cur - prev) / prev) * 100);
    return h('span', { class: ch >= 0 ? 'up' : 'down' }, `${Math.abs(ch)}% vs previous ${d.days}d`);
  };
  const kpi = (label, value, sub) => h('div', { class: 'kpi' }, h('span', { class: 'kpi__label' }, label), h('span', { class: 'kpi__value' }, value), h('span', { class: 'kpi__delta' }, sub));

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: d.timezone || 'Asia/Kolkata' }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const chapter = (no, kind, line) => h('div', { class: 'chapter' }, h('span', { class: 'chapter__kind' }, kind), h('span', { class: 'chapter__no' }, `CH.${no}`), h('span', { class: 'chapter__rule' }), h('span', {}, line));
  const filteredTotal = (d.filtered || []).reduce((a, f) => a + f.n, 0);
  dash.replaceChildren(
    h('section', { class: 'hello' },
      h('h1', {}, `${greet}, Tarun.`),
      h('p', {}, `${fmt(visitors)} people found the signal in the last ${d.days} days${d.live ? ` — ${fmt(d.live)} ${d.live === 1 ? 'is' : 'are'} here right now` : ''}.`),
      h('span', { class: 'mono' }, `Times in ${d.timezone || 'UTC'} · last event ${d.freshness && d.freshness.last_event ? ago(d.freshness.last_event) : 'never'}`)),
    chapter('01', 'Audience', 'Who arrived, and how that compares to the period before.'),
    h('section', { class: 'kpis span-12', 'aria-label': 'Key numbers' },
      kpi('Visitors', fmt(visitors), delta(visitors, d.prev.visitors)),
      kpi('Visits', fmt(d.kpi.visits), delta(d.kpi.visits, d.prev.visits)),
      kpi('New visitors', fmt(d.kpi.new_visitors), `${pct(d.kpi.new_visitors, visitors)}% of visitors`),
      kpi('Finished the intro', `${pct(d.launch.completed, launched)}%`, `${fmt(d.launch.completed)} of ${fmt(launched)} · ${fmt(d.launch.skipped)} skipped`),
      kpi('Chose music', `${pct(soundOn, soundAns)}%`, `${fmt(soundOn)} of ${fmt(soundAns)} answered`),
      kpi('Median time on site', dur(d.engagement.median_seconds), `avg ${dur(d.engagement.avg_seconds)} · scrolled ${d.engagement.avg_depth}%`),
      kpi('Actions', fmt(d.kpi.actions), delta(d.kpi.actions, d.prev.actions)),
    ),
    card('span-12', 'Traffic', `Unique visitors and visits per day · last ${d.days} days`, (el) => lineChart(el, d.daily),
      () => table(['Day', 'Visitors', 'Visits'], d.daily.map((r) => [r.day, r.visitors, r.visits]), [1, 2])),
    chapter('02', 'Journey', 'How far people travel through the story.'),
    card('span-8', 'How far people read', 'Visitors reaching each chapter, as a share of those who reached Home', (el) => funnel(el, d.chapters),
      () => table(['Chapter', 'Visitors'], d.chapters.map((r) => [`${r.k} · ${lab(L.chapter, r.k)}`, r.n]), [1])),
    card('span-4', 'Why they came', 'Answer to “What brings you here?”', (el) => donut(el, d.roles.map((r) => ({ label: lab(L.role, r.k), n: r.n, other: r.k === 'unknown' }))),
      () => table(['Reason', 'Visitors'], d.roles.map((r) => [lab(L.role, r.k), r.n]), [1])),
    chapter('03', 'Intent', 'What visitors told the intro, and what they did next.'),
    card('span-6', 'Where they chose to start', 'Last question of the intro', (el) => hbars(el, d.starts.map((r) => ({ label: lab(L.start, r.k), n: r.n }))),
      () => table(['Start', 'Visitors'], d.starts.map((r) => [lab(L.start, r.k), r.n]), [1])),
    card('span-6', 'What they clicked', 'Contact and conversion actions', (el) => hbars(el, d.actions.map((r) => ({ label: lab(L.action, r.k), n: r.n }))),
      () => table(['Action', 'Clicks'], d.actions.map((r) => [lab(L.action, r.k), r.n]), [1])),
    card('span-4', 'Preferences', 'Sound, motion and theme choices', (el) => {
      stacked(el, 'Sound', d.sound.map((r) => ({ label: lab(L.sound, r.k), n: r.n, other: r.k === 'unknown' })));
      stacked(el, 'Motion', d.motion.map((r) => ({ label: lab(L.motion, r.k), n: r.n, other: r.k === 'unknown' })));
      stacked(el, 'Theme', (d.theme || []).map((r) => ({ label: lab(L.theme, r.k), n: r.n, other: r.k === 'unknown' })));
    }, () => table(['Preference', 'Choice', 'Visitors'], [...d.sound.map((r) => ['Sound', lab(L.sound, r.k), r.n]), ...d.motion.map((r) => ['Motion', lab(L.motion, r.k), r.n]), ...(d.theme || []).map((r) => ['Theme', lab(L.theme, r.k), r.n])], [2])),
    chapter('04', 'Context', 'Screens, places and the sites that sent them.'),
    card('span-4', 'Devices', 'Visitors by screen size', (el) => donut(el, d.devices.map((r) => ({ label: lab(L.device, r.k), n: r.n, other: r.k === 'unknown' }))),
      () => table(['Device', 'Visitors'], d.devices.map((r) => [lab(L.device, r.k), r.n]), [1])),
    card('span-4', 'Countries', 'Top 12 by visitors', (el) => hbars(el, d.countries.map((r) => ({ label: regionName(r.k), n: r.n })), { compact: true }),
      () => table(['Country', 'Visitors'], d.countries.map((r) => [regionName(r.k), r.n]), [1])),
    card('span-8', 'When people visit', `Visits by weekday and hour (${d.timezone || 'UTC'})`, (el) => heatmap(el, d.heat),
      () => table(['Weekday', `Hour (${d.timezone || 'UTC'})`, 'Visits'], d.heat.map((r) => [['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][r.dow], r.hr, r.n]), [1, 2])),
    card('span-4', 'Referrers', 'Sites that sent people here', (el) => hbars(el, d.referrers.map((r) => ({ label: r.k, n: r.n })), { compact: true }),
      () => table(['Referrer', 'Visitors'], d.referrers.map((r) => [r.k, r.n]), [1])),
    chapter('05', 'Visitors', 'Individual journeys — open one for its full timeline.'),
    visitorsCard(d.recent),
    chapter('06', 'Integrity', 'How clean the data is, and who touched the admin panel.'),
    qualityCard(d, filteredTotal),
    securityCard(),
  );
}

// ---------- card with chart ⇄ table toggle ----------
let figNo = 0;
function card(span, title, subtitle, drawChart, drawTable) {
  const body = h('div', { class: 'chart' });
  const toggle = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Table');
  let asTable = false;
  const render = () => {
    body.replaceChildren();
    if (asTable) body.append(drawTable());
    else drawChart(body);
  };
  toggle.addEventListener('click', () => { asTable = !asTable; toggle.textContent = asTable ? 'Chart' : 'Table'; toggle.setAttribute('aria-pressed', String(asTable)); render(); });
  const el = h('section', { class: `card ${span}` },
    h('div', { class: 'card__head' }, h('span', { class: 'card__idx' }, `FIG.${String(++figNo).padStart(2, '0')}`), h('h2', {}, title), h('div', { class: 'card__tools' }, toggle)),
    h('p', { class: 'muted', style: { marginTop: '-6px', fontSize: '12px' } }, subtitle), body);
  requestAnimationFrame(render);
  let w = 0;
  new ResizeObserver(() => { const nw = body.clientWidth; if (Math.abs(nw - w) > 24) { w = nw; if (!asTable) render(); } }).observe(body);
  return el;
}

function table(cols, rows, numCols = []) {
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: numCols.includes(i) ? 'num' : '' }, c)))),
    h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: numCols.includes(i) ? 'num' : '' }, typeof c === 'number' ? fmt(c) : c)))) : h('tr', {}, h('td', { colspan: String(cols.length), class: 'muted' }, 'No data yet')))));
}

// ---------- tooltip ----------
function tooltip(container) {
  const tip = h('div', { class: 'tip', role: 'status' });
  container.append(tip);
  return {
    show(x, y, title, rows) {
      tip.replaceChildren(h('div', { class: 'tip__title' }, title), ...rows.map(([color, name, val]) => h('div', { class: 'tip__row' }, color ? h('span', { class: 'sw', style: { background: color } }) : '', name, h('b', {}, val))));
      tip.classList.add('on');
      const cw = container.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = x + 14; if (left + tw > cw) left = x - tw - 14; if (left < 0) left = 0;
      let top = y - th - 10; if (top < 0) top = y + 14;
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    },
    hide() { tip.classList.remove('on'); },
  };
}
const niceMax = (v) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const empty = (el) => el.append(h('p', { class: 'empty' }, 'No data for this range yet.'));

// ---------- line chart (2 series, one axis, crosshair + tooltip) ----------
function lineChart(el, rows) {
  if (!rows.length || rows.every((r) => !r.visits && !r.visitors)) return empty(el);
  const W = Math.max(320, el.clientWidth), H = 240, m = { t: 12, r: 64, b: 26, l: 36 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.visits, r.visitors))));
  const x = (i) => m.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v) => m.t + ih - (v / max) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Visitors and visits per day' });
  const grid = s('g', { class: 'grid' });
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; grid.append(s('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v) })); svg.append(s('text', { class: 'tick', x: m.l - 8, y: y(v) + 3, 'text-anchor': 'end' }, fmt(v))); }
  svg.prepend(grid);
  const every = Math.ceil(rows.length / Math.max(2, Math.floor(iw / 70)));
  rows.forEach((r, i) => { if (i % every === 0 || i === rows.length - 1) svg.append(s('text', { class: 'tick', x: x(i), y: H - 6, 'text-anchor': 'middle' }, r.day.slice(5))); });
  const series = [['visits', 'Visits', SERIES[1]], ['visitors', 'Visitors', SERIES[0]]];
  const pathOf = (k) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join('');
  svg.append(s('path', { d: `${pathOf('visitors')}L${x(rows.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: SERIES[0], opacity: '0.12' }));
  for (const [k, name, color] of series) {
    svg.append(s('path', { d: pathOf(k), fill: 'none', stroke: color, 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const last = rows[rows.length - 1];
    svg.append(s('text', { class: 'label', x: x(rows.length - 1) + 8, y: y(last[k]) + 4 }, name)); // direct label at the line end
  }
  const cross = s('line', { y1: m.t, y2: m.t + ih, stroke: 'var(--line-2)', 'stroke-width': '1', visibility: 'hidden' });
  const dots = series.map(([, , c]) => s('circle', { r: '4.5', fill: c, stroke: 'var(--surface-1)', 'stroke-width': '2', visibility: 'hidden' }));
  svg.append(cross, ...dots);
  const hit = s('rect', { class: 'hit', x: m.l, y: m.t, width: iw, height: ih });
  svg.append(hit);
  el.append(h('div', { class: 'legend' }, series.slice().reverse().map(([, n, c]) => h('span', {}, h('span', { class: 'sw', style: { background: c } }), n))), svg);
  const tip = tooltip(el);
  const move = (ev) => {
    const box = svg.getBoundingClientRect(); const sx = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(rows.length - 1, Math.round(((sx - m.l) / iw) * (rows.length - 1))));
    const r = rows[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    series.forEach(([k], j) => { dots[j].setAttribute('cx', x(i)); dots[j].setAttribute('cy', y(r[k])); dots[j].setAttribute('visibility', 'visible'); });
    const px = (x(i) / W) * box.width, py = (y(r.visits) / H) * box.height;
    tip.show(px, py + (box.top - el.getBoundingClientRect().top), new Date(r.day).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }), [[SERIES[0], 'Visitors', fmt(r.visitors)], [SERIES[1], 'Visits', fmt(r.visits)]]);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { tip.hide(); cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); });
}

// Bar with the data-end rounded (4px) and the baseline end square
const barPath = (x0, y0, w, hgt, r = 4) => { r = Math.min(r, w, hgt / 2); return `M${x0},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${y0 + hgt - r}Q${x0 + w},${y0 + hgt} ${x0 + w - r},${y0 + hgt}H${x0}Z`; };

// ---------- horizontal bars (single series) ----------
function hbars(el, items, { compact = false } = {}) {
  items = items.filter((i) => i.n > 0);
  if (!items.length) return empty(el);
  const W = Math.max(280, el.clientWidth), bh = compact ? 16 : 20, gap = compact ? 10 : 12;
  const labelW = Math.min(170, Math.max(90, Math.max(...items.map((i) => i.label.length)) * 7.2));
  const H = items.length * (bh + gap) + 4;
  const max = Math.max(...items.map((i) => i.n));
  const iw = W - labelW - 56;
  const total = items.reduce((a, i) => a + i.n, 0);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Bar chart' });
  svg.append(s('line', { class: 'baseline', x1: labelW, x2: labelW, y1: 0, y2: H - 4 }));
  const tip = tooltip(el);
  items.forEach((it, i) => {
    const y0 = i * (bh + gap) + 2, w = Math.max(2, (it.n / max) * iw);
    svg.append(s('text', { class: 'label', x: labelW - 10, y: y0 + bh / 2 + 4, 'text-anchor': 'end' }, it.label.length > 24 ? `${it.label.slice(0, 23)}…` : it.label));
    const bar = s('path', { d: barPath(labelW + 1, y0, w, bh), fill: SERIES[0] });
    svg.append(bar, s('text', { class: 'value', x: labelW + w + 8, y: y0 + bh / 2 + 4 }, fmt(it.n)));
    const hit = s('rect', { class: 'hit', x: 0, y: y0 - gap / 2, width: W, height: bh + gap });
    hit.addEventListener('pointermove', (ev) => { bar.setAttribute('opacity', '0.8'); const b = el.getBoundingClientRect(); tip.show(ev.clientX - b.left, ev.clientY - b.top, it.label, [[SERIES[0], 'Count', fmt(it.n)], ['', 'Share', `${pct(it.n, total)}%`]]); });
    hit.addEventListener('pointerleave', () => { bar.removeAttribute('opacity'); tip.hide(); });
    svg.append(hit);
  });
  el.append(svg);
}

// ---------- chapter funnel ----------
function funnel(el, rows) {
  const order = ['00', '01', '02', '03', '04', '05', '06', '07'];
  const by = Object.fromEntries(rows.map((r) => [r.k, r.n]));
  const base = by['00'] || Math.max(0, ...rows.map((r) => r.n));
  if (!base) return empty(el);
  const W = Math.max(320, el.clientWidth), bh = 22, gap = 8, labelW = 128, iw = W - labelW - 96;
  const H = order.length * (bh + gap);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Chapter reach funnel' });
  svg.append(s('line', { class: 'baseline', x1: labelW, x2: labelW, y1: 0, y2: H - gap }));
  const tip = tooltip(el);
  order.forEach((k, i) => {
    const n = by[k] || 0, y0 = i * (bh + gap), w = Math.max(n ? 2 : 0, (n / base) * iw);
    svg.append(s('text', { class: 'label', x: labelW - 10, y: y0 + bh / 2 + 4, 'text-anchor': 'end' }, `${k} · ${L.chapter[k]}`));
    svg.append(s('rect', { x: labelW + 1, y: y0, width: iw, height: bh, fill: 'var(--surface-2)', rx: '3' }));
    const bar = s('path', { d: barPath(labelW + 1, y0, w, bh), fill: SERIES[0] });
    svg.append(bar, s('text', { class: 'value', x: labelW + iw + 10, y: y0 + bh / 2 + 4 }, `${pct(n, base)}%`));
    const prev = i ? by[order[i - 1]] || 0 : n;
    const hit = s('rect', { class: 'hit', x: 0, y: y0 - gap / 2, width: W, height: bh + gap });
    hit.addEventListener('pointermove', (ev) => { const b = el.getBoundingClientRect(); tip.show(ev.clientX - b.left, ev.clientY - b.top, `${k} · ${L.chapter[k]}`, [[SERIES[0], 'Visitors', fmt(n)], ['', 'Of Home', `${pct(n, base)}%`], ['', 'Kept from previous', i ? `${pct(n, prev)}%` : '—']]); });
    hit.addEventListener('pointerleave', () => tip.hide());
    svg.append(hit);
  });
  el.append(svg);
}

// ---------- donut (part-to-whole, ≤ 5 slices + legend) ----------
function donut(el, items) {
  items = items.filter((i) => i.n > 0);
  if (!items.length) return empty(el);
  const total = items.reduce((a, i) => a + i.n, 0);
  const S = 200, R = 86, r = 58, cx = S / 2, cy = S / 2;
  const svg = s('svg', { viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': 'Share breakdown', class: 'donut' });
  const tip = tooltip(el);
  let a0 = -Math.PI / 2;
  let ci = 0;
  const colorFor = (it) => (it.other ? 'var(--text-muted)' : SERIES[ci++]);
  const colored = items.map((it) => ({ ...it, color: colorFor(it) }));
  colored.forEach((it) => {
    const a1 = a0 + (it.n / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
    const d = items.length === 1
      ? `M${cx - R},${cy}A${R},${R} 0 1 1 ${cx + R},${cy}A${R},${R} 0 1 1 ${cx - R},${cy}M${cx - r},${cy}A${r},${r} 0 1 0 ${cx + r},${cy}A${r},${r} 0 1 0 ${cx - r},${cy}Z`
      : `M${p(a0, R)}A${R},${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${large} 0 ${p(a0, r)}Z`;
    const seg = s('path', { d, fill: it.color, stroke: 'var(--surface-1)', 'stroke-width': '2', 'fill-rule': 'evenodd' });
    seg.addEventListener('pointermove', (ev) => { seg.setAttribute('opacity', '0.8'); const b = el.getBoundingClientRect(); tip.show(ev.clientX - b.left, ev.clientY - b.top, it.label, [[it.color, 'Visitors', fmt(it.n)], ['', 'Share', `${pct(it.n, total)}%`]]); });
    seg.addEventListener('pointerleave', () => { seg.removeAttribute('opacity'); tip.hide(); });
    svg.append(seg);
    a0 = a1;
  });
  svg.append(s('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', fill: 'var(--text-primary)', 'font-size': '26', 'font-family': 'Inter Tight, Arial' }, fmt(total)));
  svg.append(s('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'tick' }, 'visitors'));
  el.append(svg, h('div', { class: 'legend', style: { justifyContent: 'center' } }, colored.map((it) => h('span', {}, h('span', { class: 'sw', style: { background: it.color } }), `${it.label} · ${pct(it.n, total)}%`))));
}

// ---------- 100% stacked bar ----------
function stacked(el, title, items) {
  items = items.filter((i) => i.n > 0);
  const wrap = h('div', { style: { marginBottom: '14px' } }, h('div', { class: 'label', style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' } }, title));
  el.append(wrap);
  if (!items.length) return empty(wrap);
  const total = items.reduce((a, i) => a + i.n, 0);
  const W = Math.max(240, el.clientWidth), H = 22;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${title} split` });
  const tip = tooltip(wrap);
  let x0 = 0, ci = 0;
  const colored = items.map((it) => ({ ...it, color: it.other ? 'var(--text-muted)' : SERIES[ci++] }));
  colored.forEach((it, i) => {
    const w = (it.n / total) * W - (i < colored.length - 1 ? 2 : 0); // 2px surface gap between fills
    const rect = s('rect', { x: x0, y: 0, width: Math.max(1, w), height: H, fill: it.color, rx: i === 0 || i === colored.length - 1 ? '4' : '0' });
    rect.addEventListener('pointermove', (ev) => { const b = wrap.getBoundingClientRect(); tip.show(ev.clientX - b.left, ev.clientY - b.top, `${title}: ${it.label}`, [[it.color, 'Visitors', fmt(it.n)], ['', 'Share', `${pct(it.n, total)}%`]]); });
    rect.addEventListener('pointerleave', () => tip.hide());
    svg.append(rect);
    x0 += w + 2;
  });
  wrap.append(svg, h('div', { class: 'legend', style: { marginTop: '6px' } }, colored.map((it) => h('span', {}, h('span', { class: 'sw', style: { background: it.color } }), `${it.label} ${pct(it.n, total)}%`))));
}

// ---------- weekday × hour heatmap (sequential) ----------
function heatmap(el, cells) {
  if (!cells.length) return empty(el);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  cells.forEach((c) => { if (c.dow >= 1 && c.dow <= 7) grid[c.dow - 1][c.hr] = c.n; });
  const max = Math.max(1, ...cells.map((c) => c.n));
  const W = Math.max(320, el.clientWidth), lw = 34, top = 16;
  const cw = (W - lw) / 24, ch = Math.min(26, Math.max(14, cw));
  const H = top + ch * 7 + 30;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Visits by weekday and hour' });
  const tip = tooltip(el);
  for (let hr = 0; hr < 24; hr += 3) svg.append(s('text', { class: 'tick', x: lw + hr * cw + cw / 2, y: 10, 'text-anchor': 'middle' }, `${String(hr).padStart(2, '0')}h`));
  grid.forEach((row, di) => {
    svg.append(s('text', { class: 'tick', x: lw - 6, y: top + di * ch + ch / 2 + 3, 'text-anchor': 'end' }, days[di]));
    row.forEach((n, hr) => {
      const rect = s('rect', { x: lw + hr * cw + 1, y: top + di * ch + 1, width: Math.max(1, cw - 2), height: ch - 2, rx: '3', fill: n ? rampColor(n / max) : 'var(--surface-2)' });
      rect.addEventListener('pointermove', (ev) => { rect.setAttribute('stroke', 'var(--text-primary)'); const b = el.getBoundingClientRect(); tip.show(ev.clientX - b.left, ev.clientY - b.top, `${days[di]} · ${String(hr).padStart(2, '0')}:00 UTC`, [['', 'Visits', fmt(n)]]); });
      rect.addEventListener('pointerleave', () => { rect.removeAttribute('stroke'); tip.hide(); });
      svg.append(rect);
    });
  });
  // ramp legend
  const ly = top + ch * 7 + 12, lx = W - 170;
  svg.append(s('text', { class: 'tick', x: lx - 8, y: ly + 8, 'text-anchor': 'end' }, 'fewer'));
  RAMP.forEach((c, i) => svg.append(s('rect', { x: lx + i * 12, y: ly, width: 11, height: 10, rx: '2', fill: c })));
  svg.append(s('text', { class: 'tick', x: lx + RAMP.length * 12 + 6, y: ly + 8 }, `more (${fmt(max)})`));
  el.append(svg);
}

// ---------- integrity: data quality + setup health ----------
const FILTER_LABEL = { bot: 'Crawlers & scripts', automation: 'Automated browsers', rate: 'Rate-limited floods', invalid: 'Malformed requests', origin: 'Other-site requests' };
function qualityCard(d, filteredTotal) {
  const hs = state.health || {};
  const check = (ok, text) => h('li', {}, h('span', { class: `dot ${ok ? 'ok' : 'bad'}`, 'aria-hidden': 'true' }, ok ? '✓' : '!'), h('span', {}, text));
  const human = d.kpi.visits || 0;
  return h('section', { class: 'card span-6' },
    h('div', { class: 'card__head' }, h('span', { class: 'card__idx' }, 'QC.01'), h('h2', {}, 'Data quality')),
    h('div', { class: 'quality' },
      h('div', { class: 'qstat' }, h('b', {}, fmt(human)), h('span', {}, 'human visits kept')),
      h('div', { class: 'qstat' }, h('b', {}, fmt(filteredTotal)), h('span', {}, 'requests filtered out')),
      h('div', { class: 'qstat' }, h('b', {}, `${pct(human, human + filteredTotal)}%`), h('span', {}, 'signal-to-noise')),
      h('div', { class: 'qstat' }, h('b', {}, fmt(d.engagement.samples || 0)), h('span', {}, 'sessions with timing')),
    ),
    (d.filtered || []).length ? table(['Filtered as', 'Requests'], d.filtered.map((f) => [FILTER_LABEL[f.k] || f.k, f.n]), [1]) : h('p', { class: 'muted' }, 'Nothing filtered in this range.'),
    h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Your own browser is excluded from these numbers once you sign in here.'),
    h('ul', { class: 'checks', 'aria-label': 'Security setup' },
      check(hs.encryption, hs.encryption ? 'Visitor names encrypted at rest (AES-256-GCM)' : 'DATA_ENCRYPTION_KEY missing — names are not being stored'),
      check(hs.tls, hs.tls ? 'Database connection requires TLS' : 'DATABASE_URL does not enforce sslmode=require'),
      check(hs.cron, hs.cron ? 'Daily retention purge is scheduled' : 'CRON_SECRET missing — old data is not being purged'),
    ));
}

const AUDIT_LABEL = { login: 'Signed in', login_failed: 'Failed sign-in', login_locked: 'Sign-in locked out', logout: 'Signed out', revoke: 'Signed out everywhere', export: 'Exported CSV', delete: 'Deleted a visitor', view_visitor: 'Opened a visitor' };
function securityCard() {
  const warn = new Set(['login_failed', 'login_locked']);
  const revokeBtn = h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
    if (!confirm('Sign out every admin session on every device, including this one?')) return;
    if (DEMO) return;
    try { await api('/api/admin/revoke', { method: 'POST' }); clearTimeout(refreshTimer); renderLogin('All sessions were signed out.'); }
    catch (e) { alert(`Could not revoke: ${e.message}`); }
  } }, 'Sign out everywhere');
  const entries = state.audit || [];
  return h('section', { class: 'card span-6' },
    h('div', { class: 'card__head' }, h('span', { class: 'card__idx' }, 'QC.02'), h('h2', {}, 'Security log'), h('div', { class: 'card__tools' }, revokeBtn)),
    entries.length ? h('ol', { class: 'log' }, entries.slice(0, 14).map((e) => h('li', {},
      h('time', { title: when(e.at) }, ago(e.at)),
      h('span', {}, AUDIT_LABEL[e.action] || e.action, e.detail && !/^[0-9a-f-]{36}$/.test(e.detail) ? h('span', { class: 'muted' }, ` · ${e.detail}`) : ''),
      h('span', { class: `tag ${warn.has(e.action) ? 'warn' : ''}` }, e.thisNetwork ? 'this network' : 'other network'),
    ))) : h('p', { class: 'muted' }, 'No admin activity recorded yet.'));
}

// ---------- recent visitors + drawer ----------
function visitorsCard(rows) {
  const tbody = h('tbody');
  const count = h('span', { class: 'muted', style: { fontSize: '12px' } });
  const fill = () => {
    const q = state.filter.toLowerCase();
    const list = rows.filter((r) => !q || [r.name, r.role && lab(L.role, r.role), regionName(r.country), r.device, r.referrer].some((v) => (v || '').toLowerCase().includes(q)));
    count.textContent = `${list.length} shown`;
    tbody.replaceChildren(...(list.length ? list.map((r) => h('tr', { class: 'clickable', tabindex: '0', onclick: () => openVisitor(r.id), onkeydown: (e) => { if (e.key === 'Enter') openVisitor(r.id); } },
      h('td', {}, r.name || h('span', { class: 'muted' }, 'Anonymous')),
      h('td', {}, r.role ? h('span', { class: 'pill' }, lab(L.role, r.role)) : '—'),
      h('td', {}, regionName(r.country)),
      h('td', {}, lab(L.device, r.device || 'unknown')),
      h('td', { class: 'num' }, fmt(r.visits)),
      h('td', {}, r.furthest ? `${r.furthest} · ${lab(L.chapter, r.furthest)}` : '—'),
      h('td', { class: 'num' }, fmt(r.actions)),
      h('td', { title: when(r.last_seen) }, ago(r.last_seen)),
    )) : [h('tr', {}, h('td', { colspan: '8', class: 'muted' }, 'No visitors match.'))]));
  };
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search name, reason, country…', 'aria-label': 'Search visitors', value: state.filter, oninput: (e) => { state.filter = e.target.value; fill(); } });
  fill();
  return h('section', { class: 'card span-12' },
    h('div', { class: 'card__head', style: { flexWrap: 'wrap', gap: '10px' } }, h('h2', {}, 'Recent visitors'), count, h('div', { class: 'card__tools' }, search)),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Name', 'Reason', 'Country', 'Device', 'Visits', 'Furthest chapter', 'Actions', 'Last seen'].map((c, i) => h('th', { class: [4, 6].includes(i) ? 'num' : '' }, c)))),
      tbody)));
}

function drawer() {
  const panel = h('div', { class: 'drawer__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Visitor details' });
  const d = h('div', { class: 'drawer', id: 'drawer', hidden: true, onclick: (e) => { if (e.target === d) closeDrawer(); } }, panel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  return d;
}
const closeDrawer = () => { const d = document.getElementById('drawer'); if (d) d.hidden = true; };

async function openVisitor(id) {
  const d = document.getElementById('drawer'), panel = d.firstChild;
  d.hidden = false;
  panel.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  let data;
  try { data = DEMO ? demoVisitor(id) : await api(`/api/admin/visitor?id=${encodeURIComponent(id)}`); }
  catch (e) { panel.replaceChildren(h('p', { class: 'error' }, e.message)); return; }
  const v = data.visitor;
  const fact = (k, val) => [h('dt', {}, k), h('dd', {}, val || '—')];
  const describe = (e) => e.type === 'chapter' ? `Reached ${e.name} · ${lab(L.chapter, e.name)}`
    : e.type === 'action' ? lab(L.action, e.name)
    : e.type === 'launch' ? (e.name === 'skipped' ? 'Skipped the intro' : 'Finished the intro')
    : e.type === 'leave' ? `Left after ${dur(e.value)} · scrolled ${e.name}%` : 'Opened the site';
  const del = h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
    if (!confirm('Permanently delete this visitor and all their events? This cannot be undone.')) return;
    if (DEMO) { closeDrawer(); return; }
    try { await api(`/api/admin/visitor?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); closeDrawer(); load(false); }
    catch (e) { alert(`Delete failed: ${e.message}`); }
  } }, 'Delete visitor data');
  panel.replaceChildren(
    h('div', { style: { display: 'flex', alignItems: 'center' } }, h('span', { class: 'mono muted', style: { fontSize: '11px' } }, 'VISITOR'), h('button', { class: 'btn', type: 'button', style: { marginLeft: 'auto' }, onclick: closeDrawer, 'aria-label': 'Close' }, 'Close ✕')),
    h('h3', {}, v.name || 'Anonymous'),
    h('dl', { class: 'facts' },
      fact('Reason', v.role && lab(L.role, v.role)), fact('Started at', v.start_choice && lab(L.start, v.start_choice)),
      fact('Sound', v.sound && lab(L.sound, v.sound)), fact('Motion', v.motion && lab(L.motion, v.motion)),
      fact('Theme', v.theme && lab(L.theme, v.theme)),
      fact('Country', regionName(v.country)), fact('Device', lab(L.device, v.device || 'unknown')), fact('Language', v.lang),
      fact('Came from', v.referrer || 'Direct'), fact('Visits', fmt(v.visits)),
      fact('First seen', when(v.first_seen)), fact('Last seen', when(v.last_seen)),
      fact('Visitor id', h('span', { class: 'mono', style: { fontSize: '11px' } }, v.id)),
    ),
    h('h4', { class: 'mono muted', style: { fontSize: '11px' } }, 'TIMELINE'),
    h('ol', { class: 'timeline' }, data.events.map((e) => h('li', {}, h('time', {}, when(e.at)), describe(e)))),
    del,
  );
}

// ---------- demo data (only with ?demo) ----------
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function demoData(days) {
  const r = rng(42 + days);
  const daily = Array.from({ length: days }, (_, i) => {
    const dt = new Date(Date.now() - (days - 1 - i) * 864e5);
    const wk = [0, 6].includes(dt.getUTCDay()) ? 0.6 : 1;
    const visitors = Math.round((18 + 14 * Math.sin(i / 4) + r() * 16 + i * 0.4) * wk);
    return { day: dt.toISOString().slice(0, 10), visitors, visits: Math.round(visitors * (1.2 + r() * 0.5)) };
  });
  const V = daily.reduce((a, d) => a + d.visitors, 0);
  const split = (keys, weights) => keys.map((k, i) => ({ k, n: Math.round(V * weights[i]) }));
  const names = ['Asha', 'Rohan', null, 'Meera', 'Karthik', null, 'Priya', 'Dev', 'Ananya', null, 'Vikram', 'Sara'];
  const roles = ['hiring', 'project', 'collab', 'explore'];
  const countries = ['IN', 'US', 'GB', 'DE', 'AE', 'SG', 'CA', 'AU'];
  const recent = Array.from({ length: 24 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: names[i % names.length], role: roles[i % 4], sound: i % 3 ? 'off' : 'on', motion: i % 5 ? 'full' : 'calm',
    start_choice: ['#works', '#services', '#top', '#experience'][i % 4], country: countries[i % 8], device: ['mobile', 'desktop', 'desktop', 'tablet'][i % 4],
    referrer: [null, 'linkedin.com', 'instagram.com', 'google.com'][i % 4], visits: 1 + (i % 4), actions: i % 5, furthest: String(Math.min(7, 2 + (i % 6))).padStart(2, '0'),
    first_seen: new Date(Date.now() - (i + 3) * 36e5 * 5).toISOString(), last_seen: new Date(Date.now() - i * 36e5 * 2.3).toISOString(),
  }));
  const heat = [];
  for (let dow = 1; dow <= 7; dow++) for (let hr = 0; hr < 24; hr++) { const n = Math.round(Math.max(0, Math.sin(((hr - 6) / 24) * Math.PI * 2) * 12 + (dow < 6 ? 6 : 2) + r() * 5)); if (n) heat.push({ dow, hr, n }); }
  return {
    days, kpi: { visitors: V, visits: daily.reduce((a, d) => a + d.visits, 0), new_visitors: Math.round(V * 0.72), actions: Math.round(V * 0.41) },
    prev: { visitors: Math.round(V * 0.83), visits: Math.round(V * 1.3), actions: Math.round(V * 0.3) }, daily,
    roles: split(['hiring', 'explore', 'project', 'collab', 'unknown'], [0.34, 0.27, 0.19, 0.12, 0.08]),
    sound: split(['off', 'on', 'unknown'], [0.52, 0.4, 0.08]), theme: split(['dark', 'light', 'unknown'], [0.71, 0.21, 0.08]), motion: split(['full', 'calm', 'unknown'], [0.78, 0.14, 0.08]),
    starts: split(['#works', '#top', '#experience', '#services', '#contact', '#insights'], [0.36, 0.22, 0.16, 0.12, 0.08, 0.06]),
    chapters: ['00', '01', '02', '03', '04', '05', '06', '07'].map((k, i) => ({ k, n: Math.round(V * Math.pow(0.86, i)) })),
    actions: split(['linkedin', 'pass', 'resume', 'brief', 'instagram', 'hud_cta', 'phone'], [0.12, 0.09, 0.08, 0.06, 0.05, 0.04, 0.01]),
    devices: split(['desktop', 'mobile', 'tablet'], [0.55, 0.38, 0.07]),
    countries: countries.map((k, i) => ({ k, n: Math.round(V * [0.48, 0.16, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02][i]) })),
    referrers: split(['direct', 'linkedin.com', 'instagram.com', 'google.com', 'github.com'], [0.44, 0.28, 0.14, 0.1, 0.04]),
    heat, engagement: { avg_seconds: 212, median_seconds: 148, avg_depth: 63, samples: Math.round(V * 0.7) }, timezone: 'Asia/Kolkata', live: 3,
    freshness: { last_event: new Date(Date.now() - 4 * 6e4).toISOString(), total_events: V * 9 },
    filtered: [{ k: 'bot', n: Math.round(V * 0.21) }, { k: 'rate', n: 14 }, { k: 'automation', n: 6 }, { k: 'invalid', n: 3 }], launch: { completed: Math.round(V * 0.64), skipped: Math.round(V * 0.29) }, recent,
  };
}
function demoAudit() {
  const t = (m) => new Date(Date.now() - m * 6e4).toISOString();
  return [{ action: 'login', at: t(2), thisNetwork: true }, { action: 'export', detail: '30d, 412 rows', at: t(90), thisNetwork: true }, { action: 'login_failed', at: t(600), thisNetwork: false }, { action: 'view_visitor', detail: '00000000-0000-4000-8000-000000000001', at: t(1440), thisNetwork: true }];
}
if (DEMO) state.health = { encryption: true, tls: true, cron: true, timezone: 'Asia/Kolkata' };
function demoVisitor(id) {
  const v = state.data.recent.find((r) => r.id === id);
  return { visitor: { ...v, lang: 'en-IN' }, events: [
    { type: 'leave', name: '84', value: 262, at: v.last_seen }, { type: 'action', name: 'linkedin', at: v.last_seen },
    { type: 'chapter', name: v.furthest, at: v.last_seen }, { type: 'chapter', name: '02', at: v.last_seen },
    { type: 'launch', name: 'completed', at: v.first_seen }, { type: 'visit', at: v.first_seen },
  ] };
}

boot();
