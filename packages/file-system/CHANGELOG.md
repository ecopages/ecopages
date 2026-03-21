# Changelog

All notable changes to `@ecopages/file-system` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Switched Node-side globbing from `fast-glob` to native `node:fs/promises.glob()` so bundled ESM runtime paths avoid CommonJS interop failures.
