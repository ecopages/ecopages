# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added runtime capability declarations to integration and processor configs, with config-time validation for runtime tags and minimum runtime versions.
- Added an experimental Node runtime adapter, runtime manifest, and thin-host bootstrap boundary so framework-owned Node startup can be exercised through core services.
- Added `ServerLoader` and `TranspilerServerLoader` boundaries so config and app entry loading go through a dedicated core service.
- Added shared browser runtime asset and entry factories plus runtime specifier registry support so integrations can declare browser runtime modules through core-owned helpers.
- Added `eco.html()` and `eco.layout()` semantic factories, related public types, and exported marker-graph types for integration authors.

### Refactoring

- Finalized app-owned build manifests during `ConfigBuilder.build()` and split build contribution collection from runtime startup.
- Routed runtime specifier registration through shared integration lifecycle hooks and centralized browser bundle assembly behind `BrowserBundleService`.
- Removed legacy template filename config in favor of semantic `html` and `404` template detection from registered integration extensions.
- Documented the plugin lifecycle and aligned build, HMR, and invalidation services around the shared dev graph and build executor flow.

### Bug Fixes

- Routed React HMR browser entry rebuilds and page-metadata module loading through shared browser bundling and server-loading services.
- Fixed Node bootstrap resolution so app-local aliases, third-party dependencies, `import.meta.dirname`, `import.meta.filename`, and `bun:*` diagnostics behave correctly during experimental Node startup.
- Moved development invalidation and server-module cache invalidation onto the app-owned dev graph so watcher routing and experimental Node invalidation share one policy.
- Hardened cross-integration rendering and explicit static route handling so sparse dependency graphs, direct renderer paths, and foreign JSX boundaries no longer crash.
- Hardened delegated link detection and current-page reload coordination for mixed-router development navigation flows.

### Tests

- Added regression coverage for `eco.html()` and `eco.layout()`, shared browser bundle and server loader services, and experimental Node bootstrap paths.

### Documentation

- Added focused architecture and API documentation for config, plugins, services, adapters, HMR, router, and the rendering lifecycle.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
