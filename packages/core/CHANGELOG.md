# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added `eco.html()` and `eco.layout()` as Phase 1 semantic factories over the existing component pipeline, along with exported `EcoHtmlComponent`, `EcoLayoutComponent`, and `LayoutProps` types.
- Exposed `ProcessedAsset` and `MarkerGraphContext` through the core public type surface so integrations can type deferred-render helpers without internal imports.

### Refactoring

- Added shared captured-HTML orchestration helpers to `IntegrationRenderer` so direct renderer paths can reuse core deferred marker resolution, asset merging, and final HTML finalization.

#### Node.js Runtime Support

- **Node server adapter** — Full HTTP server adapter for Node.js via `packages/core/src/adapters/node/`, including request bridging, route handling, static content serving, and graceful shutdown.
- **Node static build pipeline** — Static-site build and preview server for Node.js runtime (`ab22f167`, `a47b4da3`, `435dc250`).
- **Node API handler pipeline** — `define-api-handler` now works cross-runtime; Node adapter wires API handler execution end-to-end (`73e57d87`, `f46aa528`).
- **Node client bridge** — `NodeClientBridge` with SSE-based HMR stream and heartbeat mechanism for connection health (`3361445f`).
- **Node HMR manager** — `NodeHmrManager` that mirrors Bun HMR capabilities on the Node runtime.
- **`createApp` universal factory** — Top-level `createApp` export that selects the correct adapter (Bun or Node) at runtime (`ce691bdf`, `2f1b1109`).

#### Build System

- **`EsbuildBuildAdapter`** — A new build backend backed by esbuild, replacing the Bun-only transpilation path. Includes module resolution routing, plugin registration, and transpilation defaults (`f503e86e`, `94c37d38`, `e4e124a1`).
- **Build dependency graph** — `BuildDependencyGraph` interface for tracking entrypoints and their asset dependencies, enabling more accurate HMR invalidation (`e7653c9b`).
- **Build adapter abstraction** — `build-adapter.ts` and `build-types.ts` decouple build and plugin contracts from Bun-specific types (`11b03bcc`).

#### Rendering & Orchestration

- **Boundary rendering policy** — Cross-integration component boundaries are now explicitly enforced (`ec1e4d66`).
- **Full orchestration mode** — Legacy rendering mode branches removed; the engine always runs in unified orchestration mode (`f652fa0a`).
- **Extracted render services** — The render pipeline is decomposed into focused services:
    - `RenderExecutionService`
    - `RenderPreparationService`
    - `MarkerGraphResolver`
    - `FileRouteMiddlewarePipeline`
    - `PageRequestCacheCoordinator`
    - `PageModuleImportService`
- **Component render context** — New `ComponentRenderContext` consolidates component-level state during rendering (`eco/component-render-context.ts`).
- **Worker-tools HTML rewriter fallback** — `html-transformer` adopts `@worker-tools/html-rewriter` as a fallback for non-Bun environments (`54056d4f`).

#### Dependency & Injection

- **Global injector map** — `GlobalInjectorMap` and `LazyInjectorMap` provide structured, testable dependency injection for global and lazy assets (`c3a25072`).
- **Lazy dependency resolution** — SSR lazy script resolution now uses dedicated utility functions for dependency entry attributes and content generation (`71ce2f4f`).
- **Dependency entry type refactor** — Unified types for script and stylesheet dependency entries, with improved error messages (`1e02dba6`).
- **Module dependencies** — New `module-dependencies.ts` tracks explicit module-level asset relationships.
- **Eco utils extraction** — Shared utilities moved to `eco.utils.ts` to remove runtime metadata fallbacks (`bdc60d50`).

#### API Handlers

- **Unified typed API handler context** — `defineApiHandler` now exposes a fully typed, runtime-agnostic context object. The Bun-specific adapter is slimmed down to a thin wrapper (`2f1b1109`, `08e194b4`).
- **Portable root runtime API** — Core exposes a portable API surface that avoids runtime escape hatches (`ce691bdf`, `1ec42c02`).

