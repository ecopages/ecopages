# Changelog

All notable changes to `@ecopages/file-system` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Switched the Node adapter from `fast-glob` to native `node:fs/promises.glob()` so bundled Node runtime and static-generation paths no longer pull CommonJS-only glob internals into ESM server modules.

### Refactoring

- `package.json` updated to add `fs` as an explicit peer dependency, reflecting the package's role in the runtime-agnostic file abstraction layer used by the Node adapter.
