# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Removed deprecated `config.layout` innermost alias on page configs. Use `config.layouts` and `config.layoutEntries` instead.

### Features

- Added nested `layout` arrays on `eco.page()` with normalization to `config.layouts` / `config.layoutEntries`.
- Added `composeChildren` hook on `composeDocumentShell` for integration-owned unified layout+page composition.
- Added `EcoDeclaredComponent` validation for `dependencies.components` entries.
- Added `createApp()` as the recommended runtime entrypoint with Bun-first execution and Node fallback.
- Added app-owned build and runtime ownership: host module loading, browser-safe `eco` export, `eco.html()`, `eco.layout()`, and published `EcoPagesAppConfig`.
- Added Page Browser Graph orchestration so integrations declare browser graph contributions and routes share grouped browser assets where appropriate.
- Added browser runtime asset manifest and import rewrite so runtime modules resolve to concrete public URLs instead of import-map aliases.
- Added boundary-plan metadata and mixed-renderer `renderBoundary()` payload contract for cross-integration pages.
- Added `@ecopages/core/dev/host-runtime` for Vite and other host integrations.
- Replaced filesystem route discovery with `RouteRegistry` for matching, static-generation planning, and dev reload.
- Added `@ecopages/core/plugins/tsconfig-import-resolver` for tsconfig `paths` resolution and bare-import classification via oxc-resolver.

### Bug Fixes

- Resolve project import aliases from tsconfig `paths` via oxc-resolver instead of a hardcoded `@/` → `srcDir` mapping.
- Fixed RouteRegistry static path expansion to load page modules through integration renderers so Radiant SSR setup runs before JSX page imports during build.
- Fixed app-owned server module loading so integration loaders (including React MDX) participate during request-time and static generation.
- Fixed Node and Bun adapter stability for preview, static generation, HMR, and mixed-integration rendering across built-in integrations.
- Fixed grouped page-browser graph builds so sibling routes reuse shared assets without cross-route leakage or stale partial caches.
- Fixed Node bootstrap for bare package linking, `import.meta.env` compatibility, streaming responses, preview shutdown, and `.mjs` server-module output.
- Fixed foreign-child and mixed-integration rendering so delegated children serialize in the owning integration during server rendering.
- Fixed page-module import caching to respect JSX ownership and plugin inputs across preview and static builds.
- Fixed development HMR to reload layouts, includes, and script entrypoints without stale caches or over-broad rebuilds.
- Fixed page dependency packaging so stylesheets and scripts emit correctly for static, dynamic, and HMR flows.
- Fixed `ecopages build` failing when the configured serve port is already in use.

### Refactoring

- Consolidated HMR, preview hosts, runtime binding, and route rendering behind shared services; Bun and Node adapters now differ only at transport hooks.
- Narrowed published package surface: removed legacy `@ecopages/core/internal-types`, duplicate navigation-coordinator export, and unused escape-hatch entrypoints.
- Re-exported integration and processor plugin types through plugin entrypoints instead of internal build modules.

### Documentation

- Added architecture and API documentation for config, plugins, services, adapters, HMR, routing, and rendering.

### Tests

- Added regression coverage for `RouteRegistry`, explicit static routes, mixed boundaries, Node fallback, and cross-runtime invalidation.
- Added regression coverage for RouteRegistry page module loading through integration renderers during static path expansion.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core/create-app`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
- `eco.page({ layout })` accepts one layout or an **outer → inner** array. Arrays normalize to `config.layouts` and `config.layoutEntries`.
- Entries in `dependencies.components` (including layouts merged from `eco.page({ layout })`) must be declared with `eco.component()`, `eco.layout()`, or `eco.html()` so `config.__eco` is present.
- `DefaultHmrContext` now requires a `getEntrypointDependencyGraph(): EntrypointDependencyGraph` method. This enables selective HMR invalidation so integrations can rebuild only the entrypoints affected by a changed dependency instead of all watched entrypoints. Implementations should return the shared `EntrypointDependencyGraph` instance from `@ecopages/core/services/runtime-state/entrypoint-dependency-graph.service`.
