# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed React router page HMR to rerender the live router root directly during page updates, preventing rerun hydration scripts from downgrading the active router registration.
- Fixed development React routes to keep emitting page hydration bootstraps, restoring client hydration and react-router ownership in Bun dev servers and the React playground.
- Fixed Bun development React page hydration to register route modules through the React-owned HMR entrypoint path instead of the generic script fallback.
- Fixed React MDX development module loading to consume an injected host module loader instead of probing Nitro/Vite globals inside the page-module service.
- Fixed Nitro/Vite development React routes to skip the legacy hydration bundle build path while the Vite-native server runner is active.
- Fixed Nitro/Vite development React MDX routes to import page modules through the host Vite runner instead of the legacy MDX build-adapter path.
- Fixed React page hydration bundles to replace direct `@ecopages/core` browser imports with a lightweight Eco factory shim, avoiding esbuild worker crashes when bundling `eco.page(...)` modules for preview and static output.

### Features & Performance

- **Performance Hydration**: Introduced static reachability analysis to enforce explicit hydration boundaries and optimized HMR via metadata caching.
- **Service-Oriented Internals**: Refactored the integration into focused core-backed services for bundling, hydration, and page-module loading.
- **React MDX**: Inlined MDX support directly into the React integration for a zero-config setup, including Node-native compatibility for experimental startup.

### Bug Fixes & Refactoring

- Suppressed expected Vite import-analysis warnings for runtime-loaded React page modules and declared-module inspection paths.
- **Handoff Stability**: Standardized router-backed page payloads and document owner markers for mixed-router stability during navigation.
- **Hydration Hardening**: Fixed island remount races, prop collisions, and layout metadata resolution during development and route handoffs.
- **SSR Composition**: Preserved stitched child HTML during marker-graph React renders and skipped parent island hydration for pure SSR composition boundaries.
- **Architecture**: Centralized runtime specifiers and consolidated browser-side integration state under `window.__ECO_PAGES__`.

---

## Migration Notes

- The React integration now requires explicit client boundary declarations for client-rendered components.
- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
- The internal service layer is not part of the public API and may change between releases.
