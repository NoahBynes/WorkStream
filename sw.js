// Service Worker - 离线缓存（网络优先策略，避免代码更新后仍返回旧版本）
const CACHE_NAME = 'workstream-v27';
const CACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png',
    './styles/theme.css',
    './styles/main.css',
    './js/app.js',
    './js/router.js',
    './js/db.js',
    './js/store.js',
    './js/components/quick-record.js',
    './js/pages/dashboard.js',
    './js/pages/study.js',
    './js/pages/fitness.js',
    './js/pages/finance.js',
    './js/pages/news.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_ASSETS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const isSameOrigin = event.request.url.startsWith(self.location.origin);

    // 第三方资源（CDN）：网络优先，失败回退缓存
    if (!isSameOrigin) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // 同源资源：网络优先 + 后台更新缓存
    // 这样代码更新后能立即生效，离线时仍可回退到缓存
    event.respondWith(
        fetch(event.request).then(response => {
            // 仅缓存有效响应
            if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
        }).catch(() => caches.match(event.request))
    );
});
