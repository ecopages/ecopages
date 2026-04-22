# Changelog

All notable changes to `@ecopages/postcss-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added reusable runtime CSS loading, a public `PostcssProcessor` class, and build-adapter registration for the plugin.

### Bug Fixes

- Fixed runtime PostCSS config loading and stylesheet rebuilds for Tailwind-driven template changes.

- Fixed direct stylesheet processing and preset output so Tailwind v4 preserves injected references and nested BEM selectors.

### Tests

- Added processor and preset coverage for the runtime CSS loader and build adapter flow.
