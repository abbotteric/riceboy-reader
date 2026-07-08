"use strict";

const $ = (id) => document.getElementById(id);

let manifest = null;
let current = null; // { comic, n } while reading
let chromeVisible = false;

const posKey = (slug) => `riceboy.pos.${slug}`;
const savedPos = (slug) => parseInt(localStorage.getItem(posKey(slug)), 10) || 0;

// images come straight from rice-boy.com: pages 1-999 are zero-padded 3-digit
// filenames, 1000+ are plain; almost all .png with rare fallbacks handled in render()
const ORIGIN = "https://rice-boy.com";
const EXTS = ["png", "jpg", "gif"];
function imgURL(slug, n, ext = "png") {
  const base = n < 1000 ? String(n).padStart(3, "0") : String(n);
  return `${ORIGIN}/${slug}/${base}.${ext}`;
}

// ---------- routing ----------

function route() {
  const m = location.hash.match(/^#\/([a-z0-9]+)(?:\/(\d+))?$/);
  const comic = m && manifest.comics.find((c) => c.slug === m[1]);
  if (comic) {
    const n = Math.min(Math.max(parseInt(m[2], 10) || 1, 1), comic.pages);
    openReader(comic, n);
  } else {
    openLibrary();
  }
}

// ---------- library ----------

function openLibrary() {
  current = null;
  $("reader").hidden = true;
  $("library").hidden = false;
  renderShelf();
}

function renderShelf() {
  const shelf = $("shelf");
  shelf.innerHTML = "";
  for (const comic of manifest.comics) {
    const pos = savedPos(comic.slug);
    const card = document.createElement("div");
    card.className = "card";

    const cover = document.createElement("img");
    cover.className = "cover";
    cover.loading = "lazy";
    cover.referrerPolicy = "no-referrer";
    cover.src = imgURL(comic.slug, 1);
    cover.alt = "";
    card.appendChild(cover);

    const info = document.createElement("div");
    info.className = "info";

    const h2 = document.createElement("h2");
    h2.textContent = comic.title;
    info.appendChild(h2);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `${comic.pages} pages${comic.ongoing ? ' &middot; <span class="ongoing">ongoing</span>' : ""}`;
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "actions";
    if (pos > 1) {
      actions.appendChild(linkBtn(`Resume p.${pos}`, comic.slug, pos, true));
      actions.appendChild(linkBtn("Start over", comic.slug, 1, false));
    } else {
      actions.appendChild(linkBtn("Start reading", comic.slug, 1, true));
    }
    if (comic.ongoing) {
      actions.appendChild(linkBtn("Latest", comic.slug, comic.pages, false));
    }
    info.appendChild(actions);

    if (comic.chapters.length) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${comic.chapters.length} chapters`;
      details.appendChild(summary);
      comic.chapters.forEach((ch, i) => {
        const end = comic.chapters[i + 1] ? comic.chapters[i + 1].start - 1 : comic.pages;
        const a = document.createElement("a");
        a.href = `#/${comic.slug}/${ch.start}`;
        a.innerHTML = `${escapeHTML(ch.title)} <span>p.${ch.start}&ndash;${end}</span>`;
        details.appendChild(a);
      });
      info.appendChild(details);
    }

    card.appendChild(info);
    shelf.appendChild(card);
  }
}

function linkBtn(label, slug, n, primary) {
  const a = document.createElement("a");
  a.textContent = label;
  a.href = `#/${slug}/${n}`;
  if (primary) a.className = "primary";
  return a;
}

function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ---------- reader ----------

function openReader(comic, n) {
  const entering = !current || current.comic !== comic;
  current = { comic, n };
  $("library").hidden = true;
  $("reader").hidden = false;
  if (entering) {
    populateChapters(comic);
    $("slider").max = comic.pages;
    setChrome(true); // visible on entry so the controls are discoverable
  }
  applyFit();
  render();
}

function render() {
  const { comic, n } = current;
  const img = $("page");
  const status = $("pagestatus");
  status.hidden = true;
  img.classList.add("loading");
  img.onload = () => {
    img.classList.remove("loading");
    $("stage").scrollTo(0, 0);
  };
  let attempt = 0;
  img.onerror = () => {
    attempt++;
    if (attempt < EXTS.length) {
      img.src = imgURL(comic.slug, n, EXTS[attempt]);
      return;
    }
    img.classList.remove("loading");
    status.textContent = `Page ${n} isn't available (yet?)`;
    status.hidden = false;
  };
  img.src = imgURL(comic.slug, n);
  img.alt = `${comic.title}, page ${n}`;

  localStorage.setItem(posKey(comic.slug), String(n));
  history.replaceState(null, "", `#/${comic.slug}/${n}`);
  updateChrome();
  preload();
}

const preloaded = new Set();
function preload() {
  const { comic, n } = current;
  for (const p of [n + 1, n + 2, n - 1]) {
    if (p < 1 || p > comic.pages) continue;
    const url = imgURL(comic.slug, p);
    if (preloaded.has(url)) continue;
    preloaded.add(url);
    new Image().src = url;
  }
}

