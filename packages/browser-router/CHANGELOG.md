# Changelog

All notable changes to `@ecopages/browser-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added cross-router handoff hooks, configurable `<html>` attribute syncing, and public document sync helpers.

### Bug Fixes

- Fixed navigation races, duplicate script injection, and stale cleanup during repeated page swaps.
- Fixed mixed-runtime document ownership, script reruns, persisted head scripts, and client-managed `<html>` state during browser-router navigations.

### Refactoring

- Routed handoff and current-page reload behavior through the shared navigation coordinator.

### Documentation

- Updated the README examples for the current router API.
