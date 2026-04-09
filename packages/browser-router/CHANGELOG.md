# Changelog

All notable changes to `@ecopages/browser-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added cross-router navigation handoff and document adoption hooks so browser-router can exchange control with other runtimes without forcing a reload.
- Improved head swaps to execute newly introduced scripts and preserve light-DOM custom elements during page transitions.
- Added `documentElementAttributesToSync` so apps can explicitly control which root `<html>` attributes browser-router synchronizes during navigation.
- Added public document sync helpers so advanced setups can reuse browser-router's root `<html>` attribute synchronization logic without overriding the router pipeline.

### Bug Fixes

- Fixed stale delegated navigations and rapid-click races so only the latest browser-router navigation can commit a swap.
- Re-executed `data-eco-rerun` scripts after body replacement and forced fresh module URLs for external rerun scripts so page bootstraps rebind correctly on every navigation.
- Synced rendered document ownership markers and live `<html>` attributes during swaps so mixed browser-router and React-router pages preserve the correct hydration owner.
- Preserved client-managed `<html>` state such as theme classes and data attributes while still syncing router-owned document metadata during swaps.
- Prevented duplicate head-script execution, duplicate `/_hmr_runtime.js` injection, and listener accumulation across repeated navigations.
- Reset hydrated custom elements from incoming HTML and ignored superseded navigation fetch failures so cross-runtime handoffs no longer leave blank or mixed DOM state behind.
- Preserved `data-eco-persist` head scripts during stale head cleanup so browser-router navigations keep persistent client modules loaded across page swaps.

### Refactoring

- Routed handoff and current-page reload behavior through the shared navigation coordinator.

### Documentation

- Updated the README examples for the current router API.
