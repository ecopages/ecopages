# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

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
