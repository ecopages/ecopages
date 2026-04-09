# Changelog

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed Lit page composition through non-Lit HTML templates so SSR comment markers no longer cause duplicate page shells to be appended.

### Features

- Aligned Lit with the unified orchestration pipeline and the shared lazy dependency and global injector flow.

### Bug Fixes

- Suppressed expected Vite import-analysis warnings for runtime SSR lazy-preload module imports.
- Prevented the shared Lit hydrate-support bootstrap from re-running on every browser-router navigation.
- Routed Lit renderer output through Lit's static SSR template pipeline so registered custom elements render declarative shadow DOM during SSR instead of staying as bare host tags.
- Fixed cross-integration Lit SSR to defer Lit boundaries into marker-graph resolution and preload `ssr: true` lazy scripts during component-level renders, so custom elements like the kitchen-sink counter render their server markup outside Lit-owned page entry routes.
- Made Lit html-template insertion robust so mixed-layout SSR no longer leaks the content placeholder or appends `undefined` to the final document.
- Fixed Lit html-template integration detection so non-Lit document shells no longer leak the content placeholder or top-level `lit-part` markers in Nitro-hosted routes.

### Refactoring

- Cleaned up ambient module declarations.

### Tests

- Updated integration coverage for the orchestration pipeline and Node and esbuild compatibility.
