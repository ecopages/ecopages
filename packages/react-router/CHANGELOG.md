# Changelog

All notable changes to `@ecopages/react-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Removed the React router adapter `importMapKey` field. The adapter now exposes only the browser bundle import path used by both development and production hydration.

### Features

- Added per-tier `persistLayouts` caching for nested `eco.page({ layout: [...] })` stacks via `resolvePersistedLayoutStack`. Routes that share an outer layout reuse the same mounted outer instance on SPA navigation while inner tiers swap.

### Bug Fixes

- Fixed grouped React route navigations, same-page hash links, page-module extraction, current-page HMR reloads, and React-to-browser-router handoffs.

---

## Migration Notes

- `persistLayouts` defaults to `true` with `ecoRouter()`. Each nested layout tier is cached by `config.identity.file` or `id`; shared outer layouts stay mounted when navigating between routes with different inner tiers.
- Plain React layout functions are not valid `eco.page({ layout })` values — use `eco.layout()` so layouts pass declared-component validation and enter the client graph.
