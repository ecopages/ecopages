# Changelog

All notable changes to `@ecopages/react-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Extended page-module extraction to honor explicit hydration markers and self-owned React page entry bundles during navigation.
- Fixed current-page reloads to accept HMR module overrides so persisted-layout refreshes import the rebuilt active page entry.
- Fixed React-to-browser-router handoffs, queued-click replay, and stale-navigation races during mixed-router navigations.
- Standardized route payload reads, document-owner markers, rerun scripts, and current-page HMR refreshes for persisted React layouts.

### Refactoring

- Routed browser handoff and current-page reloads through the shared navigation coordinator.
- Removed the React router adapter `importMapKey` field so the adapter now exposes only the browser bundle import path used by both development and production hydration.
- Updated package metadata for the current core, esbuild adapter, and React peer dependency surface.
