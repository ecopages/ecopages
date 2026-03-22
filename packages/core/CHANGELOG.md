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
- Added a dedicated `workDir` app config path for internal runtime artifacts so `distDir` can stay a clean export directory.

### Refactoring

- Finalized app-owned build manifests during `ConfigBuilder.build()` and split build contribution collection from runtime startup.
- Consolidated Node thin-host app bootstrap to reuse one app-owned build executor for app-entry loading and invalidation rebinds instead of creating duplicate app-phase executors.
- Added one shared runtime build-executor installer boundary so Node and Bun adapters use the same app-owned executor ownership path, and made Node thin-host session invalidation state explicitly owned by one session-scoped invalidation service.
- Narrowed `NodeRuntimeManifest` to path and module-path fields only; removed `buildPlugins`, `browserBundles`, and `bootstrap` sections that were written as static constants and never consumed after validation.
- Extracted shared runtime bootstrap helpers for executor installation, public-dir preparation, and runtime plugin setup so Node and Bun startup paths reuse one adapter-owned flow while keeping host-specific HMR and transport hooks.
- Moved route initialization plus response-handler wiring behind shared adapter startup hooks and normalized Node/Bun watch-mode route refresh callbacks to one shared adapter-level contract.
- Routed runtime specifier registration through shared integration lifecycle hooks and centralized browser bundle assembly behind `BrowserBundleService`.
- Consolidated server-module loading around one shared app-owned transpiler, app-scoped import caches, and one app-owned invalidation path so runtime subsystems no longer coordinate through duplicated loader state.
- Allowed `ServerModuleTranspiler` to accept an injected module-import dependency so runtime tests can use explicit fakes instead of module-level mocking.
- Allowed `TranspilerServerLoader` to accept an injected transpiler factory so bootstrap loader tests can use explicit doubles instead of module-level mocking.
- Allowed `PageModuleImportService` and `ServerStaticBuilder` to accept narrow runtime dependencies so their tests can use explicit fakes instead of module-level mocking and logger spies.
- Moved HTML rewriter runtime selection into a dedicated provider so `HtmlTransformerService` stays focused on HTML transformation and its tests no longer need module-level mocking.
- Split app-owned server invalidation state from entrypoint dependency graphs so runtime invalidation, browser rebuild targeting, and HMR coordination each use their own dedicated runtime owner.
- Standardized Node runtime bootstrap wiring behind shared app-owned bootstrap helpers and one runtime-adapter loader rebind path so page metadata probes, request-time imports, and thin-host startup follow the same internal flow.
- Removed legacy template filename config in favor of semantic `html` and `404` template detection from registered integration extensions.
- Documented the plugin lifecycle and aligned build, HMR, and invalidation services around the shared dev graph and build executor flow.

### Bug Fixes

- Stopped loading `eco.config.ts` in a separate Node thin-host bootstrap pass so app-entry loading can be the single runtime config evaluation path.
- Routed React HMR browser entry rebuilds and page-metadata module loading through shared browser bundling and server-loading services.
- Fixed Node bootstrap resolution so app-local aliases, third-party dependencies, `import.meta.dirname`, `import.meta.filename`, and `bun:*` diagnostics behave correctly during experimental Node startup.
- Moved development invalidation and server-module cache invalidation onto the app-owned dev graph so watcher routing and experimental Node invalidation share one policy.
- Hardened cross-integration rendering and explicit static route handling so sparse dependency graphs, direct renderer paths, and foreign JSX boundaries no longer crash.
- Hardened delegated link detection and current-page reload coordination for mixed-router development navigation flows.
- Set `dist` as the default export directory, kept `.eco` as the internal work directory, and ensured static builds reset only the deployable output before regeneration.
- Moved request-time page metadata transpilation into the internal work directory so static exports no longer leak `.server-modules-meta` into `distDir`.
- Kept runtime-executed server modules and Node thin-host bootstrap output under `.eco` so request-time imports keep resolving app and workspace dependencies correctly without polluting `dist`.
- Fixed Node alias resolution for simple barrel imports such as `@/layouts/base-layout` so experimental runtime metadata and bootstrap loads resolve the concrete module file.
- Moved development-only HMR browser bundles and HMR server-module transpiles behind internal runtime paths so preview/export cleanup no longer deletes active dev assets.
- Re-emitted integration-owned runtime assets after static export cleanup so preview and build keep React vendor bundles like `/assets/vendors/react.js` and `/assets/vendors/react-dom.js` available.
- Re-ran processor runtime setup after static export cleanup so processor-owned outputs such as optimized images are restored into `dist` before pages are generated.
- Made `preview` rebuild and then serve `dist` so production verification always runs against the actual deployable output.

### Tests

- Added regression coverage for `eco.html()` and `eco.layout()`, shared browser bundle and server loader services, and experimental Node bootstrap paths.
- Added alias-resolver regression coverage for simple barrel imports that re-export compound-extension modules such as `.kita.tsx`.
- Added regression coverage for HMR internal output paths so dev runtime assets stay isolated from preview/export output.

### Documentation

- Added focused architecture and API documentation for config, plugins, services, adapters, HMR, router, and the rendering lifecycle.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
