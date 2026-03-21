# Changelog

All notable changes to `@ecopages/browser-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added cross-router navigation handoff and document adoption hooks so browser-router can exchange control with other runtimes without forcing a reload.
- Improved head swaps to execute newly introduced scripts and preserve light-DOM custom elements during page transitions.

### Bug Fixes

- Fixed stale delegated navigations and rapid-click races so only the latest browser-router navigation can commit a swap.
- Re-executed `data-eco-rerun` scripts after body replacement and forced fresh module URLs for external rerun scripts so page bootstraps rebind correctly on every navigation.
- Synced rendered document ownership markers and live `<html>` attributes during swaps so mixed browser-router and React-router pages preserve the correct hydration owner.
- Prevented duplicate head-script execution, duplicate `/_hmr_runtime.js` injection, and listener accumulation across repeated navigations.
- Reset hydrated custom elements from incoming HTML and ignored superseded navigation fetch failures so cross-runtime handoffs no longer leave blank or mixed DOM state behind.

### Refactoring

- Routed handoff and current-page reload behavior through the shared navigation coordinator.

### Documentation

- Updated the README examples for the current router API.
