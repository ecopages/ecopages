# @ecopages/vite-plugin

## [UNRELEASED] - TBD

### Features

- Added composed Vite plugin surface with `ecopages()` entrypoint that returns an array of Vite plugins for config merging, virtual modules, source transforms, island registration, metadata injection, JSX compatibility, HMR, and dev server bridging
- Added built-in dev server middleware that bridges `app.fetch()` into Vite's `configureServer` hook
- Added `normalizeHtmlResponse()` for Lit SSR slot placement and Vite client injection

### Bug Fixes

- Fixed `ecopages:config` so it preserves array-form Vite aliases and keeps `ssr.noExternal: true` intact when merging Ecopages defaults
- Fixed rewritten Vite dev HTML responses so stale `content-length` and `etag` headers are removed before the bridged response is sent
