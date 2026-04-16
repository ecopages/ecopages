# Changelog

All notable changes to `@ecopages/kitajs` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed Kita full-route and direct `ctx.render()` rendering to stay on the renderer-owned page/layout/document path while resolving mixed boundaries inside the owning renderer.

### Documentation

- Updated the README to document `.kita.tsx` route ownership and Kita's role as an outer shell in mixed-renderer apps.

### Tests

- Updated integration coverage for explicit boundary composition and Node and esbuild compatibility.
