/* Kakeibo 家計簿 — Service Worker
   役割: アプリ本体(HTML)をキャッシュして、電波が弱い/オフラインでも起動できるようにする。
   方針: アプリ本体は network-first（オンライン時は常に最新を取得＝誰でも最新）。
         スプレッドシート(GAS)への通信はクロスオリジンなので一切キャッシュせず素通り＝データは常に最新。 */
const CACHE = "kakeibo-shell-v10";
const SHELL = ["./", "./index.html"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // GET かつ同一オリジンのみ制御。GAS等クロスオリジン（データ取得）は素通り＝常に最新。
  if (req.method !== "GET" || url.origin !== location.origin) return;

  // アプリ本体（ナビゲーション/HTML）: network-first → 失敗時にキャッシュ
  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put("./", res.clone()).catch(() => {});
        return res;
      } catch (_) {
        const cached = (await caches.match("./")) || (await caches.match("./index.html"));
        return cached || new Response("オフラインです。一度オンラインで開いてください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // その他の同一オリジン静的ファイル: cache-first
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, res.clone()).catch(() => {});
      return res;
    } catch (_) {
      return cached || new Response("", { status: 504 });
    }
  })());
});
