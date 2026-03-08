# Changelog

All notable changes to `@ecopages/browser-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- **Light-DOM custom element support in `dom-swapper`** — `morphdom` morphing process now correctly handles light-DOM custom elements during page transitions (`fce8080c`).
- **Improved `morphHead` script injection** — New scripts from the incoming page's `<head>` are now injected and executed correctly during client-side navigation, even when not marked with `data-eco-rerun` (`08e15e99`).
- **Global injector lifecycle management** — Enhanced global injector with structured lifecycle hooks and tests for hydration script handling (`2ba35aa4`).

### Bug Fixes

- Published npm package metadata now includes validated declaration exports for generated dist entrypoints.

### Refactoring

- Removed unused `@types/morphdom` dev dependency (`ceb243d0`).

### Documentation

- README updated with new API usage examples.
