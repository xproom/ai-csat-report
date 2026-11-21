/**
 * @file sw.js
 * @brief 서비스 워커 - 앱 셸만 캐시하고, 이전 버전 캐시는 정리
 * @note 사용자 데이터는 IndexedDB에 있으므로 여기서 다루지 않습니다.
 */
const CACHE_NAME = 'exam-bench-v2'
const BASE_PATH = new URL(self.registration.scope).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([BASE_PATH])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  )
})

// 네트워크 우선, 실패 시 캐시 (같은 출처 GET만)
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return response
      })
      .catch(() => caches.match(request))
  )
})
