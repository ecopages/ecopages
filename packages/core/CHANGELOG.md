# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Removed the built-in ghtml Integration, `@ecopages/core/html`, and `@ecopages/core/integrations/ghtml`. Apps must register an Integration that owns their route file extensions.
- `BuildRuntime` profiles no longer inject app plugins. Pass complete `BuildOptions`, including required app plugins and transforms, before calling `getProfile(...).build()`.
- Removed the open index signature from `BuildOptions` and `BrowserBundleOptions`.
- Removed deprecated `config.layout` innermost alias on page configs. Use `config.layouts` and `config.layoutEntries` instead.
- `createAliasResolverPlugin` now takes the app **project root** (not `srcDir`) and resolves aliases from tsconfig `compilerOptions.paths` only. Hardcoded `@/` → `srcDir` mapping is removed.

### Features

- Added `createApp()` as the recommended runtime entrypoint with Bun-first execution and Node fallback.
- Added app-owned build and runtime ownership: host module loading, browser-safe `eco` export, `eco.html()`, `eco.layout()`, and published `EcoPagesAppConfig`.
- Replaced filesystem route discovery with `RouteRegistry` for matching, static-generation planning, and dev reload.
- Added Page Browser Graph orchestration, browser runtime asset manifest, and import rewrite so runtime modules resolve to concrete public URLs.
- Added boundary-plan metadata and mixed-renderer `renderBoundary()` payload contract for cross-integration pages.
- Added `@ecopages/core/dev/host-runtime` for Vite and other host integrations.
- Added `@ecopages/core/plugins/tsconfig-import-resolver` for tsconfig `paths` resolution and bare npm import classification.
- Added nested `layout` arrays on `eco.page()` with normalization to `config.layouts` / `config.layoutEntries`.
- Added `composeChildren` hook on `composeDocumentShell` for integration-owned unified layout+page composition.
- Added `EcoDeclaredComponent` validation for `dependencies.components` entries.
- Direct local Eco Component imports (including named `export { X } from` barrels) and relative side-effect CSS imports supply Dependencies by default. Explicit stylesheet declarations override inferred references to the same resolved file. Inferred styles stay on Component identity until collection, including when server modules bundle a copy of `eco`. Named barrel hops are watch paths so a live retarget invalidates cached page assets.
- `mergePageDependencies()` keeps file-owned contributions (including `modules`) so combining a Page with a content entry cannot re-home relative paths.
- Page HTML cache in watch mode uses Cache Strategy admission on a bounded memory store. Set `cache.enabled: false` to disable watch-mode HTML caching entirely.
- Watch mode SSR-prewarms processor-declared content paths (`routePrefix` + `devPrewarm`). Optional `devPrewarmReadiness: 'beforeReady'` blocks the framework ready signal until prewarm completes. Concurrent prewarm uses `ECOPAGES_DEV_PREWARM_STATIC_ROUTES_PARALLELISM` (default `3`).
- Dev client modules are transpiled per source file on demand with in-memory caching and lazy `/assets/vendors` prebundles.

### Bug Fixes

- Browser `runtimeModules` resolve ESM/`module` entries instead of CJS `require()` export keys; CJS vendor files still emit explicit named re-exports so bindings such as React `jsx` exist on the vendor URL.
- Fixed Node and Bun adapter stability for preview, static generation, HMR, and mixed-integration rendering.
- Fixed grouped page-browser graph builds, foreign-child delegation, page-module import caching, and page dependency packaging across static, dynamic, and HMR flows.
- Fixed dev transform vendor prebundles, browser-target Rolldown builds, and development HMR invalidation for layouts, includes, and script entrypoints.
- Unknown content lookups that throw `HttpError.NotFound` keep that status through page render wrapping.
- Semantic `404.*` / `500.*` templates now receive safe empty `locals` / `pageLocals`.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core/create-app`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- `eco.page({ layout })` accepts one layout or an **outer → inner** array. Arrays normalize to `config.layouts` and `config.layoutEntries`.
- Entries in `dependencies.components` (including layouts merged from `eco.page({ layout })`) must be declared with `eco.component()`, `eco.layout()`, or `eco.html()` so `config.identity` is present.
- `DefaultHmrContext` now requires a `getEntrypointDependencyGraph(): EntrypointDependencyGraph` method. Implementations should return the shared `EntrypointDependencyGraph` instance from `@ecopages/core/services/runtime-state/entrypoint-dependency-graph.service`.
