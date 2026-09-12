# Changelog

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6
    - @ecopages/mdx@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/mdx@0.2.0-rc.5
    - @ecopages/core@0.2.0-rc.5

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
