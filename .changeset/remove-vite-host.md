---
'@ecopages/core': minor
---

Remove the Vite host. Dev and build run on the Node and Bun adapters, and Rolldown owns every build.

**Breaking:**

- The Vite plugin package is removed.
- `createApp()` no longer takes an embedded runtime or a host-owned dev client. `app.start()` always boots the server.
- Build ownership is only Rolldown. `createBuildAdapter()` takes no arguments, and the host build-adapter marker is removed.
- The Vite plugin adapters for source transforms and component metadata are removed.
- The `@ecopages/core/dev/host-runtime` subpath is removed.
- Hosts can no longer attach WebSocket upgrades on a shared server or leave unmatched upgrades for another listener. Unmatched upgrades are destroyed.
