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
