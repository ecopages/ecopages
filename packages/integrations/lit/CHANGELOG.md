# Changelog

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed Lit document-shell composition, declarative shadow DOM SSR, nested child serialization, lazy preload handling, explicit render paths, and mixed-renderer foreign-subtree resolution.
- Fixed Lit foreign-subtree payload compatibility coverage and removed the plugin/renderer integration-name import cycle.

### Documentation

- Updated the README to document `.lit.tsx` route ownership, standalone setup, and mixed-renderer Lit foreign-subtree handling.

### Tests

- Updated integration coverage for explicit foreign-subtree composition and Node and esbuild compatibility.
- Added renderer-level coverage for the foreign-subtree payload compatibility contract.

### Refactoring

- Moved Lit HTML serialization and child-slot reinjection mechanics into a dedicated utility so the renderer stays focused on preload and foreign-subtree orchestration.
