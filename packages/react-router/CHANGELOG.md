# Changelog

All notable changes to `@ecopages/react-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed React-to-browser-router handoffs, queued-click replay, and stale-navigation races during mixed-router navigations.
- Standardized route payload reads, document-owner markers, rerun scripts, and current-page HMR refreshes for persisted React layouts.

### Refactoring

- Routed browser handoff and current-page reloads through the shared navigation coordinator.
- Updated package metadata for the current core, esbuild adapter, and React peer dependency surface.
