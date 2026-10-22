// Orbit's service worker. It exists so the installed app opens without a network and so
// static files load fast. It caches the app shell and fingerprinted static files, and nothing
// else: never anything under /api, because those answers are private to the signed-in user.
//
// The build swaps the placeholder in BUILD for a hash of the built file names, so every release ships a
// different sw.js. The browser sees the change, installs the new worker, and the activate step
// deletes the old cache.

const BUILD = '__BUILD_ID__'
const PREFIX = 'orbit-shell-'
const CACHE = PREFIX + BUILD
const SHELL = '/'
const MAX_ASSETS = 80

const isStaticFile = (url) =>
  url.pathname.startsWith('/assets/') ||
  /^\/(favicon\.svg|icon[\w-]*\.(png|svg)|manifest\.webmanifest)$/.test(url.pathname)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(SHELL, { cache: 'reload' })))
      // A failed pre-cache must not stop the worker: the network still works.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** Keeps the cache from growing without bound as releases replace fingerprinted files. */
async function trim(cache) {
  const requests = await cache.keys()
  const extra = requests.length - MAX_ASSETS
  for (let i = 0; i < extra; i++) {
    if (new URL(requests[i].url).pathname !== SHELL) await cache.delete(requests[i])
  }
}

async function shellFirstFromNetwork(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    const type = response.headers.get('content-type') || ''
    // Every client-side route answers with the same shell, so one copy serves them all offline.
    if (response.ok && type.includes('text/html')) await cache.put(SHELL, response.clone())
    return response
  } catch {
    return (await cache.match(SHELL)) || Response.error()
  }
}

async function staticFileFromCache(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    await trim(cache)
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('range')) return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(shellFirstFromNetwork(request))
  } else if (isStaticFile(url)) {
    event.respondWith(staticFileFromCache(request))
  }
})
