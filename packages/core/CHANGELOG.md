# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added app-owned runtime and build ownership around `createApp()`, host module loading, the browser-safe `eco` export, `eco.html()`, `eco.layout()`, and the published `EcoPagesAppConfig` surface.
- Added boundary-plan metadata and a compatibility `renderBoundary()` payload contract for mixed-renderer orchestration.

### Refactoring

- Renamed route-renderer ownership and foreign-child contracts across core so ownership planning, foreign-subtree payloads, and queued foreign-subtree resolution now use the simplified terminology.
- Introduced a single `RouteRenderFlow` owner for route render preparation and execution, removing the separate execution service seam while keeping boundary planning shared.
- Narrowed route-render orchestration onto an explicit `RouteRenderFlowAdapter` seam and one structural Html finalization plan, reducing callback-bag plumbing between `RouteRenderFlow` and `IntegrationRenderer`.
- Renamed renderer-owned page browser asset preparation onto an explicit `buildPageBrowserGraph()` seam so route orchestration no longer treats emitted browser dependencies as a flat route-asset append.
- Removed the generic HMR runtime-specifier registry and plugin registration seam so core no longer carries import-map-era runtime state that integrations no longer use.
- Moved foreign-boundary ownership validation out of boundary-plan construction so route root graphs are validated before dependency and data preparation.
- Moved page-package classification into the asset-processing module so render orchestration no longer carries a dedicated packaging service wrapper.
- Split file-route page middleware onto its own context contract so page middleware no longer exposes handler-only `ctx.render()` helpers and the pipeline stops carrying fake render traps.
- Narrowed route-renderer consumers onto explicit resolver contracts, moved filesystem custom 404 rendering back under the filesystem matcher, and shared explicit static render preparation between runtime and static generation.

- Added the `@ecopages/core/dev/host-runtime` seam so host integrations such as the Vite plugin use one explicit development bridge instead of importing host-module-loader and invalidation internals directly.
- Moved extension-facing merge and assertion helpers behind the integration and processor plugin entrypoints so MDX and image processing no longer depend on raw `utils/deep-merge` or `utils/invariant` package paths.
- Re-exported shared build-plugin authoring types through the integration and processor plugin entrypoints so extension packages depend on plugin surfaces instead of the raw `build/build-types` module.
- Removed the legacy `@ecopages/core/errors/locals-access-error` and `@ecopages/core/adapters/bun/client-bridge` exports after moving their remaining consumers to the public `errors` and root type surfaces.
- Removed the unused `@ecopages/core/utils/parse-cli-args` and `@ecopages/core/services/module-loading/app-server-module-transpiler.service` exports from the published package surface.
- Removed the unused `@ecopages/core/bun/create-app` and `@ecopages/core/route-renderer/template-serialization` exports to keep the published package surface aligned with the documented entrypoints.
- Removed the legacy `@ecopages/core/internal-types` export now that the public root package exposes the supported `EcoPagesAppConfig` contract.
- Removed the duplicate `@ecopages/core/router/client/navigation-coordinator` export in favor of the canonical `@ecopages/core/router/navigation-coordinator` subpath.
- Bundled page-local component stylesheets and standard file scripts into page-owned assets before processing, reducing per-page asset fan-out in emitted HTML.
- Grouped Ecopages JSX page and lazy dependency entries into one multi-entry browser build so shared chunks can be emitted once without relying on the runtime alias vendor path.
- Removed the transitional flat dependency write from render preparation so final HTML injection now follows the structured page-package path only.
- Consolidated runtime state around shared module-loading services, app-owned build execution, and the universal `createApp()` boundary.
- Simplified route-renderer orchestration around renderer-owned boundary runtimes, shared string-boundary queue helpers, and a smaller component render context.
- Centralized shared integration renderer bootstrapping so package integrations only append renderer-specific config instead of duplicating core lifecycle wiring.
- Moved shared queued boundary resolution to attachment-policy payloads and constructor-injectable planning services.
- Extracted shared page, layout, and document-shell composition into a narrow `RouteShellComposer` while keeping renderer-owned boundary handoff in `IntegrationRenderer`.
- Removed marker-era compatibility capture, the shared route-level fallback resolver, deprecated `@ecopages/core/node*` escape hatches, and other dead route-renderer internals.
- Replaced the split `FSRouter` and `FSRouterScanner` flow with one `RouteRegistry` seam for filesystem route discovery, request matching, and static-generation planning.

