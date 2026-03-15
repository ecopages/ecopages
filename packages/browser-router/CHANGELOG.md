# Changelog

All notable changes to `@ecopages/browser-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- **Light-DOM custom element support in `dom-swapper`** — `morphdom` morphing process now correctly handles light-DOM custom elements during page transitions (`fce8080c`).
- **Improved `morphHead` script injection** — New scripts from the incoming page's `<head>` are now injected and executed correctly during client-side navigation, even when not marked with `data-eco-rerun` (`08e15e99`).
- **Global injector lifecycle management** — Enhanced global injector with structured lifecycle hooks and tests for hydration script handling (`2ba35aa4`).
- Added navigation ownership handoff so browser-router can yield smoothly to React-router-managed pages and accept delegated transitions back out.

### Bug Fixes

- Fixed `data-eco-rerun` scripts never re-executing after the first navigation — the router now unconditionally re-executes any script tagged with `data-eco-rerun` on every swap; `data-eco-script-id` prevents tag accumulation but no longer gates re-execution.
- Delayed `data-eco-rerun` script execution until after body replacement so DOM-dependent bootstraps rebind against the incoming page on browser-router navigations.
- Forced external module rerun scripts to use a fresh URL on each browser-router swap so plain JS component bootstraps re-execute instead of getting stuck behind the browser module cache.
- Published npm package metadata now includes validated declaration exports for generated dist entrypoints.
- Registered a current-page HMR refresh hook that invalidates cached HTML before re-fetching the active route.
- Prevented duplicate `/_hmr_runtime.js` injection when an HTML response passes through multiple development server layers.
- Ignored stale browser-router swap results after a newer navigation starts, preventing mixed DOM state during rapid cross-router hops.
- Detected real React page markers from fallback data and hydration assets so ownership boundaries reload instead of appending React bootstraps into an existing browser-router head.
- Replaced hydrated custom elements during body morphs so Lit component state resets from the incoming HTML instead of leaking across browser-router navigations.

### Refactoring

- Moved cross-router handoff and current-page reload coordination onto the shared internal navigation coordinator.
- Removed unused `@types/morphdom` dev dependency (`ceb243d0`).

### Documentation

- README updated with new API usage examples.
