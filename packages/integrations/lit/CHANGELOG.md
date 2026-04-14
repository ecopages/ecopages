# Changelog

All notable changes to `@ecopages/lit` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Aligned Lit with the shared orchestration, lazy dependency, and global injector flow.

### Bug Fixes

- Fixed mixed-template SSR composition, placeholder cleanup, lazy preload handling, and browser-router bootstrap reruns.
- Routed Lit SSR through the static template pipeline so registered custom elements emit declarative shadow DOM.
- Fixed component-boundary SSR to inject serialized children through both direct Lit interpolation and repeated Lit child slots when Lit is hosted by other integrations.

### Refactoring

- Cleaned up ambient module declarations.

### Tests

- Updated integration coverage for the orchestration pipeline and Node and esbuild compatibility.
