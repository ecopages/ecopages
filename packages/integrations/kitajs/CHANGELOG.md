# Changelog

All notable changes to `@ecopages/kitajs` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed explicit `ctx.render()` Kita views so deferred cross-integration layout components resolve through the marker pipeline instead of crashing during direct server rendering.

### Features

- Aligned KitaJS renderer with full orchestration mode — removed legacy rendering path (`fc07bdb0`).

### Refactoring

- **Type safety improvements** — Enhanced type safety for component signatures; test component creation helpers are now more accurately typed (`574657eb`).
- Ambient module declarations cleaned up (`5f46ecc5`).
- Updated test suite for esbuild adapter and Node.js runtime compatibility (`31a44458`).

### Tests

- Updated integration tests to align with the new orchestration model.
