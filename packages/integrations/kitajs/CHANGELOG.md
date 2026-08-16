# Changelog

All notable changes to `@ecopages/kitajs` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added the `@ecopages/kitajs/eco-embed` helper for Kita-owned mixed-integration authoring on top of `eco.embed()`.

### Bug Fixes

- Fixed Kita full-route and direct `ctx.render()` rendering to stay on the renderer-owned page/layout/document path while resolving mixed boundaries inside the owning renderer.
