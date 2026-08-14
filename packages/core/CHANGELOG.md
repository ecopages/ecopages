# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Removed the built-in ghtml Integration, `@ecopages/core/html`, and `@ecopages/core/integrations/ghtml`. Apps must register an Integration that owns their route file extensions. `ghtml` is no longer a core dependency.
- Removed `@ecopages/core/build/runtime-build-executor`. Use `@ecopages/core/build/build-runtime` (`installBuildRuntime`, `requireBuildRuntime`) instead.
- `BuildRuntime` profiles no longer inject app plugins. Pass complete `BuildOptions`, including required app plugins and transforms, before calling `getProfile(...).build()`.
- Removed the open index signature from `BuildOptions` and `BrowserBundleOptions` so request identity can cover every field exhaustively.
- Removed write-only Page Browser Graph disk manifest persistence (`.browser-pages-graph`). Production static export still prebuilds graphs into the in-memory `page-browser-graph-session`.
- Removed deprecated `config.layout` innermost alias on page configs. Use `config.layouts` and `config.layoutEntries` instead.
- `createAliasResolverPlugin` now takes the app **project root** (not `srcDir`) and resolves aliases from tsconfig `compilerOptions.paths` only. Apps without tsconfig `paths` get no alias resolver handlers. Hardcoded `@/` → `srcDir` mapping is removed.
- Removed dev HMR entrypoint disk cache, grouped cold-graph prewarm, and `ECOPAGES_DEV_COLD_CLIENT_GRAPH*` env vars. Dev client modules are transpiled per source file on demand with in-memory caching and lazy `/assets/vendors` prebundles.
- Removed `ECOPAGES_DEV_PREWARM_ALL_STATIC_ROUTES`. Dev SSR prewarm only renders processor-declared pathnames from `collectDevPrewarmPlan()`.

### Bug Fixes

- Unknown content lookups that throw `HttpError.NotFound` keep that status through page render wrapping, so the request matcher serves a 404 without a 500 stack dump.
- Browser vendor prebundles now prefer ESM `module` / `import` entries for third-party packages (legacy `browser` export conditions are omitted) while keeping browser-first resolution for `@ecopages/core`.
- Semantic `404.*` / `500.*` templates now receive safe empty `locals` / `pageLocals` instead of the throwing locals proxy.
- Development rendered HTML cache keys now include browser-runtime asset generation so rebuilt bootstrap/vendor script URLs cannot go stale.

### Features

- Page HTML cache in watch mode uses Cache Strategy admission on a bounded memory store: static pages may be retained, dynamic pages never are. Set `cache.enabled: false` to disable watch-mode HTML caching entirely. Source-path edits invalidate only registered HTML keys; shared or unmapped dependencies clear the full page cache.
- Page Browser Graph per-route reuse is disabled while HMR is enabled; session graphs still cache after build with dependency invalidation.
- Watch mode SSR-prewarms processor-declared content paths after the HMR-ready response pipeline is configured (`routePrefix` + `devPrewarm`). Optional `devPrewarmReadiness: 'beforeReady'` blocks the framework ready signal until prewarm completes. Concurrent prewarm uses `ECOPAGES_DEV_PREWARM_STATIC_ROUTES_PARALLELISM` (default `3`).
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
- Added `@ecopages/core/plugins/tsconfig-import-resolver` for tsconfig `paths` resolution, project module path resolution, and bare npm import classification via oxc-resolver.

### Bug Fixes

- Dev transform vendor prebundles resolve bare packages with `"browser"` export conditions so dual packages such as `@ecopages/core` do not pull Node builtins into the client graph.
- Dev transform vendor prebundles apply integration client-graph boundary plugins, disable code splitting, and exclude app build plugins so server-only package graphs cannot reach the browser.
- Browser-target Rolldown builds fail hard on `node:*` builtins instead of emitting them as external script URLs.
- Dev transform vendor registry merges runtime manifest specifiers from all contributors and rejects server-only package main entries (for example `@ecopages/react` plugin paths).
- Dev transform externalize pass skips namespaced virtual modules (`ecopages:images`) so they inline instead of emitting a broken bare `images` import.
- React HMR broadcasts `layout-update` for layout file changes even when no page module update URLs are queued.
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
- Entries in `dependencies.components` (including layouts merged from `eco.page({ layout })`) must be declared with `eco.component()`, `eco.layout()`, or `eco.html()` so `config.identity` is present.
- `DefaultHmrContext` now requires a `getEntrypointDependencyGraph(): EntrypointDependencyGraph` method. This enables selective HMR invalidation so integrations can rebuild only the entrypoints affected by a changed dependency instead of all watched entrypoints. Implementations should return the shared `EntrypointDependencyGraph` instance from `@ecopages/core/services/runtime-state/entrypoint-dependency-graph.service`.
