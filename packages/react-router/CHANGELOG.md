# Changelog

All notable changes to `@ecopages/react-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added per-tier `persistLayouts` caching for nested `eco.page({ layout: [...] })` stacks via `resolvePersistedLayoutStack`.
- Routes that share an outer layout (for example `[AppShell, Docs]` and `[AppShell, Settings]`) reuse the same mounted outer instance on SPA navigation while inner tiers swap.

### Bug Fixes

- Fixed grouped React route navigations to resolve the destination page bootstrap from explicit document markers instead of relying on legacy asset filename patterns.
- Fixed same-page hash links and Shadow DOM TOC clicks to bypass React Router interception so anchor navigation preserves the URL fragment without a document fetch.
- Extended page-module extraction to honor explicit hydration markers and self-owned React page entry bundles during navigation.
- Fixed current-page reloads to accept HMR module overrides so persisted-layout refreshes import the rebuilt active page entry.
- Fixed React-to-browser-router handoffs, queued-click replay, and stale-navigation races during mixed-router navigations.
- Standardized route payload reads, document-owner markers, rerun scripts, and current-page HMR refreshes for persisted React layouts.
- Fixed stable-id external rerun scripts to reuse registered bootstraps instead of cache-busting shared module chunks on every navigation.

### Refactoring

- Routed browser handoff and current-page reloads through the shared navigation coordinator.
- Removed the React router adapter `importMapKey` field so the adapter now exposes only the browser bundle import path used by both development and production hydration.
- Updated package metadata for the current core, Rolldown build adapter, and React peer dependency surface.

---

## Migration Notes

- `persistLayouts` defaults to `true` with `ecoRouter()`. Each nested layout tier is cached by `config.identity.file` or `id`; shared outer layouts stay mounted when navigating between routes with different inner tiers.
- Plain React layout functions are not valid `eco.page({ layout })` values — use `eco.layout()` so layouts pass declared-component validation and enter the client graph.
