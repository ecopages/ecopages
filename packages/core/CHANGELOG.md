# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Suppressed Node response-stream client disconnects during runtime serving so navigation-driven aborts no longer log `ERR_STREAM_UNABLE_TO_PIPE` as server failures in tests and development.
- Preserved Node preview-host state through async shutdown failures and coalesced overlapping preview `stop()` calls onto one in-flight shutdown.
- Streamed Node adapter Web `Response` bodies directly into `ServerResponse` so large payloads and streaming responses no longer buffer through `arrayBuffer()` first.
- Fixed Bun adapter runtime and HMR type contracts so Bun-specific collaborators type-check cleanly during core package builds.
- Restored the Bun server adapter static-generation import path so preview and E2E startup no longer fail with `StaticSiteGenerator is not defined` during runtime initialization.
- Preserved configured Node hostnames in reported runtime origins while still normalizing bare IPv6 literals, so localhost binds no longer log as resolved socket addresses like `[::1]`.
- Fixed Node-target server-module ESM outputs to emit `.mjs` runtime artifacts so top-level `await` and other ESM semantics do not depend on app-level `"type": "module"`.
- Preserve foreign-child runtime normalized props on inline renders so mixed-integration children stay serialized during server rendering.
- Fixed Bun component render contexts to keep async foreign-child interception active during Lit and Ecopages JSX renderer passes in preview and static builds.
- Fixed Bun app-module server builds to run metadata loaders before JSX ownership overrides so foreign-owned layouts and HTML shells keep their integration metadata during preview and static rendering.
- Fixed page-module import caching to include JSX ownership and plugin inputs so preview and static generation do not reuse server modules compiled for the wrong integration runtime.

### Features

- Added app-owned runtime and build ownership around `createApp()`, host module loading, the browser-safe `eco` export, `eco.html()`, `eco.layout()`, and the published `EcoPagesAppConfig` surface.
- Added boundary-plan metadata and a compatibility `renderBoundary()` payload contract for mixed-renderer orchestration.

### Refactoring

- Re-exported the renderer contribution contracts through the integration plugin surface so integrations declare page-browser and document HTML hooks from one core boundary.
- Moved Page Browser Graph assembly into the shared route orchestrator so integrations now declare graph contributions instead of building page-browser assets inside renderer execution.
- Cached shared Page Browser Graph resolution across repeated route preparation while automatically bypassing that cache when HMR is enabled.
- Split resolved Page Browser Graph outputs into explicit entry and chunk asset groups while keeping route packaging flattening in the shared orchestrator.
- Moved Page Browser Graph flattening behind `createPagePackage()` and threaded the structured graph through `PagePackageResult` so route preparation no longer collapses browser graph shape before packaging.
- Updated HTML finalization to inject Page Browser Graph entry assets from `PagePackageResult` while keeping chunk assets out of the initial document injection path.
- Preserved structured Page Browser Graph metadata through explicit renderer hydration paths so full-document view rendering reuses the shared graph contract without flattening it back into a plain page package.
- Routed Bun runtime loader registration through the shared runtime plugin bootstrap so loaders and runtime plugins now follow one startup registration path.
- Removed the Bun `ServerLifecycle` and shared runtime-bootstrap forwarding seams so Bun and Node adapters own their runtime startup directly against the shared build, plugin, and watcher helpers.
- Moved shared HMR registration, strategy dispatch, runtime bundling, and entrypoint bookkeeping behind one shared manager module so Bun and Node now differ only at the runtime-specific transport hooks.
- Moved runtime binding resolution and static build runtime decisions behind shared app-startup primitives so Bun and Node app modules no longer duplicate host and preview/build setup policy.
- Extracted shared runtime-origin resolution for server adapters and introduced a small runtime host contract so Bun and Node app startup now call the same transport lifecycle shape.
- Moved preview server lifecycle behind shared preview-host contracts and extracted Node's HTTP request/response bridge into a reusable module so `create-app` no longer owns runtime transport details.
- Moved runtime hosts, preview hosts, and the Node request bridge to constructor-injected collaborators with factory-edge defaults so app and server adapters no longer construct services inline.
- Moved Bun and Node server-adapter collaborator assembly behind runtime-specific dependency bundles, including an injected Node dev-runtime factory for websocket, bridge, and HMR setup.
- Removed the dead Bun route-handler factory seam and the remaining Bun static-builder callback so server adapters now consume only runtime collaborators instead of construction hooks.
- Collapsed one-shot server-adapter dependency wrapper helpers back into the factory edge, keeping only the injected Node dev-runtime factory seam that still carries real runtime behavior.
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

- Fixed mixed Ecopages JSX to string-renderer component handoff so delegated foreign children are serialized before Kita or other string-first shells receive them during preview and static rendering.
- Fixed Bun page-module loading to keep framework-owned page imports on the transpilation path whenever a runtime build root and output directory are configured.
- Fixed Bun development server-module invalidation to add runtime cache-busting even when Bun dev runs without `NODE_ENV=development`, so shared include changes reload fresh document-shell modules.
- Fixed Bun development include invalidation so shared `@/includes/...` helpers are folded into rebuilt server modules after graph bumps, keeping document-shell reloads fresh without bundling unrelated mixed-renderer boundaries.
- Fixed Bun development document-shell reloads to roll rebuilt server-module filenames forward after invalidation, so shared include-only changes do not reuse stale cached module paths.
- Fixed Bun server-module transpilation naming so page imports that also emit CSS assets no longer fail with output-path collisions during static builds and preview startup.
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
