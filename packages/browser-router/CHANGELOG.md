# Changelog

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5

All notable changes to `@ecopages/browser-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added cross-router handoff hooks, configurable `<html>` attribute syncing, and public document sync helpers.

### Bug Fixes

- Fixed navigation races, duplicate script injection, mixed-runtime document ownership, and persisted head scripts during browser-router navigations.
- Fixed body morph swaps with duplicate `id` attributes, stylesheet prefetch console warnings, and stable-id external rerun script cache busting.