### Bug Fixes

- Fixed integration registry typing so `ConfigBuilder.setIntegrations()` accepts heterogeneous framework plugins without rejecting valid JSX or React integrations at type-check time.
- Fixed page-owned dependency packaging so final Html output suppresses bundled source stylesheet assets that were reintroduced later during shell-time asset merging.
- Fixed development page dependency packaging so script Dependencies stay source-backed for HMR instead of being collapsed into one page-owned script bundle.
- Fixed Bun preview builds to start the static preview server only after static generation releases the live build server port, preventing preview mode from double-binding the configured port.
- Fixed router-owned HMR current-page reloads to clear persisted layout caches so active shared layouts pick up updated implementations during development.
- Fixed router-owned HMR layout refreshes to reuse the active HMR page entry instead of stale static bootstrap assets during persisted-layout reloads.
- Fixed fetch-mode static generation to normalize absolute routes onto the active build runtime origin, restoring preview prerendering for routes discovered from absolute router entries.
- Fixed global lazy-trigger bootstrap emission to inline the full bootstrap runtime in final HTML, removing separate initial injector bootstrap and runtime requests.
- Fixed Ecopages JSX lazy-trigger finalization to preserve SSR custom-element markup nodes instead of coercing them to `[object Object]` inside parent renders.
- Fixed legacy scripts-injector wrapping and grouped content-script bundling cleanup so non-string JSX SSR output stays intact and failed grouped builds do not leak temporary entries.
- Fixed Ecopages JSX dependency resolution so page bundling now follows only declared `dependencies.scripts` entries, preventing SSR-only imports and lazy-declared scripts from being promoted into the page bundle.
- Fixed Ecopages JSX lazy dependency bundling to keep page and lazy entries separate, preventing lazy scripts from forcing extra shared chunk requests into the page bundle.
- Fixed Ecopages JSX dependency emission to collapse bundleable component CSS and module scripts into page-owned assets while preserving lazy trigger scripts.
- Fixed Ecopages JSX page-owned dependency bundles to keep using the shared JSX and Radiant vendor runtimes so lazy chunks do not trigger duplicate runtime downloads.
- Fixed Ecopages JSX page-owned browser bundles to keep intrinsic custom-element scripts out of final HTML when the current component tree already imports them, reducing docs home page script fan-out to one page bundle.
- Fixed Node static builds so `ecopages build` no longer fails when the configured serve port is already in use.
- Fixed mixed-integration page, layout, document, and component rendering to resolve foreign boundaries inside their owning renderer across the built-in integrations.
- Fixed host/runtime module loading, published build-helper exports, asset output normalization, explicit render flows, and static or preview build stability across Bun, Node, Vite, and Nitro.
- Fixed development project watcher setup to register chokidar paths and handlers only once per app runtime.
- Fixed development script-entry registration to build only the requested HMR entrypoint instead of fanning out across all watched script entrypoints during startup.
- Fixed Node bootstrap runtime package linking to refresh dangling `.eco/node_modules` symlinks instead of failing with `EEXIST` during page transpilation.
- Fixed request-time and static-generation page inspection to preserve integration-specific page loading without reusing the normal render module identity.
- Fixed Node preview and static-generation React runtime resolution so app-owned page modules and server rendering share one React module identity.
- Fixed Bun browser output normalization so batched multi-entrypoint HMR rebuilds match emitted files to their expected served paths instead of Bun output order.
- Fixed render-preparation graph traversal so sparse component dependency arrays do not break custom 404 rendering or file-system response fallback flows.

### Documentation

- Added architecture and API documentation for config, plugins, services, adapters, HMR, routing, and rendering.
- Documented that Html-owned dependency assets stay shared while page, layout, and component dependency assets are packaged per route.

### Tests

- Added regression coverage for app-owned runtime services, Node fallback paths, and cross-runtime invalidation behavior.
- Strengthened the core ghtml integration tests so route and explicit render paths await real outcomes and cover `renderToResponse` behavior.
- Added core regression coverage for boundary plans, payload contracts, and typed mixed-boundary context flow.
- Added router and static-generation regression coverage for `RouteRegistry`, explicit static route expansion, and file-response fallbacks.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core/create-app`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
