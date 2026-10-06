---
'@ecopages/vite-plugin': minor
'@ecopages/core': patch
---

In the Vite host, edits now reach the app the same way every time:

- Pages, layouts, includes and views pick up edits on the next request; the embedded app's watcher handles invalidation and HMR alone.
- Editing `app.ts` or a module it imports, such as an API or WebSocket handler, restarts Vite with a fresh app, and the old app is stopped. Before, the plugin re-created the app without stopping the old one, so WebSocket upgrades kept running the old handlers and every edit leaked an app instance.
- An embedded app (`runtime: { embedded: true }`) no longer closes the host's HTTP server in `app.stop()`; stopping it no longer hangs once the host has closed that server.

**Breaking:** `EcopagesPluginApi` no longer has `invalidateAppCache()`, `getDevHostReady()`, `isDevHostReady()`, `markDevHostReady()`, `markDevHostFailed()`, `getCachedApp()` or `setCachedApp()`. They were plugin-internal state with no replacement; code that only passes the API between Ecopages plugins is unaffected.
