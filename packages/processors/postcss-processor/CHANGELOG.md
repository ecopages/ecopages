# Changelog

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5
    - @ecopages/file-system@0.2.0-rc.5

All notable changes to `@ecopages/postcss-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added reusable runtime CSS loading, a public `PostcssProcessor` class, and build-adapter registration for the plugin.

### Bug Fixes

- Fixed runtime PostCSS config loading, stylesheet rebuilds for Tailwind-driven template changes, and Tailwind v4 preset output for injected references and nested BEM selectors.
