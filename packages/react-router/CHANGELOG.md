# Changelog

All notable changes to `@ecopages/react-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed React-to-non-React handoffs to replay queued clicks through the next active runtime and reuse prefetched HTML documents instead of forcing a second fetch.
- Fixed stale handoff cleanup and fallback races so older React-router or browser-router navigations cannot overwrite a newer navigation.
- Standardized React route payload reads on `window.__ECO_PAGES__.page` and explicit document owner markers so mixed-router page ownership stays stable.
- Restored current-page HMR refreshes with persist layouts enabled by targeting the active React-router owner.

### Refactoring

- Routed browser handoff and current-page reloads through the shared navigation coordinator.
- Updated package metadata for the current core, esbuild adapter, and React peer dependency surface.
