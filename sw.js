// Cache simples: a página abre mesmo com internet fraca; os dados vêm do Firebase.
const C = "mococa-lmb-v15";
const FILES = ["./", "index.html", "config.js", "manifest.webmanifest", "css/app.css", "js/app.js", "js/calc.js", "js/demo.js", "js/acesso.js", "js/importar.js", "js/torneio-core.js", "js/torneio.js", "js/torneio-demo.js", "js/exportar.js", "js/midias.js", "js/aovivo.js", "css/torneio.css", "img/logo.jpg", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable.png", "img/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // rede primeiro (sempre a versão nova), cache se estiver sem internet
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
