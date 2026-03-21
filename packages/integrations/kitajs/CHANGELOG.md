# Changelog

All notable changes to `@ecopages/kitajs` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed explicit `ctx.render()` flows so deferred cross-integration layout components resolve through the marker pipeline instead of crashing during direct server rendering.

### Features

- Aligned KitaJS with the unified orchestration pipeline.

### Refactoring

- Tightened Kita component typing and cleaned up ambient module declarations.

### Tests

- Updated integration coverage for the orchestration pipeline and Node and esbuild compatibility.
