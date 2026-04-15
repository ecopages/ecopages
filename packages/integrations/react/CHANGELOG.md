# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed development hydration, router HMR ownership, and page bootstraps across Bun, Vite, and Nitro flows.
- Fixed React page and MDX module loading to use host-provided loaders on Vite or Nitro and a lightweight browser `eco` shim in preview and build output.
- Fixed React Fast Refresh to keep React-owned island entrypoints on the React HMR path while ignoring non-React watched script entrypoints.
- Fixed `renderDocument` to prepend `<!DOCTYPE html>` for both React-managed and non-React HTML templates, matching the behavior of all other integrations.
- Fixed React island asset generation to share both bundled component modules and hydration bootstraps across repeated island instances of the same component.
- Fixed full route and explicit React view rendering to compose page, layout, and document shells through renderer-owned component boundaries so mixed non-React shells resolve deferred foreign content without leaving route-level markers behind.
- Fixed partial React `renderToResponse()` views with deferred foreign boundaries to fall back to explicit component-boundary rendering instead of streaming unresolved marker placeholders.

### Features

- Added built-in React MDX support and reachability-based hydration analysis for React page bundles.

### Refactoring

- Consolidated React bundling, hydration, and runtime state behind shared service boundaries and `window.__ECO_PAGES__`.

### Documentation

- Updated the README to document React's mixed-renderer ownership model for nested boundaries and non-React page, layout, and document shells.

---

## Migration Notes

- The React integration now requires explicit client boundary declarations for client-rendered components.
- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
- The internal service layer is not part of the public API and may change between releases.
