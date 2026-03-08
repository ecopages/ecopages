# Changelog

All notable changes to `@ecopages/postcss-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Rebuilt tracked stylesheets from fresh PostCSS plugin instances on non-CSS source changes so Tailwind utility generation updates without stale caches or forced reloads.

### Features

- **Runtime CSS loaders** — Added `css-loader-plugin.ts`, `css-loader.bun.ts`, and `css-runtime-contract.ts` to support runtime CSS loading. CSS is now cached at runtime to avoid redundant processing during HMR (`cbaafea4`, `e7653c9b`).
- **`PostcssProcessor` class** — New `postcss-processor.ts` exposes a programmatic API for the processor separate from the plugin DSL.

### Refactoring

- `plugin.ts` significantly overhauled to integrate with the new build adapter and support build dependency graph registration (`e7653c9b`).
- Test suite updated for esbuild adapter and Node runtime compatibility (`31a44458`).
- Removed unused `@types/postcss` dev dependency.

### Tests

- Updated `plugin.test.ts`, `postcss-processor.test.ts`, and `presets.test.ts` for new plugin contract.
