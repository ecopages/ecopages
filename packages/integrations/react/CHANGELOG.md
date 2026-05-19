# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed React MDX page-module loading under Node-style ESM builds so compiled MDX routes resolve emitted `.mjs` outputs instead of assuming `.js` runtime artifacts.
- Fixed React MDX loader initialization under the Node `tsx` runtime by resolving the internal loader helper through static imports instead of lazy module imports.
- Fixed React HMR ownership matching so non-React compound template files like explicit `.kita.tsx` server views no longer emit stale React module updates instead of full route reloads.
- Fixed router-managed React HMR page entries to reload the active route with a cleared persisted-layout cache so shared layout edits apply while the current page stays mounted.
- Fixed router-managed React HMR handlers to forward the active page HMR entry when reloading the current route through React Router.
- Fixed production React route hydration bundles to inline React runtime dependencies and import the router through the emitted page browser graph instead of a published import-map key.
- Removed the redundant React page props bootstrap script so route hydration relies on the canonical `__ECO_PAGE_DATA__` payload.
- Fixed React hydration, Fast Refresh, module loading, doctype handling, island asset reuse, and mixed-renderer foreign-subtree resolution across Bun, Vite, and Nitro flows.
- Restored direct `ReactPlugin` construction so the exported class still accepts the public plugin options shape.
- Fixed React foreign-subtree payload compatibility coverage and removed the plugin/renderer integration-name import cycle.

### Features

- Added built-in React MDX support and reachability-based hydration analysis for React page bundles.
- Added the `@ecopages/react/eco-embed` helper for React-owned mixed-integration authoring on top of `eco.embed()`.

### Refactoring

- Collapsed React route hydration into one page-owned entry module that re-exports the page component and bundles runtime dependencies in production.
- Removed the router adapter `importMapKey` contract so both development and production route hydration follow the router bundle import path instead of split import-map and bundle-path models.
- Replaced the positional `ReactHmrStrategy` constructor with an options object so React HMR wiring can evolve without argument-order churn.
- Renamed the remaining React runtime alias internals away from `specifierMap` terminology now that import-map-era core seams are gone.
- Consolidated React bundling, hydration, and runtime state behind shared service boundaries and `window.__ECO_PAGES__`.
- Moved React plugin option/default resolution into the factory and replaced renderer static config with instance-owned runtime wiring.
- Extracted React page-payload and locals serialization into a dedicated service to keep the renderer focused on orchestration.
- Centralized recursive React component-config traversal so module discovery and MDX SSR-lazy asset collection no longer reimplement graph walking.
- Moved MDX config dependency resolution out of the renderer into a dedicated React service.
- Collected shared React plugin and renderer config types into a dedicated module while keeping renderer-local runtime types close to implementation.

### Tests

- Added Vitest browser coverage for the React `dynamic()` utility using React Testing Library.
- Added browser execution coverage for the generated React hydration bootstrap, including router ownership registration and page-root cleanup.
- Added renderer-level coverage for the foreign-subtree payload compatibility contract, including non-attachable fragment roots.

### Documentation

- Updated the README to document React-owned mixed boundaries and React MDX setup.

---

## Migration Notes

- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
