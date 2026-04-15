# Changelog

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Aligned Lit with renderer-owned boundary composition, lazy dependency handling, and the global injector flow.

### Bug Fixes

- Fixed Lit routes rendered through foreign document shells to inject page/layout HTML inside the document body instead of leaving the Lit children placeholder in the final response.
- Fixed mixed-template SSR composition, placeholder cleanup, lazy preload handling, and browser-router bootstrap reruns.
- Routed Lit SSR through the static template pipeline so registered custom elements emit declarative shadow DOM.
- Fixed component-boundary SSR to inject serialized children through both direct Lit interpolation and repeated Lit child slots when Lit is hosted by other integrations.
- Fixed full route and `renderToResponse()` Lit rendering to stay on the renderer-owned explicit page/layout/document path instead of routing through shared marker finalization orchestration.

### Refactoring

- Cleaned up ambient module declarations.

### Documentation

- Updated the README to document `.lit.tsx` route ownership, standalone setup, and mixed-renderer Lit boundary handling.

### Tests

- Updated integration coverage for explicit boundary composition and Node and esbuild compatibility.
