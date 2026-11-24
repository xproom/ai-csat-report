/**
 * @file sw.js
 * @brief 서비스 워커 - 앱 화면 파일만 캐시
 * - /assets/ 파일은 이름에 내용 지문이 들어 있어 바뀌지 않으므로 캐시를 먼저 씀 (다시 열 때 빠름)
 * - 그 밖(첫 화면 주소 등)은 새 버전을 받도록 네트워크를 먼저 쓰고, 끊겼을 때만 캐시
 * @note 사용자 데이터는 IndexedDB·서버에 있으므로 여기서 다루지 않습니다.
 */
const PREFIX = 'exam-bench-'
const CACHE_NAME = PREFIX + 'v3'
const BASE_PATH = new URL(self.registration.scope).pathname
const MAX_ENTRIES = 80

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([BASE_PATH])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  // 같은 주소(origin)를 쓰는 다른 서비스의 캐시는 건드리지 않음
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  )
})

async function save(request, response) {
  // 실패한 응답(404 등)은 남기지 않음
  if (!response.ok || response.status === 206) return
  const copy = response.clone()
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, copy)
  // 배포를 거듭해도 옛 파일이 끝없이 쌓이지 않게 오래된 것부터 지움
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
    if (new URL(key.url).pathname !== BASE_PATH) await cache.delete(key)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return
  // 첫 화면 주소는 브라우저가 잠시 보관한 옛 판 대신 서버에 새 판이 있는지 꼭 확인
  const fromNetwork = () => fetch(request, request.mode === 'navigate' ? { cache: 'no-cache' } : undefined).then((response) => {
    event.waitUntil(save(request, response.clone()).catch(() => {}))
    return response
  })
  event.respondWith(url.pathname.startsWith(BASE_PATH + 'assets/')
    ? caches.match(request).then((cached) => cached || fromNetwork())
    : fromNetwork().catch(() => caches.match(request).then((cached) => cached || Response.error())))
})
