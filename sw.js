// Service Worker: App offline verfügbar machen (z.B. im Laden ohne Empfang).
// App-Dateien: zuerst aus dem Netz (immer aktuell), sonst aus dem Cache.
// Supabase-Anfragen werden nicht gecacht – die App speichert ihre Daten selbst.
const CACHE = "einkaufsliste-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./assets/app.js", "./assets/parser.js", "./assets/config.js", "./assets/style.css", "./assets/icon.svg",
  "./data/rezepte.json", "./data/grundsortiment.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const eigene = url.origin === self.location.origin;
  const cdn = url.hostname === "cdn.jsdelivr.net";
  if (!eigene && !cdn) return; // Supabase, Bilder usw. normal laden

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // CDN-Dateien sind versioniert und ändern sich nie: Cache zuerst
    if (cdn) {
      const treffer = await cache.match(e.request);
      if (treffer) return treffer;
    }
    try {
      const antwort = await fetch(e.request);
      if (antwort.ok) cache.put(e.request, antwort.clone());
      return antwort;
    } catch (fehler) {
      const treffer = await cache.match(e.request, { ignoreSearch: true }) || (e.request.mode === "navigate" && await cache.match("./index.html"));
      if (treffer) return treffer;
      throw fehler;
    }
  })());
});
