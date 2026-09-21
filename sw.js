const CACHE_NAME = "ledger-pwa-v19"; // 升級版本號以強制更新

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

// 3. 攔截請求階段：改為 Stale-While-Revalidate (快取優先，背景更新) 策略
self.addEventListener("fetch", (event) => {
  // 將所有外部 API 請求完全放行，不進行快取攔截
  if (
    event.request.url.includes("googleapis.com") ||
    event.request.url.includes("accounts.google.com") ||
    event.request.url.includes("api.exchangerate-api.com") ||
    event.request.url.includes("api.allorigins.win") ||
    event.request.url.includes("corsproxy.io") ||
    event.request.url.includes("twse.com.tw") ||
    event.request.url.includes("tpex.org.tw") ||
    event.request.url.includes("yahoo.com") ||
    event.request.url.startsWith("chrome-extension")
  ) {
    return;
  }

  // 快取優先 (Cache-First) 策略：先從本地快取秒速載入，同時在背景偷偷抓最新版備用
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 定義去網路抓取最新檔案的 Promise
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        })
        .catch(() => {
          console.warn("Service Worker: 網路離線，僅使用快取");
        });

      // 如果快取有檔案就立刻回傳 (秒開)，否則等待網路請求
      return cachedResponse || fetchPromise;
    }),
  );
});
