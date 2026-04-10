# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Refactoring

- Removed the unused Vite-specific environment host-loader helper from core so host module loading stays behind the generic runtime-owned boundary.
- Made Bun-native build ownership explicit in core runtime state, added a Vite host-owned build boundary, and demoted esbuild from default architecture to Bun-path compatibility infrastructure.
- Added explicit ConfigBuilder build-ownership selection so Bun-native and Vite-host flows can be finalized without post-build runtime mutation.
- Removed the direct Nitro/Vite module-loader default from core page-module imports and replaced it with an abstract host module loader injected through app runtime state.
- Removed the internal Node fallback from the public `@ecopages/core/create-app` entrypoint so direct core execution is Bun-only and cross-runtime support can move behind the Vite host path.
- Removed the public `@ecopages/core/node`, `@ecopages/core/node/create-app`, and `@ecopages/core/node/server-adapter` escape hatches so the remaining Node compatibility path stays internal to the universal `createApp` boundary.
- Stopped eagerly attaching the Node thin-host manifest during config build so Bun-native core config stays host-agnostic until the Node compatibility path is invoked.
- Removed the app-runtime `nodeRuntimeManifest` state slot so thin-host manifests are derived only at the compatibility boundary instead of being stored in core runtime state.
- Removed the dedicated `@ecopages/core/node/runtime-adapter` public subpath and collapsed the remaining Node manifest helpers down to a type-only core boundary; thin-host manifest validation now lives with the CLI launcher.
- Moved the remaining Node thin-host manifest contract into the core Node adapter boundary and deleted the separate runtime-manifest service file.
- Deleted the thin-host runtime adapter implementation from core and moved the default thin-host session bootstrap into the CLI package; also removed the unused thin-host-specific node_modules helper from the shared bootstrap resolver.
- Moved the shared Node bootstrap transpilation plugin out of `adapters/node` into `services/module-loading`, so server module transpilation no longer depends on the Node adapter cluster.
- Simplified Node runtime adapter to use direct `import()` calls instead of the multi-layer bootstrap pipeline (`TranspilerServerLoader`, config bridge, `AppBuildExecutor`), reducing ~250 lines of orchestration code.
- Removed `TranspilerServerLoader` service and its tests (`server-loader.service.ts`) — no longer needed now that Node loader hooks handle TypeScript transpilation.
- Removed unused `writeBundledNodeRuntimeManifest` helper (`write-runtime-manifest.ts`).

### Bug Fixes

- Fixed Bun development page and template imports to include the app invalidation version in app-owned module loads, so include and layout reloads can pick up fresh server-rendered output.
- Fixed Bun development HTML template imports to bypass the framework module cache, so shared include and layout edits can refresh the server-rendered shell without forcing every page module through a fresh import.
- Fixed app-owned page and template module imports to use the app’s active build executor, keeping request-time module loads on the same runtime build coordinator and plugin pipeline as the rest of the app.
- Fixed the `@ecopages/core` browser entry to expose a browser-safe `eco` factory from core instead of re-exporting the server runtime implementation.
- Fixed Nitro include and layout HMR to invalidate Ecopages server-module state before reloading, so browser refreshes pick up fresh server-rendered HTML instead of stale cached modules.
- Fixed Nitro include and layout HMR by keeping embedded Node runtimes in development watch mode and invalidating Ecopages server-module state before reloads, so browser refreshes pick up fresh server-rendered HTML instead of stale cached modules.
- Fixed embedded Vite and Nitro app bootstraps to configure host-module loading and embedded runtime mode directly through `createApp()`, removing the need for pre-bootstrap app and process mutation in host entry files.
- Fixed esbuild browser builds triggered through plugin-loaded entrypoints to resolve workspace-installed packages without corrupting the esbuild service protocol.
- Fixed Bun preview and static-generation startup to keep esbuild builds on the serialized recovery coordinator in production, preventing shared-service `Unexpected EOF` crashes during Playwright webServer startup.
- Fixed `@ecopages/core/create-app` compatibility for Node thin-host consumers so the loader-rewritten create-app module continues to provide the named `createApp` export.
- Fixed dev-time Nitro page module loading to use the host Vite module runner for source imports instead of routing request-time loads through the Node transpile pipeline.
- Fixed Nitro dev source-module loading to keep Ecopages integration templates on the framework transpiler path instead of routing them through the host Vite runner.
- Suppressed expected Vite import-analysis warnings for runtime-only module imports used by the Node build adapter and server-side module loaders.
- Fixed core runtime source-path compatibility for Vite and Nitro server runners by normalizing direct source imports and removing unsupported runtime enum syntax from the HMR strategy path.
- Fixed active core runtime resolution paths to avoid `import.meta.resolve` in the Vite/Nitro module runner, allowing the Nitro spike to render real pages through `app.fetch()`.
- Fixed deferred marker graph resolution to discover deep child markers captured inside serialized `children` props, restoring multi-level cross-integration SSR assembly.
- Fixed watch-mode route refresh to await and deduplicate page add/remove rebuilds so newly created pages resolve without restarting the dev server.
- Fixed runtime component fallback references to stay stable across duplicate core module instances during Vite/Nitro source execution.

- Fixed npm release packaging to publish rewritten internal dependency versions instead of unresolved `workspace:*` ranges.
- Fixed published npm packaging to exclude raw TypeScript sources from tarballs so consumers resolve the built JavaScript and declaration outputs consistently.

### Features & Architecture

- **Experimental Node.js Support**: Introduced a framework-owned thin-host bootstrap and runtime manifest flow for Node.js, providing cross-runtime parity while keeping the core agnostic.
- **Architectural Consolidation**: Unified server-side loading, browser bundling, and HMR strategy orchestration across all runtimes using shared core services (`ServerModuleTranspiler`, `BrowserBundleService`).
- **Build & Asset Refinement**: Introduced an internal `.eco` work directory to isolate development artifacts from production exports, and added `eco.html()`/`eco.layout()` for semantic component definitions.
- **Performance & Reliability**: Refactored internal watchers and HMR dispatching to improve build stability during rapid development cycles.

### Tests & Documentation

- **Robust Regression Suite**: Added coverage for experimental Node.js paths, the new shared services, and cross-runtime file-change dispatching.
- **Architecture Docs**: Added focused architecture and API documentation for config, plugins, services, adapters, HMR, router, and the rendering lifecycle.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
