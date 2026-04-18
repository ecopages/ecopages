# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed React hydration, Fast Refresh, module loading, doctype handling, island asset reuse, and mixed-renderer boundary resolution across Bun, Vite, and Nitro flows.
- Restored direct `ReactPlugin` construction so the exported class still accepts the public plugin options shape.
- Fixed React boundary payload compatibility coverage and removed the plugin/renderer integration-name import cycle.

### Features

- Added built-in React MDX support and reachability-based hydration analysis for React page bundles.

### Refactoring

- Consolidated React bundling, hydration, and runtime state behind shared service boundaries and `window.__ECO_PAGES__`.
- Moved React plugin option/default resolution into the factory and replaced renderer static config with instance-owned runtime wiring.
- Extracted React page-payload and locals serialization into a dedicated service to keep the renderer focused on orchestration.
- Centralized recursive React component-config traversal so module discovery and MDX SSR-lazy asset collection no longer reimplement graph walking.
- Moved MDX config dependency resolution out of the renderer into a dedicated React service.
- Collected shared React plugin and renderer config types into a dedicated module while keeping renderer-local runtime types close to implementation.

### Tests

- Added Vitest browser coverage for the React `dynamic()` utility using React Testing Library.
- Added browser execution coverage for the generated React hydration bootstrap, including router ownership registration and page-root cleanup.
- Added renderer-level coverage for the boundary payload compatibility contract, including non-attachable fragment roots.

### Documentation

- Updated the README to document React-owned mixed boundaries and React MDX setup.

---

## Migration Notes

- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
