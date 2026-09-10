# Changelog

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed Lit document-shell composition, declarative shadow DOM SSR, nested child serialization, lazy preload handling, and mixed-renderer foreign-subtree resolution.
- Wrapped the inline Lit hydrate-support bootstrap in its own scope so preview pages do not leak minified helper globals across other scripts.
