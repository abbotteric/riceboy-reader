# Rice-Boy.com Self-Hosted Comic Reader — Implementation Plan

> **Revision (2026-07-07):** no bulk mirror. The local server is a **caching proxy** —
> images are fetched from rice-boy.com on demand as you read, cached on disk, and the
> reader UI is served alongside. See "Architecture (proxy revision)" below; the original
> mirror-based Parts 1–3 are kept for reference but superseded.

Build a personal, self-hosted reader for Evan Dahm's webcomics (rice-boy.com) with a
pleasant iPad reading experience. Personal use only — do not expose publicly.

## Architecture (proxy revision)

```
riceboy/
├── server.py          # stdlib-only: static files + /api/comics.json + /img/ proxy
├── data/cache/        # on-demand image cache + manifest.json (gitignore-able)
└── reader/            # vanilla HTML/CSS/JS single-page reader
```

- `server.py` (Python 3, stdlib, ThreadingHTTPServer):
  - `/` serves `reader/` static files.
  - `/api/comics.json` — manifest built by scraping each comic's `index.php` archive
    page (page count = highest `?c=` link; chapters from `<h1>`/`<smallcaps>` headings
    preceding link runs). Cached to disk with a ~12 h TTL (3rd Voice updates); serve
    stale on origin failure.
  - `/img/<slug>/<n>` — resolves the origin filename (zero-pad 3 for n<1000, else plain,
    `.png` → `.jpg` → `.gif` fallback), serves from `data/cache/<slug>/`, fetching from
    origin on miss. Long immutable cache headers; in-memory negative cache for misses;
    origin fetches serialized with a ≥1 s gap (human-paced on-demand reading, not a
    crawl — bulk politeness rules don't apply, but don't let fast scrubbing hammer it).
- Reader requests images by page number only (`/img/vattu/412`) — no extension logic
  client-side, no per-page dimensions in the manifest (use a placeholder aspect-ratio
  until load).
- Everything else in Part 2 (reader UX) and Part 3 (hosting) still applies.

## Site research (verified 2026-07-07)

All four comics share an identical structure: PHP page viewer at
`index.php?c=NNN`, with the comic image as a bare file in the same directory.

| Comic | Base URL | Pages | Status |
|---|---|---|---|
| Rice Boy | `https://rice-boy.com/rb/` | 439 | complete |
| Order of Tales | `https://rice-boy.com/oot/` | 744 | complete |
| Vattu | `https://rice-boy.com/vattu/` | 1279 | complete |
| 3rd Voice | `https://rice-boy.com/3rdvoice/` | 923 as of today | **ongoing, updates regularly** |

Image URL pattern (verified by direct fetch):
- Pages 1–999: `<base>/NNN.png` — zero-padded 3 digits (`001.png`, `100.png`)
- Pages 1000+: `<base>/NNNN.png` — plain 4 digits (verified `vattu/1000.png` → 200)
- All samples were PNG, ~450–820 KB each, natural width 800px, heights vary
  (~1190–1240px). **Do not assume**: have the downloader fall back to `.jpg`/`.gif` on
  404 and record the actual filename + pixel dimensions in the manifest.
- Total: ~3,385 pages ≈ 2 GB.

Archive/TOC: each comic's `index.php` (no `?c=`) is the archive page, listing every page
as `<a href="index.php?c=NNN">` grouped under chapter/book headings. Known structure:
- Rice Boy: five "Books" (1–84, 85–170, 171–257, 258–354, 355–439)
- Vattu: four parts — "The Name & the Mark" (1–270), "The Sword & the Sacrament"
  (271–572), "The Tower & the Shadow" (573–958), "The River" (959–1279)