### Refactoring

- Moved the shared client-side navigation coordinator into `router/client` and kept the legacy core router export path mapped to that canonical client runtime.
- Simplified `DevBuildCoordinator` to use explicit per-app build executors instead of monkey-patching or process-global startup installation. Build callers now receive app-owned executors through config/runtime context, while process-level fault handlers, `onRecovery`, and the `install-dev-build-runtime.ts` indirection layer remain removed.
- Injected `appConfig` directly into `FileSystemResponseMatcher` and confined React runtime-specifier aliasing to the React integration so generic core HMR no longer owns a React-specific workaround.
- **Bun adapter isolation** — Bun-specific types (`serve` options, file reads, env access, argv/hash helpers) are routed through dedicated helpers, making the remaining adapter code portable (`73668f52`, `0c90ced1`, `73fb904a`, `5eb0957b`, `4bdc74a9`, `e9ce163c`, `22f9de4a`, `f7b3d95e`).
- **Shared server adapter** — Common server adapter logic extracted to `adapters/shared/application-adapter.ts` and `adapters/shared/server-adapter.ts`, shared between Bun and Node adapters (`5a872eda`).
- **Route assets isolation** — Route-level assets are now isolated per-request, hardening dependency processing (`3fd76a12`).
- **Shared matcher error constants** — Matcher error strings are now constants shared across test and source (`ff4db106`).
- **App registration & fetch pipeline** — App creation and request handling consolidated into a single unified pipeline (`86e20a3d`).
- **Adapter escape hatch surface** trimmed — Public adapter API is narrowed to reduce surface area (`1ec42c02`).
- Consolidated final HTML attribute stamping and processed-asset deduplication into `HtmlTransformerService`, removing `HtmlPostProcessingService` from the render pipeline.

### Bug Fixes

- Split strict integration-owned HMR entrypoint registration from generic script-asset registration so page bundles now fail fast when their owning integration does not emit output, instead of silently falling back to a wrong generic build.
- Stopped generic JS HMR rebuilds from overwriting integration-owned entrypoints, so React route bundles keep their framework-specific output after shared script invalidations.
- Invalidated stale `_hmr` entrypoint files before fresh registration so broken bundles cannot be reused across restarts.
- Fixed esbuild recovery and serialization tests to keep mocked `esbuild` modules compatible with fresh-service reload logic during protocol fault handling.
- Added stable runtime fallback component refs for deferred cross-integration rendering so explicit source-imported views can resolve markers without build-time metadata.
- Moved development build coordination off process-global state and onto explicit app-owned executors so mixed runtime build paths share recovery logic without hidden global installation.
- Fixed request-time Node page-module imports to externalize packages by default in development, preventing duplicate React instances during server-rendered route loads.
- Stopped first-time dev HMR entrypoint registration from broadcasting live update or reload events, so navigating to a new route no longer triggers spurious page refreshes mid-navigation.
- Serialized shared esbuild adapter builds in development to avoid intermittent process crashes while multiple startup or HMR bundling requests overlap.
- Consolidated browser runtime globals under `window.__ECO_PAGES__` and removed the unused ambient `ecoConfig` declaration.
- Recycled the shared esbuild service before subsequent serialized Node development builds and recover known esbuild protocol faults so stale sessions do not take down the dev server.
- Deduplicated concurrent dev HMR entrypoint registrations so repeated hydration asset requests share one in-flight build instead of racing through duplicate setup work.
- Fixed dev watching for `src/includes` template changes so shared server-rendered shell updates trigger a browser reload instead of being treated like client-only HMR work.
- Fixed browser-side current-page reload coordination so HMR refreshes still target the active runtime even when the reload request originates from that same owner.
- Fixed router handoff detection to use an explicit rendered document owner marker instead of hydration-script sniffing.
- Fixed router ownership handoff so external runtimes can integrate through the navigation coordinator without browser-router knowing specific peer router names.
- Fixed cross-runtime navigation so runtimes can hand off already-fetched browser documents through the coordinator instead of forcing a reload or a second fetch.

