# Changelog

All notable changes to `@ecopages/vite-plugin` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added the composed `ecopages()` Vite entrypoint, built-in dev-server bridging, and HTML normalization helpers for Vite-hosted Ecopages apps.

### Bug Fixes

- Fixed Ecopages config merging to preserve array aliases and `ssr.noExternal: true`.
- Fixed bridged HTML responses, duplicate `/@vite/client` injection, include-template HMR reloads, and Fetch-compatible request bridging for the Vite dev server.