- 3rd Voice: "Argument" (1–8) then numbered "Passages" (e.g. "1st Passage: The God's
  Book or Spondule & Navichet" starting at 9)
- Order of Tales: chapter markup not yet inspected — scrape it, don't hard-code.

Prefer scraping the index pages to derive chapters + max page count rather than
hard-coding the table above; hard-coded values are only a fallback/sanity check.

Politeness: `robots.txt` has no disallows but sets `crawl-delay: 10`. Honor it.
At 10s/page the full mirror takes ~9.5 hours — that's fine because the downloader must
be **resumable** (skip files already on disk) and run unattended (e.g. overnight, or in
the background via `caffeinate`). Set a real User-Agent identifying this as a personal
archiver. This is Evan Dahm's freely-published work; the user reads it on the site and
supports via the normal channels — the mirror exists only to fix the mobile reading UX.

## Why the site is bad on iPad (what we're fixing)

The comic pages are 2000s-era table layouts with **no viewport meta tag**, so iPad
Safari renders at ~980px virtual width — the 800px image sits small with dead margins
and needs manual pinch-zoom on every page. Nav is small image-button links
(`nav.back.png` etc.), awkward tap targets. No swipe, no position memory, page loads
full HTML round-trip each time.

## Architecture

```
riceboy/
├── PLAN.md
├── sync.py            # mirror + manifest builder (stdlib-only Python 3)
├── data/              # gitignore-able; the mirrored content
│   ├── comics.json    # top-level manifest (all comics)
│   ├── rb/001.png …
│   ├── oot/…
│   ├── vattu/…
│   └── 3rdvoice/…
└── reader/            # the static app — no build step, vanilla HTML/CSS/JS
    ├── index.html     # library view (pick a comic) + reader (single page app)
    ├── app.js
    ├── style.css
    └── manifest.webmanifest  # PWA manifest for Add-to-Home-Screen
```

Serve `riceboy/` root (or symlink `data/` into `reader/`) with any static file server.
No backend: the reader fetches `comics.json` and computes image URLs client-side.

### Part 1 — `sync.py` (mirror + manifest)

Single Python 3 script, stdlib only (`urllib`, `json`, `html.parser`, `struct` for PNG
dimensions — or a tiny header parser for png/jpg/gif). Behavior:

1. For each comic, fetch `index.php`, parse the archive: highest `?c=` number = page
   count; heading text between link groups = chapter titles with start pages.
2. Download every missing page image to `data/<slug>/`, with:
   - resume: skip files that exist and are non-empty; verify content-type is `image/*`
     and file isn't an HTML error page before keeping it
   - extension fallback `.png` → `.jpg` → `.gif` on 404
   - 10s sleep between actual requests (none for skipped files), retry with backoff on
     5xx/network errors, clean Ctrl-C handling
   - progress output (`vattu 412/1279`)
3. Write `data/comics.json`:
   ```json
   {
     "generated": "2026-07-07T…",
     "comics": [{
       "slug": "rb", "title": "Rice Boy", "ongoing": false,
       "pages": [{"n": 1, "file": "001.png", "w": 800, "h": 1206}, …],
       "chapters": [{"title": "First Book", "start": 1}, …]
     }, …]
   }
   ```
   Per-page width/height matters: the reader uses it to reserve layout space (no reflow)
   and choose fit mode; read dimensions from the local file headers, not extra requests.
4. Re-running syncs incrementally — for 3rd Voice it discovers pages past the previous
   max and appends. Support `--comic 3rdvoice` to sync just one.

Suggested order: sync `rb` first (439 pages ≈ 75 min) so the reader can be built and
tested against real data while the rest mirrors.

### Part 2 — the reader (the actual point of this project)

Vanilla single-page app, two views:

**Library view** — one card per comic (title, page count, "resume at page N" if
localStorage has a position, ongoing badge for 3rd Voice). Chapter list expands for
jump-to-chapter.

**Reader view** — one page at a time, optimized for iPad Safari:

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- Image centered on a near-black background (`#111`), `max-width: 100%` and
  fit-to-height by default in landscape (`max-height: 100dvh`), fit-to-width in
  portrait; a toggle to switch fit mode. Use `dvh` units and
  `env(safe-area-inset-*)` so Safari's collapsing toolbars don't clip the page.
- **Navigation**: invisible tap zones — left third = previous, right third = next,
  center = toggle a minimal chrome overlay (page number scrubber slider, chapter picker,
  fit toggle, back to library). Also horizontal swipe and arrow keys (for a paired
  keyboard). All handlers passive; no 300ms-delay legacy events.
- **Preload** next 2–3 images (`new Image()`), keep previous cached; page turns must be
  instant.
- **Position memory**: localStorage per comic (`riceboy.pos.vattu = 412`), saved on
  every page turn; library "resume" uses it. Also reflect page in the URL hash
  (`#/vattu/412`) so history/back and bookmarking work.
- **PWA niceties**: web app manifest (`display: standalone`, dark theme-color, icon —
  can reuse a comic panel crop), so Add-to-Home-Screen gives a chromeless full-screen
  reader. A service worker is optional; skip in v1 unless trivial (the images are
  local-network anyway).
- No frameworks, no build step. Target Safari 17+; use modern JS freely.

Design taste: the comics are lush, saturated art on white pages — keep the UI nearly
invisible. Dark neutral background, no borders, chrome only appears on center-tap and
auto-hides after ~3s.

### Part 3 — hosting

**v1 (now):** anything that serves static files from this Mac on the LAN, e.g.
`python3 -m http.server 8930 -d ~/tmp/riceboy` and browse to
`http://erics-mac-mini.local:8930/reader/` from the iPad. Document this in a README.

**v2 (homelab, optional):** the homelab repo (`~/src/homelab`) is a k3s cluster
(control plane `homelab.local` 192.168.0.41) with MetalLB (pool 192.168.0.240–250, .240–.242
taken) and existing podman + k8s patterns. Simplest faithful option: an nginx
Deployment with the `riceboy/` tree on a hostPath/PVC on `homelab.local`, exposed via
MetalLB LoadBalancer IP (e.g. 192.168.0.243), and run `sync.py` there as a k8s CronJob
(weekly) to keep 3rd Voice current. Follow that repo's conventions: update its
`docs/architecture.md` + `PROGRESS.md`, commit and push (its CLAUDE.md requires this).
Keep it LAN-only; do not port-forward or expose via any tunnel — this is unlicensed
redistribution the moment it's public.

## Milestones & acceptance criteria

1. **M1 — sync.py works**: `./sync.py --comic rb` produces 439 verified images +
   `comics.json` with chapters and per-page dimensions; re-run is a fast no-op.
2. **M2 — reader works on iPad**: open library, tap Rice Boy, read 20 pages by tapping
   right edge with no pinch-zooming, no layout shift, instant page turns; kill Safari,
   reopen, "resume" lands on the same page. Portrait and landscape both fill the screen
   sensibly. (Test in desktop Safari responsive mode at iPad dimensions first, then real
   device.)
3. **M3 — full mirror**: all four comics synced overnight; spot-check first/last page of
   each renders in the reader; total size ~2 GB.
4. **M4 (optional) — homelab deploy** per Part 3 v2.

## Known risks / things to verify while implementing

- Some pages may not be 800px PNGs (spreads, guest pages, early experiments) — the
  extension fallback + recorded dimensions handle this, but eyeball any page whose
  fetch needed a fallback.
- The archive-page HTML is hand-written 2000s markup; parse defensively (regex for
  `index\.php\?c=(\d+)` is more robust than a strict HTML parser for the links; grab
  chapter headings loosely and fall back to "no chapters" rather than failing).
- 3rd Voice's latest-page count changes; never hard-code 923 anywhere.
- iPad Safari quirks: `100vh` overshoots under the collapsed toolbar — that's why the
  plan says `100dvh`; also disable double-tap-zoom on the tap zones
  (`touch-action: manipulation`).
