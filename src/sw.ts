/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

/**
 * Cold launch, and nothing else.
 *
 * This worker exists to answer one question: what happens when somebody opens the
 * app at a client's premises with no signal? Without it, a browser error page.
 * With it, the shell comes off disk and lands on a working interface reading from
 * IndexedDB.
 *
 * It deliberately does not cache data. Reads come from Dexie and writes go through
 * the outbox; a second, stale copy of the API sitting in the Cache API would only
 * ever disagree with them.
 */

// The build stamps the shell in here: HTML, JS, CSS, fonts, icons.
precacheAndRoute(self.__WB_MANIFEST)

// Every navigation is answered by the app shell. React Router takes it from
// there, so a deep link opened offline lands on the right screen rather than a
// 404 from a server that cannot be reached.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
  }),
)

// Supabase is never cached. The outbox handles being offline; a cached POST would
// be a write that looks like it worked and did not.
registerRoute(({ url }) => url.hostname.endsWith('.supabase.co'), new NetworkOnly())

// Fonts and icons are immutable and content-hashed, so the first copy is the only
// copy that will ever be asked for.
registerRoute(
  ({ request }) => request.destination === 'font' || request.destination === 'image',
  new CacheFirst({
    cacheName: 'aaaj-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)

/**
 * Updating is the app's decision, not this worker's.
 *
 * A new worker waits until the page asks it to take over, because activating in
 * the background would reload the tab underneath somebody who is halfway through
 * typing a comment at a client's office.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

clientsClaim()
