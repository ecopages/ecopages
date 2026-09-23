# Changelog

## 0.2.0-rc.9

### Patch Changes

- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9
    - @ecopages/react@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8
    - @ecopages/react@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/react@0.2.0-rc.7
    - @ecopages/core@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6
    - @ecopages/react@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5
    - @ecopages/react@0.2.0-rc.5

All notable changes to `@ecopages/react-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED]: TBD

### Breaking Changes

- Removed the React router adapter `importMapKey` field. The adapter now exposes only the browser bundle import path used by both development and production hydration.

### Features

- Added per-tier `persistLayouts` caching for nested `eco.page({ layout: [...] })` stacks via `resolvePersistedLayoutStack`. Routes that share an outer layout reuse the same mounted outer instance on SPA navigation while inner tiers swap.

### Bug Fixes

- Fixed grouped React route navigations, same-page hash links, page-module extraction, current-page HMR reloads, and React-to-browser-router handoffs.

---

## Migration Notes

- `persistLayouts` defaults to `true` with `ecoRouter()`. Each nested layout tier is cached by `config.identity.file` or `id`; shared outer layouts stay mounted when navigating between routes with different inner tiers.
- Plain React layout functions are not valid `eco.page({ layout })` values: use `eco.layout()` so layouts pass declared-component validation and enter the client graph.