### Refactoring

- Added a shared browser-side navigation coordinator so client runtimes can hand off ownership, reload the current page, and request cross-router navigation through one internal protocol instead of ad hoc globals.
- Expanded the navigation coordinator with document-owner adoption, explicit claim/release, targeted cleanup, and event subscription primitives for third-party routers.
- Removed legacy template filename config and now derive `html` and `404` entries semantically from registered integration extensions.
- Fixed invariant checks for route paths with improved error messaging in `AbstractApplicationAdapter` (`9c2a6242`).
- Fixed dependency import name extraction in `extractEcopagesVirtualImports` (`39bbc472`).
- Removed an invalid npm export entry that pointed to a non-existent `utils/ecopages-url-resolver` declaration target.
- Fixed processor lifecycle hijacking where PostCSS watching TSX/HTML for Tailwind class scanning incorrectly prevented those files from reaching the HMR strategy pipeline.
- Unified the file watcher event pipeline: processors are now notified inside `handleFileChange` instead of binding separate chokidar listeners, eliminating double-execution and race conditions.
- Fixed dev CSS updates to stay on the processor-owned path instead of using a parallel core stylesheet HMR strategy, so PostCSS transforms remain authoritative during HMR.
- Fixed emitted asset paths for file stylesheet dependencies so processed CSS stays under the correct `src`-relative asset location during HMR and rebuilds.
- Fixed page layout typing to accept both semantic `eco.layout()` components and existing `eco.component()` layouts without widening page render contracts.
- Added async task queue to `ProjectWatcher` to serialize concurrent file change handling and prevent overlapping builds.
- Batched `JsHmrStrategy` entrypoint builds into a single esbuild invocation for improved AST sharing and rebuild speed.
- Added `outbase` support to `BuildOptions` for correct output directory structure with multi-entrypoint builds.
- Fixed marker graph resolution to pass stable component instance ids into nested integration renders so cross-integration islands continue hydrating after the React explicit-island change (`unreleased`).
- Static generation and preview now skip pages with `cache: 'dynamic'` and warn instead of attempting to render request-time routes (`unreleased`).
- Static build and preview now warn when registered API endpoints will be unavailable because no server runtime is started (`unreleased`).

### Tests

- Added coverage for `eco.html()` and `eco.layout()` plus metadata injection for the new factory calls.
- Added stylesheet HMR regression coverage for raw CSS fallback reloads and processor-owned PostCSS updates.
- Added node static content server test coverage (`435dc250`).
- Strengthened HTML transformer mode matrix coverage (`286c1253`).
- Aligned integration and dependency processing tests to new orchestration model (`7cc73316`).
- Added marker graph regression coverage for nested integration render instance ids (`unreleased`).
- Added `EsbuildBuildAdapter` test suite with 500+ lines (`build-adapter.test.ts`).
- Added `file-route-middleware-pipeline` tests.

### Documentation

- Added build-layer architecture documentation for the shared adapter and `DevBuildCoordinator`, including the development orchestration and recovery flow.
- Updated rendering graph documentation to cover extracted rendering services (`8bfcfd21`).
- Refreshed server handler and module dependency guidance (`3494f44d`).

---

## Migration Notes

- **`createApp`** is now the recommended entrypoint (previously `EcopagesApp`). Import from `@ecopages/core`.
- **`defineApiHandler`** signature is unchanged but the handler context object now carries explicit runtime-agnostic types. No breaking changes for existing handlers.
- Bun adapter still works as before; the new Node adapter is additive.
- The old explicit `renderingMode` config option has been removed — full orchestration is always active.
