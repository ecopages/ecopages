# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added app-owned runtime and build ownership around `createApp()`, host module loading, the browser-safe `eco` export, `eco.html()`, `eco.layout()`, and the published `EcoPagesAppConfig` surface.

### Refactoring

- Consolidated runtime state around shared module-loading services, app-owned build execution, and the universal `createApp()` boundary.
- Simplified route-renderer orchestration around renderer-owned boundary runtimes, shared string-boundary queue helpers, and a smaller component render context.
- Centralized shared integration renderer bootstrapping so package integrations only append renderer-specific config instead of duplicating core lifecycle wiring.
- Removed marker-era compatibility capture, the shared route-level fallback resolver, deprecated `@ecopages/core/node*` escape hatches, and other dead route-renderer internals.

### Bug Fixes

- Fixed mixed-integration page, layout, document, and component rendering to resolve foreign boundaries inside their owning renderer across the built-in integrations.
- Fixed host/runtime module loading, published build-helper exports, asset output normalization, explicit render flows, and static or preview build stability across Bun, Node, Vite, and Nitro.
- Fixed request-time and static-generation page inspection to preserve integration-specific page loading without reusing the normal render module identity.
- Fixed Node preview and static-generation React runtime resolution so app-owned page modules and server rendering share one React module identity.
- Fixed Bun browser output normalization so batched multi-entrypoint HMR rebuilds match emitted files to their expected served paths instead of Bun output order.
- Fixed render-preparation graph traversal so sparse component dependency arrays do not break custom 404 rendering or file-system response fallback flows.

### Documentation

- Added architecture and API documentation for config, plugins, services, adapters, HMR, routing, and rendering.

### Tests

- Added regression coverage for app-owned runtime services, Node fallback paths, and cross-runtime invalidation behavior.
- Strengthened the core ghtml integration tests so route and explicit render paths await real outcomes and cover `renderToResponse` behavior.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core/create-app`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
