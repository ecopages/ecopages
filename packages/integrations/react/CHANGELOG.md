# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed development hydration, router HMR ownership, and page bootstraps across Bun, Vite, and Nitro flows.
- Fixed React page and MDX module loading to use host-provided loaders on Vite or Nitro and a lightweight browser `eco` shim in preview and build output.

### Features

- Added built-in React MDX support and reachability-based hydration analysis for React page bundles.

### Refactoring

- Consolidated React bundling, hydration, and runtime state behind shared service boundaries and `window.__ECO_PAGES__`.

---

## Migration Notes

- The React integration now requires explicit client boundary declarations for client-rendered components.
- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
- The internal service layer is not part of the public API and may change between releases.