function go(delta) {
  const { comic, n } = current;
  const next = Math.min(Math.max(n + delta, 1), comic.pages);
  if (next === n) return;
  current.n = next;
  if (chromeVisible) setChrome(false);
  render();
}

function goTo(n) {
  current.n = Math.min(Math.max(n, 1), current.comic.pages);
  render();
}

// ---------- chrome (overlay UI) ----------

function setChrome(visible) {
  chromeVisible = visible;
  $("topbar").hidden = !visible;
  $("bottombar").hidden = !visible;
  if (visible) updateChrome();
}

function updateChrome() {
  if (!current || !chromeVisible) return;
  const { comic, n } = current;
  $("title").textContent = comic.title;
  $("slider").value = n;
  $("pageinput").value = n;
  $("pageinput").max = comic.pages;
  $("pagetotal").textContent = `/ ${comic.pages}`;
  const select = $("chapters");
  let idx = -1;
  comic.chapters.forEach((ch, i) => { if (ch.start <= n) idx = i; });
  select.value = String(idx);
}

function populateChapters(comic) {
  const select = $("chapters");
  select.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "-1";
  opt.textContent = "Jump to chapter…";
  opt.disabled = true;
  select.appendChild(opt);
  comic.chapters.forEach((ch, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = ch.title;
    select.appendChild(o);
  });
  select.hidden = comic.chapters.length === 0;
}

// ---------- fit mode ----------

function fitMode() {
  return localStorage.getItem("riceboy.fit") || "fit";
}

function applyFit() {
  const mode = fitMode();
  $("reader").classList.toggle("fit", mode === "fit");
  $("reader").classList.toggle("wide", mode === "wide");
}

function toggleFit() {
  localStorage.setItem("riceboy.fit", fitMode() === "fit" ? "wide" : "fit");
  applyFit();
}

// ---------- input ----------

function bindEvents() {
  // tap zones on the stage itself (an overlay would swallow wide-mode scrolling):
  // left 30% = previous, right 30% = next, middle = toggle the UI
  $("stage").addEventListener("click", (e) => {
    const x = e.clientX / innerWidth;
    if (x < 0.3) go(-1);
    else if (x > 0.7) go(1);
    else setChrome(!chromeVisible);
  });
  $("btn-back").addEventListener("click", () => { location.hash = ""; });
  $("btn-fit").addEventListener("click", toggleFit);

  $("slider").addEventListener("input", (e) => {
    $("pageinput").value = e.target.value; // live preview while scrubbing
  });
  $("slider").addEventListener("change", (e) => goTo(parseInt(e.target.value, 10)));

  $("pageinput").addEventListener("change", (e) => {
    const n = parseInt(e.target.value, 10);
    if (n) goTo(n);
  });
  $("pageinput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur(); // commit + dismiss the keyboard
  });

  $("chapters").addEventListener("change", (e) => {
    const ch = current.comic.chapters[parseInt(e.target.value, 10)];
    if (ch) goTo(ch.start);
  });

  document.addEventListener("keydown", (e) => {
    if (!current) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "Escape") location.hash = "";
  });

  // horizontal swipe anywhere on the stage
  let touch = null;
  const stage = $("stage");
  stage.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
      go(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  addEventListener("hashchange", route);
  addEventListener("orientationchange", applyFit);
}

// ---------- ongoing-comic discovery ----------

// The baked manifest goes stale for ongoing comics. We can't scrape the
// archive cross-origin, but <img> loads aren't CORS-bound: walk forward from
// the newest known page until one 404s, and remember what we found.
function imageExists(url) {
  return new Promise((resolve) => {
    const probe = new Image();
    const timer = setTimeout(() => resolve(false), 10000);
    probe.onload = () => { clearTimeout(timer); resolve(true); };
    probe.onerror = () => { clearTimeout(timer); resolve(false); };
    probe.src = url;
  });
}

async function discoverLatest(comic) {
  const key = `riceboy.latest.${comic.slug}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(key)); } catch {}
  if (cached && cached.pages > comic.pages) comic.pages = cached.pages;
  if (cached && Date.now() - cached.t < 12 * 3600 * 1000) return;
  let n = comic.pages;
  while (await imageExists(imgURL(comic.slug, n + 1))) n++;
  localStorage.setItem(key, JSON.stringify({ pages: n, t: Date.now() }));
  if (n === comic.pages) return;
  comic.pages = n;
  if (current && current.comic === comic) {
    $("slider").max = n;
    updateChrome();
  } else if (!current) {
    renderShelf(); // refresh page counts / "Latest" links
  }
}

// ---------- boot ----------

function boot() {
  bindEvents();
  manifest = window.COMICS_DATA;
  if (!manifest) {
    $("library").hidden = false;
    $("shelf").textContent = "comics.js failed to load.";
    return;
  }
  route();
  for (const comic of manifest.comics) {
    if (comic.ongoing) discoverLatest(comic);
  }
  if ("serviceWorker" in navigator &&
      (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
