# Changelog

All notable changes to `@ecopages/browser-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added cross-router handoff hooks, configurable `<html>` attribute syncing, and public document sync helpers.

### Bug Fixes

- Fixed navigation races, duplicate script injection, mixed-runtime document ownership, and persisted head scripts during browser-router navigations.
- Fixed body morph swaps with duplicate `id` attributes, stylesheet prefetch console warnings, and stable-id external rerun script cache busting.
