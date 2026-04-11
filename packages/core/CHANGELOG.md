# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added a shared runtime boundary around `createApp()`, host module loading, and explicit build ownership for Bun-native execution, Node fallback support, and Vite or Nitro hosts.
- Added the browser-safe `eco` export, semantic `eco.html()` and `eco.layout()` helpers, and the internal `.eco` work directory.

### Refactoring

- Consolidated runtime state around shared module-loading services, app-owned build execution, and the universal `createApp()` boundary.
- Removed the deprecated `@ecopages/core/node*` public escape hatches and the old thin-host bootstrap internals from core.

### Bug Fixes

- Fixed request-time module loading, host-runner interop, and include or layout HMR across Bun, Vite, and Nitro development flows.
- Fixed preview, static-generation, and browser bundle stability for esbuild-backed production paths.
- Fixed deep marker-graph resolution, watch-mode route refreshes, and duplicate-core fallback references in mixed-runtime rendering.
- Fixed npm package output to rewrite workspace dependency versions and publish built JavaScript and declaration artifacts.

### Documentation

- Added architecture and API documentation for config, plugins, services, adapters, HMR, routing, and rendering.

### Tests

- Added regression coverage for Node fallback paths, shared runtime services, and cross-runtime invalidation behavior.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
