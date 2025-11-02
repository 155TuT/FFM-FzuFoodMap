const TILE_CACHE = "ffm-tile-cache-v1";
const MAX_TILE_ENTRIES = 160;
const TILE_HOST_SUFFIX = "api.maptiler.com";

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== TILE_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isTileRequest =
    url.hostname.endsWith(TILE_HOST_SUFFIX) &&
    (url.pathname.includes("/tiles/") || url.pathname.endsWith("/tile.json"));

  if (!isTileRequest) return;

  event.respondWith(
    caches.open(TILE_CACHE).then(async cache => {
      const cached = await cache.match(request);
      const fetchAndUpdate = () =>
        fetch(request)
          .then(response => {
            if (response && response.ok) {
              cache.put(request, response.clone()).catch(() => undefined);
              void trimTileCache(cache);
            }
            return response;
          });

      if (cached) {
        event.waitUntil(
          fetchAndUpdate().catch(() => undefined)
        );
        return cached;
      }

      return fetchAndUpdate().catch(() => cached ?? Response.error());
    })
  );
});

async function trimTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_TILE_ENTRIES) return;
  const removeCount = keys.length - MAX_TILE_ENTRIES;
  for (let index = 0; index < removeCount; index += 1) {
    const key = keys[index];
    await cache.delete(key);
  }
}
