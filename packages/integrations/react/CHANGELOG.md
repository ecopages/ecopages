# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features & Performance

- **Performance Hydration**: Introduced static reachability analysis to enforce explicit hydration boundaries and optimized HMR via metadata caching.
- **Service-Oriented Internals**: Refactored the integration into focused core-backed services for bundling, hydration, and page-module loading.
- **React MDX**: Inlined MDX support directly into the React integration for a zero-config setup, including Node-native compatibility for experimental startup.

### Bug Fixes & Refactoring

- **Handoff Stability**: Standardized router-backed page payloads and document owner markers for mixed-router stability during navigation.
- **Hydration Hardening**: Fixed island remount races, prop collisions, and layout metadata resolution during development and route handoffs.
- **Architecture**: Centralized runtime specifiers and consolidated browser-side integration state under `window.__ECO_PAGES__`.

---

## Migration Notes

- The React integration now requires explicit client boundary declarations for client-rendered components.
- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
- The internal service layer is not part of the public API and may change between releases.
