// 오프라인에서도 열리게 하는 서비스 워커.
// 게임은 모두 브라우저에서 돌기 때문에 한 번 받은 파일만 있으면 인터넷 없이 할 수 있다.
// - 페이지(HTML): 네트워크 먼저, 안 되면 저장해 둔 것
// - 그 밖의 같은 출처 파일(JS, CSS, 아이콘): 저장해 둔 것 먼저, 없으면 받아서 저장
// TURN 계정 주소를 빼기 전 판(v1)이 계정을 저장해 두었을 수 있어, 이름을 올려 그 캐시를 비운다.
const CACHE = "mighty-v2";
/** 저장하면 안 되는 주소: 요청마다 새로 받는 시간 제한 TURN 계정 */
const NO_STORE = new Set(["/turn-credentials"]);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    NO_STORE.has(url.pathname)
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit ?? caches.match("/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
