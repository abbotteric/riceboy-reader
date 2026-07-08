// App-shell cache so the installed app launches without its origin server.
// Comic images come from rice-boy.com and are deliberately NOT cached here
// (a full read-through is ~1 GB — let the browser's HTTP cache handle it).
const CACHE = "riceboy-v4";
const SHELL = ["./", "index.html", "app.js", "comics.js", "style.css",
               "icon.png", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // comic images: straight to network
  // stale-while-revalidate: serve cached shell instantly, refresh in background
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const refresh = fetch(e.request).then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
});
