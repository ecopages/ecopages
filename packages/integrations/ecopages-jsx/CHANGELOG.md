# Changelog

All notable changes to `@ecopages/ecopages-jsx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added the Ecopages JSX integration with optional Radiant runtime support and optional MDX routes compiled against `@ecopages/jsx`.
- Added the `@ecopages/ecopages-jsx/eco-embed` helper for Ecopages-JSX-owned mixed-integration authoring on top of `eco.embed()`.

### Breaking Changes

- Removed the shared JSX runtime bundle and browser import-map asset in favor of per-script browser entries that prepend `@ecopages/radiant/client/install-hydrator` when Radiant SSR is enabled.
- Intrinsic custom-element loading now follows explicit `dependencies.scripts` ownership instead of implicit tag-to-script discovery.

### Bug Fixes

- Fixed Ecopages JSX SSR/hydration wiring for Radiant hosts, intrinsic custom-element assets, mixed-integration delegated children, and page-owned browser bundles.
- Fixed lazy custom-element dependencies to stay as standalone assets instead of being folded into page-owned bundles.
