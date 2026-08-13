const CACHE_NAME = 'ledger-pwa-v2'; // 當您升級 App 時，請修改這個版本號 (例如 v2, v3...)
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/vue@3/dist/vue.esm-browser.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/lucide@latest'
];

// 1. 安裝階段：將靜態資源寫入快取
self.addEventListener('install', event => {
  // 強制立即接管控制權，不必等待舊版 Service Worker 關閉
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Service Worker: 快取檔案中');
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. 啟用階段：自動清理舊版本快取 (本次新增的核心功能)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 如果快取名稱與當前的 CACHE_NAME 不符，代表是舊版快取，直接刪除
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 刪除舊快取 ->', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 確保新的 Service Worker 立即對所有開啟的網頁客戶端生效
      return self.clients.claim();
    })
  );
});

// 3. 攔截請求階段：Cache-First 策略
self.addEventListener('fetch', event => {
  // 對於 GitHub API 或證交所 API，直接放行不快取，確保抓到最新數據
  if (event.request.url.includes('api.github.com') || event.request.url.includes('twse.com.tw')) {
    return;
  }
  
  // 優先從快取尋找檔案，若無則透過網路請求
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});