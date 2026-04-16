# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed React hydration, Fast Refresh, module loading, doctype handling, island asset reuse, and mixed-renderer boundary resolution across Bun, Vite, and Nitro flows.

### Features

- Added built-in React MDX support and reachability-based hydration analysis for React page bundles.

### Refactoring

- Consolidated React bundling, hydration, and runtime state behind shared service boundaries and `window.__ECO_PAGES__`.

### Documentation

- Updated the README to document React-owned mixed boundaries and React MDX setup.

---

## Migration Notes

- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
