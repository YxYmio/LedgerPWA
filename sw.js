const CACHE_NAME = "ledger-pwa-v11"; // 升級版本號以強制更新

// 將本地化的第三方套件全數納入離線快取名單
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./constants.js",
  "./helpers.js",
  "./reports.js",
  "./charts.js",
  "./app.js",
  "./lib/html5-qrcode.min.js",
  "./lib/tailwindcss.min.js",
  "./lib/chart.min.js",
  "./lib/vue.global.prod.min.js",
];

// 1. 安裝階段：將靜態資源寫入快取
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: 快取本地檔案中 (包含 lib 套件)");
      return cache.addAll(urlsToCache);
    }),
  );
});

// 2. 啟用階段：自動清理舊版本快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("Service Worker: 刪除舊快取 ->", cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// 3. 攔截請求階段：Cache-First 策略
self.addEventListener("fetch", (event) => {
  // 將所有外部 API 請求完全放行，僅對本機資源進行快取攔截
  if (
    event.request.url.includes("googleapis.com") ||
    event.request.url.includes("accounts.google.com") ||
    event.request.url.includes("api.exchangerate-api.com") ||
    event.request.url.includes("api.allorigins.win") ||
    event.request.url.includes("corsproxy.io") ||
    event.request.url.includes("twse.com.tw") ||
    event.request.url.includes("yahoo.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }),
  );
});
