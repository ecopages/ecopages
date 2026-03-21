# Changelog

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Aligned Lit with the unified orchestration pipeline and the shared lazy dependency and global injector flow.

### Bug Fixes

- Prevented the shared Lit hydrate-support bootstrap from re-running on every browser-router navigation.
- Routed Lit renderer output through Lit's static SSR template pipeline so registered custom elements render declarative shadow DOM during SSR instead of staying as bare host tags.

### Refactoring

- Cleaned up ambient module declarations.

### Tests

- Updated integration coverage for the orchestration pipeline and Node and esbuild compatibility.
