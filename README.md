# Rice Boy Reader

A **fully static**, iPad-friendly reader for [Evan Dahm's comics](https://rice-boy.com)
(Rice Boy, Order of Tales, Vattu, 3rd Voice). The original site has no viewport meta
tag, so it renders desktop-sized on tablets; this is a modern front end that loads the
comic images **directly from rice-boy.com** — no backend, no proxy, no comic content in
this repo. Built for personal use.

**Live app:** https://abbotteric.github.io/riceboy-reader/

## Install on iPad

Open the URL in Safari → Share → **Add to Home Screen**. Because it's served over
HTTPS, the service worker caches the app on-device: the saved app launches instantly
with no server involved. (Comic images stream from rice-boy.com, so reading needs
internet.)

## Using it

- Tap the **right / left third** of the screen (or swipe, or arrow keys) to turn pages.
- Tap the **middle** for controls (also shown when opening a comic): page-number box,
  scrubber slider, chapter picker, fit toggle (fit whole page ⇄ fill width and scroll),
  and home.
- Reading position is remembered per comic ("Resume p.412" in the library), on-device.

## How it works

- `docs/` is the whole app (vanilla HTML/CSS/JS, no build step), served by GitHub
  Pages from the `main` branch.
- `docs/comics.js` is a **baked manifest** (page counts, chapter lists) scraped from
  the archive pages. New 3rd Voice *pages* are discovered by the app itself
  (cross-origin `<img>` probing past the newest known page, cached 12 h in
  localStorage). New *chapter headings* need a re-bake:

  ```sh
  python3 update_manifest.py && git commit -am "re-bake manifest" && git push
  ```

  Pages redeploys in about a minute; installed apps pick it up in the background.
- Page images are `https://rice-boy.com/<comic>/<page>.png` (3-digit zero-padded below
  1000), loaded with `referrerpolicy="no-referrer"` and jpg/gif fallback.
- `docs/sw.js` caches the app shell (stale-while-revalidate); comic images are
  deliberately not service-worker-cached.

See `PLAN.md` for design history (a caching-proxy design preceded this static one).
