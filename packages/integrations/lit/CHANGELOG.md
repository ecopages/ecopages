# Changelog

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Aligned Lit renderer with full orchestration mode — removed legacy rendering path (`fc07bdb0`).
- Integration updated to work with the new lazy dependency map and global injector rendering mode.

### Refactoring

- Ambient module declarations cleaned up (`5f46ecc5`).
- Updated test suite for esbuild adapter and Node.js runtime compatibility (`31a44458`).

### Tests

- Updated integration tests to the new orchestration model.
