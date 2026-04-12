# Changelog

All notable changes to `@ecopages/vite-plugin` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added the composed `ecopages()` Vite entrypoint, built-in dev-server bridging, and HTML normalization helpers for Vite-hosted Ecopages apps.
- Added a public `EcoPagesAppConfig` export in `@ecopages/core` for published integration packages.

### Bug Fixes

- Fixed Ecopages config merging to preserve array aliases and `ssr.noExternal: true`.
- Fixed bridged HTML responses to drop stale body-derived headers after rewriting.
- Fixed HTML normalization to avoid injecting duplicate `/@vite/client` scripts into already-instrumented documents.
- Fixed Vite dev-server and hot-update setup to fail fast when required Vite capabilities are unavailable.
- Fixed Vite dev-server request bridging to convert Node headers and request bodies into Fetch-compatible `Request` inputs.

### Documentation

- Added package documentation for installing and using `@ecopages/vite-plugin` with `eco.config`.

### Refactoring

- Refactored the Vite plugin to depend on the public core app config export instead of `@ecopages/core/internal-types`.
- Narrowed the public API surface to only export the `ecopages()` entrypoint and its option types.
