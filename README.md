# Tarun KM — Portfolio

Multidisciplinary engineer, designer & developer. A single-page portfolio told as an
eight-chapter "transmission", with ASCII motion, a live hero video and a boarding-pass CTA.

**Stack:** plain HTML, CSS and JavaScript — no build step.
Animation runs on [GSAP](https://gsap.com) + ScrollTrigger and [Lenis](https://lenis.darkroom.engineering)
smooth scroll, loaded from CDNs.

## Structure

```
index.html        page markup (all content lives here)
styles.css        design tokens, layout, components, mobile rules
script.js         loader, scroll story, cursor, HUD, cards, music player
ascii.js          ASCII engine: text scramble, character fields, image lens, cursor trail
404.html          "signal lost" page
vercel.json       caching + security headers
robots.txt
assets/
  logo.webp
  hero.mp4          4K master (large high-DPI screens only)
  hero-1080.mp4     web version (default)
  hero-poster.jpg   first frame, shown while the video loads
  audio/            three background tracks — Gemini & Tarun KM
```

## Chapters

| # | Title | Section id |
|---|---|---|
| 00 | Signal | hero |
| 01 | The Code | `#about` |
| 02 | Artifacts | `#works` |
| 03 | The Log | `#experience` |
| 04 | The Passage | `#services` |
| 05 | The Static | `#ascii` |
| 06 | Victories | `#insights` |
| 07 | Arrival | `#contact` |

Chapter titles and story lines are the `data-title` / `data-line` attributes on each section.

## Run locally

Any static server works:

```bash
npx serve .
```

Then open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project → Import** the repository.
3. Framework preset: **Other**. Leave the build command and output directory empty.
4. Deploy.
5. After the first deploy, replace `YOUR-DOMAIN` in the social-share tags at the top of
   `index.html` with your live URL, then push again.

## Updating media

- **Hero video:** 16:9, 8–15 s seamless loop, no audio. Re-encode the web version with
  `ffmpeg -i hero.mp4 -vf scale=1920:-2 -c:v libx264 -crf 27 -an -movflags +faststart hero-1080.mp4`.
- **Project images:** see the content brief for the exact ratio of each slot.

## Admin panel & visitor database

`/admin` is a password-protected dashboard showing what visitors do on the site.
Data is stored in Postgres (Neon) and written only through `/api/collect`.

### One-time setup on Vercel

1. **Create the database** — Vercel → your project → **Storage** → **Create** → **Neon (Postgres)** → connect it to the project.
   This adds `DATABASE_URL` automatically. Tables are created on first use.
2. **Generate your admin secrets** locally (the password is typed hidden and never saved):
   ```bash
   npm install
   npm run hash-password
   ```
   It prints `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET` and `DATA_ENCRYPTION_KEY`.
   Optional: `ADMIN_TZ` (default `Asia/Kolkata`) for day and hour buckets.
   **Back up `DATA_ENCRYPTION_KEY`** — without it stored names can't be read; never change it once data exists.
3. **Add them** in Vercel → Settings → **Environment Variables** (Production), then redeploy.
4. **Match regions** — Settings → Functions → Function Region: pick the region closest to your Neon database
   (e.g. Mumbai `bom1` for Neon `aws-ap-south-1`). Keeps every database call fast.
5. **Check it** — open `https://<your-domain>/api/health`. `{"ok":true,"db":true}` means the database is connected.
6. Open `https://<your-domain>/admin` and sign in. Demo mode (`/admin/?demo`) only works on localhost — the live dashboard only ever shows real data.

### Security & privacy

- Password stored only as a scrypt hash; sessions are HMAC-signed, `HttpOnly; Secure; SameSite=Strict`, 8 h.
- Logins are rate-limited (5 failures / 15 min per hashed IP); write endpoints check `Origin`.
- All SQL is parameterised; visitor input is allowlist-validated and length-capped; the dashboard renders
  visitor data as text only (no `innerHTML`) under a strict Content-Security-Policy.
- No IP addresses stored; referrers reduced to domain; GPC / Do-Not-Track visitors are not tracked.
- A daily Vercel cron (`/api/cron/purge`) deletes visitors inactive for 12 months; delete any visitor from the dashboard.
- CSV export neutralises spreadsheet formulas.
- Visitor names are encrypted in the database (AES-256-GCM); the key exists only in Vercel.
- The schema enforces its own rules with CHECK constraints; the app refuses non-TLS database URLs.
- `__Host-` session cookie; "Sign out everywhere" revokes every session; every admin action is audit-logged.
- Authentic data: crawlers, scripts, headless/automated browsers and per-network floods are dropped (and counted);
  a visitor exists only after a real page view; your own browser is excluded after you sign in.

### Production hardening

- Strict Content-Security-Policy on every page (no inline scripts or styles on the main site); CDN libraries are
  pinned and loaded with Subresource Integrity, so a tampered copy is refused.
- `Cross-Origin-Resource-Policy: same-origin` on `/assets` — other websites can't embed your images or videos.
- Image shield: right-click, drag, long-press save and printing of artwork are blocked; video has no download/PiP.
  (Screenshots can't be prevented on any website — this stops casual copying and hotlinking.)
- `robots.txt` keeps `/admin` and `/api` out of search and opts the artwork out of image search and AI training.
- `.vercelignore` keeps tests, scripts and docs off the public site.

### Tests

```bash
npm test
```
Runs the API end-to-end against an in-memory Postgres (PGlite).
